<script lang="ts">
  import Panel from "$lib/ui/Panel.svelte";
  import Icono from "$lib/Icono.svelte";
  import CampoMonto from "$lib/ui/CampoMonto.svelte";
  import { leerMonto, montoEditable } from "$lib/formato";
  import {
    crearCuenta, editarCuenta, archivarCuenta,
    type Cuenta, type CuentaNueva, type TipoCuenta, type Moneda,
  } from "$lib/datos";

  let { abierto, cuenta, cerrar, listo }: {
    abierto: boolean;
    /** null = cuenta nueva */
    cuenta: Cuenta | null;
    cerrar: () => void;
    /** Se llama después de guardar, archivar o eliminar. */
    listo: () => void;
  } = $props();

  const tipos: { id: TipoCuenta; nombre: string }[] = [
    { id: "debito", nombre: "Débito" },
    { id: "credito", nombre: "Crédito" },
    { id: "efectivo", nombre: "Efectivo" },
  ];
  // CDT y cajitas se gestionan en Inversiones, no aquí.

  // Estado del formulario (texto tal como se escribe)
  let tipo = $state<TipoCuenta>("debito");
  let nombre = $state("");
  let banco = $state("");
  let ultimos4 = $state("");
  let moneda = $state<Moneda>("COP");
  let saldo = $state("");
  let cupo = $state("");
  let diaCorte = $state("");
  let diaPago = $state("");
  let tasa = $state("");
  let comision = $state("2,9");
  let interesUnaCuota = $state(true);
  let principal = $state(false);
  let error = $state("");
  let guardando = $state(false);

  const credito = $derived(tipo === "credito");
  const efectivo = $derived(tipo === "efectivo");
  const conTasa = $derived(tipo === "credito" || tipo === "inversion");
  const etiquetaSaldo = $derived(
    credito ? "Deuda actual" : cuenta ? "Saldo actual" : "Saldo inicial",
  );

  const pct = (v: number | null | undefined) =>
    v == null ? "" : (v * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 });
  const leerPct = (t: string) => {
    const n = Number(t.replace(/[^\d,.]/g, "").replace(",", "."));
    return t.trim() && !isNaN(n) ? n / 100 : null;
  };
  const leerDia = (t: string) => (t.trim() ? Number(t) : null);

  // Cargar datos al abrir
  $effect(() => {
    if (!abierto) return;
    const c = cuenta;
    tipo = c?.tipo ?? "debito";
    nombre = c?.nombre ?? "";
    banco = c?.banco ?? "";
    ultimos4 = c?.ultimos4 ?? "";
    moneda = c?.moneda ?? "COP";
    // Al editar se muestra el valor ACTUAL (el mismo de la lista y del extracto).
    saldo = c ? montoEditable(c.saldo) : "";
    cupo = montoEditable(c?.cupo ?? null);
    diaCorte = c?.dia_corte?.toString() ?? "";
    diaPago = c?.dia_pago?.toString() ?? "";
    tasa = pct(c?.tasa_ea);
    comision = pct(c?.comision_internacional ?? 0.029);
    interesUnaCuota = c?.interes_una_cuota ?? true;
    principal = c?.principal ?? false;
    error = "";
  });

  /**
   * Opción B: lo escrito es el saldo/deuda ACTUAL. Se ajusta el punto de partida
   * para que, con los movimientos ya registrados, el resultado sea lo escrito.
   */
  function saldoInicialPara(escrito: number): number {
    if (!cuenta) return escrito;
    const antesCredito = cuenta.tipo === "credito";
    // Movimiento neto ya registrado (ingresos − egresos ± transferencias)
    const neto = antesCredito ? cuenta.saldo_inicial - cuenta.saldo : cuenta.saldo - cuenta.saldo_inicial;
    return credito ? escrito + neto : escrito - neto;
  }

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    const leido = leerMonto(saldo) ?? 0;
    const saldoC = saldoInicialPara(credito ? Math.abs(leido) : leido);
    const datos: CuentaNueva = {
      nombre, tipo, moneda,
      // El efectivo no tiene banco ni número.
      banco: efectivo ? null : banco || null,
      ultimos4: efectivo ? null : ultimos4 || null,
      saldo_inicial: saldoC,
      cupo: credito ? leerMonto(cupo) : null,
      dia_corte: credito ? leerDia(diaCorte) : null,
      dia_pago: credito ? leerDia(diaPago) : null,
      tasa_ea: conTasa ? leerPct(tasa) : null,
      interes_una_cuota: interesUnaCuota,
      comision_internacional: leerPct(comision) ?? 0,
      principal,
    };
    guardando = true;
    try {
      if (cuenta) await editarCuenta(cuenta.id, datos);
      else await crearCuenta(datos);
      listo();
      cerrar();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      guardando = false;
    }
  }

  async function archivar() {
    if (!cuenta) return;
    error = "";
    try {
      await archivarCuenta(cuenta.id, !cuenta.archivada);
      listo();
      cerrar();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<Panel {abierto} {cerrar} titulo={cuenta ? "Editar cuenta" : "Nueva cuenta"}
  subtitulo={cuenta ? cuenta.nombre : "Débito, tarjeta de crédito o efectivo"}>
  <form id="form-cuenta" class="form" onsubmit={guardar}>
    <div class="campo">
      <span class="etiqueta">Tipo</span>
      <div class="cf-seg" role="group" aria-label="Tipo de cuenta">
        {#each tipos as t}
          <button type="button" aria-pressed={tipo === t.id} onclick={() => (tipo = t.id)}>{t.nombre}</button>
        {/each}
      </div>
    </div>

    <label class="campo">
      <span class="etiqueta">Nombre</span>
      <span class="cf-field"><input bind:value={nombre} placeholder={credito ? "Infinite" : efectivo ? "Billetera" : "Ahorros BBVA"} required /></span>
    </label>

    {#if !efectivo}
    <div class="fila-campos">
      <label class="campo">
        <span class="etiqueta">Banco</span>
        <span class="cf-field"><input bind:value={banco} placeholder="BBVA, Nu, Nequi…" /></span>
      </label>
      <label class="campo">
        <span class="etiqueta">Últimos 4</span>
        <span class="cf-field"><input bind:value={ultimos4} inputmode="numeric" maxlength="4" placeholder="4821" /></span>
      </label>
    </div>
    {/if}

    <div class="campo">
      <span class="etiqueta">Moneda</span>
      <div class="cf-seg" role="group" aria-label="Moneda">
        <button type="button" aria-pressed={moneda === "COP"} onclick={() => (moneda = "COP")}>Pesos (COP)</button>
        <button type="button" aria-pressed={moneda === "USD"} onclick={() => (moneda = "USD")}>Dólares (USD)</button>
      </div>
    </div>

    <label class="campo">
      <span class="etiqueta">{etiquetaSaldo}</span>
      <CampoMonto bind:valor={saldo} {moneda} />
      <span class="ayuda">
        {#if cuenta && cuenta.num_movimientos > 0}
          Escribe el valor de hoy (por ejemplo, el de tu extracto). La app ajusta el punto de partida
          para cuadrar con los {cuenta.num_movimientos} movimientos ya registrados.
        {:else if credito}
          Lo que debes hoy en la tarjeta. Si lo escribes con signo menos, se guarda en positivo.
        {:else}
          Lo que tienes hoy en esta cuenta.
        {/if}
      </span>
    </label>

    {#if credito}
      <div class="grupo-form">
        <span class="cf-overline">Tarjeta de crédito</span>
        <label class="campo">
          <span class="etiqueta">Cupo total</span>
          <CampoMonto bind:valor={cupo} {moneda} placeholder="10.000.000" />
        </label>
        <div class="fila-campos">
          <label class="campo">
            <span class="etiqueta">Día de corte</span>
            <span class="cf-field"><input bind:value={diaCorte} inputmode="numeric" maxlength="2" placeholder="15" /></span>
          </label>
          <label class="campo">
            <span class="etiqueta">Día de pago</span>
            <span class="cf-field"><input bind:value={diaPago} inputmode="numeric" maxlength="2" placeholder="30" /></span>
          </label>
        </div>
        <div class="fila-campos">
          <label class="campo">
            <span class="etiqueta">Tasa E.A.</span>
            <span class="cf-field"><input bind:value={tasa} inputmode="decimal" placeholder="29,63" /><span class="sufijo">%</span></span>
          </label>
          <label class="campo">
            <span class="etiqueta">Comisión internacional</span>
            <span class="cf-field"><input bind:value={comision} inputmode="decimal" placeholder="2,9" /><span class="sufijo">%</span></span>
          </label>
        </div>
        <label class="interruptor">
          <input type="checkbox" bind:checked={interesUnaCuota} />
          <span>Cobra interés en compras a 1 cuota
            <small>Desmárcalo si la tarjeta no cobra cuando pagas antes de la fecha límite. Con más de 1 cuota siempre cobra.</small>
          </span>
        </label>
      </div>
    {:else if conTasa}
      <label class="campo">
        <span class="etiqueta">Tasa E.A.</span>
        <span class="cf-field"><input bind:value={tasa} inputmode="decimal" placeholder="10,5" /><span class="sufijo">%</span></span>
      </label>
    {/if}

    <label class="interruptor">
      <input type="checkbox" bind:checked={principal} />
      <span>Cuenta principal <small>Se destaca primero y es el origen por defecto al pagar tarjetas.</small></span>
    </label>

    {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  </form>

  {#snippet pie()}
    {#if cuenta}
      <button class="cf-btn cf-btn--ghost" onclick={archivar}>
        <Icono nombre="archivar" />{cuenta.archivada ? "Restaurar" : "Archivar"}
      </button>
      <span class="espacio"></span>
    {/if}
    <button class="cf-btn cf-btn--secondary" onclick={cerrar}>Cancelar</button>
    <button class="cf-btn cf-btn--primary" type="submit" form="form-cuenta" disabled={guardando}>
      {cuenta ? "Guardar cambios" : "Crear cuenta"}
    </button>
  {/snippet}
</Panel>

<style>
  .form { display: flex; flex-direction: column; gap: var(--space-4); }
  .espacio { flex: 1; }
</style>
