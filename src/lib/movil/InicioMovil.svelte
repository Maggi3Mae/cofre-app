<script lang="ts">
  // Inicio en el celular (lienzo «Cofre en el celular» → Inicio): Patrimonio con ojito, el mes,
  // presupuestos, te deben y últimos movimientos.
  import Icono from "$lib/Icono.svelte";
  import FilaMovil from "./FilaMovil.svelte";
  import { avisos } from "$lib/alertas/estado-alertas.svelte";
  import { pesos, pesosCorto } from "$lib/formato";
  import { rango, fechaCorta } from "$lib/periodo";
  import {
    patrimonio, historialPatrimonio, totales, listarTransacciones, leerTrm, leerNombre, leerPatrimonioOculto,
    guardarPatrimonioOculto, listarPresupuestos, listarPersonas, mesEnCurso, claseNivel, alCambiarDatos,
    type Patrimonio, type Totales, type Transaccion, type Presupuesto, type Persona,
  } from "$lib/datos";
  import { hoy } from "$lib/formato";
  import { sinc, centro } from "$lib/sinc/estado-sinc.svelte";

  const OCULTO = "$ ••••••";
  const mesNombre = new Intl.DateTimeFormat("es-CO", { month: "long" }).format(new Date());

  let nombre = $state("");
  let pat = $state<Patrimonio | null>(null);
  let cambioMes = $state<number | null>(null);
  let tot = $state<Totales>({ ingresos: 0, egresos: 0, balance: 0 });
  let presup = $state<Presupuesto[]>([]);
  let deudores = $state<Persona[]>([]);
  let ultimos = $state<Transaccion[]>([]);
  let oculto = $state(false);
  let error = $state("");

  leerPatrimonioOculto().then((v) => (oculto = v)).catch(() => {});
  function alternarOculto() {
    oculto = !oculto;
    guardarPatrimonioOculto(oculto).catch(() => {});
  }

  let consulta = 0;
  async function cargar() {
    const id = ++consulta;
    try {
      const trm = await leerTrm();
      const [p, t, pr, dd, u, n] = await Promise.all([
        patrimonio(), totales(rango("mes"), trm), listarPresupuestos(mesEnCurso(), trm), listarPersonas(), listarTransacciones({ limite: 5 }), leerNombre(),
      ]);
      const hp = await historialPatrimonio(p.neto, trm, hoy());
      if (id !== consulta) return;
      pat = p; tot = t; ultimos = u; nombre = n; // se relee al sincronizar
      cambioMes = hp.length > 1 ? hp[hp.length - 1].neto - hp[hp.length - 2].neto : null;
      // Los 3 más cerca del tope.
      presup = [...pr].sort((a, b) => b.pct - a.pct).slice(0, 3);
      deudores = dd.filter((d) => d.pendiente > 0).sort((a, b) => b.vencidos - a.vencidos || (a.proximaFecha ?? "9").localeCompare(b.proximaFecha ?? "9"));
      error = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  cargar();
  $effect(() => alCambiarDatos(cargar));

  const textoNivel: Record<string, string> = { w80: "atención", w90: "casi al límite", over: "te pasaste" };
  const primero = $derived(deudores[0]);
  const chipSinc = $derived(
    !sinc.emparejado ? null
    : sinc.enCurso ? { texto: "Sincronizando…", clase: "cf-chip--brand" }
    : sinc.error ? { texto: `Sin conexión con el ${centro()}`, clase: "cf-chip--warn-80" }
    : { texto: `Al día con el ${centro()}`, clase: "cf-chip--income" },
  );
</script>

<header class="cab">
  <div>
    <h1 class="titulo-pantalla">Hola{nombre ? `, ${nombre}` : ""}</h1>
    <p class="caption sub">Así van tus finanzas en {mesNombre}</p>
  </div>
  {#if chipSinc}
    <a href="/mas" class="cf-chip cf-chip--sm {chipSinc.clase} sinc"><span class="bolita"></span>{chipSinc.texto}</a>
  {/if}
</header>

{#if error}<p class="error-form" role="alert">No se pudo cargar el inicio: {error}</p>{/if}

<section class="cf-balance pat" aria-label="Patrimonio">
  <div class="pat-cab">
    <span class="cf-overline blanco">Patrimonio neto · hoy</span>
    <button type="button" class="ojo" onclick={alternarOculto} aria-pressed={oculto}
      aria-label={oculto ? "Mostrar montos" : "Ocultar montos"}><Icono nombre={oculto ? "ojoTachado" : "ojo"} /></button>
  </div>
  <div class="neto">{oculto ? OCULTO : pat ? pesos(pat.neto, pat.neto < 0 ? "−" : undefined) : "—"}</div>
  {#if cambioMes != null}
    <span class="cambio">
      {#if oculto}{OCULTO} este mes{:else}<Icono nombre={cambioMes < 0 ? "abajo" : "arriba"} />{pesos(Math.abs(cambioMes), cambioMes < 0 ? "−" : "+")} este mes{/if}
    </span>
  {/if}
  <div class="frost">
    <div class="cf-frost"><span class="et">Activos</span><b>{oculto ? OCULTO : pesos(pat?.activos ?? 0)}</b></div>
    <div class="cf-frost"><span class="et">Deudas</span><b>{oculto ? OCULTO : pesos(pat?.deuda ?? 0)}</b></div>
  </div>
</section>

<section class="mes" aria-label="Este mes">
  <a href="/transacciones" class="cf-glass dato">
    <span class="cf-tile cf-tile--income mini"><Icono nombre="ingreso" /></span>
    <span class="cf-overline">Ingresos</span>
    <b class="ing">+ {pesosCorto(tot.ingresos)}</b>
  </a>
  <a href="/transacciones" class="cf-glass dato">
    <span class="cf-tile cf-tile--expense mini"><Icono nombre="egreso" /></span>
    <span class="cf-overline">Egresos</span>
    <b class="egr">− {pesosCorto(tot.egresos)}</b>
  </a>
  <a href="/reportes" class="cf-glass dato">
    <span class="cf-tile cf-tile--brand mini"><Icono nombre="inversiones" /></span>
    <span class="cf-overline">Balance</span>
    <b>{tot.balance < 0 ? "−" : "+"} {pesosCorto(tot.balance)}</b>
  </a>
</section>

{#if presup.length}
  <section class="cf-glass bloque" aria-labelledby="t-pres">
    <div class="bloque-cab"><h2 id="t-pres">Presupuestos del mes</h2><a href="/presupuestos">Ver todos</a></div>
    {#each presup as b (b.categoria_id)}
      <div class="pres">
        <div class="pres-fila"><b>{b.nombre}</b><span class="num">{pesos(b.gastado)} de {pesos(b.limite)}</span></div>
        <div class="cf-bar {b.nivel === 'ok' ? '' : `cf-bar--${claseNivel[b.nivel]}`}"><span style:width="{Math.min(100, b.pct)}%"></span></div>
        {#if b.nivel !== "ok"}<span class="nivel n-{claseNivel[b.nivel]}">{Math.round(b.pct)} % · {textoNivel[b.nivel]}</span>{/if}
      </div>
    {/each}
  </section>
{/if}

{#if avisos.porConfirmar > 0}
  <a href="/recurrentes" class="cf-glass deben">
    <span class="cf-tile cf-tile--brand"><Icono nombre="repetir" /></span>
    <span class="deben-txt"><span class="cf-overline">Recurrentes</span><b class="rec-txt">{avisos.porConfirmar} por confirmar</b></span>
    <Icono nombre="siguiente" clase="chev" />
  </a>
{/if}

{#if primero}
  <a href="/medeben" class="cf-glass deben">
    <span class="cf-tile cf-tile--brand"><Icono nombre="personas" /></span>
    <span class="deben-txt"><span class="cf-overline">Te deben</span><b>{oculto ? OCULTO : pesos(pat?.teDeben ?? 0)}</b></span>
    {#if primero.vencidos > 0}
      <span class="cf-chip cf-chip--sm cf-chip--over-100">{primero.nombre} · vencido</span>
    {:else if primero.proximaFecha}
      <span class="cf-chip cf-chip--sm cf-chip--brand">{primero.nombre} · {fechaCorta(primero.proximaFecha)}</span>
    {/if}
    <Icono nombre="siguiente" clase="chev" />
  </a>
{/if}

<section class="cf-glass bloque ultimos" aria-labelledby="t-ult">
  <div class="bloque-cab"><h2 id="t-ult">Últimos movimientos</h2><a href="/transacciones">Ver todos</a></div>
  {#each ultimos as t (t.id)}<FilaMovil tx={t} conFecha />{/each}
  {#if !ultimos.length}<p class="cf-muted vacio">Aún no tienes movimientos. Toca <b>+</b> para registrar el primero.</p>{/if}
</section>

<style>
  .deben-txt b.rec-txt { font-size: 16px; line-height: 22px; }
  .cab { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .sub { font-size: 13px; line-height: 18px; margin-top: 2px; }
  .sinc { margin-top: 6px; text-decoration: none; flex: none; }
  .bolita { width: 6px; height: 6px; border-radius: 999px; background: currentColor; }

  .pat { padding: 20px; gap: 14px; }
  .pat-cab { display: flex; align-items: center; justify-content: space-between; }
  .blanco { color: rgba(255, 255, 255, .85); }
  .ojo { width: 44px; height: 44px; margin: -10px -10px -10px 0; border: 0; border-radius: 999px; background: transparent; color: #fff; display: grid; place-items: center; position: relative; }
  .neto { position: relative; font: 650 40px/44px var(--font-display); letter-spacing: -.03em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .cambio {
    position: relative; align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
    background: rgba(255, 255, 255, .16); border: 1px solid rgba(255, 255, 255, .24); font-size: 12px; font-weight: 600;
  }
  .cambio :global(.cf-icon) { width: 14px; height: 14px; stroke-width: 2.2; }
  .frost { position: relative; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .frost .cf-frost { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .et { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; opacity: .85; }
  .frost b { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .mes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .dato { border-radius: 20px; padding: 12px; display: flex; flex-direction: column; gap: 8px; text-decoration: none; color: var(--ink); min-width: 0; }
  .mini { width: 32px; height: 32px; border-radius: 10px; }
  .mini :global(.cf-icon) { width: 16px; height: 16px; }
  .dato b { font-size: 14px; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ing { color: var(--income); }
  .egr { color: var(--expense); }

  .bloque { border-radius: 24px; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  .bloque-cab { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .bloque-cab h2 { margin: 0; font: 600 17px/22px var(--font-display); }
  .bloque-cab a { font-size: 13px; font-weight: 600; color: var(--primary-text); text-decoration: none; padding: 10px 0; }
  .pres { display: flex; flex-direction: column; gap: 6px; }
  .pres-fila { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; }
  .pres-fila b { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .num { color: var(--ink-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .nivel { font-size: 12px; font-weight: 600; }
  .n-warn-80 { color: var(--warn-80); }
  .n-warn-90 { color: var(--warn-90); }
  .n-over-100 { color: var(--over-100); }

  .deben { border-radius: 24px; padding: 16px; display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--ink); }
  .deben-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .deben-txt b { font: 650 20px/26px var(--font-display); font-variant-numeric: tabular-nums; }
  .deben :global(.chev) { color: var(--ink-3); }
  .deben .cf-chip { min-width: 0; overflow: hidden; text-overflow: ellipsis; }

  .ultimos { padding: 8px 16px 12px; gap: 0; }
  .ultimos .bloque-cab { padding: 8px 0; }
  .vacio { padding: 10px 0; }
</style>
