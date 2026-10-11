<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import Icono from "$lib/Icono.svelte";
  import FormCategoria from "$lib/categorias/FormCategoria.svelte";
  import FilaCategoria from "$lib/categorias/FilaCategoria.svelte";
  import FilaEtiqueta from "$lib/categorias/FilaEtiqueta.svelte";
  import Reglas from "$lib/categorias/Reglas.svelte";
  import {
    listarCategorias, contarSinCategoria, listarEtiquetas, obtenerOCrearEtiqueta, MAX_ETIQUETA,
    type Categoria, type Etiqueta, type TipoCategoria,
  } from "$lib/datos";

  type Vista = "categorias" | "etiquetas" | "reglas";
  const vista = $derived<Vista>(
    ({ etiquetas: "etiquetas", reglas: "reglas" } as const)[page.url.searchParams.get("vista") ?? ""] ?? "categorias",
  );

  let categorias = $state<Categoria[]>([]);
  let sinCategoria = $state(0);
  let etiquetas = $state<Etiqueta[]>([]);
  let cargando = $state(true);
  let error = $state("");
  let aviso = $state("");

  // Panel de categoría
  let formAbierto = $state(false);
  let editando = $state<Categoria | null>(null);
  let tipoNueva = $state<TipoCategoria>("egreso");

  // Nueva etiqueta (en línea)
  let creandoEtiqueta = $state(false);
  let nombreEtiqueta = $state("");
  let errorEtiqueta = $state("");

  const secciones = $derived([
    { tipo: "egreso" as const, nombre: "Egresos", lista: categorias.filter((c) => c.tipo === "egreso") },
    { tipo: "ingreso" as const, nombre: "Ingresos", lista: categorias.filter((c) => c.tipo === "ingreso") },
  ]);

  async function cargar() {
    try {
      [categorias, sinCategoria, etiquetas] = await Promise.all([
        listarCategorias(), contarSinCategoria(), listarEtiquetas(),
      ]);
      error = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      cargando = false;
    }
  }

  function cambiarVista(v: Vista) {
    aviso = "";
    goto(v === "categorias" ? "?" : `?vista=${v}`, { replaceState: true, keepFocus: true, noScroll: true });
  }

  function nuevaCategoria(tipo: TipoCategoria = "egreso") {
    editando = null;
    tipoNueva = tipo;
    formAbierto = true;
  }

  function trasCambio(mensaje: string) {
    aviso = mensaje;
    cargar();
  }

  async function crearEtiqueta(e: SubmitEvent) {
    e.preventDefault();
    errorEtiqueta = "";
    const nombre = nombreEtiqueta.trim();
    if (etiquetas.some((t) => t.nombre.localeCompare(nombre, "es", { sensitivity: "base" }) === 0))
      return void (errorEtiqueta = `Ya existe «${nombre}».`);
    try {
      await obtenerOCrearEtiqueta(nombre);
      nombreEtiqueta = "";
      creandoEtiqueta = false;
      trasCambio(`Etiqueta «${nombre}» creada.`);
    } catch (err) {
      errorEtiqueta = err instanceof Error ? err.message : String(err);
    }
  }

  function enfocar(nodo: HTMLInputElement) {
    nodo.focus();
  }

  const plural = (k: number, uno: string, varios: string) => `${k.toLocaleString("es-CO")} ${k === 1 ? uno : varios}`;

  cargar();
</script>

<header class="encabezado">
  <div>
    <h1 class="titulo-pantalla">Categorías</h1>
    <p class="caption">
      {vista === "categorias"
        ? `${plural(categorias.length, "categoría", "categorías")}`
        : vista === "etiquetas" ? `${plural(etiquetas.length, "etiqueta", "etiquetas")}` : "Categorías automáticas al importar"}
    </p>
  </div>
  <div class="encabezado-acciones">
    {#if vista === "categorias"}
      <button class="cf-btn cf-btn--primary" onclick={() => nuevaCategoria()}><Icono nombre="mas" />Nueva categoría</button>
    {:else if vista === "etiquetas"}
      <button class="cf-btn cf-btn--primary" onclick={() => { creandoEtiqueta = true; errorEtiqueta = ""; }}><Icono nombre="mas" />Nueva etiqueta</button>
    {/if}
  </div>
</header>

<div class="cf-seg" role="group" aria-label="Vista">
  <button aria-pressed={vista === "categorias"} onclick={() => cambiarVista("categorias")}>Categorías</button>
  <button aria-pressed={vista === "etiquetas"} onclick={() => cambiarVista("etiquetas")}>Etiquetas</button>
  <button aria-pressed={vista === "reglas"} onclick={() => cambiarVista("reglas")}>Reglas</button>
</div>

{#if error}<p class="error-form" role="alert">No se pudieron cargar los datos: {error}</p>{/if}
{#if aviso}<p class="aviso" role="status">{aviso}</p>{/if}

{#if cargando}
  <p class="caption">Cargando…</p>
{:else if vista === "categorias"}
  {#if sinCategoria > 0}
    <a class="sin-categoria" href="/transacciones?sin-categoria=1">
      <span class="cf-tile cf-tile--brand"><Icono nombre="categorias" /></span>
      <span class="info">
        <b>Sin categoría</b>
        <span class="caption">{plural(sinCategoria, "movimiento por categorizar", "movimientos por categorizar")}</span>
      </span>
      <span class="ir">Categorizar <Icono nombre="siguiente" clase="flecha" /></span>
    </a>
  {/if}

  {#each secciones as sec (sec.tipo)}
    <section class="seccion cf-glass cf-card" aria-labelledby="s-{sec.tipo}">
      <header class="seccion-cab">
        <h2 id="s-{sec.tipo}" class="cf-card-title">{sec.nombre}</h2>
        <button class="cf-btn cf-btn--ghost" onclick={() => nuevaCategoria(sec.tipo)}><Icono nombre="mas" />Agregar</button>
      </header>
      {#if sec.lista.length}
        <div class="filas">
          {#each sec.lista as c (c.id)}
            <FilaCategoria categoria={c} {categorias} editar={() => { editando = c; formAbierto = true; }} listo={trasCambio} />
          {/each}
        </div>
      {:else}
        <p class="cf-muted">No tienes categorías de {sec.nombre.toLowerCase()}.</p>
      {/if}
    </section>
  {/each}
{:else if vista === "reglas"}
  <Reglas {categorias} />
{:else}
  <section class="seccion cf-glass cf-card" aria-label="Etiquetas">
    <p class="cf-muted intro">
      Las etiquetas agrupan movimientos de varias categorías, como «Viaje Cartagena» o «Reembolsable».
      Un movimiento tiene una categoría y puede tener varias etiquetas.
    </p>

    {#if creandoEtiqueta}
      <form class="nueva" onsubmit={crearEtiqueta}>
        <span class="cf-field"><input bind:value={nombreEtiqueta} maxlength={MAX_ETIQUETA} placeholder="Nombre de la etiqueta"
          aria-label="Nombre de la nueva etiqueta" use:enfocar onkeydown={(e) => e.key === "Escape" && (creandoEtiqueta = false)} /></span>
        <button class="cf-btn cf-btn--ghost" type="button" onclick={() => (creandoEtiqueta = false)}>Cancelar</button>
        <button class="cf-btn cf-btn--primary" type="submit">Crear</button>
      </form>
      {#if errorEtiqueta}<p class="error-form" role="alert">{errorEtiqueta}</p>{/if}
    {/if}

    {#if etiquetas.length}
      <div class="filas">
        {#each etiquetas as t (t.id)}
          <FilaEtiqueta etiqueta={t} listo={trasCambio} />
        {/each}
      </div>
    {:else if !creandoEtiqueta}
      <p class="cf-muted">Aún no tienes etiquetas. También puedes crearlas al registrar un movimiento.</p>
    {/if}
  </section>
{/if}

<FormCategoria abierto={formAbierto} categoria={editando} {categorias} tipoInicial={tipoNueva}
  cerrar={() => (formAbierto = false)} listo={() => trasCambio(editando ? "Categoría actualizada." : "Categoría creada.")} />

<style>
  .seccion { gap: var(--space-4); }
  .seccion-cab { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .filas { display: flex; flex-direction: column; gap: var(--space-2); }
  .intro { font-size: 14px; line-height: 20px; max-width: 640px; }
  .aviso { padding: 10px 14px; border-radius: var(--r-md); background: var(--primary-soft); color: var(--primary-text); font-size: 13px; font-weight: 500; align-self: flex-start; }
  .sin-categoria {
    display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4) var(--space-5);
    border-radius: var(--r-xl); border: 1px dashed var(--primary); background: var(--glass-1);
    color: inherit; text-decoration: none;
  }
  .sin-categoria:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .sin-categoria .info { flex: 1; display: flex; flex-direction: column; }
  .sin-categoria b { font-size: 15px; line-height: 20px; }
  .ir { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 14px; color: var(--primary-text); }
  .ir :global(.flecha) { width: 16px; height: 16px; }
  .nueva { display: flex; align-items: center; gap: var(--space-2); }
  .nueva .cf-field { flex: 1; max-width: 360px; }
</style>
