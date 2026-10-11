<script lang="ts">
  import { pantalla } from "$lib/pantalla.svelte";
  import Icono from "$lib/Icono.svelte";
  import CampoMonto from "$lib/ui/CampoMonto.svelte";
  import { pesos, leerMonto, montoEditable } from "$lib/formato";
  import { fechaLarga } from "./fechas";
  import {
    aportarCajita, retirarCajita, ajustarSaldoCajita, eliminarCajita, type Cajita, type Cuenta,
  } from "$lib/datos";

  let { cajita, cuentas, editar, listo }: {
    cajita: Cajita;
    cuentas: Cuenta[];
    editar: () => void;
    listo: (mensaje: string) => void;
  } = $props();

  const k = $derived(cajita.calculo);
  const pctTasa = (v: number) => `${(v * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })} %`;

  type Modo = "" | "aportar" | "retirar" | "ajustar" | "borrar";
  let modo = $state<Modo>("");
  let monto = $state("");
  let cuenta = $state<number | null>(null);
  let error = $state("");

  const titulos: Record<Exclude<Modo, "" | "borrar">, string> = {
    aportar: "¿Cuánto aportas y desde qué cuenta?",
    retirar: "¿Cuánto retiras y a qué cuenta?",
    ajustar: "¿Cuánto muestra el banco hoy?",
  };

  function abrir(m: Modo) {
    modo = m;
    error = "";
    monto = m === "ajustar" ? montoEditable(k.valorHoy) : m === "retirar" ? "" : k.aporteMensual ? montoEditable(k.aporteMensual) : "";
    cuenta = cuentas.find((c) => c.principal)?.id ?? cuentas[0]?.id ?? null;
  }

  async function confirmar(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    const v = leerMonto(monto);
    if (v == null || v < 0 || (modo !== "ajustar" && v === 0)) return void (error = "Escribe un monto válido.");
    const nombreCuenta = cuentas.find((c) => c.id === cuenta)?.nombre ?? "";
    try {
      if (modo === "aportar") {
        if (cuenta == null) throw new Error("Elige una cuenta.");
        await aportarCajita(cajita.id, cuenta, v);
        listo(`Aportaste ${pesos(v)} a «${cajita.nombre}» desde ${nombreCuenta}.`);
      } else if (modo === "retirar") {
        if (cuenta == null) throw new Error("Elige una cuenta.");
        await retirarCajita(cajita.id, cuenta, v);
        listo(`Retiraste ${pesos(v)} de «${cajita.nombre}» a ${nombreCuenta}.`);
      } else {
        await ajustarSaldoCajita(cajita.id, v);
        listo(`«${cajita.nombre}» quedó en ${pesos(v)}.`);
      }
      modo = "";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function borrar() {
    try {
      await eliminarCajita(cajita.id);
      listo(`«${cajita.nombre}» se eliminó.`);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<article class="cajita cf-glass cf-card">
  <header class="cab">
    <span class="cf-tile cf-tile--income"><Icono nombre="inversiones" /></span>
    <div class="titulo">
      <b>{cajita.nombre}</b>
      <span class="caption">{pctTasa(cajita.tasa_ea)} E.A.{cajita.banco ? ` · ${cajita.banco}` : ""}</span>
    </div>
    <div class="valor">
      <span class="cf-overline">Valor hoy</span>
      <b>{pesos(k.valorHoy)}</b>
    </div>
  </header>

  {#if k.progreso != null}
    <div class="meta">
      <div class="linea">
        <span class="caption">Meta {pesos(cajita.meta!)}{cajita.fecha_meta ? ` · ${fechaLarga(cajita.fecha_meta)}` : ""}</span>
        <span class="caption"><b>{Math.round(k.progreso * 100)} %</b></span>
      </div>
      <span class="cf-bar cf-bar--income" role="progressbar" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(k.progreso * 100)} aria-label="Avance de la meta">
        <span style:width="{k.progreso * 100}%"></span>
      </span>
      <span class="caption">
        {#if k.falta === 0}¡Meta alcanzada!
        {:else}Te faltan {pesos(k.falta!)}{#if k.aporteMensual} · aporta {pesos(k.aporteMensual)} al mes durante {k.mesesRestantes} {k.mesesRestantes === 1 ? "mes" : "meses"}{/if}
        {/if}
      </span>
    </div>
  {/if}

  <dl class="kpis">
    <div><dt>Interés del día</dt><dd>{pesos(k.interesDia)}</dd></div>
    <div><dt>Interés acumulado</dt><dd class="cf-amt-income">{pesos(k.acumulado)}</dd></div>
    <div><dt>Saldo base</dt><dd>{pesos(cajita.saldo)}</dd><span class="caption">desde {fechaLarga(cajita.fecha_saldo)}</span></div>
  </dl>
  {#if cajita.notas}<p class="caption">{cajita.notas}</p>{/if}

  {#if modo === "borrar"}
    <div class="confirmar" role="alertdialog" aria-label="Eliminar {cajita.nombre}">
      <p class="caption">
        Se borra la cajita{cajita.num_movimientos ? ` y sus ${cajita.num_movimientos} transferencias: los saldos de las cuentas vuelven a como estaban` : ""}.
      </p>
      <div class="acciones">
        <button class="cf-btn cf-btn--ghost" onclick={() => (modo = "")}>Cancelar</button>
        <button class="cf-btn cf-btn--secondary peligro" onclick={borrar}>Eliminar</button>
      </div>
    </div>
  {:else if modo}
    <form class="confirmar" onsubmit={confirmar}>
      <span class="etiqueta">{titulos[modo]}</span>
      <div class="campos">
        <CampoMonto bind:valor={monto} requerido etiqueta="Monto" />
        {#if modo !== "ajustar"}
          <span class="cf-field">
            <select bind:value={cuenta} aria-label="Cuenta">
              {#each cuentas as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
            </select>
          </span>
        {/if}
      </div>
      {#if modo === "retirar"}<span class="caption">Disponible: {pesos(k.valorHoy)}</span>{/if}
      {#if modo === "ajustar"}<span class="caption">No crea movimientos: el interés se cuenta desde hoy con este saldo.</span>{/if}
      <div class="acciones">
        <button type="button" class="cf-btn cf-btn--ghost" onclick={() => (modo = "")}>Cancelar</button>
        <button type="submit" class="cf-btn cf-btn--primary">
          {modo === "aportar" ? "Aportar" : modo === "retirar" ? "Retirar" : "Guardar saldo"}
        </button>
      </div>
    </form>
  {:else}
    <footer class="acciones">
      <button class="cf-btn cf-btn--secondary" onclick={() => abrir("aportar")} disabled={!cuentas.length}><Icono nombre="mas" />Aportar</button>
      <button class="cf-btn cf-btn--ghost" onclick={() => abrir("retirar")} disabled={!cuentas.length || k.valorHoy <= 0}><Icono nombre="billete" />Retirar</button>
      <!-- Celular: solo aportar y retirar. -->
      {#if !pantalla.celular}
      <button class="cf-btn cf-btn--ghost" onclick={() => abrir("ajustar")}>Ajustar saldo</button>
      <span class="espacio"></span>
      <button class="cf-btn cf-btn--icon" onclick={editar} aria-label="Editar {cajita.nombre}" title="Editar"><Icono nombre="editar" /></button>
      <button class="cf-btn cf-btn--icon peligro" onclick={() => (modo = "borrar")} aria-label="Eliminar {cajita.nombre}" title="Eliminar"><Icono nombre="papelera" /></button>
      {/if}
    </footer>
  {/if}
  {#if error}<p class="error-form" role="alert">{error}</p>{/if}
</article>

<style>
  .cajita { gap: var(--space-4); }
  .cab { display: flex; gap: var(--space-3); align-items: flex-start; }
  .titulo { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .titulo b { font-size: 16px; line-height: 22px; }
  .valor { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .valor b { font: 650 24px/30px var(--font-display); letter-spacing: -.02em; color: var(--income); font-variant-numeric: tabular-nums; }
  .meta { display: flex; flex-direction: column; gap: 6px; }
  .linea { display: flex; justify-content: space-between; gap: var(--space-3); }
  .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin: 0; }
  .kpis div { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3); border-radius: var(--r-md); background: var(--glass-1); }
  .kpis dt { font-size: 12px; line-height: 16px; color: var(--ink-2); font-weight: 500; }
  .kpis dd { margin: 0; font-size: 15px; line-height: 20px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .acciones { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .espacio { flex: 1; }
  .confirmar { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-radius: var(--r-lg); background: var(--income-soft); }
  .confirmar[role=alertdialog] { background: var(--glass-1); border: 1px solid var(--line); }
  .confirmar .etiqueta { font-size: 13px; font-weight: 600; }
  .confirmar .acciones { justify-content: flex-end; }
  .campos select { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: 400 14px/20px var(--font-sans); color: var(--ink); }
  .campos { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
  .peligro { color: var(--expense); }
  @media (max-width: 760px) { .kpis, .campos { grid-template-columns: 1fr; } }
</style>
