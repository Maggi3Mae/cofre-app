<script lang="ts">
  import CampoFecha from "$lib/ui/CampoFecha.svelte";
  import { untrack } from "svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import CampoMonto from "$lib/ui/CampoMonto.svelte";
  import Icono from "$lib/Icono.svelte";
  import { hoy, leerMonto, pesos } from "$lib/formato";
  import { fechaLarga } from "$lib/inversiones/fechas";
  import type { ModoReparto } from "./reparto";
  import {
    crearGastoGrupal, calcularReparto, crearPersona,
    type EgresoDivisible, type ParticipanteGrupal, type Persona, type Cuenta, type Categoria,
  } from "$lib/datos";

  let { abierto, egreso, personas, cuentas, categorias, cerrar, listo }: {
    abierto: boolean;
    /** Egreso existente que se divide (null = gasto nuevo). */
    egreso: EgresoDivisible | null;
    personas: Persona[];
    /** Cuentas en pesos (débito, efectivo y tarjetas). */
    cuentas: Cuenta[];
    /** Categorías de egreso. */
    categorias: Categoria[];
    cerrar: () => void;
    listo: (mensaje: string) => void;
  } = $props();

  let descripcion = $state("");
  let fecha = $state(hoy());
  let cuenta = $state<number | null>(null);
  let categoria = $state<number | null>(null);
  let base = $state("");
  let propina = $state("");
  let modo = $state<ModoReparto>("igual");
  let conmigo = $state(true);
  /** Personas elegidas, en orden, con su valor escrito (monto o %). */
  let elegidas = $state<{ id: number; nombre: string; valor: string }[]>([]);
  let miValor = $state("");
  let nueva = $state("");
  let fechaAcordada = $state("");
  let extra = $state<Persona[]>([]);
  let error = $state("");
  let guardando = $state(false);

  // Se llena solo al abrir (con `untrack`, para no reiniciar el formulario al escribir).
  $effect(() => {
    if (!abierto) return;
    const e = egreso;
    untrack(() => {
      descripcion = e?.comercio ?? "";
      fecha = e?.fecha ?? hoy();
      cuenta = e?.cuenta_id ?? cuentas.find((c) => c.principal)?.id ?? cuentas[0]?.id ?? null;
      categoria = e?.categoria_id ?? null;
      base = e ? String(e.monto / 100) : "";
      propina = "";
      modo = "igual";
      conmigo = true;
      elegidas = [];
      miValor = "";
      nueva = "";
      fechaAcordada = "";
      extra = [];
      error = "";
    });
  });

  const todas = $derived([...personas, ...extra.filter((x) => !personas.some((p) => p.id === x.id))]);
  const libres = $derived(todas.filter((p) => !p.archivada && !elegidas.some((e) => e.id === p.id)));

  function elegir(p: Persona) {
    elegidas = [...elegidas, { id: p.id, nombre: p.nombre, valor: "" }];
  }
  function quitar(id: number) {
    elegidas = elegidas.filter((e) => e.id !== id);
  }

  async function agregarNueva() {
    error = "";
    try {
      const id = await crearPersona(nueva);
      const p = { id, nombre: nueva.trim(), archivada: false } as Persona;
      extra = [...extra, p];
      elegir(p);
      nueva = "";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const leerPct = (t: string) => {
    const n = Number(t.replace(/[^\d,.]/g, "").replace(",", "."));
    return t.trim() && !isNaN(n) ? n / 100 : 0;
  };
  const valorDe = (t: string) => (modo === "montos" ? leerMonto(t) ?? 0 : modo === "porcentaje" ? leerPct(t) : undefined);

  const participantes = $derived<ParticipanteGrupal[]>([
    ...(conmigo ? [{ persona_id: null, valor: valorDe(miValor) }] : []),
    ...elegidas.map((e) => ({ persona_id: e.id, valor: valorDe(e.valor) })),
  ]);
  const baseNum = $derived(leerMonto(base) ?? 0);
  const r = $derived(calcularReparto({ base: baseNum, propinaPct: egreso ? 0 : leerPct(propina), reparto: modo, participantes }));
  const parteDe = (clave: string) => r.partes.find((p) => p.clave === clave)?.monto ?? 0;
  const miParte = $derived(parteDe("yo"));
  const teDeben = $derived(r.total - (conmigo ? miParte : 0));

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    if (cuenta == null) return void (error = "Elige con qué pagaste.");
    guardando = true;
    try {
      await crearGastoGrupal({
        descripcion, fecha, cuenta_id: cuenta, categoria_id: categoria, base: baseNum,
        propinaPct: egreso ? 0 : leerPct(propina), reparto: modo, participantes,
        fecha_acordada: fechaAcordada || null, transaccion_id: egreso?.id ?? null,
      });
      listo(`«${descripcion.trim()}» quedó dividido: tu parte es ${pesos(conmigo ? miParte : 0)} y te deben ${pesos(teDeben)}.`);
      cerrar();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      guardando = false;
    }
  }
</script>

<Panel {abierto} {cerrar} titulo={egreso ? "Dividir este gasto" : "Dividir un gasto"}
  subtitulo={egreso ? `${pesos(egreso.monto)} · ${fechaLarga(egreso.fecha)}` : "Tu parte es gasto; la de los demás, préstamo"}>
  <form id="form-grupal" class="form" onsubmit={guardar}>
    <label class="campo">
      <span class="etiqueta">Qué fue</span>
      <span class="cf-field"><input bind:value={descripcion} placeholder="Cena de cumpleaños, mercado…" required /></span>
    </label>
    {#if !egreso}
      <label class="campo">
        <span class="etiqueta">Total (sin propina)</span>
        <CampoMonto bind:valor={base} grande requerido />
      </label>
      <div class="fila-campos">
        <label class="campo">
          <span class="etiqueta">Propina</span>
          <span class="cf-field"><input bind:value={propina} inputmode="decimal" placeholder="0" /><span class="sufijo">%</span></span>
        </label>
        <label class="campo">
          <span class="etiqueta">Fecha</span>
          <CampoFecha bind:valor={fecha} requerido />
        </label>
      </div>
      <label class="campo">
        <span class="etiqueta">Pagaste con</span>
        <span class="cf-field">
          <select bind:value={cuenta}>{#each cuentas as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}</select>
        </span>
      </label>
    {/if}
    <label class="campo">
      <span class="etiqueta">Categoría de tu parte</span>
      <span class="cf-field">
        <select bind:value={categoria}>
          <option value={null}>Sin categoría</option>
          {#each categorias as k (k.id)}<option value={k.id}>{k.nombre}</option>{/each}
        </select>
      </span>
    </label>

    <div class="campo">
      <span class="etiqueta">Con quién</span>
      <div class="chips">
        {#each libres as p (p.id)}
          <button type="button" class="cf-chip chip-boton" onclick={() => elegir(p)}><Icono nombre="mas" />{p.nombre}</button>
        {/each}
      </div>
      <div class="nueva">
        <span class="cf-field"><input bind:value={nueva} placeholder="Otra persona" aria-label="Nombre de otra persona"
          onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (nueva.trim()) agregarNueva(); } }} /></span>
        <button type="button" class="cf-btn cf-btn--secondary" onclick={agregarNueva} disabled={!nueva.trim()}>Agregar</button>
      </div>
    </div>

    <div class="campo">
      <span class="etiqueta">Cómo se reparte</span>
      <div class="cf-seg" role="group" aria-label="Cómo se reparte">
        <button type="button" aria-pressed={modo === "igual"} onclick={() => (modo = "igual")}>Igual</button>
        <button type="button" aria-pressed={modo === "montos"} onclick={() => (modo = "montos")}>Por montos</button>
        <button type="button" aria-pressed={modo === "porcentaje"} onclick={() => (modo = "porcentaje")}>Por %</button>
      </div>
    </div>

    <div class="partes">
      <div class="parte" class:fuera={!conmigo}>
        <label class="yo"><input type="checkbox" bind:checked={conmigo} /> <b>Tú</b></label>
        {#if conmigo && modo === "montos"}<CampoMonto bind:valor={miValor} etiqueta="Tu parte" />
        {:else if conmigo && modo === "porcentaje"}<span class="cf-field pct"><input bind:value={miValor} inputmode="decimal" placeholder="0" aria-label="Tu porcentaje" /><span class="sufijo">%</span></span>
        {:else}<span></span>{/if}
        <span class="monto">{conmigo ? pesos(miParte) : "No participas"}</span>
      </div>
      {#each elegidas as e (e.id)}
        <div class="parte">
          <span class="quien"><b>{e.nombre}</b>
            <button type="button" class="cf-btn cf-btn--icon quitar" onclick={() => quitar(e.id)} aria-label="Quitar a {e.nombre}"><Icono nombre="cerrar" /></button>
          </span>
          {#if modo === "montos"}<CampoMonto bind:valor={e.valor} etiqueta="Parte de {e.nombre}" />
          {:else if modo === "porcentaje"}<span class="cf-field pct"><input bind:value={e.valor} inputmode="decimal" placeholder="0" aria-label="Porcentaje de {e.nombre}" /><span class="sufijo">%</span></span>
          {:else}<span></span>{/if}
          <span class="monto">{pesos(parteDe(String(e.id)))}</span>
        </div>
      {/each}
      <div class="resumen">
        {#if r.propina}<span class="caption">Propina {pesos(r.propina)} · total pagado {pesos(r.total)}</span>{/if}
        {#if elegidas.length && !r.cuadra}
          <span class="mal">
            {modo === "porcentaje"
              ? (r.falta > 0 ? `Falta repartir ${Math.round(r.falta * 10000) / 100} %` : `Sobra ${Math.round(-r.falta * 10000) / 100} %`)
              : (r.falta > 0 ? `Falta repartir ${pesos(r.falta)}` : `Sobra ${pesos(-r.falta)}`)}
          </span>
        {:else if elegidas.length}
          <span><b>Tu parte {pesos(conmigo ? miParte : 0)}</b> · te deben <b>{pesos(teDeben)}</b></span>
        {:else}
          <span class="caption">Elige con quién dividir.</span>
        {/if}
        {#if modo === "montos" && r.propina}<span class="caption">La propina se reparte en proporción a lo de cada uno.</span>{/if}
      </div>
    </div>

    <label class="campo">
      <span class="etiqueta">Quedaron en pagarte el</span>
      <CampoFecha bind:valor={fechaAcordada} min={fecha} opcional titulo="Quedaron en pagarte el" />
      <span class="ayuda">Opcional. Si pasa la fecha, Cofre te avisa.</span>
    </label>
    {#if egreso}<p class="ayuda">El movimiento se reduce a tu parte y la de cada persona queda como préstamo desde la misma cuenta. El saldo no cambia.</p>{/if}
    {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  </form>
  {#snippet pie()}
    <button class="cf-btn cf-btn--secondary" onclick={cerrar}>Cancelar</button>
    <button class="cf-btn cf-btn--primary" type="submit" form="form-grupal" disabled={guardando || !elegidas.length || !r.cuadra}>Dividir</button>
  {/snippet}
</Panel>

<style>
  .form { display: flex; flex-direction: column; gap: var(--space-4); }
  .form .cf-seg { align-self: stretch; }
  .form .cf-seg button { flex: 1; }
  .chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .chip-boton { cursor: pointer; border: 1px solid var(--line); background: var(--glass-1); color: var(--ink); font: inherit; font-size: 13px; }
  .chip-boton:hover { background: var(--primary-soft); color: var(--primary-text); }
  .chip-boton:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .nueva { display: flex; gap: var(--space-2); }
  .nueva .cf-field { flex: 1; }
  .partes { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); border-radius: var(--r-lg); background: var(--primary-soft); }
  .parte { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) auto; gap: var(--space-2); align-items: center; min-height: 40px; }
  .parte.fuera { opacity: .7; }
  .yo, .quien { display: flex; align-items: center; gap: var(--space-2); min-width: 0; font-size: 14px; }
  .quien b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .quitar { width: 28px; height: 28px; }
  .quitar :global(.cf-icon) { width: 14px; height: 14px; }
  .monto { font-weight: 650; font-size: 14px; color: var(--primary-text); font-variant-numeric: tabular-nums; text-align: right; min-width: 92px; }
  .pct input { min-width: 0; }
  .resumen { display: flex; flex-direction: column; gap: 2px; padding-top: var(--space-2); border-top: 1px solid var(--line); font-size: 14px; }
  .mal { color: var(--over-100-alt); font-weight: 600; }
  .ayuda { font-size: 12px; line-height: 16px; color: var(--ink-2); }
</style>
