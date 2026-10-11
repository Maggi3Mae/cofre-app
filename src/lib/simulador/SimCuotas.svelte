<script lang="ts">
  // Simulador de compras a cuotas: usa el mismo cálculo que el registro de compras (calcularPlan).
  import Icono from "$lib/Icono.svelte";
  import CampoMonto from "$lib/ui/CampoMonto.svelte";
  import GraficaBarras from "./GraficaBarras.svelte";
  import { pesos, leerMonto, hoy } from "$lib/formato";
  import { fechaLarga } from "$lib/inversiones/fechas";
  import { calcularPlan, tasaMensual, type Cuenta, type DatosTarjeta, type Plan } from "$lib/datos";

  let { tarjetas, registrar }: {
    /** Tarjetas de crédito activas. */
    tarjetas: Cuenta[];
    registrar: (tarjetaId: number, plan: Plan, internacional: boolean) => void;
  } = $props();

  const PLAZOS = [1, 3, 6, 12, 18, 24, 36, 48];
  const MANUAL = -1;

  let tarjetaId = $state<number>(MANUAL);
  let monto = $state("");
  let internacional = $state(false);
  let numCuotas = $state(12);
  let otra = $state("");
  let tasaManual = $state("");
  let comisionManual = $state("2,9");

  // Al llegar las tarjetas, elegir la principal o la primera con tasa.
  let elegida = false;
  $effect(() => {
    if (elegida || !tarjetas.length) return;
    elegida = true;
    tarjetaId = (tarjetas.find((t) => t.principal && t.tasa_ea) ?? tarjetas.find((t) => t.tasa_ea) ?? tarjetas[0]).id;
  });

  const pct = (v: number, d = 2) => `${(v * 100).toLocaleString("es-CO", { maximumFractionDigits: d })} %`;
  const leerPct = (t: string) => {
    const n = Number(t.replace(/[^\d,.]/g, "").replace(",", "."));
    return t.trim() && !isNaN(n) ? n / 100 : null;
  };

  const tarjeta = $derived(tarjetas.find((t) => t.id === tarjetaId) ?? null);
  /** Sin tasa en la tarjeta: se escribe a mano para esta simulación. */
  const pideTasa = $derived(!tarjeta || !tarjeta.tasa_ea);
  const datos = $derived<DatosTarjeta | null>(
    pideTasa
      ? (leerPct(tasaManual) ? {
          tasa_ea: leerPct(tasaManual), interes_una_cuota: tarjeta?.interes_una_cuota ?? true,
          comision_internacional: tarjeta?.comision_internacional ?? leerPct(comisionManual) ?? 0,
          dia_corte: tarjeta?.dia_corte ?? null, dia_pago: tarjeta?.dia_pago ?? null,
        } : null)
      : tarjeta);
  const base = $derived(leerMonto(monto));
  const n = $derived(otra ? Number(otra) : numCuotas);
  const nValido = $derived(Number.isInteger(n) && n >= 1 && n <= 72);

  const plan = $derived(datos && base && base > 0 && nValido ? calcularPlan(base, n, internacional, datos, hoy()) : null);
  const comparacion = $derived(
    datos && base && base > 0 ? PLAZOS.map((k) => calcularPlan(base, k, internacional, datos, hoy())) : []);
  const otras = $derived(
    base && base > 0 && nValido
      ? tarjetas.filter((t) => t.id !== tarjetaId && t.tasa_ea).map((t) => ({ t, p: calcularPlan(base, n, internacional, t, hoy()) }))
      : []);
  const disponible = $derived(tarjeta?.cupo != null ? tarjeta.cupo - Math.max(0, tarjeta.saldo) : null);
  const excede = $derived(plan && disponible != null && plan.capital > disponible);

  const ea = $derived(datos?.tasa_ea ?? 0);
  const textoTasa = $derived(ea ? `${pct(ea)} E.A. (${pct(tasaMensual(ea) * 12)} N.M.V.)` : "");
  const sobreCapital = (p: Plan) => (p.capital ? p.intereses / p.capital : 0);
</script>

<section class="cf-glass cf-card entradas" aria-label="Datos de la compra">
  <div class="rejilla">
    <label class="campo">
      <span class="etiqueta">Tarjeta</span>
      <span class="cf-field">
        <select bind:value={tarjetaId}>
          {#each tarjetas as t (t.id)}<option value={t.id}>{t.nombre}{t.tasa_ea ? "" : " (sin tasa)"}</option>{/each}
          <option value={MANUAL}>Otra tarjeta (escribir tasa)</option>
        </select>
      </span>
      {#if textoTasa}<span class="ayuda">{textoTasa}{disponible != null ? ` · cupo disponible ${pesos(disponible)}` : ""}</span>{/if}
    </label>
    <label class="campo">
      <span class="etiqueta">Monto de la compra</span>
      <CampoMonto bind:valor={monto} grande placeholder="500.000" />
    </label>
  </div>

  {#if pideTasa}
    <div class="rejilla">
      <label class="campo">
        <span class="etiqueta">Tasa E.A.</span>
        <span class="cf-field"><input bind:value={tasaManual} inputmode="decimal" placeholder="29,66" /><span class="sufijo">%</span></span>
        {#if tarjeta}<span class="ayuda">Esta tarjeta no tiene tasa: puedes ponérsela en Cuentas. Mientras tanto, escríbela aquí.</span>{/if}
      </label>
      {#if !tarjeta}
        <label class="campo">
          <span class="etiqueta">Comisión internacional</span>
          <span class="cf-field"><input bind:value={comisionManual} inputmode="decimal" /><span class="sufijo">%</span></span>
        </label>
      {/if}
    </div>
  {/if}

  <div class="campo">
    <span class="etiqueta">Cuotas</span>
    <div class="cuotas">
      <div class="cf-seg" role="group" aria-label="Número de cuotas">
        {#each PLAZOS as k}
          <button type="button" aria-pressed={!otra && numCuotas === k} onclick={() => { numCuotas = k; otra = ""; }}>{k}</button>
        {/each}
      </div>
      <span class="cf-field corto"><input bind:value={otra} inputmode="numeric" maxlength="2" placeholder="Otra" aria-label="Otro número de cuotas" /></span>
    </div>
  </div>

  <label class="interruptor">
    <input type="checkbox" bind:checked={internacional} />
    <span>Compra internacional
      <small>Suma la comisión de la tarjeta ({pct(datos?.comision_internacional ?? 0, 1)}) al capital antes de calcular las cuotas.</small>
    </span>
  </label>
</section>

{#if plan}
  {#if excede}
    <p class="alerta" role="alert">Esta compra ({pesos(plan.capital)}) supera el cupo disponible de {tarjeta?.nombre} ({pesos(disponible!)}).</p>
  {/if}

  <section class="kpis" aria-label="Resultado">
    <div class="cf-glass cf-card kpi principal">
      <span class="cf-overline">Cuota mensual</span>
      <b>{pesos(plan.cuota)}</b>
      <span class="caption">{plan.numCuotas} {plan.numCuotas === 1 ? "cuota" : "cuotas"}{plan.tasaEA ? "" : " · sin interés"}</span>
    </div>
    <div class="cf-glass cf-card kpi"><span class="cf-overline">Total a pagar</span><b>{pesos(plan.total)}</b></div>
    <div class="cf-glass cf-card kpi">
      <span class="cf-overline">Intereses</span><b class="cf-amt-expense">{pesos(plan.intereses)}</b>
      <span class="caption">{pct(sobreCapital(plan), 1)} sobre el capital</span>
    </div>
    <div class="cf-glass cf-card kpi">
      {#if plan.comision}
        <span class="cf-overline">Comisión internacional</span><b>{pesos(plan.comision)}</b>
        <span class="caption">Capital {pesos(plan.capital)}</span>
      {:else}
        <span class="cf-overline">Monto base</span><b>{pesos(plan.montoBase)}</b>
      {/if}
    </div>
  </section>

  {#if tarjeta && !pideTasa}
    <div class="registrar">
      <button class="cf-btn cf-btn--primary" onclick={() => registrar(tarjeta.id, plan, internacional)}>
        <Icono nombre="tarjeta" />Registrar esta compra
      </button>
      <span class="caption">Se registra como egreso en {tarjeta.nombre}: sube la deuda y cuenta en el presupuesto de su categoría.</span>
    </div>
  {/if}

  <div class="graficas">
    {#if plan.numCuotas > 1}
      <section class="cf-glass cf-card">
        <h2 class="cf-card-title">Cómo se reparte cada cuota</h2>
        <GraficaBarras apiladas descripcion="Capital e interés de cada cuota"
          categorias={plan.filas.map((f) => `${f.numero}`)}
          series={[
            { nombre: "Capital", valores: plan.filas.map((f) => f.capital), color: "--primary" },
            { nombre: "Interés", valores: plan.filas.map((f) => f.interes), color: "--expense" },
          ]} />
      </section>
    {/if}
    <section class="cf-glass cf-card">
      <h2 class="cf-card-title">Comparación de plazos</h2>
      <GraficaBarras apiladas descripcion="Total a pagar por número de cuotas: capital más intereses"
        categorias={comparacion.map((p) => `${p.numCuotas}`)} resaltar={comparacion.findIndex((p) => p.numCuotas === plan.numCuotas)}
        extra={comparacion.map((p) => `Cuota mensual ${pesos(p.cuota)}`)}
        series={[
          { nombre: "Capital", valores: comparacion.map((p) => p.capital), color: "--primary" },
          { nombre: "Intereses", valores: comparacion.map((p) => p.intereses), color: "--expense" },
        ]} />
    </section>
  </div>

  {#if otras.length}
    <section class="cf-glass cf-card">
      <h2 class="cf-card-title">¿Y con mis otras tarjetas?</h2>
      <table class="tabla">
        <thead><tr><th>Tarjeta</th><th>Tasa E.A.</th><th>Cuota</th><th>Total</th><th>Intereses</th></tr></thead>
        <tbody>
          <tr class="actual"><td>{tarjeta?.nombre ?? "Esta"}</td><td>{pct(plan.tasaEA)}</td><td>{pesos(plan.cuota)}</td><td>{pesos(plan.total)}</td><td>{pesos(plan.intereses)}</td></tr>
          {#each otras as o (o.t.id)}
            <tr>
              <td>{o.t.nombre}</td><td>{pct(o.p.tasaEA)}</td><td>{pesos(o.p.cuota)}</td><td>{pesos(o.p.total)}</td>
              <td>{pesos(o.p.intereses)}
                {#if o.p.intereses < plan.intereses}<span class="cf-chip cf-chip--sm cf-chip--income">ahorras {pesos(plan.intereses - o.p.intereses)}</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  <details class="cf-glass cf-card plegable">
    <summary>Tabla comparativa por plazo</summary>
    <table class="tabla">
      <thead><tr><th>Cuotas</th><th>Cuota mensual</th><th>Total</th><th>Intereses</th><th>% sobre capital</th></tr></thead>
      <tbody>
        {#each comparacion as p (p.numCuotas)}
          <tr class:actual={p.numCuotas === plan.numCuotas}>
            <td>{p.numCuotas}</td><td>{pesos(p.cuota)}</td><td>{pesos(p.total)}</td><td>{pesos(p.intereses)}</td><td>{pct(sobreCapital(p), 1)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </details>

  <details class="cf-glass cf-card plegable">
    <summary>Tabla de amortización ({plan.numCuotas} {plan.numCuotas === 1 ? "cuota" : "cuotas"})</summary>
    <table class="tabla">
      <thead><tr><th>#</th><th>Fecha</th><th>Cuota</th><th>Capital</th><th>Interés</th><th>Saldo</th></tr></thead>
      <tbody>
        {#each plan.filas as f (f.numero)}
          <tr><td>{f.numero}</td><td>{fechaLarga(f.fecha)}</td><td>{pesos(f.capital + f.interes)}</td><td>{pesos(f.capital)}</td><td>{pesos(f.interes)}</td><td>{pesos(f.saldo)}</td></tr>
        {/each}
      </tbody>
    </table>
    {#if tarjeta && !(tarjeta.dia_corte && tarjeta.dia_pago)}
      <p class="caption">Las fechas son aproximadas: configura el día de corte y de pago de la tarjeta en Cuentas.</p>
    {/if}
  </details>
{:else}
  <section class="cf-glass cf-card"><p class="cf-muted">
    {pideTasa && !leerPct(tasaManual) ? "Escribe la tasa E.A. para simular." : !nValido ? "Las cuotas van de 1 a 72." : "Escribe el monto de la compra para ver cuánto pagarías."}
  </p></section>
{/if}

<style>
  .entradas { gap: var(--space-4); }
  .rejilla { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
  .ayuda { font-size: 12px; line-height: 16px; color: var(--ink-2); }
  .cuotas { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
  .corto { width: 90px; }
  .alerta { padding: 10px 14px; border-radius: var(--r-md); background: var(--warn-90-soft); color: var(--warn-90); font-size: 13px; font-weight: 600; }
  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
  .kpi { gap: 2px; }
  .kpi b { font-size: 20px; line-height: 26px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .kpi.principal b { font: 650 28px/34px var(--font-display); letter-spacing: -.02em; color: var(--primary-text); }
  .registrar { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .graficas { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
  .graficas > :only-child { grid-column: 1 / -1; }
  .tabla { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
  .tabla th { text-align: right; font-weight: 600; color: var(--ink-2); font-size: 12px; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  .tabla td { text-align: right; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  .tabla th:first-child, .tabla td:first-child { text-align: left; }
  .tabla tr.actual td { background: var(--primary-soft); color: var(--primary-text); font-weight: 600; }
  .tabla .cf-chip { margin-left: 6px; }
  .plegable { gap: var(--space-3); }
  .plegable summary { cursor: pointer; font-weight: 600; font-size: 14px; }
  @media (max-width: 900px) { .kpis { grid-template-columns: 1fr 1fr; } .graficas, .rejilla { grid-template-columns: 1fr; } }
</style>
