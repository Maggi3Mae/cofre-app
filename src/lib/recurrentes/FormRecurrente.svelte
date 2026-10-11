<script lang="ts">
  import CampoFecha from "$lib/ui/CampoFecha.svelte";
  // Crear o editar un movimiento recurrente (panel; hoja en el celular).
  import Panel from "$lib/ui/Panel.svelte";
  import Icono from "$lib/Icono.svelte";
  import CampoMonto from "$lib/ui/CampoMonto.svelte";
  import CampoEtiquetas from "$lib/ui/CampoEtiquetas.svelte";
  import { leerMonto, montoEditable, hoy } from "$lib/formato";
  import { fechaCorta } from "$lib/periodo";
  import {
    crearRecurrente, editarRecurrente, proximas, textoFrecuencia,
    type Recurrente, type RecurrenteNueva, type Frecuencia, type Modo, type Cuenta, type Categoria,
  } from "$lib/datos";

  let { abierto, recurrente, plantilla = null, cuentas, categorias, etiquetas: opciones = [], cerrar, listo }: {
    abierto: boolean;
    /** null = nueva */
    recurrente: Recurrente | null;
    /** Datos iniciales para una nueva («Hacer recurrente» desde un movimiento). */
    plantilla?: RecurrenteNueva | null;
    cuentas: Cuenta[];
    categorias: Categoria[];
    etiquetas?: string[];
    cerrar: () => void;
    listo: (mensaje: string) => void;
  } = $props();

  type Tipo = RecurrenteNueva["tipo"];
  let tipo = $state<Tipo>("egreso");
  let nombre = $state("");
  let monto = $state("");
  let cuentaId = $state<number | null>(null);
  let destinoId = $state<number | null>(null);
  let categoriaId = $state<number | null>(null);
  let frecuencia = $state<Frecuencia>("mensual");
  let dia = $state(1);
  let dia2 = $state(31);
  let mes = $state(1);
  let modo = $state<Modo>("confirmar");
  let inicio = $state("");
  let fin = $state("");
  let notas = $state("");
  let etiquetas = $state<string[]>([]);
  let error = $state("");
  let guardando = $state(false);

  $effect(() => {
    if (!abierto) return;
    const r = recurrente ?? plantilla;
    tipo = r?.tipo ?? "egreso";
    nombre = r?.nombre ?? "";
    monto = r ? montoEditable(r.monto) : "";
    cuentaId = r?.cuenta_id ?? cuentas.find((c) => c.principal)?.id ?? cuentas[0]?.id ?? null;
    destinoId = r?.cuenta_destino_id ?? null;
    categoriaId = r?.categoria_id ?? null;
    frecuencia = r?.frecuencia ?? "mensual";
    dia = r?.dia ?? 1;
    dia2 = r?.dia2 ?? 31;
    mes = r?.mes ?? Number(hoy().slice(5, 7));
    modo = r?.modo ?? "confirmar";
    inicio = r?.inicio ?? hoy();
    fin = r?.fin ?? "";
    notas = r?.notas ?? "";
    etiquetas = [...(r?.etiquetas ?? [])];
    verDias = false;
    error = "";
  });

  const transf = $derived(tipo === "transferencia");
  const cuenta = $derived(cuentas.find((c) => c.id === cuentaId));
  const destinos = $derived(cuentas.filter((c) => c.id !== cuentaId && c.moneda === cuenta?.moneda));
  const cats = $derived(categorias.filter((c) => c.tipo === tipo));

  // Selector de días en cuadrícula (en quincenal se eligen los dos seguidos).
  let verDias = $state(false);
  let paso = $state(0);
  const nombreDia = (d: number) => (d >= 31 ? "Último día" : `Día ${d}`);
  const textoDias = $derived(frecuencia === "quincenal"
    ? `${nombreDia(Math.min(dia, dia2))} y ${nombreDia(Math.max(dia, dia2)).toLowerCase()}` : nombreDia(dia));
  function abrirDias() { paso = 0; verDias = !verDias; }
  function elegirDia(d: number) {
    if (frecuencia !== "quincenal") { dia = d; verDias = false; return; }
    if (paso === 0) { dia = d; paso = 1; return; }
    if (d === dia) return;
    dia2 = d; verDias = false;
  }
  const marcado = (d: number) => d === dia || (frecuencia === "quincenal" && paso === 0 && d === dia2);

  function cambiarFrecuencia(f: Frecuencia) {
    verDias = false;
    if (f === frecuencia) return;
    frecuencia = f;
    if (f === "semanal") dia = Math.min(dia, 5);
    if (f === "quincenal") { dia = 15; dia2 = 31; }
  }

  const regla = $derived({ frecuencia, dia, dia2: frecuencia === "quincenal" ? dia2 : null, mes: frecuencia === "anual" ? mes : null,
    inicio: inicio || hoy(), fin: fin || null });
  const siguientes = $derived(proximas(regla, inicio > hoy() ? inicio : hoy(), 3));

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    const v = leerMonto(monto);
    if (v == null || v <= 0) return void (error = "Escribe un monto mayor que cero.");
    if (cuentaId == null) return void (error = "Elige la cuenta.");
    const datos: RecurrenteNueva = {
      nombre, tipo, monto: v, cuenta_id: cuentaId, cuenta_destino_id: transf ? destinoId : null,
      categoria_id: transf ? null : categoriaId, comercio: recurrente?.comercio ?? plantilla?.comercio ?? null,
      notas, etiquetas, ...regla, modo,
    };
    guardando = true;
    try {
      if (recurrente) { await editarRecurrente(recurrente.id, datos); listo(`«${nombre.trim()}» actualizado.`); }
      else { await crearRecurrente(datos); listo(`«${nombre.trim()}» quedó programado.`); }
      cerrar();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      guardando = false;
    }
  }

  const DIAS_MES = Array.from({ length: 30 }, (_, i) => i + 1);
  const SEMANA = ["L", "M", "X", "J", "V", "S", "D"];
  const NOMBRES_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const FRECUENCIAS: [Frecuencia, string][] = [["mensual", "Mensual"], ["quincenal", "Quincenal"], ["semanal", "Semanal"], ["anual", "Anual"]];
</script>

<Panel {abierto} {cerrar} titulo={recurrente ? "Editar recurrente" : "Nuevo recurrente"}
  subtitulo={recurrente ? recurrente.nombre : "Se registra solo o te pide confirmación en su fecha"}>
  <form id="form-rec" class="form" onsubmit={guardar}>
    <div class="cf-seg" role="group" aria-label="Tipo">
      <button type="button" aria-pressed={tipo === "egreso"} onclick={() => { tipo = "egreso"; categoriaId = null; }}>Egreso</button>
      <button type="button" aria-pressed={tipo === "ingreso"} onclick={() => { tipo = "ingreso"; categoriaId = null; }}>Ingreso</button>
      <button type="button" aria-pressed={transf} onclick={() => (tipo = "transferencia")}>Transferencia</button>
    </div>

    <div class="dos">
      <label class="campo">
        <span class="etiqueta">Nombre</span>
        <span class="cf-field"><input bind:value={nombre} required placeholder={tipo === "ingreso" ? "Nómina" : transf ? "Ahorro a Nequi" : "Arriendo, Netflix…"} /></span>
      </label>
      <label class="campo">
        <span class="etiqueta">Monto</span>
        <CampoMonto bind:valor={monto} moneda={cuenta?.moneda ?? "COP"} requerido etiqueta="Monto" />
      </label>
    </div>

    <div class="dos">
      <label class="campo">
        <span class="etiqueta">{transf ? "Sale de" : tipo === "ingreso" ? "Entra a" : "Cuenta"}</span>
        <span class="cf-field">
          <select bind:value={cuentaId} required>
            {#each cuentas as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
          </select>
        </span>
      </label>
      {#if transf}
        <label class="campo">
          <span class="etiqueta">Llega a</span>
          <span class="cf-field">
            <select bind:value={destinoId} required>
              <option value={null} disabled>Elige…</option>
              {#each destinos as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
            </select>
          </span>
        </label>
      {:else}
        <label class="campo">
          <span class="etiqueta">Categoría</span>
          <span class="cf-field">
            <select bind:value={categoriaId}>
              <option value={null}>Sin categoría</option>
              {#each cats as c (c.id)}<option value={c.id}>{c.padre_id != null ? "— " : ""}{c.nombre}</option>{/each}
            </select>
          </span>
        </label>
      {/if}
    </div>

    <div class="campo">
      <span class="etiqueta" id="rec-frec">Cada cuánto</span>
      <div class="cf-seg ancho" role="group" aria-labelledby="rec-frec">
        {#each FRECUENCIAS as [f, t]}
          <button type="button" aria-pressed={frecuencia === f} onclick={() => cambiarFrecuencia(f)}>{t}</button>
        {/each}
      </div>
    </div>

    {#if frecuencia === "semanal"}
      <div class="campo">
        <span class="etiqueta" id="rec-dia">Día</span>
        <div class="cf-seg semana" role="group" aria-labelledby="rec-dia">
          {#each SEMANA as d, i}
            <button type="button" aria-pressed={dia === i + 1} onclick={() => (dia = i + 1)} aria-label={NOMBRES_SEMANA[i]} title={NOMBRES_SEMANA[i]}>{d}</button>
          {/each}
        </div>
      </div>
    {:else}
      <div class="dos">
        {#if frecuencia === "anual"}
          <label class="campo">
            <span class="etiqueta">Mes</span>
            <span class="cf-field"><select bind:value={mes}>{#each MESES as m, i}<option value={i + 1}>{m}</option>{/each}</select></span>
          </label>
        {/if}
        <div class="campo">
          <span class="etiqueta" id="rec-dias">{frecuencia === "quincenal" ? "Días" : "Día"}</span>
          <button type="button" class="cf-field elegir-dia" aria-expanded={verDias} aria-controls="rec-calendario" onclick={abrirDias}>
            <span>{textoDias}</span><Icono nombre="abajo" />
          </button>
        </div>
      </div>
      {#if verDias}
        <div class="calendario" id="rec-calendario" role="group" aria-labelledby="rec-dias">
          {#if frecuencia === "quincenal"}<span class="caption">{paso === 0 ? "Elige el primer día" : "Ahora el segundo día"}</span>{/if}
          <div class="rejilla">
            {#each DIAS_MES as d}
              <button type="button" aria-pressed={marcado(d)} onclick={() => elegirDia(d)}>{d}</button>
            {/each}
            <button type="button" class="ultimo" aria-pressed={marcado(31)} onclick={() => elegirDia(31)}>Último día</button>
          </div>
        </div>
      {/if}
    {/if}
    <p class="caption">
      {textoFrecuencia(regla)}{#if siguientes.length} · próximas: {siguientes.map(fechaCorta).join(", ")}{:else} · ya no hay fechas{/if}
    </p>

    <div class="campo">
      <span class="etiqueta" id="rec-modo">Al llegar la fecha</span>
      <div class="cf-seg ancho" role="group" aria-labelledby="rec-modo">
        <button type="button" aria-pressed={modo === "confirmar"} onclick={() => (modo = "confirmar")}>Confirmar</button>
        <button type="button" aria-pressed={modo === "auto"} onclick={() => (modo = "auto")}>Automático</button>
      </div>
      <span class="caption">{modo === "confirmar"
        ? "Te aparece en «Por confirmar» y ajustas el monto si cambió. No toca tus saldos hasta confirmarlo."
        : "Se registra en su fecha sin preguntarte. Si borras uno, no se vuelve a crear."}</span>
    </div>

    <div class="dos">
      <label class="campo">
        <span class="etiqueta">Desde</span>
        <CampoFecha bind:valor={inicio} requerido titulo="Desde" />
      </label>
      <div class="campo">
        <span class="etiqueta" id="rec-hasta">Hasta</span>
        <CampoFecha bind:valor={fin} min={inicio} opcional vacio="Sin fecha final" titulo="Hasta" etiqueta="Hasta" />
      </div>
    </div>

    <div class="campo">
      <span class="etiqueta">Etiquetas</span>
      <CampoEtiquetas bind:valor={etiquetas} {opciones} />
    </div>
    <label class="campo">
      <span class="etiqueta">Notas</span>
      <span class="cf-field"><input bind:value={notas} placeholder="Opcional" /></span>
    </label>

    {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  </form>
  {#snippet pie()}
    <button class="cf-btn cf-btn--secondary" onclick={cerrar}>Cancelar</button>
    <button class="cf-btn cf-btn--primary" type="submit" form="form-rec" disabled={guardando}>{recurrente ? "Guardar cambios" : "Programar"}</button>
  {/snippet}
</Panel>

<style>
  .form { display: flex; flex-direction: column; gap: var(--space-4); }
  .dos { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--space-4); }
  .form > .cf-seg, .campo > .cf-seg { align-self: flex-start; max-width: 100%; }
  .semana button { min-width: 40px; }
  /* Segmentos a todo el ancho: opciones iguales y en una sola línea. */
  .cf-seg.ancho { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; align-self: stretch; width: 100%; }
  .cf-seg.ancho button { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-inline: 8px; }
  .elegir-dia { justify-content: space-between; cursor: pointer; font: inherit; color: var(--ink); text-align: left; }
  .elegir-dia :global(.cf-icon) { width: 16px; height: 16px; color: var(--ink-3); transition: transform .15s; }
  .elegir-dia[aria-expanded="true"] :global(.cf-icon) { transform: rotate(180deg); }
  .calendario {
    display: flex; flex-direction: column; gap: var(--space-2); margin-top: calc(var(--space-2) * -1);
    padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--glass-1);
  }
  .rejilla { display: grid; grid-template-columns: repeat(7, minmax(36px, 1fr)); gap: 4px; }
  .rejilla button {
    height: 40px; border: 0; border-radius: var(--r-md); background: transparent; color: var(--ink);
    font: 500 14px/1 var(--font-body, inherit); font-variant-numeric: tabular-nums; cursor: pointer;
  }
  .rejilla button:hover { background: var(--primary-soft); }
  .rejilla button[aria-pressed="true"] { background: var(--primary); color: #fff; font-weight: 650; }
  .rejilla button:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
  .rejilla .ultimo { grid-column: span 3; }
  p.caption { margin-top: calc(var(--space-2) * -1); }
</style>
