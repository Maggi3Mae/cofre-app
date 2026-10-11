<script lang="ts">
  import MenuAcciones, { type Accion } from "$lib/ui/MenuAcciones.svelte";
  import CampoFecha from "$lib/ui/CampoFecha.svelte";
  import Icono from "$lib/Icono.svelte";
  import CampoMonto from "$lib/ui/CampoMonto.svelte";
  import { hoy, leerMonto, montoEditable, pesos } from "$lib/formato";
  import { fechaLarga } from "$lib/inversiones/fechas";
  import { fechaCorta } from "$lib/periodo";
  import {
    abonarPrestamo, darPorPerdido, deshacerPerdido, eliminarPrestamo, type Prestamo, type Cuenta,
  } from "$lib/datos";

  let { prestamo, cuentas, editar, listo }: {
    prestamo: Prestamo;
    /** Cuentas en pesos; los abonos solo entran a débito o efectivo. */
    cuentas: Cuenta[];
    editar: () => void;
    listo: (mensaje: string) => void;
  } = $props();

  const k = $derived(prestamo.calculo);
  const destinos = $derived(cuentas.filter((c) => c.tipo !== "credito"));
  const origen = $derived(cuentas.find((c) => c.id === prestamo.cuenta_origen_id)?.nombre);

  type Modo = "" | "abonar" | "perdido" | "borrar";
  let modo = $state<Modo>("");
  /** «⋯» del préstamo: editar, dar por perdido y eliminar (lienzo «Me deben · botones», opción A). */
  const menu = $derived.by((): Accion[] => {
    const a: Accion[] = [];
    if (k.estado !== "perdido") a.push({ texto: "Editar préstamo", icono: "editar", detalle: "Monto, fecha, cuotas o descripción", accion: editar });
    if (k.estado === "activo") a.push({ texto: "Dar por perdido", icono: "deshacer", detalle: "Deja de contarlo como deuda", accion: () => abrir("perdido") });
    a.push({ texto: "Eliminar préstamo", icono: "papelera", peligro: true, accion: () => abrir("borrar") });
    return a;
  });
  let monto = $state("");
  let cuenta = $state<number | null>(null);
  let fecha = $state(hoy());
  let error = $state("");

  const claseCuota = { pagada: "cf-chip--income", parcial: "cf-chip--brand", pendiente: "", vencida: "cf-chip--over-100" } as const;
  const nombreCuota = { pagada: "Pagada", parcial: "Parcial", pendiente: "Pendiente", vencida: "Vencida" } as const;

  function abrir(m: Modo) {
    modo = m;
    error = "";
    fecha = hoy();
    if (m === "abonar") {
      // Lo atrasado; si no hay, la próxima cuota sin cubrir; si no, todo lo pendiente.
      const proxima = k.cuotas.find((c) => c.estado !== "pagada");
      const sugerido = k.atrasado || (proxima ? proxima.monto - proxima.abonado : k.pendiente);
      monto = montoEditable(Math.min(sugerido, k.pendiente));
      cuenta = destinos.find((c) => c.principal)?.id ?? destinos[0]?.id ?? null;
    }
  }

  async function abonar(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    const v = leerMonto(monto);
    if (!v) return void (error = "Escribe un monto válido.");
    if (cuenta == null) return void (error = "Elige a qué cuenta entra.");
    try {
      await abonarPrestamo(prestamo.id, cuenta, v, fecha);
      const restante = k.pendiente - v;
      listo(restante > 0
        ? `${prestamo.persona} abonó ${pesos(v)}. Faltan ${pesos(restante)}.`
        : `${prestamo.persona} terminó de pagar el préstamo.`);
      modo = "";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function ejecutar(accion: () => Promise<void>, mensaje: string) {
    error = "";
    try {
      await accion();
      listo(mensaje);
      modo = "";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<article class="prestamo cf-glass cf-card" class:apagado={k.estado !== "activo"}>
  <header class="cab">
    <span class="cf-tile cf-tile--brand"><Icono nombre="billete" /></span>
    <div class="titulo">
      <b>{prestamo.descripcion || "Préstamo"}</b>
      <span class="caption">
        {#if prestamo.gasto_grupal}Parte de «{prestamo.gasto_grupal}» · {/if}{fechaLarga(prestamo.fecha)} · {origen ? `salió de ${origen}` : "solo registro"}{k.cuotas.length ? ` · ${k.cuotas.length} ${k.cuotas.length === 1 ? "cuota" : "cuotas"}` : ""}
      </span>
    </div>
    <div class="valor">
      <span class="cf-overline">Préstamo</span>
      <b>{pesos(prestamo.monto)}</b>
    </div>
  </header>

  <div class="avance">
    <div class="linea">
      <span class="caption">
        {#if k.estado === "perdido"}Dado por perdido el {fechaLarga(prestamo.perdido_en!)}: {pesos(k.perdido)} pasaron a gasto.
        {:else if k.estado === "pagado"}Pagado completo.
        {:else}Abonado {pesos(k.abonado)} · pendiente <b>{pesos(k.pendiente)}</b>{/if}
      </span>
      {#if k.estado === "perdido"}<span class="cf-chip cf-chip--sm cf-chip--expense">Perdido</span>
      {:else if k.estado === "pagado"}<span class="cf-chip cf-chip--sm cf-chip--income">Pagado</span>
      {:else if k.vencido}<span class="cf-chip cf-chip--sm cf-chip--over-100">Vencido hace {k.diasVencido} {k.diasVencido === 1 ? "día" : "días"}</span>
      {:else if k.proximaFecha}<span class="cf-chip cf-chip--sm cf-chip--brand">Próximo pago: {fechaCorta(k.proximaFecha)}</span>{/if}
    </div>
    <span class="cf-bar" class:cf-bar--income={k.estado === "pagado"} role="progressbar" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={Math.round(k.progreso * 100)} aria-label="Avance del pago">
      <span style:width="{k.progreso * 100}%"></span>
    </span>
    {#if k.estado === "activo" && k.vencido && k.atrasado}<span class="caption atrasado">Atrasado: {pesos(k.atrasado)}</span>{/if}
  </div>

  {#if k.cuotas.length}
    <div class="tabla-envoltura">
      <table class="cuotas">
        <thead><tr><th>Cuota</th><th>Fecha</th><th class="num">Valor</th><th class="num">Abonado</th><th>Estado</th></tr></thead>
        <tbody>
          {#each k.cuotas as c (c.numero)}
            <tr>
              <td>{c.numero}</td>
              <td>{fechaCorta(c.fecha)}</td>
              <td class="num">{pesos(c.monto)}</td>
              <td class="num">{pesos(c.abonado)}</td>
              <td><span class="cf-chip cf-chip--sm {claseCuota[c.estado]}">{nombreCuota[c.estado]}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if modo === "abonar"}
    <form class="confirmar" onsubmit={abonar}>
      <span class="etiqueta">Registrar abono</span>
      <div class="campos">
        <CampoMonto bind:valor={monto} requerido etiqueta="Monto" />
        <span class="cf-field">
          <select bind:value={cuenta} aria-label="Entra a">
            {#each destinos as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
          </select>
        </span>
        <CampoFecha bind:valor={fecha} min={prestamo.fecha} etiqueta="Fecha del abono" />
      </div>
      <span class="caption">Máximo {pesos(k.pendiente)}. Suma a la cuenta; no es un ingreso.</span>
      <div class="acciones">
        <button type="button" class="cf-btn cf-btn--ghost" onclick={() => (modo = "")}>Cancelar</button>
        <button type="submit" class="cf-btn cf-btn--primary">Abonar</button>
      </div>
    </form>
  {:else if modo === "perdido"}
    <div class="confirmar aviso" role="alertdialog" aria-label="Dar por perdido">
      <p class="caption">
        Los {pesos(k.pendiente)} pendientes pasan a ser un gasto sin categoría y dejan de sumar en «Te deben».
        El saldo de tus cuentas no cambia. Puedes deshacerlo.
      </p>
      <div class="acciones">
        <button class="cf-btn cf-btn--ghost" onclick={() => (modo = "")}>Cancelar</button>
        <button class="cf-btn cf-btn--secondary peligro"
          onclick={() => ejecutar(() => darPorPerdido(prestamo.id), `El préstamo de ${prestamo.persona} quedó como perdido.`)}>Dar por perdido</button>
      </div>
    </div>
  {:else if modo === "borrar"}
    <div class="confirmar aviso" role="alertdialog" aria-label="Eliminar préstamo">
      <p class="caption">
        Se borra el préstamo con su salida, sus abonos y su plan: los saldos de las cuentas vuelven a como estaban.
      </p>
      <div class="acciones">
        <button class="cf-btn cf-btn--ghost" onclick={() => (modo = "")}>Cancelar</button>
        <button class="cf-btn cf-btn--secondary peligro"
          onclick={() => ejecutar(() => eliminarPrestamo(prestamo.id), "Préstamo eliminado.")}>Eliminar</button>
      </div>
    </div>
  {:else}
    <footer class="acciones pie">
      {#if k.estado === "activo"}
        <button class="cf-btn cf-btn--primary abonar" onclick={() => abrir("abonar")} disabled={!destinos.length}><Icono nombre="mas" />Abonar</button>
      {:else if k.estado === "perdido"}
        <button class="cf-btn cf-btn--secondary abonar"
          onclick={() => ejecutar(() => deshacerPerdido(prestamo.id), "El préstamo volvió a estar activo.")}><Icono nombre="deshacer" />Deshacer perdido</button>
      {:else}
        <span class="espacio"></span>
      {/if}
      <MenuAcciones tam={40} titulo={prestamo.descripcion?.trim() || prestamo.gasto_grupal || "Préstamo"}
        subtitulo={k.estado === "activo" ? `Pendiente ${pesos(k.pendiente)}` : ""} etiqueta="Más opciones del préstamo" acciones={menu} />
    </footer>
  {/if}
  {#if error}<p class="error-form" role="alert">{error}</p>{/if}
</article>

<style>
  .prestamo { gap: var(--space-4); }
  .prestamo.apagado { opacity: .82; }
  .cab { display: flex; gap: var(--space-3); align-items: flex-start; }
  .titulo { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .titulo b { font-size: 16px; line-height: 22px; }
  .valor { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .valor b { font: 650 22px/28px var(--font-display); letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
  .avance { display: flex; flex-direction: column; gap: var(--space-2); }
  .linea { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .atrasado { color: var(--over-100-alt); font-weight: 600; }
  .tabla-envoltura { overflow-x: auto; }
  .cuotas { width: 100%; border-collapse: collapse; font-size: 13px; }
  .cuotas th { text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); padding: 6px 8px; border-bottom: 1px solid var(--line); }
  .cuotas td { padding: 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  .cuotas tr:last-child td { border-bottom: 0; }
  .cuotas .num { text-align: right; font-variant-numeric: tabular-nums; }
  .acciones { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .espacio { flex: 1; }
  .pie { flex-wrap: nowrap; padding-top: var(--space-3); border-top: 1px solid var(--line); }
  .pie .abonar { height: 40px; }
  :global(html.celular) .pie .abonar { flex: 1; }
  .pie :global(.puntos) { margin-left: auto; }
  .confirmar { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-radius: var(--r-lg); background: var(--primary-soft); }
  .confirmar.aviso { background: var(--glass-1); border: 1px solid var(--line); }
  .confirmar .etiqueta { font-size: 13px; font-weight: 600; color: var(--primary-text); }
  .confirmar .acciones { justify-content: flex-end; }
  .campos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
  .campos select { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: 400 14px/20px var(--font-sans); color: var(--ink); }
  .peligro { color: var(--expense); }
  @media (max-width: 760px) { .campos { grid-template-columns: 1fr; } }
</style>
