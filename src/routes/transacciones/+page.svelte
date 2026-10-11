<script lang="ts">
  import CampoFecha from "$lib/ui/CampoFecha.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { SvelteSet } from "svelte/reactivity";
  import Icono from "$lib/Icono.svelte";
  import FormTransaccion from "$lib/transacciones/FormTransaccion.svelte";
  import FilaTransaccion from "$lib/transacciones/FilaTransaccion.svelte";
  import LectorFactura, { type Prellenado } from "$lib/facturas/LectorFactura.svelte";
  import FilaMovil from "$lib/movil/FilaMovil.svelte";
  import ElegirFoto from "$lib/ui/ElegirFoto.svelte";
  import { pantalla } from "$lib/pantalla.svelte";
  import { avisos } from "$lib/alertas/estado-alertas.svelte";
  import { tomarFactura } from "$lib/facturas/pendiente";
  import { monto } from "$lib/formato";
  import {
    periodos, rango, agruparPorSemana, nombreDia, nombreSemana, claveSemana, type Periodo,
  } from "$lib/periodo";
  import {
    alCambiarDatos, listarTransacciones, totalesTransacciones, listarCuentas, listarCategorias, listarEtiquetas,
    eliminarTransacciones, categorizarTransacciones, etiquetarTransacciones, marcarComoPagoTarjeta,
    type Categoria, type Cuenta, type Etiqueta, type FiltroTx, type Moneda, type TipoTx,
    type TotalesTx, type Transaccion,
  } from "$lib/datos";

  const PAGINA = 100;

  // --- Filtros (los enlaces de Categorías/Etiquetas llegan por la URL) ---
  const q = page.url.searchParams;
  const num = (k: string) => (q.get(k) ? Number(q.get(k)) : null);
  const vieneConFiltro = q.has("categoria") || q.has("etiqueta") || q.has("sin-categoria") || q.has("cuenta") || q.has("texto");
  const periodoUrl = periodos.find((p) => p.id === q.get("periodo"))?.id;

  let periodo = $state<Periodo>(periodoUrl ?? (vieneConFiltro ? "todo" : "mes"));
  let desdeP = $state(q.get("desde") ?? "");
  let hastaP = $state(q.get("hasta") ?? "");
  let texto = $state(q.get("texto") ?? "");
  let textoAplicado = $state(q.get("texto") ?? "");
  let tipo = $state<TipoTx | null>(null);
  let cuentaId = $state<number | null>(num("cuenta"));
  let categoriaId = $state<number | null>(num("categoria"));
  let sinCategoria = $state(q.get("sin-categoria") === "1");
  let etiquetaId = $state<number | null>(num("etiqueta"));

  // --- Datos ---
  let txs = $state<Transaccion[]>([]);
  let totales = $state<TotalesTx>({ cantidad: 0, porMoneda: [] });
  let cuentas = $state<Cuenta[]>([]);
  let categorias = $state<Categoria[]>([]);
  let etiquetas = $state<Etiqueta[]>([]);
  let cargando = $state(true);
  let hayMas = $state(false);
  let error = $state("");
  let aviso = $state("");

  // --- Panel ---
  let panelAbierto = $state(false);
  let editando = $state<Transaccion | null>(null);

  // --- Selección y lote ---
  const seleccion = new SvelteSet<number>();
  type Accion = null | "categoria" | "etiqueta" | "pago" | "eliminar";
  let accion = $state<Accion>(null);
  let loteCategoria = $state<number | null>(null);
  let loteEtiqueta = $state("");
  let loteTarjeta = $state<number | null>(null);

  const activas = $derived(cuentas.filter((c) => !c.archivada && c.tipo !== "inversion"));
  const tarjetas = $derived(activas.filter((c) => c.tipo === "credito"));
  const porSemana = $derived(agruparPorSemana(periodo, desdeP, hastaP));

  const filtro = $derived<FiltroTx>({
    ...rango(periodo, desdeP, hastaP),
    texto: textoAplicado || undefined,
    tipo: tipo ?? undefined,
    cuentaId: cuentaId ?? undefined,
    categoriaId: sinCategoria ? undefined : categoriaId ?? undefined,
    sinCategoria: sinCategoria || undefined,
    etiquetaId: etiquetaId ?? undefined,
  });

  /** Chips de filtros activos. */
  const chips = $derived.by(() => {
    const r: { texto: string; quitar: () => void }[] = [];
    if (textoAplicado) r.push({ texto: `«${textoAplicado}»`, quitar: () => { texto = ""; textoAplicado = ""; } });
    if (tipo) r.push({ texto: { egreso: "Egresos", ingreso: "Ingresos", transferencia: "Transferencias" }[tipo], quitar: () => (tipo = null) });
    if (cuentaId != null) r.push({ texto: cuentas.find((c) => c.id === cuentaId)?.nombre ?? "Cuenta", quitar: () => (cuentaId = null) });
    if (sinCategoria) r.push({ texto: "Sin categoría", quitar: () => (sinCategoria = false) });
    else if (categoriaId != null) r.push({ texto: categorias.find((c) => c.id === categoriaId)?.nombre ?? "Categoría", quitar: () => (categoriaId = null) });
    if (etiquetaId != null) r.push({ texto: `#${etiquetas.find((e) => e.id === etiquetaId)?.nombre ?? "etiqueta"}`, quitar: () => (etiquetaId = null) });
    return r;
  });

  /** Grupos por día o por semana, con el neto de cada uno (por moneda). */
  const grupos = $derived.by(() => {
    const mapa = new Map<string, Transaccion[]>();
    for (const t of txs) {
      const k = porSemana ? claveSemana(t.fecha) : t.fecha;
      (mapa.get(k) ?? mapa.set(k, []).get(k)!).push(t);
    }
    return [...mapa].map(([clave, lista]) => {
      const neto = new Map<Moneda, number>();
      for (const t of lista)
        if (t.tipo !== "transferencia")
          neto.set(t.cuenta_moneda, (neto.get(t.cuenta_moneda) ?? 0) + (t.tipo === "ingreso" ? t.monto : -t.monto));
      return {
        clave, lista,
        nombre: porSemana ? nombreSemana(clave) : nombreDia(clave),
        neto: [...neto].map(([m, v]) => monto(v, m, v > 0 ? "+" : v < 0 ? "−" : undefined)).join(" · "),
      };
    });
  });

  // --- Carga ---
  let consulta = 0;
  async function cargar(mas = false) {
    const id = ++consulta;
    try {
      const f = { ...filtro, limite: PAGINA, desplazamiento: mas ? txs.length : 0 };
      const [lista, tot] = await Promise.all([listarTransacciones(f), mas ? totales : totalesTransacciones(filtro)]);
      if (id !== consulta) return; // llegó una consulta más nueva
      txs = mas ? [...txs, ...lista] : lista;
      totales = tot;
      hayMas = lista.length === PAGINA;
      if (!mas) seleccion.clear();
      error = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      cargando = false;
    }
  }

  async function cargarCatalogos() {
    [cuentas, categorias, etiquetas] = await Promise.all([listarCuentas(true), listarCategorias(), listarEtiquetas()]);
  }

  // Recargar cuando cambia el filtro
  $effect(() => {
    filtro;
    cargar();
  });

  // Cambios que llegan del Mac al sincronizar (o de la hoja «Nuevo movimiento»).
  $effect(() => alCambiarDatos(() => { cargar(); cargarCatalogos(); }));

  // Búsqueda con pausa para no consultar en cada tecla
  let pausa: ReturnType<typeof setTimeout> | undefined;
  function buscar() {
    clearTimeout(pausa);
    pausa = setTimeout(() => (textoAplicado = texto.trim()), 250);
  }

  function trasCambio(mensaje: string) {
    aviso = mensaje;
    cargar();
    cargarCatalogos();
  }

  // Desde factura: foto → lector → formulario prellenado.
  let fotoFactura = $state<File | null>(null);
  let prellenado = $state<Prellenado | null>(null);

  function elegirFoto(f: File | undefined) {
    if (f) fotoFactura = f;
  }

  function desdeFactura(p: Prellenado) {
    fotoFactura = null;
    editando = null;
    prellenado = p;
    panelAbierto = true;
  }

  // Foto elegida en Importar.
  $effect(() => {
    if (page.url.searchParams.has("factura")) {
      const f = tomarFactura();
      if (f) fotoFactura = f;
      goto("/transacciones", { replaceState: true, keepFocus: true, noScroll: true });
    }
  });

  function nuevo() {
    editando = null;
    prellenado = null;
    panelAbierto = true;
  }

  function limpiarFiltros() {
    texto = ""; textoAplicado = ""; tipo = null; cuentaId = null; categoriaId = null; sinCategoria = false; etiquetaId = null;
    goto("/transacciones", { replaceState: true, keepFocus: true, noScroll: true });
  }

  function elegirCategoriaFiltro(v: string) {
    sinCategoria = v === "sin";
    categoriaId = v && v !== "sin" ? Number(v) : null;
  }

  // --- Lote ---
  const todasSeleccionadas = $derived(txs.length > 0 && txs.every((t) => seleccion.has(t.id)));
  function alternarTodas() {
    if (todasSeleccionadas) seleccion.clear();
    else txs.forEach((t) => seleccion.add(t.id));
  }
  function alternar(id: number) {
    if (seleccion.has(id)) seleccion.delete(id);
    else seleccion.add(id);
  }
  function abrirAccion(a: Accion) {
    accion = accion === a ? null : a;
    loteCategoria = null;
    loteEtiqueta = "";
    loteTarjeta = tarjetas[0]?.id ?? null;
  }

  async function aplicarLote() {
    const ids = [...seleccion];
    const n = ids.length;
    const plural = (k: number) => `${k} ${k === 1 ? "movimiento" : "movimientos"}`;
    try {
      if (accion === "categoria") {
        await categorizarTransacciones(ids, loteCategoria);
        const nombre = categorias.find((c) => c.id === loteCategoria)?.nombre ?? "Sin categoría";
        aviso = `${plural(n)} → «${nombre}». Las transferencias no se cambian.`;
      } else if (accion === "etiqueta") {
        if (!loteEtiqueta.trim()) return;
        await etiquetarTransacciones(ids, loteEtiqueta);
        aviso = `Etiqueta «${loteEtiqueta.trim()}» agregada a ${plural(n)}.`;
      } else if (accion === "pago") {
        if (loteTarjeta == null) return;
        const hechos = await marcarComoPagoTarjeta(ids, loteTarjeta);
        const tarjeta = tarjetas.find((c) => c.id === loteTarjeta)?.nombre;
        aviso = hechos
          ? `${plural(hechos)} ahora ${hechos === 1 ? "es pago" : "son pagos"} de «${tarjeta}».${hechos < n ? ` ${n - hechos} no aplicaban (solo egresos de débito o efectivo en la misma moneda).` : ""}`
          : "Ninguno aplicaba: solo se convierten egresos de cuentas de débito o efectivo, en la misma moneda de la tarjeta.";
      } else if (accion === "eliminar") {
        await eliminarTransacciones(ids);
        aviso = `${plural(n)} ${n === 1 ? "eliminado" : "eliminados"}.`;
      }
      accion = null;
      seleccion.clear();
      cargar();
      cargarCatalogos();
    } catch (e) {
      aviso = e instanceof Error ? e.message : String(e);
    }
  }

  cargarCatalogos();
  // «Nuevo movimiento» desde otra pantalla o desde el + del celular (también si ya estás aquí).
  $effect(() => {
    if (page.url.searchParams.get("nuevo") === "1") {
      nuevo();
      goto("/transacciones", { replaceState: true, keepFocus: true, noScroll: true });
    }
  });

  function abrirTx(t: Transaccion) {
    if (t.es_inversion) return void goto("/inversiones");
    if (t.prestamo_persona_id != null) return void goto(`/medeben?persona=${t.prestamo_persona_id}`);
    editando = t;
    prellenado = null;
    panelAbierto = true;
  }

  // Celular: chips de filtro con selector nativo.
  const mesActual = new Intl.DateTimeFormat("es-CO", { month: "long" }).format(new Date());
  const periodosMovil = $derived(periodos.filter((p) => p.id !== "personalizado" || periodo === "personalizado"));
  const nombrePeriodo = (id: Periodo, nombre: string) => (id === "mes" ? mesActual.charAt(0).toUpperCase() + mesActual.slice(1) : nombre);
</script>

{#if pantalla.celular}
<h1 class="titulo-pantalla">Movimientos</h1>

<label class="cf-field buscar-m">
  <Icono nombre="buscar" />
  <input type="search" bind:value={texto} oninput={buscar} placeholder="Buscar comercio, nota o categoría" aria-label="Buscar movimientos" />
</label>

<div class="chips-m desliza">
  <label class="chip-m" class:on={periodo !== "todo"}>
    <select bind:value={periodo} aria-label="Período">
      {#each periodosMovil as p (p.id)}<option value={p.id}>{nombrePeriodo(p.id, p.nombre)}</option>{/each}
    </select><Icono nombre="abajo" />
  </label>
  <label class="chip-m" class:on={cuentaId != null}>
    <select bind:value={cuentaId} aria-label="Cuenta">
      <option value={null}>Todas las cuentas</option>
      {#each activas as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
    </select><Icono nombre="abajo" />
  </label>
  <label class="chip-m" class:on={sinCategoria || categoriaId != null}>
    <select value={sinCategoria ? "sin" : categoriaId ?? ""} onchange={(e) => elegirCategoriaFiltro(e.currentTarget.value)} aria-label="Categoría">
      <option value="">Categoría</option>
      <option value="sin">Sin categoría</option>
      {#each categorias as c (c.id)}<option value={c.id}>{c.padre_id != null ? "· " : ""}{c.nombre}</option>{/each}
    </select><Icono nombre="abajo" />
  </label>
  {#if etiquetas.length}
    <label class="chip-m" class:on={etiquetaId != null}>
      <select bind:value={etiquetaId} aria-label="Etiqueta">
        <option value={null}>Etiqueta</option>
        {#each etiquetas as e (e.id)}<option value={e.id}>#{e.nombre}</option>{/each}
      </select><Icono nombre="abajo" />
    </label>
  {/if}
  {#if chips.length}<button type="button" class="chip-m limpiar" onclick={limpiarFiltros}><Icono nombre="cerrar" />Limpiar</button>{/if}
</div>

{#each totales.porMoneda as r (r.moneda)}
  <div class="cf-glass resumen-m">
    <div><span class="caption">Entró{totales.porMoneda.length > 1 ? ` · ${r.moneda}` : ""}</span><b class="cf-amt-income">{monto(r.ingresos, r.moneda, "+")}</b></div>
    <div><span class="caption">Salió{totales.porMoneda.length > 1 ? ` · ${r.moneda}` : ""}</span><b class="cf-amt-expense">{monto(r.egresos, r.moneda, "−")}</b></div>
  </div>
{/each}

{#if error}<p class="error-form" role="alert">No se pudieron cargar los movimientos: {error}</p>{/if}

{#if cargando}
  <p class="caption">Cargando…</p>
{:else if !txs.length}
  <section class="cf-glass vacio-m">
    <span class="cf-tile cf-tile--brand"><Icono nombre="transacciones" /></span>
    <b>{chips.length || periodo !== "todo" ? "No hay movimientos con estos filtros" : "Aún no tienes movimientos"}</b>
    <span class="caption">{chips.length || periodo !== "todo" ? "Prueba con otro período o quita algún filtro." : "Toca + para registrar el primero."}</span>
  </section>
{:else}
  {#each grupos as g (g.clave)}
    <div class="dia-m"><span>{g.nombre}</span><span>{g.neto}</span></div>
    <div class="cf-glass grupo-m">
      {#each g.lista as t (t.id)}<FilaMovil tx={t} abrir={() => abrirTx(t)} conFecha={porSemana} />{/each}
    </div>
  {/each}
  {#if hayMas}<button class="cf-btn cf-btn--secondary" onclick={() => cargar(true)}>Cargar más</button>{/if}
{/if}
{:else}

<header class="encabezado">
  <div>
    <h1 class="titulo-pantalla">Transacciones</h1>
    <p class="caption">{totales.cantidad.toLocaleString("es-CO")} {totales.cantidad === 1 ? "movimiento" : "movimientos"}</p>
  </div>
  <div class="encabezado-acciones">
    <label class="cf-field buscador">
      <Icono nombre="buscar" />
      <input bind:value={texto} oninput={buscar} placeholder="Buscar comercio o nota" aria-label="Buscar movimientos" />
    </label>
    <a class="cf-btn cf-btn--secondary recurrentes" href="/recurrentes"><Icono nombre="repetir" />Recurrentes{#if avisos.porConfirmar > 0}<span
      class="cf-aviso" aria-label="{avisos.porConfirmar} por confirmar" title="{avisos.porConfirmar} por confirmar">{avisos.porConfirmar}</span>{/if}</a>
    <ElegirFoto elegir={elegirFoto} hacia="abajo"><Icono nombre="documento" /><span class="largo">Desde </span>factura</ElegirFoto>
    <button class="cf-btn cf-btn--primary" onclick={nuevo}><Icono nombre="mas" />Nuevo<span class="largo"> movimiento</span></button>
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

<div class="filtros">
  <label class="cf-field filtro">
    <select value={tipo ?? ""} onchange={(e) => (tipo = (e.currentTarget.value || null) as TipoTx | null)} aria-label="Tipo">
      <option value="">Todos los tipos</option>
      <option value="egreso">Egresos</option>
      <option value="ingreso">Ingresos</option>
      <option value="transferencia">Transferencias</option>
    </select>
  </label>
  <label class="cf-field filtro">
    <select value={cuentaId ?? ""} onchange={(e) => (cuentaId = e.currentTarget.value ? Number(e.currentTarget.value) : null)} aria-label="Cuenta">
      <option value="">Todas las cuentas</option>
      {#each cuentas.filter((c) => c.tipo !== "inversion") as c (c.id)}<option value={c.id}>{c.nombre}{c.archivada ? " (archivada)" : ""}</option>{/each}
    </select>
  </label>
  <label class="cf-field filtro">
    <select value={sinCategoria ? "sin" : (categoriaId ?? "")} onchange={(e) => elegirCategoriaFiltro(e.currentTarget.value)} aria-label="Categoría">
      <option value="">Todas las categorías</option>
      <option value="sin">Sin categoría</option>
      {#each categorias as c (c.id)}<option value={c.id}>{c.padre_id != null ? "  · " : ""}{c.nombre}</option>{/each}
    </select>
  </label>
  <label class="cf-field filtro">
    <select value={etiquetaId ?? ""} onchange={(e) => (etiquetaId = e.currentTarget.value ? Number(e.currentTarget.value) : null)} aria-label="Etiqueta">
      <option value="">Todas las etiquetas</option>
      {#each etiquetas as e (e.id)}<option value={e.id}>{e.nombre}</option>{/each}
    </select>
  </label>
</div>

{#if chips.length}
  <div class="chips" aria-label="Filtros activos">
    {#each chips as c (c.texto)}
      <span class="cf-chip cf-chip--brand">{c.texto}
        <button class="quitar" onclick={c.quitar} aria-label="Quitar filtro {c.texto}"><Icono nombre="cerrar" /></button>
      </span>
    {/each}
    <button class="cf-btn cf-btn--ghost limpiar" onclick={limpiarFiltros}>Quitar filtros</button>
  </div>
{/if}

<section class="resumen" aria-label="Resumen del filtro">
  {#each totales.porMoneda.length ? totales.porMoneda : [{ moneda: "COP" as Moneda, ingresos: 0, egresos: 0, balance: 0 }] as r (r.moneda)}
    <div class="stat cf-glass">
      <span class="cf-overline">Ingresos{totales.porMoneda.length > 1 ? ` · ${r.moneda}` : ""}</span>
      <b class="cf-amt-income">{monto(r.ingresos, r.moneda, "+")}</b>
    </div>
    <div class="stat cf-glass">
      <span class="cf-overline">Egresos{totales.porMoneda.length > 1 ? ` · ${r.moneda}` : ""}</span>
      <b class="cf-amt-expense">{monto(r.egresos, r.moneda, "−")}</b>
    </div>
    <div class="stat cf-glass">
      <span class="cf-overline">Balance{totales.porMoneda.length > 1 ? ` · ${r.moneda}` : ""}</span>
      <b class:cf-amt-income={r.balance > 0} class:cf-amt-expense={r.balance < 0}>
        {monto(r.balance, r.moneda, r.balance > 0 ? "+" : r.balance < 0 ? "−" : undefined)}
      </b>
    </div>
  {/each}
</section>

{#if error}<p class="error-form" role="alert">No se pudieron cargar los movimientos: {error}</p>{/if}
{#if aviso}<p class="aviso" role="status">{aviso}</p>{/if}

{#if cargando}
  <p class="caption">Cargando…</p>
{:else if !txs.length}
  <section class="vacio cf-glass cf-card">
    <span class="cf-tile cf-tile--brand"><Icono nombre="transacciones" /></span>
    {#if chips.length || periodo !== "todo"}
      <h2 class="cf-card-title">No hay movimientos con estos filtros</h2>
      <p class="cf-muted">Prueba con otro período o quita algún filtro.</p>
    {:else}
      <h2 class="cf-card-title">Aún no tienes movimientos</h2>
      <p class="cf-muted">Registra tu primer gasto o ingreso. Toma unos segundos.</p>
    {/if}
    <button class="cf-btn cf-btn--primary" onclick={nuevo}><Icono nombre="mas" />Nuevo<span class="largo"> movimiento</span></button>
  </section>
{:else}
  <section class="lista cf-glass cf-card" aria-label="Movimientos">
    <div class="cabecera">
      <label class="casilla">
        <input type="checkbox" checked={todasSeleccionadas} onchange={alternarTodas}
          aria-label="Seleccionar los {txs.length} movimientos cargados" />
      </label>
      <div class="columnas">
        <span>Movimiento</span><span class="col-cat">Categoría</span><span class="col-cta">Cuenta</span><span class="col-etq">Etiquetas</span><span class="der">Monto</span>
      </div>
    </div>
    {#each grupos as g (g.clave)}
      <div class="grupo">
        <h3 class="grupo-cab"><span>{g.nombre}</span><span class="caption">{g.neto}</span></h3>
        {#each g.lista as t (t.id)}
          <FilaTransaccion tx={t} seleccionada={seleccion.has(t.id)} alternar={() => alternar(t.id)}
            abrir={() => abrirTx(t)} conFecha={porSemana} />
        {/each}
      </div>
    {/each}
    {#if hayMas}
      <button class="cf-btn cf-btn--secondary mas" onclick={() => cargar(true)}>Cargar más</button>
    {/if}
  </section>
{/if}

{#if seleccion.size}
  <div class="lote cf-glass-3" role="region" aria-label="Acciones en lote">
    <div class="lote-fila">
      <b>{seleccion.size} {seleccion.size === 1 ? "seleccionado" : "seleccionados"}</b>
      <button class="cf-btn cf-btn--ghost" aria-pressed={accion === "categoria"} onclick={() => abrirAccion("categoria")}><Icono nombre="categorias" />Categoría</button>
      <button class="cf-btn cf-btn--ghost" aria-pressed={accion === "etiqueta"} onclick={() => abrirAccion("etiqueta")}><Icono nombre="mas" />Etiqueta</button>
      {#if tarjetas.length}
        <button class="cf-btn cf-btn--ghost" aria-pressed={accion === "pago"} onclick={() => abrirAccion("pago")}><Icono nombre="tarjeta" />Pago de tarjeta</button>
      {/if}
      <button class="cf-btn cf-btn--ghost peligro" aria-pressed={accion === "eliminar"} onclick={() => abrirAccion("eliminar")}><Icono nombre="papelera" />Eliminar</button>
      <span class="espacio"></span>
      <button class="cf-btn cf-btn--icon" onclick={() => { seleccion.clear(); accion = null; }} aria-label="Quitar selección"><Icono nombre="cerrar" /></button>
    </div>

    {#if accion === "categoria"}
      <div class="lote-fila">
        <label class="cf-field control">
          <select bind:value={loteCategoria} aria-label="Categoría para los seleccionados">
            <option value={null}>Sin categoría</option>
            {#each categorias as c (c.id)}<option value={c.id}>{c.tipo === "ingreso" ? "Ingreso · " : ""}{c.padre_id != null ? "· " : ""}{c.nombre}</option>{/each}
          </select>
        </label>
        <button class="cf-btn cf-btn--primary" onclick={aplicarLote}>Asignar</button>
      </div>
    {:else if accion === "etiqueta"}
      <div class="lote-fila">
        <label class="cf-field control">
          <input bind:value={loteEtiqueta} list="lote-etiquetas" maxlength="30" placeholder="Nombre de la etiqueta" aria-label="Etiqueta para los seleccionados" />
          <datalist id="lote-etiquetas">{#each etiquetas as e (e.id)}<option value={e.nombre}></option>{/each}</datalist>
        </label>
        <button class="cf-btn cf-btn--primary" onclick={aplicarLote} disabled={!loteEtiqueta.trim()}>Agregar</button>
      </div>
    {:else if accion === "pago"}
      <div class="lote-fila">
        <span class="caption explicacion">Convierte egresos en transferencias hacia la tarjeta: dejan de contar como gasto y bajan su deuda.</span>
        <label class="cf-field control">
          <select bind:value={loteTarjeta} aria-label="Tarjeta">
            {#each tarjetas as c (c.id)}<option value={c.id}>{c.nombre}{c.ultimos4 ? ` ••${c.ultimos4}` : ""}</option>{/each}
          </select>
        </label>
        <button class="cf-btn cf-btn--primary" onclick={aplicarLote}>Convertir</button>
      </div>
    {:else if accion === "eliminar"}
      <div class="lote-fila">
        <span class="caption explicacion">¿Eliminar {seleccion.size} {seleccion.size === 1 ? "movimiento" : "movimientos"}? No se puede deshacer.</span>
        <button class="cf-btn cf-btn--secondary peligro" onclick={aplicarLote}><Icono nombre="papelera" />Eliminar</button>
      </div>
    {/if}
  </div>
{/if}

{/if}

<FormTransaccion abierto={panelAbierto} transaccion={editando} cuentas={activas} {categorias} {prellenado}
  etiquetas={etiquetas.map((e) => e.nombre)} cerrar={() => { panelAbierto = false; prellenado = null; }} listo={trasCambio}
  factura={(f) => (fotoFactura = f)} />

<LectorFactura archivo={fotoFactura} cuentas={activas} {categorias}
  cerrar={() => (fotoFactura = null)} continuar={desdeFactura} />

<style>
  .recurrentes { position: relative; }
  /* ---------- Celular ---------- */
  .buscar-m { height: 48px; border-radius: 16px; }
  .buscar-m :global(.cf-icon) { color: var(--ink-3); }
  .buscar-m input { font-size: 15px; }
  .chips-m { display: flex; gap: 8px; margin: 0 calc(-1 * var(--space-4)); padding: 0 var(--space-4); }
  .chip-m {
    position: relative; flex: none; display: inline-flex; align-items: center; gap: 4px; min-height: 36px; padding: 0 10px 0 12px;
    border-radius: var(--r-full); border: 1px solid var(--line); background: var(--input); color: var(--ink); font: 600 13px/18px var(--font-sans);
  }
  .chip-m.on { background: var(--primary-soft); color: var(--primary-text); border-color: transparent; }
  .chip-m select { appearance: none; -webkit-appearance: none; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; padding: 0; max-width: 46vw; text-overflow: ellipsis; }
  .chip-m :global(.cf-icon) { width: 14px; height: 14px; stroke-width: 2.2; pointer-events: none; }
  .chip-m.limpiar { cursor: pointer; color: var(--ink-2); }
  .resumen-m { border-radius: 20px; padding: 12px 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .resumen-m div { display: flex; flex-direction: column; min-width: 0; }
  .resumen-m b { font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dia-m { display: flex; justify-content: space-between; gap: 8px; padding: 0 4px; margin-bottom: calc(-1 * var(--space-2));
    font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); }
  .grupo-m { border-radius: 20px; padding: 2px 16px; }
  .vacio-m { border-radius: 20px; padding: 24px 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }

  .buscador { width: 280px; }
  .periodo { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .fecha { display: block; width: 220px; }
  .filtros { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
  .filtro select { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: 400 14px/20px var(--font-sans); color: var(--ink); }
  .chips { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .quitar { display: inline-flex; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; }
  .quitar :global(.cf-icon) { width: 14px; height: 14px; }
  .limpiar { height: 32px; padding: 0 var(--space-3); font-size: 13px; }
  .resumen { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); }
  .stat { border-radius: var(--r-lg); padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: 4px; }
  .stat b { font: 650 24px/30px var(--font-display); letter-spacing: -.02em; }
  .aviso { padding: 10px 14px; border-radius: var(--r-md); background: var(--primary-soft); color: var(--primary-text); font-size: 13px; font-weight: 500; align-self: flex-start; }
  .vacio { align-items: flex-start; max-width: 520px; }
  .lista { gap: 0; padding: var(--space-3) var(--space-4) var(--space-4); }
  .cabecera { display: flex; align-items: center; padding: var(--space-2) 0; border-bottom: 1px solid var(--line); }
  .columnas {
    flex: 1; display: grid; gap: var(--space-3); padding-right: var(--space-3);
    grid-template-columns: minmax(0, 2.2fr) minmax(0, 1.1fr) minmax(0, 1.2fr) minmax(0, 1.1fr) minmax(120px, auto);
    font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2);
  }
  .casilla { display: grid; place-items: center; width: 44px; flex: none; cursor: pointer; }
  .casilla input { width: 16px; height: 16px; accent-color: var(--primary); cursor: pointer; }
  .der { text-align: right; }
  .grupo-cab {
    display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3);
    margin: var(--space-4) 0 0; padding: 0 var(--space-3) 6px 44px; border-bottom: 1px solid var(--line);
    font: 600 13px/18px var(--font-sans); color: var(--ink);
  }
  .grupo-cab .caption { font-weight: 600; }
  .mas { align-self: center; margin-top: var(--space-4); }
  .lote {
    position: sticky; bottom: var(--space-4); z-index: 10; border-radius: var(--r-lg);
    padding: var(--space-3) var(--space-4); display: flex; flex-direction: column; gap: var(--space-3);
  }
  .lote-fila { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .lote-fila > b { margin-right: var(--space-2); font-size: 14px; }
  .lote .cf-btn--ghost { height: 36px; padding: 0 var(--space-3); color: var(--ink); }
  .lote .cf-btn--ghost[aria-pressed="true"] { background: var(--primary-soft); color: var(--primary-text); }
  .lote .cf-btn--icon { width: 36px; height: 36px; }
  .control { flex: 1; max-width: 360px; height: 40px; }
  .control select, .control input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: 400 14px/20px var(--font-sans); color: var(--ink); }
  .explicacion { flex-basis: 100%; }
  .peligro, .lote .peligro { color: var(--expense); }
  .espacio { flex: 1; }
  @media (max-width: 1100px) {
    .columnas { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(110px, auto); }
    .col-etq { display: none; }
    .filtros { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 760px) {
    .columnas { grid-template-columns: minmax(0, 1fr) auto; }
    .col-cat, .col-cta { display: none; }
    .resumen { grid-template-columns: 1fr; }
    .buscador { width: 100%; }
  }
  /* Tablet vertical: título + botones cortos arriba; la búsqueda en su propia fila. */
  :global(html.tablet.vertical) .encabezado-acciones { display: contents; }
  :global(html.tablet.vertical) .encabezado > div:first-child { flex: 1; min-width: 0; }
  :global(html.tablet.vertical) .buscador { order: 9; flex-basis: 100%; width: auto; }
  :global(html.tablet.vertical) .largo { display: none; }
</style>
