<script lang="ts">
  // Movimientos recurrentes: «Por confirmar» arriba y la lista de lo programado.
  // Celular: ver, confirmar y omitir; crear, editar, pausar y eliminar en el Mac o la tablet.
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import Icono from "$lib/Icono.svelte";
  import CampoMonto from "$lib/ui/CampoMonto.svelte";
  import FormRecurrente from "$lib/recurrentes/FormRecurrente.svelte";
  import { pantalla } from "$lib/pantalla.svelte";
  import { pesos, leerMonto, montoEditable, hoy } from "$lib/formato";
  import { fechaCorta } from "$lib/periodo";
  import type { NombreIcono } from "$lib/iconos";
  import {
    listarRecurrentes, porConfirmar, confirmarOcurrencia, omitirOcurrencia, confirmarTodas, activarRecurrente,
    eliminarRecurrente, plantillaDesdeTransaccion, textoFrecuencia, listarCuentas, listarCategorias, listarEtiquetas,
    claseTesela, alCambiarDatos, sumarDias, sugerenciasSuscripcion, descartarSugerencia, plantillaDesdeSugerencia, totalMensual,
    type SugerenciaSuscripcion, type Recurrente, type RecurrenteNueva, type Ocurrencia, type Cuenta, type Categoria,
  } from "$lib/datos";

  let lista = $state<Recurrente[]>([]);
  let pendientes = $state<(Ocurrencia & { valor: string })[]>([]);
  let cuentas = $state<Cuenta[]>([]);
  let categorias = $state<Categoria[]>([]);
  let etiquetas = $state<string[]>([]);
  let sugerencias = $state<SugerenciaSuscripcion[]>([]);
  let mensual = $state({ salen: 0, entran: 0, sinTrm: false });
  let cargando = $state(true);
  let error = $state("");
  let aviso = $state("");
  let confirmarBorrar = $state<number | null>(null);
  let ocupado = $state(false);

  // Formulario
  let formAbierto = $state(false);
  let editando = $state<Recurrente | null>(null);
  let plantilla = $state<RecurrenteNueva | null>(null);

  const activas = $derived(cuentas.filter((c) => !c.archivada && c.tipo !== "inversion"));
  const porRec = $derived(new Map(lista.map((r) => [r.id, r])));

  let consulta = 0;
  async function cargar() {
    const id = ++consulta;
    try {
      const [l, p, c, k, e, sg, tm] = await Promise.all([listarRecurrentes(), porConfirmar(), listarCuentas(true), listarCategorias(),
        listarEtiquetas(), sugerenciasSuscripcion(), totalMensual()]);
      if (id !== consulta) return;
      lista = l;
      // Conserva lo que la persona ya escribió en un monto por confirmar.
      const antes = new Map(pendientes.map((x) => [`${x.recurrente_id}|${x.fecha}`, x.valor]));
      pendientes = p.map((o) => ({ ...o, valor: antes.get(`${o.recurrente_id}|${o.fecha}`) ?? montoEditable(o.monto) }));
      cuentas = c; categorias = k; etiquetas = e.map((x) => x.nombre);
      sugerencias = sg; mensual = tm;
      error = "";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      cargando = false;
    }
  }
  $effect(() => { cargar(); });
  $effect(() => alCambiarDatos(cargar));

  // ?nuevo=1 o ?desde=<id de movimiento> («Hacer recurrente»)
  $effect(() => {
    const q = page.url.searchParams;
    if (pantalla.celular) return;
    const desde = q.get("desde");
    if (desde) {
      plantillaDesdeTransaccion(Number(desde)).then((p) => { if (p) { editando = null; plantilla = p; formAbierto = true; } });
      goto("/recurrentes", { replaceState: true, noScroll: true });
    } else if (q.get("nuevo")) {
      nuevo();
      goto("/recurrentes", { replaceState: true, noScroll: true });
    }
  });

  function nuevo() { editando = null; plantilla = null; formAbierto = true; }
  function desdeSugerencia(sg: SugerenciaSuscripcion) { editando = null; plantilla = plantillaDesdeSugerencia(sg); formAbierto = true; }
  function editar(r: Recurrente) { editando = r; plantilla = null; formAbierto = true; }

  async function accion(f: () => Promise<unknown>, mensaje: string) {
    if (ocupado) return;
    ocupado = true;
    error = "";
    try { await f(); aviso = mensaje; await cargar(); }
    catch (err) { error = err instanceof Error ? err.message : String(err); }
    finally { ocupado = false; }
  }

  function confirmar(o: Ocurrencia & { valor: string }) {
    const v = leerMonto(o.valor);
    if (v == null || v <= 0) return void (error = `Escribe el monto de «${o.nombre}».`);
    accion(() => confirmarOcurrencia(o.recurrente_id, o.fecha, v), `«${o.nombre}» del ${fechaCorta(o.fecha)} quedó registrado.`);
  }

  const dia = hoy();
  const activasN = $derived(lista.filter((r) => r.activa).length);
  const proximaGeneral = $derived(lista.map((r) => r.proxima).filter((f): f is string => !!f).sort()[0] ?? null);
  const cuando = (f: string) => f === dia ? "Hoy" : f === sumarDias(dia, 1) ? "Mañana" : f === sumarDias(dia, -1) ? "Ayer" : fechaCorta(f);
  const signo = (t: string) => (t === "ingreso" ? "+" : t === "egreso" ? "−" : "");
  const icono = (r: { tipo: string; categoria_id: number | null }): NombreIcono =>
    r.tipo === "transferencia" ? "transacciones" : (categorias.find((c) => c.id === r.categoria_id)?.icono ?? "otros");
  const tesela = (r: { tipo: string; categoria_id: number | null }) =>
    r.tipo === "transferencia" ? "cf-tile--brand" : claseTesela(categorias.find((c) => c.id === r.categoria_id)?.color);
</script>

<header class="encabezado">
  <div>
    <a class="volver caption" href={pantalla.celular ? "/mas" : "/transacciones"}><Icono nombre="siguiente" />{pantalla.celular ? "Más" : "Transacciones"}</a>
    <h1 class="titulo-pantalla">Recurrentes</h1>
    <p class="caption">Lo que se repite: arriendo, servicios, nómina, suscripciones…</p>
  </div>
  {#if !pantalla.celular}
    <div class="encabezado-acciones">
      <button class="cf-btn cf-btn--primary" onclick={nuevo} disabled={!activas.length}><Icono nombre="mas" />Nuevo recurrente</button>
    </div>
  {/if}
</header>

{#if error}<p class="error-form" role="alert">{error}</p>{/if}
{#if aviso}<p class="aviso" role="status">{aviso}</p>{/if}

{#if pantalla.celular}
  <!-- Celular (lienzo «Recurrentes · celular») -->
  {#if !cargando}
    <section class="cf-glass cf-card resumen-m" aria-label="Resumen">
      <div><span class="cf-overline">Salen al mes</span><b class="total-m">{pesos(mensual.salen)}</b></div>
      <div class="der-m">
        <b>{activasN} {activasN === 1 ? "programado" : "programados"}</b>
        {#if proximaGeneral}<span class="caption">Próximo: {cuando(proximaGeneral)}</span>{/if}
      </div>
    </section>
  {/if}

  {#if pendientes.length}
    <section class="cf-card pend-m" aria-labelledby="t-pend-m">
      <div class="pend-cab">
        <h2 id="t-pend-m">Por confirmar · {pendientes.length}</h2>
        {#if pendientes.length > 1}
          <button class="cf-btn cf-btn--ghost corto" disabled={ocupado}
            onclick={() => accion(confirmarTodas, `${pendientes.length} movimientos registrados.`)}>Confirmar todas</button>
        {:else}<span class="caption">No toca tus saldos aún</span>{/if}
      </div>
      {#each pendientes as o (`${o.recurrente_id}|${o.fecha}`)}
        {@const r = porRec.get(o.recurrente_id)}
        <div class="pend-item">
          <div class="pend-fila">
            <div class="txt-m"><b class="nom-m">{o.nombre}</b><span class="cap-m">{cuando(o.fecha)}{#if r} · {r.cuenta_nombre}{/if}</span></div>
            <b class="monto-m" class:ing={o.tipo === "ingreso"}>{signo(o.tipo)} {pesos(o.monto)}</b>
          </div>
          <div class="dos-m">
            <button class="cf-btn cf-btn--secondary" disabled={ocupado}
              onclick={() => accion(() => omitirOcurrencia(o.recurrente_id, o.fecha), `«${o.nombre}» omitido.`)}>Omitir</button>
            <button class="cf-btn cf-btn--primary" disabled={ocupado} onclick={() => confirmar(o)}><Icono nombre="check" />Confirmar</button>
          </div>
        </div>
      {/each}
    </section>
  {/if}

  {#if cargando}
    <p class="caption">Cargando…</p>
  {:else if lista.length}
    <h2 class="seccion-m">Programados</h2>
    <section class="cf-glass cf-card lista-m" aria-label="Programados">
      {#each lista as r (r.id)}
        <div class="fila-m" class:pausada={!r.activa}>
          <span class="cf-tile {tesela(r)} mini-m"><Icono nombre={icono(r)} /></span>
          <div class="txt-m">
            <b class="nom-m">{r.nombre}</b>
            <span class="cap-m">
              {#if !r.activa}<span class="modo-m apagado">En pausa</span>{:else if r.modo === "auto"}<span class="modo-m">Auto</span>{/if}
              <span class="corta-m">{textoFrecuencia(r)} · {r.tipo === "transferencia" ? `${r.cuenta_nombre} → ${r.cuenta_destino_nombre}` : r.cuenta_nombre}</span>
            </span>
          </div>
          <div class="der-fila">
            <b class="monto-m" class:ing={r.tipo === "ingreso"}>{signo(r.tipo)} {pesos(r.monto)}</b>
            <span class="cap-m">{r.proxima ? cuando(r.proxima) : "—"}</span>
          </div>
        </div>
      {/each}
    </section>
  {:else}
    <section class="cf-glass cf-card vacio">
      <span class="cf-tile cf-tile--brand"><Icono nombre="repetir" /></span>
      <p>Programa en el computador lo que pagas o recibes siempre (arriendo, servicios, nómina): llega aquí al sincronizar.</p>
    </section>
  {/if}
{:else}
{#if pendientes.length}
  <section class="cf-glass cf-card" aria-labelledby="t-pend">
    <div class="fila-cab">
      <h2 class="cf-card-title" id="t-pend">Por confirmar <span class="cf-chip cf-chip--sm cf-chip--warn-80">{pendientes.length}</span></h2>
      {#if pendientes.length > 1}
        <button class="cf-btn cf-btn--ghost" disabled={ocupado}
          onclick={() => accion(confirmarTodas, `${pendientes.length} movimientos registrados con su monto de siempre.`)}>
          <Icono nombre="check" />Confirmar todas
        </button>
      {/if}
    </div>
    <p class="caption">Ya pasó su fecha. Ajusta el monto si la factura cambió; no tocan tus saldos hasta confirmarlos.</p>
    <div class="filas">
      {#each pendientes as o (`${o.recurrente_id}|${o.fecha}`)}
        {@const r = porRec.get(o.recurrente_id)}
        <article class="fila pend">
          <span class="cf-tile {r ? tesela(r) : ''}"><Icono nombre={r ? icono(r) : "repetir"} /></span>
          <div class="cuerpo">
            <b>{o.nombre}</b>
            <span class="caption">{cuando(o.fecha)}{#if r} · {r.tipo === "transferencia" ? `${r.cuenta_nombre} → ${r.cuenta_destino_nombre}` : r.cuenta_nombre}{/if}</span>
          </div>
          <div class="monto-pend"><CampoMonto bind:valor={o.valor} etiqueta="Monto de {o.nombre}" /></div>
          <div class="acciones">
            <button class="cf-btn cf-btn--ghost" disabled={ocupado}
              onclick={() => accion(() => omitirOcurrencia(o.recurrente_id, o.fecha), `«${o.nombre}» del ${fechaCorta(o.fecha)} omitido.`)}>Omitir</button>
            <button class="cf-btn cf-btn--primary" disabled={ocupado} onclick={() => confirmar(o)}><Icono nombre="check" />Confirmar</button>
          </div>
        </article>
      {/each}
    </div>
  </section>
{/if}

{#if sugerencias.length && !pantalla.celular}
  <section class="cf-glass cf-card" aria-labelledby="t-sug">
    <h2 class="cf-card-title" id="t-sug">Parece que se repite</h2>
    <p class="caption">Pagos del mismo comercio, por un monto parecido, cada mes. ¿Los programas?</p>
    <div class="sugs">
      {#each sugerencias as sg (sg.clave)}
        {@const cat = categorias.find((c) => c.id === sg.categoria_id)}
        <article class="sug">
          <div class="sug-cab">
            <span class="cf-tile {claseTesela(cat?.color)} mini"><Icono nombre={cat?.icono ?? "repetir"} /></span>
            <b>{sg.comercio}</b>
          </div>
          <b class="num sug-monto">{pesos(sg.monto)}<span class="caption"> al mes</span></b>
          <span class="caption">{textoFrecuencia({ frecuencia: "mensual", dia: sg.dia })} · {sg.meses} meses seguidos</span>
          <div class="sug-acc">
            <button class="cf-btn cf-btn--ghost" disabled={ocupado}
              onclick={() => accion(() => descartarSugerencia(sg.clave), `«${sg.comercio}» no se volverá a sugerir.`)}>No es recurrente</button>
            <button class="cf-btn cf-btn--secondary" onclick={() => desdeSugerencia(sg)}><Icono nombre="repetir" />Hacer recurrente</button>
          </div>
        </article>
      {/each}
    </div>
  </section>
{/if}

{#if cargando}
  <p class="caption">Cargando…</p>
{:else if lista.length}
  <section class="cf-glass cf-card" aria-labelledby="t-prog">
    <div class="fila-cab">
      <h2 class="cf-card-title" id="t-prog">Programados</h2>
      <div class="al-mes" aria-label="Equivalente mensual">
        <span><span class="cf-overline">Salen al mes</span><b class="num">{pesos(mensual.salen)}</b></span>
        {#if mensual.entran}<span><span class="cf-overline">Entran</span><b class="num ing">{pesos(mensual.entran)}</b></span>{/if}
      </div>
    </div>
    {#if mensual.sinTrm}<p class="caption">Los recurrentes en dólares no se suman: falta la TRM en Ajustes.</p>{/if}
    <div class="filas">
      {#each lista as r (r.id)}
        <article class="fila" class:pausada={!r.activa}>
          <span class="cf-tile {tesela(r)}"><Icono nombre={icono(r)} /></span>
          <div class="cuerpo">
            <div class="linea">
              <b>{r.nombre}</b>
              {#if !r.activa}<span class="cf-chip cf-chip--sm">Pausado</span>
              {:else if r.modo === "auto"}<span class="cf-chip cf-chip--sm cf-chip--brand" title="Se registra solo en su fecha">Automático</span>
              {:else}<span class="cf-chip cf-chip--sm" title="Te pide confirmación en su fecha">Confirmar</span>{/if}
            </div>
            <span class="caption">
              {textoFrecuencia(r)} · {r.tipo === "transferencia" ? `${r.cuenta_nombre} → ${r.cuenta_destino_nombre}` : r.cuenta_nombre}{#if r.categoria_nombre} · {r.categoria_nombre}{/if}
            </span>
          </div>
          <div class="der">
            <b class="num" class:ing={r.tipo === "ingreso"}>{signo(r.tipo)} {pesos(r.monto)}</b>
            <span class="caption">{r.proxima ? `Próximo: ${cuando(r.proxima)}` : r.activa ? "Terminó" : "En pausa"}</span>
          </div>
          {#if !pantalla.celular}
            <div class="acciones">
              {#if confirmarBorrar === r.id}
                <span class="caption">Los movimientos ya registrados se quedan.</span>
                <button class="cf-btn cf-btn--ghost" onclick={() => (confirmarBorrar = null)}>No</button>
                <button class="cf-btn cf-btn--secondary peligro"
                  onclick={() => { confirmarBorrar = null; accion(() => eliminarRecurrente(r.id), `«${r.nombre}» eliminado.`); }}>Eliminar</button>
              {:else}
                <button class="cf-btn cf-btn--icon" disabled={ocupado} title={r.activa ? "Pausar" : "Reanudar"}
                  aria-label="{r.activa ? 'Pausar' : 'Reanudar'} {r.nombre}"
                  onclick={() => accion(() => activarRecurrente(r.id, !r.activa), r.activa ? `«${r.nombre}» en pausa.` : `«${r.nombre}» reanudado.`)}>
                  <Icono nombre={r.activa ? "pausa" : "reanudar"} />
                </button>
                <button class="cf-btn cf-btn--icon" onclick={() => editar(r)} title="Editar" aria-label="Editar {r.nombre}"><Icono nombre="editar" /></button>
                <button class="cf-btn cf-btn--icon peligro" onclick={() => (confirmarBorrar = r.id)} title="Eliminar" aria-label="Eliminar {r.nombre}"><Icono nombre="papelera" /></button>
              {/if}
            </div>
          {/if}
        </article>
      {/each}
    </div>
  </section>
{:else}
  <section class="cf-glass cf-card vacio">
    <span class="cf-tile cf-tile--brand"><Icono nombre="repetir" /></span>
    <p>Programa lo que pagas o recibes siempre (arriendo, servicios, nómina) y Cofre lo registra por ti o te pide confirmarlo en su fecha.</p>
    {#if pantalla.celular}<p class="caption">Créalos en el computador: llegan aquí al sincronizar.</p>
    {:else}
      <p class="caption">También puedes abrir un movimiento y tocar «Hacer recurrente».</p>
      <button class="cf-btn cf-btn--primary" onclick={nuevo} disabled={!activas.length}><Icono nombre="mas" />Nuevo recurrente</button>
    {/if}
  </section>
{/if}

{/if}

<FormRecurrente abierto={formAbierto} recurrente={editando} {plantilla} cuentas={activas} {categorias} {etiquetas}
  cerrar={() => (formAbierto = false)} listo={(m) => { aviso = m; cargar(); }} />

<style>
  /* ---------- Celular ---------- */
  .resumen-m { flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; }
  .resumen-m > div { display: flex; flex-direction: column; gap: 2px; }
  .total-m { font: 650 30px/34px var(--font-display); letter-spacing: -.02em; color: var(--primary-text); font-variant-numeric: tabular-nums; }
  .der-m { align-items: flex-end; text-align: right; }
  .der-m b { font-size: 15px; }
  .pend-m { gap: 10px; background: color-mix(in srgb, var(--warn-80-soft) 72%, transparent); border: 1px solid color-mix(in srgb, var(--warn-80) 18%, transparent); }
  .pend-cab { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .pend-cab h2 { margin: 0; font: 600 15px/20px var(--font-sans); color: var(--warn-80); }
  .pend-item { display: flex; flex-direction: column; gap: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
  .pend-item:first-of-type { border-top: 0; padding-top: 0; }
  .pend-fila { display: flex; align-items: center; gap: 12px; }
  .dos-m { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .dos-m .cf-btn { height: 40px; }
  .seccion-m { margin: 2px 0 0; font: 600 17px/22px var(--font-display); }
  .lista-m { padding: 4px var(--space-4); gap: 0; }
  .fila-m { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); }
  .fila-m:first-child { border-top: 0; }
  .fila-m.pausada { opacity: .6; }
  .mini-m { width: 40px; height: 40px; border-radius: 12px; flex: none; }
  .mini-m :global(.cf-icon) { width: 20px; height: 20px; }
  .txt-m { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .nom-m { font-size: 15px; line-height: 20px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cap-m { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; line-height: 16px; color: var(--ink-2); white-space: nowrap; }
  .corta-m { overflow: hidden; text-overflow: ellipsis; }
  .modo-m { flex: none; display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 999px; background: var(--primary-soft); color: var(--primary-text); font-size: 11px; font-weight: 600; }
  .modo-m.apagado { background: var(--track); color: var(--ink-2); }
  .der-fila { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .monto-m { flex: none; font-size: 15px; line-height: 20px; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .volver { display: inline-flex; align-items: center; gap: 4px; color: var(--ink-2); text-decoration: none; margin-bottom: 4px; }
  .volver :global(.cf-icon) { transform: rotate(180deg); width: 14px; height: 14px; }
  .aviso { padding: 10px 14px; border-radius: var(--r-md); background: var(--primary-soft); color: var(--primary-text); font-size: 13px; font-weight: 500; align-self: flex-start; }
  .fila-cab { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .cf-card-title { display: flex; align-items: center; gap: var(--space-2); }
  .filas { display: flex; flex-direction: column; gap: var(--space-2); }
  .fila {
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: var(--space-4);
    padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--glass-1);
  }
  .fila.pausada { opacity: .6; }
  .cuerpo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .cuerpo b { font-size: 15px; line-height: 20px; }
  .cuerpo .caption { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .linea { display: flex; align-items: center; gap: var(--space-2); }
  .der { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; white-space: nowrap; }
  .num { font-variant-numeric: tabular-nums; }
  .ing { color: var(--income); }
  .monto-pend { width: 160px; }
  .acciones { display: flex; align-items: center; gap: var(--space-1); }
  .peligro { color: var(--expense); }
  .vacio { align-items: flex-start; gap: var(--space-3); }
  .al-mes { display: flex; gap: var(--space-5); text-align: right; }
  .al-mes > span { display: flex; flex-direction: column; gap: 2px; }
  .al-mes b { font: 650 20px/26px var(--font-display); }
  .sugs { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-3); }
  .sug {
    display: flex; flex-direction: column; gap: 6px; padding: var(--space-3) var(--space-4);
    border: 1px dashed var(--line); border-radius: var(--r-lg); background: var(--glass-1);
  }
  .sug-cab { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
  .sug-cab b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini { width: 32px; height: 32px; border-radius: 10px; }
  .mini :global(.cf-icon) { width: 16px; height: 16px; }
  .sug-monto { font: 650 20px/26px var(--font-display); }
  .sug-acc { display: flex; justify-content: flex-end; gap: var(--space-1); flex-wrap: wrap; margin-top: auto; }
  .vacio p { color: var(--ink-2); max-width: 560px; }

  @media (max-width: 720px) {
    .fila { grid-template-columns: auto minmax(0, 1fr) auto; }
    .fila .acciones { grid-column: 1 / -1; justify-content: flex-end; flex-wrap: wrap; }
    .pend .monto-pend { grid-column: 2 / -1; width: auto; }
  }
</style>
