<script lang="ts">
  // Simulador de CDT: misma fórmula que Inversiones (calcularCdt). Compara plazos o hasta 3 ofertas.
  import Icono from "$lib/Icono.svelte";
  import CampoMonto from "$lib/ui/CampoMonto.svelte";
  import { pesos, leerMonto, hoy } from "$lib/formato";
  import { calcularCdt, type CalculoCdt } from "$lib/inversiones/calculo";
  import { fechaLarga } from "$lib/inversiones/fechas";
  import type { CdtNuevo } from "$lib/datos";

  let { crear }: { crear: (inicial: Partial<CdtNuevo>) => void } = $props();

  const PLAZOS = [90, 180, 360, 540];
  interface Oferta { nombre: string; tasa: string; plazo: string }

  let monto = $state("");
  let retencion = $state("4");
  let ofertas = $state<Oferta[]>([{ nombre: "Oferta A", tasa: "", plazo: "90" }]);

  const pct = (v: number, d = 2) => `${(v * 100).toLocaleString("es-CO", { maximumFractionDigits: d })} %`;
  const leerPct = (t: string) => {
    const n = Number(t.replace(/[^\d,.]/g, "").replace(",", "."));
    return t.trim() && !isNaN(n) ? n / 100 : null;
  };

  const capital = $derived(leerMonto(monto));
  const ret = $derived(leerPct(retencion) ?? 0.04);

  /** Rentabilidad neta efectiva anual: lo que de verdad rinde después de retención. */
  const eaNeta = (k: CalculoCdt, m: number, dias: number) => Math.pow(k.totalNetoVencimiento / m, 365 / dias) - 1;

  function calcular(tasa: number, plazo: number) {
    if (!capital || capital <= 0) return null;
    const k = calcularCdt({ monto: capital, tasa_ea: tasa, fecha_inicio: hoy(), plazo_dias: plazo, retencion: ret }, hoy());
    return { k, ea: eaNeta(k, capital, plazo) };
  }

  const resultados = $derived(ofertas.map((o) => {
    const t = leerPct(o.tasa), p = Number(o.plazo);
    return t && t > 0 && t < 1 && Number.isInteger(p) && p >= 1 && p <= 3650 ? { t, p, ...calcular(t, p)! } : null;
  }));
  const mejor = $derived.by(() => {
    const vals = resultados.map((r) => (r?.k ? r.ea : -1));
    return vals.filter((v) => v >= 0).length > 1 ? vals.indexOf(Math.max(...vals)) : -1;
  });
  const primera = $derived(resultados[0]);
  const plazos = $derived(primera?.k ? PLAZOS.map((p) => ({ p, ...calcular(primera.t, p)! })) : []);

  function agregar() {
    const letra = String.fromCharCode(65 + ofertas.length);
    ofertas.push({ nombre: `Oferta ${letra}`, tasa: ofertas[0].tasa, plazo: ofertas[0].plazo });
  }
</script>

<section class="cf-glass cf-card entradas" aria-label="Datos del CDT">
  <div class="rejilla">
    <label class="campo">
      <span class="etiqueta">Monto a invertir</span>
      <CampoMonto bind:valor={monto} grande placeholder="10.000.000" />
    </label>
    <label class="campo">
      <span class="etiqueta">Retención en la fuente</span>
      <span class="cf-field"><input bind:value={retencion} inputmode="decimal" /><span class="sufijo">%</span></span>
    </label>
  </div>

  {#each ofertas as o, i}
    <div class="oferta">
      <label class="campo">
        <span class="etiqueta">Nombre</span>
        <span class="cf-field"><input bind:value={o.nombre} /></span>
      </label>
      <label class="campo">
        <span class="etiqueta">Tasa E.A.</span>
        <span class="cf-field"><input bind:value={o.tasa} inputmode="decimal" placeholder="9,5" /><span class="sufijo">%</span></span>
      </label>
      <label class="campo">
        <span class="etiqueta">Plazo</span>
        <span class="cf-field"><input bind:value={o.plazo} inputmode="numeric" maxlength="4" /><span class="sufijo">días</span></span>
      </label>
      {#if i > 0}
        <button class="cf-btn cf-btn--icon quitar" onclick={() => ofertas.splice(i, 1)} aria-label="Quitar {o.nombre}" title="Quitar"><Icono nombre="cerrar" /></button>
      {/if}
    </div>
  {/each}
  {#if ofertas.length < 3}
    <button class="cf-btn cf-btn--ghost agregar" onclick={agregar}><Icono nombre="mas" />Comparar otra oferta</button>
  {/if}
</section>

{#if resultados.some((r) => r?.k)}
  <div class="ofertas" style:--cols={ofertas.length}>
    {#each resultados as r, i}
      <section class="cf-glass cf-card resultado" class:mejor={i === mejor}>
        <header class="cab">
          <b>{ofertas[i].nombre}</b>
          {#if i === mejor}<span class="cf-chip cf-chip--sm cf-chip--brand">Rinde más</span>{/if}
        </header>
        {#if r?.k}
          <span class="cf-overline">Total al vencimiento · {fechaLarga(r.k.vencimiento)}</span>
          <b class="total">{pesos(r.k.totalNetoVencimiento)}</b>
          <dl class="filas">
            <div><dt>Rendimiento bruto</dt><dd>{pesos(r.k.brutoVencimiento)}</dd></div>
            <div><dt>Retención ({pct(ret)})</dt><dd>− {pesos(r.k.retencionVencimiento)}</dd></div>
            <div><dt>Rendimiento neto</dt><dd class="cf-amt-income">{pesos(r.k.netoVencimiento)}</dd></div>
            <div><dt>Rentabilidad neta efectiva</dt><dd>{pct(r.ea)} E.A.</dd></div>
          </dl>
          <button class="cf-btn cf-btn--secondary" onclick={() => crear({
            nombre: `CDT ${ofertas[i].nombre} ${r.p} días`, monto: capital!, tasa_ea: r.t, plazo_dias: r.p, retencion: ret, fecha_inicio: hoy(),
          })}><Icono nombre="mas" />Crear este CDT</button>
        {:else}
          <p class="cf-muted">Escribe la tasa y el plazo.</p>
        {/if}
      </section>
    {/each}
  </div>

  {#if plazos.length}
    <section class="cf-glass cf-card">
      <h2 class="cf-card-title">{ofertas[0].nombre} a distintos plazos</h2>
      <table class="tabla">
        <thead><tr><th>Plazo</th><th>Rendimiento neto</th><th>Total al vencimiento</th><th>Neta efectiva</th></tr></thead>
        <tbody>
          {#each plazos as x (x.p)}
            <tr class:actual={x.p === primera?.p}><td>{x.p} días</td><td>{pesos(x.k.netoVencimiento)}</td><td>{pesos(x.k.totalNetoVencimiento)}</td><td>{pct(x.ea)}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
{:else}
  <section class="cf-glass cf-card"><p class="cf-muted">Escribe el monto, la tasa y el plazo para ver cuánto ganarías.</p></section>
{/if}

<style>
  .entradas { gap: var(--space-4); }
  .rejilla { display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-4); }
  .oferta { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: var(--space-3); align-items: end; }
  .quitar { margin-bottom: 2px; }
  .agregar { align-self: flex-start; }
  .ofertas { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: var(--space-3); }
  .resultado { gap: var(--space-2); }
  .resultado.mejor { outline: 2px solid var(--primary); outline-offset: -2px; }
  .cab { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
  .cab b { font-size: 15px; }
  .total { font: 650 26px/32px var(--font-display); letter-spacing: -.02em; color: var(--primary-text); font-variant-numeric: tabular-nums; }
  .filas { margin: 0 0 var(--space-2); display: flex; flex-direction: column; }
  .filas div { display: flex; justify-content: space-between; gap: var(--space-3); padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
  .filas dt { color: var(--ink-2); }
  .filas dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
  .tabla { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
  .tabla th { text-align: right; font-weight: 600; color: var(--ink-2); font-size: 12px; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  .tabla td { text-align: right; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  .tabla th:first-child, .tabla td:first-child { text-align: left; }
  .tabla tr.actual td { background: var(--primary-soft); color: var(--primary-text); font-weight: 600; }
  @media (max-width: 900px) { .ofertas, .rejilla { grid-template-columns: 1fr; } .oferta { grid-template-columns: 1fr 1fr; } }
</style>
