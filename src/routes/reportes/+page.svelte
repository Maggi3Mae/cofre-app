<script lang="ts">
  import { pantalla } from "$lib/pantalla.svelte";
  import Icono from "$lib/Icono.svelte";
  import GraficaBarras from "$lib/simulador/GraficaBarras.svelte";
  import {
    listarCuentas, leerTrm, alCambiarDatos, claseTesela, hayUsdEnRango,
    resumenReporte, mensualReporte, topCategoriasReporte, topComerciosReporte, anosConMovimientos,
    filtroAnterior, rangoReporte, variacion,
    type Cuenta, type FiltroReporte, type ResumenReporte, type MesReporte, type CategoriaReporte, type ComercioReporte,
  } from "$lib/datos";
  import { descargarExcel } from "$lib/datos/excel";
  import { esEscritorio } from "$lib/plataforma";
  import { pesos } from "$lib/formato";
  import { nombreMesCorto, nombreMesLargo } from "$lib/periodo";

  const ahora = new Date();

  // ---------- Filtros ----------
  let ano = $state(ahora.getFullYear());
  let mes = $state<number | null>(ahora.getMonth() + 1);
  let cuentaId = $state<number | null>(null);
  const filtro = $derived<FiltroReporte>({ ano, mes, cuentaId });

  let anos = $state<number[]>([ahora.getFullYear()]);
  let cuentas = $state<Cuenta[]>([]);
  const meses = Array.from({ length: 12 }, (_, i) => i + 1);
  const claveMes = (a: number, m: number) => `${a}-${String(m).padStart(2, "0")}`;

  // ---------- Datos ----------
  const VACIO: ResumenReporte = { ingresos: 0, egresos: 0, balance: 0, tasaAhorro: null, movimientos: 0 };
  let res = $state<ResumenReporte>(VACIO);
  let resAnt = $state<ResumenReporte>(VACIO);
  let mensual = $state<MesReporte[]>([]);
  let mensualAnt = $state<MesReporte[]>([]);
  let catsEgr = $state<CategoriaReporte[]>([]);
  let catsIng = $state<CategoriaReporte[]>([]);
  let coms = $state<ComercioReporte[]>([]);
  let usdSinTrm = $state(false);
  let cargando = $state(true);
  let error = $state("");

  let pedido = 0;
  async function cargar() {
    const f = filtro, n = ++pedido;
    error = "";
    try {
      const trm = await leerTrm();
      const [r, ra, m, ma, ce, ci, co, usd] = await Promise.all([
        resumenReporte(f, trm), resumenReporte(filtroAnterior(f), trm),
        mensualReporte(f, trm), mensualReporte({ ...f, ano: f.ano - 1 }, trm),
        topCategoriasReporte(f, "egreso", trm), topCategoriasReporte(f, "ingreso", trm),
        topComerciosReporte(f, trm),
        trm ? Promise.resolve(false) : hayUsdEnRango(rangoReporte(f)),
      ]);
      if (n !== pedido) return; // llegó una respuesta vieja
      res = r; resAnt = ra; mensual = m; mensualAnt = ma; catsEgr = ce; catsIng = ci; coms = co; usdSinTrm = usd;
    } catch (e) {
      if (n === pedido) error = e instanceof Error ? e.message : String(e);
    } finally {
      if (n === pedido) cargando = false;
    }
  }

  async function cargarListas() {
    [anos, cuentas] = await Promise.all([anosConMovimientos().catch(() => anos), listarCuentas(false).catch(() => [])]);
  }
  cargarListas();

  $effect(() => {
    filtro;
    cargar();
  });
  $effect(() => alCambiarDatos(() => { cargarListas(); cargar(); }));

  // ---------- Presentación ----------
  const nombreAnterior = $derived(mes ? `vs ${nombreMesLargo(claveMes(mes === 1 ? ano - 1 : ano, mes === 1 ? 12 : mes - 1)).toLowerCase()}` : `vs ${ano - 1}`);
  const tituloPeriodo = $derived(mes ? nombreMesLargo(claveMes(ano, mes)) : `Año ${ano}`);

  function chip(actual: number, antes: number, subirEsBueno: boolean) {
    const v = variacion(actual, antes);
    if (v == null || !isFinite(v)) return null;
    const pct = v * 100;
    const texto = `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
    const bueno = pct === 0 ? null : (pct > 0) === subirEsBueno;
    return { texto, clase: bueno == null ? "cf-chip--brand" : bueno ? "cf-chip--income" : "cf-chip--expense" };
  }
  const varIng = $derived(chip(res.ingresos, resAnt.ingresos, true));
  const varEgr = $derived(chip(res.egresos, resAnt.egresos, false));
  const varBal = $derived(chip(res.balance, resAnt.balance, true));

  const etiquetasMeses = meses.map((m) => nombreMesCorto(claveMes(2000, m)));
  const hayAno = $derived(mensual.some((m) => m.ingresos || m.egresos));

  let vistaAno = $state<"egresos" | "ingresos">("egresos");
  const hayComparacion = $derived(mensualAnt.some((m) => m.ingresos || m.egresos));

  let tipoCats = $state<"egreso" | "ingreso">("egreso");
  const cats = $derived(tipoCats === "egreso" ? catsEgr : catsIng);
  const maxCom = $derived(Math.max(1, ...coms.map((c) => c.total)));

  /** Enlace a Transacciones con el mismo período y cuenta. */
  const qFiltro = $derived.by(() => {
    const r = rangoReporte(filtro);
    return `periodo=personalizado&desde=${r.desde}&hasta=${r.hasta}${cuentaId != null ? `&cuenta=${cuentaId}` : ""}`;
  });
  // ---------- Excel ----------
  let exportando = $state(false);
  let avisoExcel = $state("");
  async function exportar() {
    exportando = true; avisoExcel = "";
    try {
      const ruta = await descargarExcel(filtro);
      if (ruta) avisoExcel = `Guardado: ${ruta.split(/[\\/]/).pop()}`;
    } catch (e) {
      avisoExcel = e instanceof Error ? e.message : String(e);
    } finally {
      exportando = false;
    }
  }

  const pct = (x: number) => `${Math.round(x * 100)} %`;
</script>

<header class="encabezado">
  <div>
    <h1 class="titulo-pantalla">{pantalla.celular ? "Resumen del mes" : "Reportes"}</h1>
    <p class="caption">{tituloPeriodo}{cuentaId != null ? ` · ${cuentas.find((c) => c.id === cuentaId)?.nombre ?? ""}` : " · Todas las cuentas"}</p>
  </div>
  <div class="encabezado-acciones">
    {#if esEscritorio}
      {#if avisoExcel}<span class="caption" role="status">{avisoExcel}</span>{/if}
      <button class="cf-btn cf-btn--secondary" onclick={exportar} disabled={exportando}>
        <Icono nombre="documento" />{exportando ? "Generando…" : "Descargar Excel"}
      </button>
    {/if}
  </div>
</header>

<div class="filtros">
  <label class="cf-field"><span class="sufijo">Año</span>
    <select bind:value={ano} aria-label="Año">{#each anos as a (a)}<option value={a}>{a}</option>{/each}</select>
  </label>
  <label class="cf-field"><span class="sufijo">Mes</span>
    <select bind:value={mes} aria-label="Mes">
      <option value={null}>Todo el año</option>
      {#each meses as m (m)}<option value={m}>{nombreMesLargo(claveMes(ano, m)).replace(/ de \d+$/, "")}</option>{/each}
    </select>
  </label>
  {#if !pantalla.celular}
  <label class="cf-field"><span class="sufijo">Cuenta</span>
    <select bind:value={cuentaId} aria-label="Cuenta">
      <option value={null}>Todas</option>
      {#each cuentas as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
    </select>
  </label>
  {/if}
</div>

{#if error}<p class="error-form" role="alert">No se pudo cargar el reporte: {error}</p>{/if}
{#if usdSinTrm}
  <p class="aviso-usd">Hay movimientos en dólares y no hay TRM: no se están sumando. <a href="/ajustes">Configúrala en Ajustes</a>.</p>
{/if}

<!-- Resumen -->
<div class="stats">
  {#each [
    { id: "ing", nombre: "Ingresos", valor: res.ingresos, v: varIng, tile: "cf-tile--income", icono: "ingreso" },
    { id: "egr", nombre: "Egresos", valor: res.egresos, v: varEgr, tile: "cf-tile--expense", icono: "egreso" },
  ] as s (s.id)}
    <section class="cf-glass cf-card stat">
      <div class="stat-cab">
        <span class="cf-tile {s.tile}"><Icono nombre={s.icono as "ingreso" | "egreso"} /></span>
        {#if s.v}<span class="cf-chip cf-chip--sm {s.v.clase}" title={nombreAnterior}>{s.v.texto}</span>{/if}
      </div>
      <span class="cf-overline">{s.nombre}</span>
      <b class="stat-monto">{pesos(s.valor)}</b>
      <span class="caption">{s.v ? nombreAnterior : `${res.movimientos} movimientos`}</span>
    </section>
  {/each}
  <section class="cf-glass cf-card stat">
    <div class="stat-cab">
      <span class="cf-tile cf-tile--saving"><Icono nombre="cofre" /></span>
      {#if varBal}<span class="cf-chip cf-chip--sm {varBal.clase}" title={nombreAnterior}>{varBal.texto}</span>{/if}
    </div>
    <span class="cf-overline">Balance</span>
    <b class="stat-monto" class:cf-amt-income={res.balance > 0} class:cf-amt-expense={res.balance < 0}>
      {pesos(Math.abs(res.balance), res.balance > 0 ? "+" : res.balance < 0 ? "−" : undefined)}
    </b>
    <span class="caption">
      {#if res.balance < 0}Gastaste {pesos(-res.balance)} más de lo que entró
      {:else if res.tasaAhorro != null}Ahorraste el {pct(res.tasaAhorro)} de tus ingresos
      {:else}Ingresos menos egresos{/if}
    </span>
  </section>
</div>

<div class="rejilla">
  <!-- Celular: solo el resumen y las categorías (las gráficas y comercios en el Mac o la tablet). -->
  {#if !pantalla.celular}
  <!-- Evolución del año -->
  <section class="cf-glass cf-card completa">
    <div class="fila-cab">
      <h2 class="cf-card-title">Evolución {ano}</h2>
      {#if mes}<span class="caption">Resaltado: {nombreMesLargo(claveMes(ano, mes)).replace(/ de \d+$/, "").toLowerCase()}</span>{/if}
    </div>
    {#if hayAno}
      <GraficaBarras
        categorias={etiquetasMeses}
        series={[
          { nombre: "Ingresos", valores: mensual.map((m) => m.ingresos), color: "--primary" },
          { nombre: "Egresos", valores: mensual.map((m) => m.egresos), color: "--expense" },
        ]}
        resaltar={mes ? mes - 1 : -1}
        extra={mensual.map((m) => `balance ${pesos(Math.abs(m.balance), m.balance < 0 ? "−" : m.balance > 0 ? "+" : undefined)}`)}
        alto={260}
        descripcion="Ingresos y egresos por mes en {ano}"
      />
    {:else}
      <p class="cf-muted">No hay movimientos en {ano}.</p>
    {/if}
  </section>

  <!-- Año vs año -->
  <section class="cf-glass cf-card completa">
    <div class="fila-cab">
      <h2 class="cf-card-title">{ano} vs {ano - 1}</h2>
      <div class="cf-seg" role="group" aria-label="Qué comparar">
        <button aria-pressed={vistaAno === "egresos"} onclick={() => (vistaAno = "egresos")}>Egresos</button>
        <button aria-pressed={vistaAno === "ingresos"} onclick={() => (vistaAno = "ingresos")}>Ingresos</button>
      </div>
    </div>
    {#if hayAno || hayComparacion}
      {@const total = (xs: MesReporte[]) => xs.reduce((s, m) => s + m[vistaAno], 0)}
      {@const v = chip(total(mensual), total(mensualAnt), vistaAno === "ingresos")}
      <p class="caption comparacion">
        {vistaAno === "egresos" ? "Egresos" : "Ingresos"} del año: <b>{pesos(total(mensual))}</b> vs {pesos(total(mensualAnt))}
        {#if v}<span class="cf-chip cf-chip--sm {v.clase}">{v.texto}</span>{/if}
      </p>
      <GraficaBarras
        categorias={etiquetasMeses}
        series={[
          { nombre: String(ano), valores: mensual.map((m) => m[vistaAno]), color: vistaAno === "egresos" ? "--expense" : "--primary" },
          { nombre: String(ano - 1), valores: mensualAnt.map((m) => m[vistaAno]), color: "--ink-3" },
        ]}
        alto={240}
        descripcion="{vistaAno === 'egresos' ? 'Egresos' : 'Ingresos'} por mes, {ano} comparado con {ano - 1}"
      />
    {:else}
      <p class="cf-muted">No hay movimientos en {ano} ni en {ano - 1}.</p>
    {/if}
  </section>

  {/if}

  <!-- Top categorías -->
  <section class="cf-glass cf-card media">
    <div class="fila-cab">
      <h2 class="cf-card-title">Top categorías</h2>
      <div class="cf-seg" role="group" aria-label="Tipo de categoría">
        <button aria-pressed={tipoCats === "egreso"} onclick={() => (tipoCats = "egreso")}>Egresos</button>
        <button aria-pressed={tipoCats === "ingreso"} onclick={() => (tipoCats = "ingreso")}>Ingresos</button>
      </div>
    </div>
    {#if cats.length}
      <ol class="ranking">
        {#each cats as c (c.id ?? "sin")}
          <li>
            <a href={c.id != null ? `/transacciones?categoria=${c.id}&${qFiltro}` : `/transacciones?sin-categoria=1&${qFiltro}`}>
              <span class="cf-tile {c.id != null ? claseTesela(c.color) : 'sin'} mini"><Icono nombre={c.icono ?? "categorias"} /></span>
              <span class="rk-texto">
                <span class="rk-fila"><b>{c.nombre}</b><span class="rk-monto">{pesos(c.total)}</span></span>
                <span class="rk-fila">
                  <span class="cf-bar cf-bar--sm rk-barra"><span style:width="{c.porcentaje * 100}%"></span></span>
                  <span class="caption">{pct(c.porcentaje)}</span>
                </span>
              </span>
            </a>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="cf-muted">No hay {tipoCats === "egreso" ? "egresos" : "ingresos"} en este período.</p>
    {/if}
  </section>

  {#if !pantalla.celular}
  <!-- Top comercios -->
  <section class="cf-glass cf-card media">
    <div class="fila-cab"><h2 class="cf-card-title">Top 15 comercios</h2><span class="caption">% de los egresos</span></div>
    {#if coms.length}
      <table class="tabla">
        <thead><tr><th scope="col">#</th><th scope="col">Comercio</th><th scope="col" class="num">Veces</th><th scope="col" class="num">Total</th><th scope="col" class="num">%</th></tr></thead>
        <tbody>
          {#each coms as c, i (c.comercio)}
            <tr>
              <td><span class="posicion">{i + 1}</span></td>
              <td class="nombre">
                <a href="/transacciones?texto={encodeURIComponent(c.comercio)}&{qFiltro}">{c.comercio}</a>
                <span class="cf-bar cf-bar--sm"><span style:width="{(c.total / maxCom) * 100}%"></span></span>
              </td>
              <td class="num">{c.veces}</td>
              <td class="num"><b>{pesos(c.total)}</b></td>
              <td class="num caption">{pct(c.porcentaje)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="cf-muted">No hay egresos con comercio en este período.</p>
    {/if}
  </section>
  {/if}
</div>

{#if cargando}<p class="caption">Cargando…</p>{/if}

<style>
  .filtros { display: flex; flex-wrap: wrap; gap: var(--space-3); }
  :global(html.celular) .filtros { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  :global(html.celular) .filtros .cf-field { min-width: 0; }
  :global(html.celular) .filtros select { min-width: 0; width: 100%; }
  .filtros .cf-field { height: 44px; }
  .filtros .sufijo { font-size: 12px; color: var(--ink-2); }
  .filtros select { font: 500 14px/20px var(--font-sans); color: var(--ink); border: 0; background: transparent; outline: 0; cursor: pointer; }

  .aviso-usd { padding: 10px 14px; border-radius: var(--r-md); background: var(--warn-80-soft); color: var(--ink); font-size: 13px; }
  .aviso-usd a { color: var(--warn-80); font-weight: 600; }

  .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-5); }
  .stat { gap: var(--space-2); padding: var(--space-5); }
  .stat-cab { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2); }
  .stat-monto { font: 650 24px/30px var(--font-display); letter-spacing: -.02em; }

  .rejilla { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-5); align-items: start; }
  .completa { grid-column: span 2; }
  .fila-cab { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .fila-cab .cf-seg button { height: 32px; padding: 0 var(--space-3); font-size: 13px; }
  .comparacion { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); }
  .comparacion b { color: var(--ink); font-weight: 600; }

  .sin { background: var(--track); color: var(--ink-2); }
  .mini { width: 32px; height: 32px; border-radius: 10px; }
  .mini :global(.cf-icon) { width: 16px; height: 16px; }
  .ranking { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
  .ranking a { display: flex; align-items: center; gap: var(--space-3); padding: 8px; margin: 0 -8px; border-radius: var(--r-md); color: inherit; text-decoration: none; }
  .ranking a:hover { background: var(--glass-1); }
  .ranking a:focus-visible { outline: 2px solid var(--primary); }
  .rk-texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .rk-fila { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .rk-fila b { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rk-monto { font-size: 14px; font-weight: 600; white-space: nowrap; }
  .rk-barra { flex: 1; }
  .rk-fila .caption { min-width: 48px; text-align: right; }

  .tabla { width: 100%; border-collapse: collapse; font-size: 14px; }
  .tabla th { text-align: left; font: 600 11px/16px var(--font-sans); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); padding: 0 6px 8px; border-bottom: 1px solid var(--line); }
  .tabla td { padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .tabla tr:last-child td { border-bottom: 0; }
  .tabla .num { text-align: right; white-space: nowrap; }
  .tabla b { font-weight: 600; }
  .nombre { width: 100%; max-width: 0; }
  .nombre a { display: block; color: var(--ink); font-weight: 600; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px; }
  .nombre a:hover { color: var(--primary-text); }
  .posicion { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 9px; background: var(--primary-soft); color: var(--primary-text); font: 650 13px/1 var(--font-display); }

  @media (max-width: 1180px) {
    .rejilla { grid-template-columns: 1fr; }
    .completa { grid-column: span 1; }
  }
  @media (max-width: 760px) {
    .stats { grid-template-columns: 1fr; }
  }
</style>
