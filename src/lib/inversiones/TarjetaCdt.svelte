<script lang="ts">
  import { pantalla } from "$lib/pantalla.svelte";
  import Icono from "$lib/Icono.svelte";
  import { pesos } from "$lib/formato";
  import { fechaLarga } from "./fechas";
  import { eliminarCdt, retirarCdt, deshacerRetiroCdt, type Cdt, type Cuenta } from "$lib/datos";

  let { cdt, cuentas, editar, listo }: {
    cdt: Cdt;
    cuentas: Cuenta[];
    editar: () => void;
    listo: (mensaje: string) => void;
  } = $props();

  const k = $derived(cdt.calculo);
  const pctTasa = (v: number) => `${(v * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })} %`;
  const historial = $derived(!!cdt.retirado_en);

  const chip = $derived(
    historial ? { clase: "cf-chip--brand", texto: cdt.renovado ? "Renovado" : "Retirado" }
    : k.estado === "vencido" ? { clase: "cf-chip--over-100", texto: "Vencido" }
    : k.estado === "vence_pronto" ? { clase: "cf-chip--warn-80", texto: `Vence en ${k.diasRestantes} ${k.diasRestantes === 1 ? "día" : "días"}` }
    : k.estado === "por_iniciar" ? { clase: "cf-chip--brand", texto: "Por iniciar" }
    : { clase: "cf-chip--income", texto: "Activo" });

  let modo = $state<"" | "borrar" | "retirar">("");
  let destino = $state<number | null>(null);
  let error = $state("");

  function abrirRetiro() {
    destino = cdt.cuenta_origen_id ?? cuentas.find((c) => c.principal)?.id ?? cuentas[0]?.id ?? null;
    error = "";
    modo = "retirar";
  }

  async function hacer(f: () => Promise<void>, mensaje: string) {
    error = "";
    try {
      await f();
      modo = "";
      listo(mensaje);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const nombreDestino = $derived(cuentas.find((c) => c.id === destino)?.nombre ?? "");
</script>

<article class="cdt cf-glass cf-card" class:historial>
  <header class="cab">
    <span class="cf-tile cf-tile--brand"><Icono nombre="inversiones" /></span>
    <div class="titulo">
      <b>{cdt.nombre}</b>
      <span class="caption">
        {pctTasa(cdt.tasa_ea)} E.A.{cdt.banco ? ` · ${cdt.banco}` : ""} · {fechaLarga(cdt.fecha_inicio)} → {fechaLarga(k.vencimiento)}
      </span>
      {#if cdt.cuenta_origen_nombre}<span class="caption">Desde {cdt.cuenta_origen_nombre}</span>{/if}
    </div>
    <div class="chips">
      {#if cdt.renovacion_auto && !historial}<span class="cf-chip cf-chip--sm cf-chip--brand">Se renueva solo</span>{/if}
      <span class="cf-chip cf-chip--sm {chip.clase}">{chip.texto}</span>
    </div>
  </header>

  {#if !historial}
    <div class="plazo">
      <span class="cf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={cdt.plazo_dias}
        aria-valuenow={k.diasTranscurridos} aria-label="Plazo transcurrido">
        <span style:width="{k.progreso * 100}%"></span>
      </span>
      <span class="caption">
        Día {k.diasTranscurridos.toLocaleString("es-CO")} de {cdt.plazo_dias.toLocaleString("es-CO")}
        {#if k.diasRestantes > 0} · faltan {k.diasRestantes.toLocaleString("es-CO")}{/if}
      </span>
    </div>

    <dl class="kpis">
      <div><dt>Invertido</dt><dd>{pesos(cdt.monto)}</dd></div>
      <div><dt>Rendimiento bruto</dt><dd>{pesos(k.brutoHoy)}</dd></div>
      <div><dt>Retención ({pctTasa(cdt.retencion)})</dt><dd class="menos">− {pesos(k.retencionHoy)}</dd></div>
      <div><dt>Rendimiento neto</dt><dd class="cf-amt-income">{pesos(k.netoHoy)}</dd></div>
      <div><dt>Interés del día</dt><dd>{k.interesDia ? pesos(k.interesDia) : "—"}</dd></div>
      <div class="destacado"><dt>Total neto hoy</dt><dd>{pesos(k.totalNetoHoy)}</dd></div>
      <div class="destacado doble"><dt>Total al vencimiento</dt><dd>{pesos(k.totalNetoVencimiento)}</dd></div>
    </dl>
  {:else}
    <p class="caption resumen">
      {pesos(cdt.monto)} → {pesos(k.totalNetoVencimiento)} neto ·
      {cdt.renovado ? `renovado el ${fechaLarga(cdt.retirado_en!)}` : `retirado el ${fechaLarga(cdt.retirado_en!)}${cdt.cuenta_retiro_nombre ? ` a ${cdt.cuenta_retiro_nombre}` : ""}`}
    </p>
  {/if}
  {#if cdt.notas}<p class="caption">{cdt.notas}</p>{/if}

  {#if modo === "retirar"}
    <div class="confirmar" role="group" aria-label="Retirar {cdt.nombre}">
      <label class="campo">
        <span class="etiqueta">¿A qué cuenta llega la plata?</span>
        <span class="cf-field">
          <select bind:value={destino}>
            {#each cuentas as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
            <option value={null}>Ninguna (solo marcar como retirado)</option>
          </select>
        </span>
      </label>
      <div class="acciones">
        <button class="cf-btn cf-btn--ghost" onclick={() => (modo = "")}>Cancelar</button>
        <button class="cf-btn cf-btn--primary" onclick={() => hacer(() => retirarCdt(cdt.id, destino),
          destino != null ? `${pesos(k.totalNetoVencimiento)} pasaron a ${nombreDestino}.` : `«${cdt.nombre}» quedó como retirado.`)}>
          {destino != null ? `Retirar ${pesos(k.totalNetoVencimiento)}` : "Marcar como retirado"}
        </button>
      </div>
    </div>
  {:else if modo === "borrar"}
    <div class="confirmar" role="alertdialog" aria-label="Eliminar {cdt.nombre}">
      <p class="caption">
        Se borra el CDT{cdt.cuenta_origen_nombre || cdt.cuenta_retiro_nombre ? " y sus transferencias: los saldos de las cuentas vuelven a como estaban" : ""}.
      </p>
      <div class="acciones">
        <button class="cf-btn cf-btn--ghost" onclick={() => (modo = "")}>Cancelar</button>
        <button class="cf-btn cf-btn--secondary peligro" onclick={() => hacer(() => eliminarCdt(cdt.id), `«${cdt.nombre}» se eliminó.`)}>Eliminar</button>
      </div>
    </div>
  {:else if !pantalla.celular}
    <!-- Celular: los CDT solo se ven. -->
    <footer class="acciones">
      {#if !historial && k.estado === "vencido"}
        <button class="cf-btn cf-btn--primary" onclick={abrirRetiro}><Icono nombre="billete" />Retirar a cuenta</button>
      {/if}
      {#if historial && !cdt.renovado}
        <button class="cf-btn cf-btn--ghost" onclick={() => hacer(() => deshacerRetiroCdt(cdt.id), "Retiro deshecho.")}><Icono nombre="deshacer" />Deshacer retiro</button>
      {/if}
      <span class="espacio"></span>
      {#if !historial}
        <button class="cf-btn cf-btn--icon" onclick={editar} aria-label="Editar {cdt.nombre}" title="Editar"><Icono nombre="editar" /></button>
      {/if}
      <button class="cf-btn cf-btn--icon peligro" onclick={() => (modo = "borrar")} aria-label="Eliminar {cdt.nombre}" title="Eliminar"><Icono nombre="papelera" /></button>
    </footer>
  {/if}
  {#if error}<p class="error-form" role="alert">{error}</p>{/if}
</article>

<style>
  .cdt { gap: var(--space-4); }
  .cdt.historial { gap: var(--space-2); }
  .cab { display: flex; gap: var(--space-3); align-items: flex-start; }
  .titulo { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .titulo b { font-size: 16px; line-height: 22px; }
  .chips { display: flex; gap: var(--space-1); flex-wrap: wrap; justify-content: flex-end; }
  .plazo { display: flex; flex-direction: column; gap: 6px; }
  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); margin: 0; }
  .kpis .doble { grid-column: span 2; }
  @media (max-width: 760px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .kpis div { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3); border-radius: var(--r-md); background: var(--glass-1); }
  .kpis dt { font-size: 12px; line-height: 16px; color: var(--ink-2); font-weight: 500; }
  .kpis dd { margin: 0; font-size: 15px; line-height: 20px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .kpis .destacado { background: var(--primary-soft); }
  .kpis .destacado dd { color: var(--primary-text); }
  .menos { color: var(--ink-2); }
  .resumen { font-size: 13px; }
  .acciones { display: flex; align-items: center; gap: var(--space-2); }
  .espacio { flex: 1; }
  .confirmar { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-radius: var(--r-lg); background: var(--glass-1); border: 1px solid var(--line); }
  .confirmar .acciones { justify-content: flex-end; }
  .peligro { color: var(--expense); }
</style>
