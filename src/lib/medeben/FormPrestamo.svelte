<script lang="ts">
  import CampoFecha from "$lib/ui/CampoFecha.svelte";
  import { untrack } from "svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import CampoMonto from "$lib/ui/CampoMonto.svelte";
  import { hoy, leerMonto, montoEditable, pesos } from "$lib/formato";
  import { fechaLarga } from "$lib/inversiones/fechas";
  import { generarPlanCuotas, sumarMeses, type CuotaPlan } from "./calculo";
  import {
    crearPrestamo, editarPrestamo, crearPersona, type Prestamo, type PrestamoNuevo, type Persona, type Cuenta,
  } from "$lib/datos";

  let { abierto, prestamo, personaInicial, personas, cuentas, cerrar, listo }: {
    abierto: boolean;
    /** null = préstamo nuevo */
    prestamo: Prestamo | null;
    /** Persona ya elegida (desde su detalle). */
    personaInicial: number | null;
    personas: Persona[];
    /** Cuentas en pesos (débito, efectivo y tarjetas). */
    cuentas: Cuenta[];
    cerrar: () => void;
    listo: (mensaje: string) => void;
  } = $props();

  type Modo = "fecha" | "cuotas" | "nada";
  const NUEVA = -1;

  let persona = $state<number | null>(null);
  let nombreNueva = $state("");
  let monto = $state("");
  let fecha = $state(hoy());
  let origen = $state<number | null>(null);
  let descripcion = $state("");
  let modo = $state<Modo>("nada");
  let fechaAcordada = $state("");
  let numCuotas = $state("3");
  let primera = $state("");
  let plan = $state<{ fecha: string; monto: string }[]>([]);
  let error = $state("");
  let guardando = $state(false);

  // Se llena solo al abrir (o al cambiar el préstamo que se edita). Lo demás se lee con `untrack`:
  // si no, cambiar la fecha u otro campo volvía a ejecutar esto y reiniciaba el formulario.
  $effect(() => {
    if (!abierto) return;
    const p = prestamo;
    untrack(() => llenar(p));
  });

  function llenar(p: Prestamo | null) {
    persona = p?.persona_id ?? personaInicial ?? personas[0]?.id ?? NUEVA;
    nombreNueva = "";
    monto = montoEditable(p?.monto ?? null);
    fecha = p?.fecha ?? hoy();
    origen = p ? p.cuenta_origen_id : (cuentas.find((c) => c.principal)?.id ?? cuentas[0]?.id ?? null);
    descripcion = p?.descripcion ?? "";
    const cuotas = p?.calculo.cuotas ?? [];
    modo = cuotas.length ? "cuotas" : p?.fecha_acordada ? "fecha" : "nada";
    fechaAcordada = p?.fecha_acordada ?? "";
    numCuotas = String(cuotas.length || 3);
    primera = cuotas[0]?.fecha ?? sumarMeses(fecha, 1);
    plan = cuotas.map((c) => ({ fecha: c.fecha, monto: montoEditable(c.monto) }));
    if (!cuotas.length && modo === "cuotas") regenerar();
    error = "";
  }

  /** Arma el plan desde monto, número de cuotas y primera fecha (borra lo editado a mano). */
  function regenerar() {
    const m = leerMonto(monto), n = Number(numCuotas);
    if (!m || !Number.isInteger(n) || n < 1 || n > 60 || !primera) return void (plan = []);
    try {
      plan = generarPlanCuotas(m, n, primera).map((c) => ({ fecha: c.fecha, monto: montoEditable(c.monto) }));
    } catch { plan = []; }
  }

  function elegirModo(m: Modo) {
    modo = m;
    if (m === "cuotas" && !plan.length) {
      if (!primera) primera = sumarMeses(fecha, 1);
      regenerar();
    }
  }

  const sumaPlan = $derived(plan.reduce((s, c) => s + (leerMonto(c.monto) ?? 0), 0));
  const montoNum = $derived(leerMonto(monto) ?? 0);
  const cuentaElegida = $derived(cuentas.find((c) => c.id === origen));

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    const m = leerMonto(monto);
    if (!m) return void (error = "Escribe el monto del préstamo.");
    if (modo === "fecha" && !fechaAcordada) return void (error = "Elige la fecha en que quedó en pagarte.");
    let cuotas: CuotaPlan[] = [];
    if (modo === "cuotas") {
      if (!plan.length) return void (error = "Arma el plan de cuotas.");
      cuotas = plan.map((c, i) => ({ numero: i + 1, fecha: c.fecha, monto: leerMonto(c.monto) ?? 0 }));
    }
    guardando = true;
    try {
      let personaId = persona;
      if (personaId === NUEVA || personaId == null) {
        if (!nombreNueva.trim()) throw new Error("Escribe el nombre de la persona.");
        personaId = await crearPersona(nombreNueva);
      }
      const datos: PrestamoNuevo = {
        persona_id: personaId, monto: m, fecha, descripcion: descripcion || null, cuenta_origen_id: origen,
        fecha_acordada: modo === "fecha" ? fechaAcordada : null,
      };
      if (prestamo) {
        await editarPrestamo(prestamo.id, datos, cuotas);
        listo("Préstamo actualizado.");
      } else {
        await crearPrestamo(datos, cuotas);
        const quien = personas.find((p) => p.id === personaId)?.nombre ?? nombreNueva.trim();
        listo(cuentaElegida ? `Le prestaste ${pesos(m)} a ${quien} desde ${cuentaElegida.nombre}.` : `Registraste que ${quien} te debe ${pesos(m)}.`);
      }
      cerrar();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      guardando = false;
    }
  }
</script>

<Panel {abierto} {cerrar} titulo={prestamo ? "Editar préstamo" : "Nuevo préstamo"}
  subtitulo={prestamo ? `${prestamo.persona} · ${fechaLarga(prestamo.fecha)}` : "La plata sale de tu cuenta; no es un gasto"}>
  <form id="form-prestamo" class="form" onsubmit={guardar}>
    <label class="campo">
      <span class="etiqueta">A quién</span>
      <span class="cf-field">
        <select bind:value={persona}>
          {#each personas as p (p.id)}<option value={p.id}>{p.nombre}</option>{/each}
          <option value={NUEVA}>+ Nueva persona…</option>
        </select>
      </span>
    </label>
    {#if persona === NUEVA}
      <label class="campo">
        <span class="etiqueta">Nombre de la persona</span>
        <span class="cf-field"><input bind:value={nombreNueva} placeholder="Camila, Mamá…" required /></span>
      </label>
    {/if}
    <label class="campo">
      <span class="etiqueta">Monto</span>
      <CampoMonto bind:valor={monto} grande requerido alEscribir={() => { if (modo === "cuotas") regenerar(); }} />
    </label>
    <div class="fila-campos">
      <label class="campo">
        <span class="etiqueta">Fecha</span>
        <CampoFecha bind:valor={fecha} requerido />
      </label>
      <label class="campo">
        <span class="etiqueta">Sale de</span>
        <span class="cf-field">
          <select bind:value={origen}>
            {#each cuentas as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
            <option value={null}>Solo registro</option>
          </select>
        </span>
      </label>
    </div>
    <span class="ayuda">
      {#if origen == null}Solo se anota lo que te deben; ninguna cuenta cambia.
      {:else if cuentaElegida?.tipo === "credito"}Sube la deuda de la tarjeta. No es un gasto.
      {:else}Sale de esa cuenta como transferencia. No es un gasto.{/if}
    </span>
    <label class="campo">
      <span class="etiqueta">Descripción</span>
      <span class="cf-field"><input bind:value={descripcion} placeholder="Opcional: arriendo, almuerzo…" /></span>
    </label>

    <div class="campo">
      <span class="etiqueta">¿Cómo te va a pagar?</span>
      <div class="cf-seg" role="group" aria-label="Cómo te va a pagar">
        <button type="button" aria-pressed={modo === "fecha"} onclick={() => elegirModo("fecha")}>Una fecha</button>
        <button type="button" aria-pressed={modo === "cuotas"} onclick={() => elegirModo("cuotas")}>En cuotas</button>
        <button type="button" aria-pressed={modo === "nada"} onclick={() => elegirModo("nada")}>Sin fecha</button>
      </div>
    </div>

    {#if modo === "fecha"}
      <label class="campo">
        <span class="etiqueta">Quedó en pagarte el</span>
        <CampoFecha bind:valor={fechaAcordada} min={fecha} requerido titulo="Quedó en pagarte el" />
      </label>
    {:else if modo === "cuotas"}
      <div class="fila-campos">
        <label class="campo">
          <span class="etiqueta">Cuotas</span>
          <span class="cf-field"><input bind:value={numCuotas} inputmode="numeric" oninput={regenerar} /></span>
        </label>
        <label class="campo">
          <span class="etiqueta">Primera cuota</span>
          <CampoFecha bind:valor={primera} min={fecha} alCambiar={regenerar} titulo="Primera cuota" />
        </label>
      </div>
      {#if plan.length}
        <div class="plan">
          {#each plan as c, i (i)}
            <div class="cuota">
              <span class="num">{i + 1}</span>
              <CampoFecha bind:valor={c.fecha} min={fecha} etiqueta="Fecha de la cuota {i + 1}" />
              <CampoMonto bind:valor={c.monto} etiqueta="Valor de la cuota {i + 1}" />
            </div>
          {/each}
          <span class="caption" class:mal={sumaPlan !== montoNum}>
            {sumaPlan === montoNum ? "Mensuales, en pesos enteros. Puedes cambiar fechas y valores."
              : `Las cuotas suman ${pesos(sumaPlan)} y el préstamo es de ${pesos(montoNum)}.`}
          </span>
        </div>
      {/if}
    {/if}
    {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  </form>
  {#snippet pie()}
    <button class="cf-btn cf-btn--secondary" onclick={cerrar}>Cancelar</button>
    <button class="cf-btn cf-btn--primary" type="submit" form="form-prestamo" disabled={guardando}>{prestamo ? "Guardar cambios" : "Crear préstamo"}</button>
  {/snippet}
</Panel>

<style>
  .form { display: flex; flex-direction: column; gap: var(--space-4); }
  .form .cf-seg { align-self: stretch; }
  .form .cf-seg button { flex: 1; }
  .ayuda { margin-top: calc(-1 * var(--space-2)); font-size: 12px; line-height: 16px; color: var(--ink-2); }
  .plan { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); border-radius: var(--r-lg); background: var(--primary-soft); }
  .cuota { display: grid; grid-template-columns: 20px minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-2); align-items: center; }
  .num { font-size: 13px; font-weight: 650; color: var(--primary-text); text-align: center; }
  .mal { color: var(--over-100-alt); font-weight: 600; }
</style>
