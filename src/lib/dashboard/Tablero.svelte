<script lang="ts">
  import CampoFecha from "$lib/ui/CampoFecha.svelte";
  import { goto } from "$app/navigation";
  import Icono from "$lib/Icono.svelte";
  import type { NombreIcono } from "$lib/iconos";
  import GraficaEvolucion, { type Punto } from "$lib/dashboard/GraficaEvolucion.svelte";
  import MiniPatrimonio from "$lib/dashboard/MiniPatrimonio.svelte";
  import { hoy, monto, pesos } from "$lib/formato";
  import {
    periodos, rango, rangoAnterior, textoPeriodo, fechaCorta, nombreDia, nombreMesCorto, nombreMesLargo,
    aFecha, type Periodo,
  } from "$lib/periodo";
  import {
    patrimonio, historialPatrimonio, totales, hayUsdEnRango, primeraFecha, evolucion, topCategorias, topComercios, resumenCuotas,
    listarTransacciones, avisoSinCategoria, descartarAvisoSinCategoria, leerTrm, leerNombre, leerPatrimonioOculto, guardarPatrimonioOculto, claseTesela, listarPresupuestos, listarPersonas, proximosPagos, mesEnCurso, claseNivel, alCambiarDatos,
    type Patrimonio, type PuntoPatrimonio, type Totales, type TopCategoria, type TopComercio, type ResumenCuotas, type Transaccion, type Presupuesto, type Persona, type ProximoPago,
  } from "$lib/datos";
  import {
    leerTarjetas, guardarTarjetas, PREDETERMINADO, nombresTarjeta, anchosPermitidos,
    type ConfigTarjeta, type IdTarjeta, type Ancho,
  } from "$lib/dashboard/tarjetas";

  // ---------- Período ----------
  let periodo = $state<Periodo>("mes");
  let desdeP = $state("");
  let hastaP = $state("");
  const r = $derived(rango(periodo, desdeP, hastaP));
  const anterior = $derived(rangoAnterior(periodo, desdeP, hastaP));
  /** Parámetros para que los enlaces abran Transacciones con el mismo período. */
  const qPeriodo = $derived(
    `periodo=${periodo}${periodo === "personalizado" ? `&desde=${desdeP}&hasta=${hastaP}` : ""}`,
  );

  // ---------- Datos ----------
  let pat = $state<Patrimonio | null>(null);
  let histPat = $state<PuntoPatrimonio[]>([]);
  let tot = $state<Totales>({ ingresos: 0, egresos: 0, balance: 0 });
  let totAnt = $state<Totales | null>(null);
  let puntos = $state<Punto[]>([]);
  let tituloEvolucion = $state("");
  let cats = $state<TopCategoria[]>([]);
  let coms = $state<TopComercio[]>([]);
  let ultimos = $state<Transaccion[]>([]);
  let sinCategoria = $state(0);
  let cuotas = $state<ResumenCuotas | null>(null);
  let presup = $state<Presupuesto[]>([]);
  let deudores = $state<Persona[]>([]);
  let prox = $state<{ lista: ProximoPago[]; salen: number; entran: number }>({ lista: [], salen: 0, entran: 0 });
  let nombre = $state("");
  leerNombre().then((n) => (nombre = n)).catch(() => {});
  // Ojito: oculta los montos de la tarjeta Patrimonio; se recuerda en Ajustes.
  const OCULTO = "$ ••••••";
  let patOculto = $state(false);
  leerPatrimonioOculto().then((v) => (patOculto = v)).catch(() => {});
  function alternarOculto() {
    patOculto = !patOculto;
    guardarPatrimonioOculto(patOculto).catch(() => {});
  }
  let usdSinTrm = $state(false);
  let cargando = $state(true);
  let error = $state("");

  async function datosEvolucion(trm: number | null): Promise<{ puntos: Punto[]; titulo: string }> {
    const h = hoy();
    let desde: string, hasta = h, por: "dia" | "mes", titulo = "";
    if (periodo === "hoy") {
      const d = aFecha(h); d.setDate(d.getDate() - 6);
      desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      por = "dia"; titulo = "Últimos 7 días";
    } else if (periodo === "todo") {
      desde = (await primeraFecha()) ?? h; por = "mes";
    } else {
      if (!r.desde || !r.hasta) return { puntos: [], titulo: "" };
      desde = r.desde; hasta = r.hasta;
      const dias = (aFecha(hasta).getTime() - aFecha(desde).getTime()) / 864e5;
      por = dias <= 62 ? "dia" : "mes";
    }
    const filas = await evolucion({ desde, hasta }, por, trm);
    const variosAnos = filas.length > 0 && filas[0].clave.slice(0, 4) !== filas[filas.length - 1].clave.slice(0, 4);
    return {
      titulo,
      puntos: filas.map((f) => ({
        etiqueta: por === "dia" ? fechaCorta(f.clave) : nombreMesCorto(f.clave, variosAnos),
        etiquetaLarga: por === "dia" ? nombreDia(f.clave) : nombreMesLargo(f.clave),
        ingresos: f.ingresos, egresos: f.egresos,
      })),
    };
  }

  let consulta = 0;
  async function cargar() {
    const id = ++consulta;
    const rr = r, ant = anterior;
    try {
      const trm = await leerTrm();
      const [p, t, tA, ev, c, co, u, sc, q, usd, pr, dd, px] = await Promise.all([
        patrimonio(), totales(rr, trm), ant ? totales(ant, trm) : Promise.resolve(null), datosEvolucion(trm),
        topCategorias(rr, trm), topComercios(rr, trm), listarTransacciones({ limite: 5 }), avisoSinCategoria(),
        resumenCuotas(hoy(), trm), trm ? Promise.resolve(false) : hayUsdEnRango(rr), listarPresupuestos(mesEnCurso(), trm),
        listarPersonas(), proximosPagos(30),
      ]);
      const hp = await historialPatrimonio(p.neto, trm, hoy());
      if (id !== consulta) return;
      pat = p; histPat = hp; tot = t; totAnt = tA; puntos = ev.puntos; tituloEvolucion = ev.titulo;
      cats = c; coms = co; ultimos = u; sinCategoria = sc; cuotas = q; presup = pr; deudores = dd.filter((d) => d.pendiente > 0); prox = px; usdSinTrm = usd || p.usdSinTrm;
      error = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      cargando = false;
    }
  }

  $effect(() => {
    r; anterior;
    cargar();
  });
  $effect(() => alCambiarDatos(cargar));

  // ---------- Variación vs período anterior ----------
  function variacion(actual: number, previo: number | undefined, subirEsBueno: boolean) {
    if (!anterior || !previo) return null;
    const pct = ((actual - previo) / previo) * 100;
    if (!isFinite(pct)) return null;
    const texto = `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
    const bueno = pct === 0 ? null : (pct > 0) === subirEsBueno;
    return { texto, clase: bueno == null ? "cf-chip--brand" : bueno ? "cf-chip--income" : "cf-chip--expense", nombre: anterior.nombre };
  }
  /** Cambio del patrimonio desde el cierre del mes pasado. */
  const cambioMes = $derived(histPat.length > 1 ? histPat[histPat.length - 1].neto - histPat[histPat.length - 2].neto : null);
  const varIng = $derived(variacion(tot.ingresos, totAnt?.ingresos, true));
  const varEgr = $derived(variacion(tot.egresos, totAnt?.egresos, false));
  const totalEgresosTop = $derived(tot.egresos || 1);
  const maxCom = $derived(Math.max(1, ...coms.map((c) => c.total)));

  async function descartarSin() {
    sinCategoria = 0;
    await descartarAvisoSinCategoria().catch(() => {});
  }

  // ---------- Búsqueda ----------
  let busqueda = $state("");
  function buscar(e: SubmitEvent) {
    e.preventDefault();
    if (busqueda.trim()) goto(`/transacciones?texto=${encodeURIComponent(busqueda.trim())}&periodo=todo`);
  }

  // ---------- Personalizar ----------
  let tarjetas = $state<ConfigTarjeta[]>(PREDETERMINADO.map((t) => ({ ...t })));
  let editando = $state(false);
  let arrastrando = $state<IdTarjeta | null>(null);
  let sobre = $state<IdTarjeta | null>(null);

  leerTarjetas().then((t) => (tarjetas = t)).catch(() => {});

  /** Tarjetas que solo aparecen con datos. */
  const conDatos = $derived<Record<IdTarjeta, boolean>>({
    patrimonio: true, ultimos: true, ingresos: true, egresos: true, balance: true,
    evolucion: true, categorias: true, comercios: true, cuotas: !!cuotas, presupuestos: presup.length > 0, teDeben: deudores.length > 0, proximos: prox.lista.length > 0,
  });
  const visibles = $derived(tarjetas.filter((t) => editando || (!t.oculta && conDatos[t.id])));

  function cambiar(nuevas: ConfigTarjeta[]) {
    tarjetas = nuevas;
    guardarTarjetas(nuevas).catch(() => {});
  }
  function mover(id: IdTarjeta, delta: number) {
    const i = tarjetas.findIndex((t) => t.id === id);
    const j = i + delta;
    if (j < 0 || j >= tarjetas.length) return;
    const n = [...tarjetas];
    [n[i], n[j]] = [n[j], n[i]];
    cambiar(n);
  }
  function soltarEn(origen: IdTarjeta, destino: IdTarjeta) {
    if (origen === destino) return;
    const n = [...tarjetas];
    const i = n.findIndex((t) => t.id === origen);
    const [t] = n.splice(i, 1);
    const j = n.findIndex((x) => x.id === destino);
    n.splice(i <= j ? j + 1 : j, 0, t);
    cambiar(n);
  }
  function ancho(id: IdTarjeta, a: Ancho) {
    cambiar(tarjetas.map((t) => (t.id === id ? { ...t, ancho: a } : t)));
  }
  function alternarOculta(id: IdTarjeta) {
    cambiar(tarjetas.map((t) => (t.id === id ? { ...t, oculta: !t.oculta } : t)));
  }
  function restablecer() {
    cambiar(PREDETERMINADO.map((t) => ({ ...t })));
  }

  // Arrastre con el puntero (más confiable que el arrastre nativo dentro de la app de escritorio).
  function empezarArrastre(e: PointerEvent, id: IdTarjeta) {
    e.preventDefault();
    arrastrando = id;
    sobre = id;
  }
  function moverPuntero(e: PointerEvent) {
    if (!arrastrando) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-tarjeta]");
    if (el) sobre = el.dataset.tarjeta as IdTarjeta;
  }
  function soltar() {
    if (arrastrando && sobre) soltarEn(arrastrando, sobre);
    arrastrando = null;
    sobre = null;
  }
  const nombreAncho: Record<Ancho, string> = { tercio: "1/3", media: "1/2", completa: "Completa" };

  const signoTx = (t: Transaccion) => (t.tipo === "ingreso" ? "+" : t.tipo === "egreso" ? "−" : undefined);
</script>

<svelte:window onpointermove={moverPuntero} onpointerup={soltar} />

<header class="encabezado">
  <div>
    <h1 class="titulo-pantalla">Hola{nombre ? `, ${nombre}` : ""}</h1>
    <p class="caption">Así van tus finanzas {textoPeriodo(periodo)}</p>
  </div>
  <div class="encabezado-acciones">
    <form onsubmit={buscar}>
      <label class="cf-field"><Icono nombre="buscar" /><input bind:value={busqueda} placeholder="Buscar movimientos" aria-label="Buscar movimientos" /></label>
    </form>
    <button class="cf-btn cf-btn--secondary" aria-pressed={editando} onclick={() => (editando = !editando)}>
      <Icono nombre={editando ? "estrella" : "ajustes"} />{editando ? "Listo" : "Personalizar"}
    </button>
    <a class="cf-btn cf-btn--primary" href="/transacciones?nuevo=1"><Icono nombre="mas" />Nuevo movimiento</a>
  </div>
</header>

<div class="periodo">
  <div class="cf-seg" role="group" aria-label="Período">
    {#each periodos as p}
      <button aria-pressed={periodo === p.id} onclick={() => (periodo = p.id)}>{p.nombre}</button>
    {/each}
  </div>
  {#if periodo === "personalizado"}
    <span class="fecha"><CampoFecha bind:valor={desdeP} prefijo="Desde" etiqueta="Desde" max={hastaP} /></span>
    <span class="fecha"><CampoFecha bind:valor={hastaP} prefijo="Hasta" etiqueta="Hasta" min={desdeP} /></span>
  {/if}
</div>

{#if error}<p class="error-form" role="alert">No se pudo cargar el resumen: {error}</p>{/if}

{#if editando}
  <div class="barra-edicion" role="status">
    <span>Arrastra las tarjetas con <Icono nombre="arrastrar" clase="mini-icono" /> o usa las flechas. Puedes ocultarlas o cambiar su ancho.</span>
    <button class="cf-btn cf-btn--ghost" onclick={restablecer}>Restablecer</button>
  </div>
{:else}
  {#if sinCategoria > 0}
    <div class="aviso-sin">
      <Icono nombre="categorias" />
      <span>Tienes <b>{sinCategoria}</b> {sinCategoria === 1 ? "movimiento" : "movimientos"} sin categoría</span>
      <a class="ir" href="/transacciones?sin-categoria=1">Categorizar <Icono nombre="siguiente" /></a>
      <button class="cf-btn cf-btn--icon descartar" onclick={descartarSin} aria-label="Descartar aviso" title="Descartar: vuelve a salir si llegan movimientos sin categoría nuevos">
        <Icono nombre="cerrar" />
      </button>
    </div>
  {/if}
  {#if usdSinTrm}
    <p class="aviso-usd">Tienes cuentas o movimientos en dólares que no se están sumando. <a href="/cuentas">Configura la TRM en Cuentas</a>.</p>
  {/if}
{/if}

<div class="tablero" class:editando class:arrastrando={!!arrastrando}>
  {#each visibles as t (t.id)}
    <div class="celda {t.ancho}" data-tarjeta={t.id} class:oculta={t.oculta}
      class:origen={arrastrando === t.id} class:destino={arrastrando && sobre === t.id && arrastrando !== t.id}>
      {#if editando}
        <div class="herramientas">
          <button class="asa" onpointerdown={(e) => empezarArrastre(e, t.id)} aria-label="Arrastrar {nombresTarjeta[t.id]}" title="Arrastrar">
            <Icono nombre="arrastrar" />
          </button>
          <b>{nombresTarjeta[t.id]}</b>
          <span class="espacio"></span>
          <div class="cf-seg anchos" role="group" aria-label="Ancho de {nombresTarjeta[t.id]}">
            {#each anchosPermitidos[t.id] as a}
              <button aria-pressed={t.ancho === a} onclick={() => ancho(t.id, a)}>{nombreAncho[a]}</button>
            {/each}
          </div>
          <button class="cf-btn cf-btn--icon h" onclick={() => mover(t.id, -1)} aria-label="Subir {nombresTarjeta[t.id]}"><Icono nombre="arriba" /></button>
          <button class="cf-btn cf-btn--icon h" onclick={() => mover(t.id, 1)} aria-label="Bajar {nombresTarjeta[t.id]}"><Icono nombre="abajo" /></button>
          <button class="cf-btn cf-btn--icon h" onclick={() => alternarOculta(t.id)}
            aria-label={t.oculta ? `Mostrar ${nombresTarjeta[t.id]}` : `Ocultar ${nombresTarjeta[t.id]}`} title={t.oculta ? "Mostrar" : "Ocultar"}>
            <Icono nombre={t.oculta ? "ojoTachado" : "ojo"} />
          </button>
        </div>
      {/if}

      {#if t.id === "patrimonio"}
        <section class="cf-balance alto">
          <div class="pat-cabeza">
            <span class="cf-overline">Patrimonio neto · hoy</span>
            <button class="pat-ojo" type="button" onclick={alternarOculto}
              aria-label={patOculto ? "Mostrar montos" : "Ocultar montos"} aria-pressed={patOculto}
              title={patOculto ? "Mostrar montos" : "Ocultar montos"}>
              <Icono nombre={patOculto ? "ojoTachado" : "ojo"} />
            </button>
          </div>
          <div class="pat-monto">
            <span class="cf-balance-amount">{patOculto ? OCULTO : pat ? pesos(pat.neto, pat.neto < 0 ? "−" : undefined) : "—"}</span>
            {#if cambioMes != null}
              <span class="cf-chip cf-chip--sm pat-chip" title="Cambio desde el cierre del mes pasado">
                {#if patOculto}{OCULTO} este mes{:else}<Icono nombre={cambioMes < 0 ? "abajo" : "arriba"} />{pesos(Math.abs(cambioMes), cambioMes < 0 ? "−" : "+")} este mes{/if}
              </span>
            {/if}
          </div>
          {#if histPat.length > 1}<div class="pat-grafica"><MiniPatrimonio puntos={histPat} oculto={patOculto} /></div>{/if}
          <div class="frost-fila">
            <div class="cf-frost"><span class="cf-overline">Activos</span><b>{patOculto ? OCULTO : pesos(pat?.activos ?? 0)}</b></div>
            <div class="cf-frost"><span class="cf-overline">Deuda de tarjetas</span><b>{patOculto ? OCULTO : pesos(pat?.deuda ?? 0, (pat?.deuda ?? 0) > 0 ? "−" : undefined)}</b></div>
          </div>
        </section>

      {:else if t.id === "ingresos" || t.id === "egresos"}
        {@const ing = t.id === "ingresos"}
        {@const v = ing ? varIng : varEgr}
        <section class="cf-glass cf-card stat alto">
          <div class="stat-cab">
            <span class="cf-tile {ing ? 'cf-tile--income' : 'cf-tile--expense'}"><Icono nombre={ing ? "ingreso" : "egreso"} /></span>
            {#if v}<span class="cf-chip cf-chip--sm {v.clase}" title={v.nombre}>{v.texto}</span>{/if}
          </div>
          <span class="cf-overline">{ing ? "Ingresos" : "Egresos"}</span>
          <b class="stat-monto">{pesos(ing ? tot.ingresos : tot.egresos)}</b>
          {#if v}<span class="caption">{v.nombre}</span>{/if}
        </section>

      {:else if t.id === "balance"}
        {@const pctQuedo = tot.ingresos > 0 ? Math.round((tot.balance / tot.ingresos) * 100) : null}
        <section class="cf-glass cf-card stat alto">
          <div class="stat-cab"><span class="cf-tile cf-tile--saving"><Icono nombre="cofre" /></span></div>
          <span class="cf-overline">Balance</span>
          <b class="stat-monto" class:cf-amt-income={tot.balance > 0} class:cf-amt-expense={tot.balance < 0}>
            {pesos(tot.balance, tot.balance > 0 ? "+" : tot.balance < 0 ? "−" : undefined)}
          </b>
          <span class="caption">
            {#if tot.balance < 0}Gastaste {pesos(-tot.balance)} más de lo que entró
            {:else if pctQuedo != null}Te quedó el {pctQuedo} % de tus ingresos
            {:else}Ingresos menos egresos{/if}
          </span>
        </section>

      {:else if t.id === "evolucion"}
        <section class="cf-glass cf-card alto">
          <div class="fila-cab">
            <h2 class="cf-card-title">Evolución</h2>
            {#if tituloEvolucion}<span class="caption">{tituloEvolucion}</span>{/if}
          </div>
          {#if puntos.length > 1}
            <GraficaEvolucion {puntos} descripcion="Ingresos y egresos {tituloEvolucion || textoPeriodo(periodo)}" />
          {:else}
            <p class="cf-muted">Elige un período más largo para ver la evolución.</p>
          {/if}
        </section>

      {:else if t.id === "categorias"}
        <section class="cf-glass cf-card alto">
          <div class="fila-cab"><h2 class="cf-card-title">Top categorías de gasto</h2></div>
          {#if cats.length}
            <ol class="ranking">
              {#each cats as c (c.id ?? "sin")}
                {@const pct = Math.round((c.total / totalEgresosTop) * 100)}
                <li>
                  <a href={c.id != null ? `/transacciones?categoria=${c.id}&${qPeriodo}` : `/transacciones?sin-categoria=1&${qPeriodo}`}>
                    <span class="cf-tile {c.id != null ? claseTesela(c.color) : 'sin'} mini"><Icono nombre={c.icono ?? "categorias"} /></span>
                    <span class="rk-texto">
                      <span class="rk-fila"><b>{c.nombre}</b><span class="rk-monto">{pesos(c.total)}</span></span>
                      <span class="rk-fila">
                        <span class="cf-bar cf-bar--sm rk-barra"><span style:width="{pct}%"></span></span>
                        <span class="caption">{pct} %</span>
                      </span>
                    </span>
                  </a>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="cf-muted">No hay gastos en este período.</p>
          {/if}
        </section>

      {:else if t.id === "comercios"}
        <section class="cf-glass cf-card alto">
          <div class="fila-cab"><h2 class="cf-card-title">Top comercios</h2></div>
          {#if coms.length}
            <ol class="ranking">
              {#each coms as c, i (c.comercio)}
                <li>
                  <a href="/transacciones?texto={encodeURIComponent(c.comercio)}&{qPeriodo}">
                    <span class="posicion">{i + 1}</span>
                    <span class="rk-texto">
                      <span class="rk-fila"><b>{c.comercio}</b><span class="rk-monto">{pesos(c.total)}</span></span>
                      <span class="rk-fila">
                        <span class="cf-bar cf-bar--sm rk-barra"><span style:width="{(c.total / maxCom) * 100}%"></span></span>
                        <span class="caption">{c.veces} {c.veces === 1 ? "vez" : "veces"}</span>
                      </span>
                    </span>
                  </a>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="cf-muted">No hay gastos en este período.</p>
          {/if}
        </section>

      {:else if t.id === "ultimos"}
        <section class="cf-glass cf-card alto">
          <div class="fila-cab"><h2 class="cf-card-title">Últimos movimientos</h2><a class="cf-btn cf-btn--ghost" href="/transacciones">Ver todo</a></div>
          {#if ultimos.length}
            <div>
              {#each ultimos as m (m.id)}
                <div class="mov">
                  {#if m.tipo === "transferencia"}
                    <span class="cf-tile cf-tile--brand"><Icono nombre="transacciones" /></span>
                  {:else}
                    <span class="cf-tile {m.categoria_id != null ? claseTesela(m.categoria_color) : 'sin'}"><Icono nombre={m.categoria_icono ?? "categorias"} /></span>
                  {/if}
                  <div class="mov-txt">
                    <b>{m.comercio || (m.tipo === "transferencia" ? "Transferencia" : m.tipo === "ingreso" ? "Ingreso" : "Egreso")}</b>
                    <span class="caption">
                      {m.tipo === "transferencia" ? `${m.cuenta_nombre} → ${m.cuenta_destino_nombre}` : `${m.categoria_nombre ?? "Sin categoría"} · ${m.cuenta_nombre}`}
                      · {nombreDia(m.fecha) === "Hoy" || nombreDia(m.fecha) === "Ayer" ? nombreDia(m.fecha) : fechaCorta(m.fecha)}
                    </span>
                  </div>
                  <span class="cf-txn-amt" class:cf-amt-income={m.tipo === "ingreso"} class:cf-amt-expense={m.tipo === "egreso"}>
                    {monto(m.monto, m.cuenta_moneda, signoTx(m))}
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="cf-muted">Aún no tienes movimientos. <a href="/transacciones?nuevo=1">Registra el primero</a>.</p>
          {/if}
        </section>

      {:else if t.id === "presupuestos"}
        <section class="cf-glass cf-card alto">
          <div class="fila-cab"><h2 class="cf-card-title">Presupuestos del mes</h2><a class="cf-btn cf-btn--ghost" href="/presupuestos">Ver todo</a></div>
          {#if presup.length}
            <ol class="ranking">
              {#each presup.slice(0, 4) as b (b.categoria_id)}
                <li>
                  <a href="/presupuestos">
                    <span class="cf-tile {claseTesela(b.color)} mini"><Icono nombre={b.icono ?? "otros"} /></span>
                    <span class="rk-texto">
                      <span class="rk-fila"><b>{b.nombre}</b><span class="rk-monto">{pesos(b.gastado)} <span class="caption">de {pesos(b.limite)}</span></span></span>
                      <span class="rk-fila">
                        <span class="cf-bar cf-bar--sm cf-bar--{claseNivel[b.nivel]} rk-barra"><span style:width="{Math.min(100, b.pct)}%"></span></span>
                        <span class="cf-chip cf-chip--sm cf-chip--{claseNivel[b.nivel]}">{Math.round(b.pct)} %</span>
                      </span>
                    </span>
                  </a>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="cf-muted">Ponle un límite a tus categorías en <a href="/presupuestos">Presupuestos</a>.</p>
          {/if}
        </section>

      {:else if t.id === "teDeben"}
        <section class="cf-glass cf-card alto">
          <div class="fila-cab"><h2 class="cf-card-title">Te deben</h2><a class="cf-btn cf-btn--ghost" href="/medeben">Ver todo</a></div>
          {#if deudores.length}
            <b class="te-deben-total">{patOculto ? OCULTO : pesos(pat?.teDeben ?? 0)}</b>
            <ol class="ranking">
              {#each deudores.slice(0, 4) as d (d.id)}
                <li>
                  <a href="/medeben?persona={d.id}">
                    <span class="inicial-mini" aria-hidden="true">{d.nombre.trim().charAt(0).toUpperCase()}</span>
                    <span class="rk-texto">
                      <span class="rk-fila">
                        <b>{d.nombre}</b>
                        <span class="rk-monto" class:vencido={d.vencidos > 0}>{patOculto ? OCULTO : pesos(d.pendiente)}</span>
                      </span>
                      <span class="rk-fila">
                        <span class="cf-bar cf-bar--sm rk-barra"><span style:width="{d.progreso * 100}%"></span></span>
                        {#if d.vencidos > 0}<span class="cf-chip cf-chip--sm cf-chip--over-100">Vencido</span>
                        {:else if d.proximaFecha}<span class="caption">{fechaCorta(d.proximaFecha)}</span>{/if}
                      </span>
                    </span>
                  </a>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="cf-muted">Cuando le prestes plata a alguien, regístralo en <a href="/medeben">Me deben</a> y aquí verás cuánto te falta por recibir.</p>
          {/if}
        </section>

      {:else if t.id === "proximos"}
        {@const pend = prox.lista.filter((x) => x.porConfirmar).length}
        <section class="cf-glass cf-card alto">
          <div class="fila-cab"><h2 class="cf-card-title">Próximos pagos</h2><a class="cf-btn cf-btn--ghost" href="/recurrentes">Ver todo</a></div>
          {#if prox.lista.length}
            <div class="prox-totales">
              <div><span class="cf-overline">Salen · 30 días</span><b class="te-deben-total">{pesos(prox.salen)}</b></div>
              {#if prox.entran}<div class="der"><span class="cf-overline">Entran</span><b class="prox-entran">{pesos(prox.entran)}</b></div>{/if}
            </div>
            {#if pend}<a class="prox-pend" href="/recurrentes"><Icono nombre="repetir" />{pend} por confirmar</a>{/if}
            <ol class="ranking">
              {#each prox.lista.slice(0, 5) as x (`${x.recurrente_id}|${x.fecha}`)}
                <li>
                  <a href="/recurrentes">
                    <span class="cf-tile {x.tipo === 'transferencia' ? 'cf-tile--brand' : claseTesela(x.color)} mini">
                      <Icono nombre={(x.tipo === "transferencia" ? "transacciones" : x.icono ?? "otros") as NombreIcono} />
                    </span>
                    <span class="rk-texto">
                      <span class="rk-fila">
                        <b>{x.nombre}</b>
                        <span class="rk-monto" class:prox-ing={x.tipo === "ingreso"}>{x.tipo === "ingreso" ? "+ " : ""}{pesos(x.monto)}</span>
                      </span>
                      <span class="rk-fila">
                        <span class="caption">{fechaCorta(x.fecha)}{x.modo === "auto" ? " · automático" : ""}</span>
                        {#if x.porConfirmar}<span class="cf-chip cf-chip--sm cf-chip--warn-80">Por confirmar</span>{/if}
                      </span>
                    </span>
                  </a>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="cf-muted">Programa tu arriendo, servicios o nómina en <a href="/recurrentes">Recurrentes</a> y aquí verás lo que viene.</p>
          {/if}
        </section>

      {:else if t.id === "cuotas"}
        <section class="cf-glass cf-card alto">
          <div class="fila-cab"><h2 class="cf-card-title">Cuotas de tarjetas por pagar</h2></div>
          {#if cuotas}
            <div class="kpis">
              <div><span class="cf-overline">Total pendiente</span><b>{pesos(cuotas.totalPendiente)}</b></div>
              <div><span class="cf-overline">Este mes</span><b>{pesos(cuotas.esteMes)}</b></div>
              <div><span class="cf-overline">Próximo mes</span><b>{pesos(cuotas.proximoMes)}</b></div>
              <div><span class="cf-overline">Cuotas pendientes</span><b>{cuotas.cuotasPendientes}</b></div>
            </div>
          {:else}
            <p class="cf-muted">Aparece cuando registres una compra a cuotas desde el Simulador.</p>
          {/if}
        </section>
      {/if}
    </div>
  {/each}
</div>

{#if cargando}<p class="caption">Cargando…</p>{/if}

<style>
  .periodo { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .fecha { display: block; width: 220px; }
  .encabezado-acciones form { display: contents; }

  .tablero { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--space-5); align-items: stretch; }
  .celda { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .tercio { grid-column: span 2; }
  .media { grid-column: span 3; }
  .completa { grid-column: span 6; }
  .alto { flex: 1; }

  /* Personalizar */
  .editando .celda { padding: var(--space-2); border: 1.5px dashed var(--violet-300); border-radius: calc(var(--r-xl) + 8px); }
  .editando .oculta > section { opacity: .4; }
  .arrastrando, .arrastrando * { user-select: none; -webkit-user-select: none; }
  .origen { opacity: .5; }
  .destino { border-color: var(--primary) !important; border-style: solid !important; background: var(--primary-soft); }
  .herramientas { display: flex; align-items: center; gap: var(--space-2); padding: 0 var(--space-1); font-size: 13px; }
  .herramientas .h { width: 32px; height: 32px; }
  .herramientas .h :global(.cf-icon) { width: 16px; height: 16px; }
  .asa { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: var(--r-sm); background: var(--track); color: var(--ink-2); cursor: grab; touch-action: none; }
  .asa :global(.cf-icon) { stroke-width: 3; width: 16px; height: 16px; }
  .arrastrando .asa { cursor: grabbing; }
  .anchos button { height: 28px; padding: 0 var(--space-2); font-size: 12px; }
  .barra-edicion { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: 10px 14px; border-radius: var(--r-md); background: var(--primary-soft); color: var(--primary-text); font-size: 13px; }
  .barra-edicion :global(.mini-icono) { width: 14px; height: 14px; stroke-width: 3; vertical-align: -2px; }
  .barra-edicion .cf-btn { height: 32px; }
  .espacio { flex: 1; }

  /* Avisos */
  .aviso-sin { display: flex; align-items: center; gap: var(--space-3); padding: 12px 16px; border-radius: var(--r-md); border: 1px dashed var(--primary); background: var(--glass-1); color: var(--ink); text-decoration: none; font-size: 14px; }
  .aviso-sin > :global(.cf-icon) { color: var(--primary); }
  .aviso-sin .ir { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; font-weight: 600; color: var(--primary-text); text-decoration: none; }
  .aviso-sin .ir:hover { text-decoration: underline; }
  .aviso-sin .descartar { width: 32px; height: 32px; margin: -4px -8px -4px 0; background: transparent; box-shadow: none; color: var(--ink-2); }
  .aviso-sin .descartar:hover { background: var(--primary-soft); color: var(--primary-text); }
  .aviso-sin .descartar :global(.cf-icon) { width: 16px; height: 16px; }
  .aviso-sin .ir :global(.cf-icon) { width: 16px; height: 16px; }
  .aviso-usd { padding: 10px 14px; border-radius: var(--r-md); background: var(--warn-80-soft); color: var(--ink); font-size: 13px; }
  .aviso-usd a { color: var(--warn-80); font-weight: 600; }

  /* Tarjetas */
  /* Patrimonio: franja de la mini gráfica de borde a borde, entre el monto y los recuadros. */
  .cf-balance .pat-grafica { height: 88px; margin: 0 calc(-1 * var(--space-6)); }
  .cf-balance .frost-fila { margin-top: auto; }
  .pat-monto { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); }
  .prox-totales { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-3); }
  .prox-totales > div { display: flex; flex-direction: column; gap: 2px; }
  .prox-totales .der { text-align: right; }
  .prox-entran { font: 650 18px/24px var(--font-display); color: var(--income); font-variant-numeric: tabular-nums; }
  .prox-ing { color: var(--income); }
  .prox-pend {
    align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
    background: color-mix(in srgb, var(--warn-80) 14%, transparent); color: var(--warn-80); font-size: 12px; font-weight: 600; text-decoration: none;
  }
  .prox-pend :global(.cf-icon) { width: 14px; height: 14px; }
  .te-deben-total { font: 650 28px/34px var(--font-display); letter-spacing: -.02em; color: var(--primary-text); font-variant-numeric: tabular-nums; }
  .inicial-mini {
    width: 32px; height: 32px; flex: none; border-radius: var(--r-full); display: grid; place-items: center;
    background: var(--primary-soft); color: var(--primary-text); font: 700 13px/1 var(--font-display);
  }
  .rk-monto.vencido { color: var(--over-100-alt); }
  .pat-cabeza { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .pat-ojo {
    display: inline-grid; place-items: center; width: 32px; height: 32px; padding: 0; border-radius: 50%;
    background: rgba(255,255,255,.14); color: #FFFFFF; border: 1px solid rgba(255,255,255,.24); cursor: pointer;
  }
  .pat-ojo:hover { background: rgba(255,255,255,.24); }
  .pat-ojo:focus-visible { outline: 2px solid #FFFFFF; outline-offset: 2px; }
  .pat-chip { background: rgba(255,255,255,.18); color: #FFFFFF; border: 1px solid rgba(255,255,255,.26); }
  .frost-fila { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
  .cf-frost { display: flex; flex-direction: column; gap: 2px; }
  .cf-frost b { font-size: 16px; font-weight: 600; }
  .stat { gap: var(--space-2); padding: var(--space-5); }
  .stat-cab { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2); }
  .stat-monto { font: 650 24px/30px var(--font-display); letter-spacing: -.02em; }
  .fila-cab { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); }
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
  .posicion { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: 10px; background: var(--primary-soft); color: var(--primary-text); font: 650 14px/1 var(--font-display); }

  .mov { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--line); }
  .mov:last-child { border-bottom: 0; }
  .mov-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .mov-txt b { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mov-txt .caption { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); }
  .kpis div { display: flex; flex-direction: column; gap: 4px; }
  .kpis b { font: 650 22px/28px var(--font-display); letter-spacing: -.02em; }

  @media (max-width: 1180px) {
    .media { grid-column: span 6; }
  }
  @media (max-width: 760px) {
    .tercio { grid-column: span 6; }
    .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
