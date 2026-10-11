<script lang="ts">
  // Reglas automáticas de categoría: las aprendidas (comercio exacto) y las palabras clave.
  import Icono from "$lib/Icono.svelte";
  import {
    listarReglas, guardarRegla, eliminarRegla, cambiarCategoriaRegla, normalizarPatron,
    type Regla, type Categoria,
  } from "$lib/datos";

  let { categorias }: { categorias: Categoria[] } = $props();

  let reglas = $state<Regla[]>([]);
  let error = $state("");
  let palabra = $state("");
  let categoriaPalabra = $state<number | null>(null);
  let errorPalabra = $state("");

  const aprendidas = $derived(reglas.filter((r) => r.tipo === "comercio"));
  const porCategoria = $derived.by(() => {
    const m = new Map<number, { nombre: string; tipo: string; palabras: Regla[] }>();
    for (const r of reglas.filter((r) => r.tipo === "palabra")) {
      const g = m.get(r.categoria_id) ?? { nombre: r.categoria_nombre, tipo: r.categoria_tipo, palabras: [] };
      g.palabras.push(r);
      m.set(r.categoria_id, g);
    }
    return [...m.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));
  });
  const opciones = $derived([
    ...categorias.filter((c) => c.tipo === "egreso"),
    ...categorias.filter((c) => c.tipo === "ingreso"),
  ]);

  async function cargar() {
    try { reglas = await listarReglas(); error = ""; }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  cargar();

  async function agregar(ev: SubmitEvent) {
    ev.preventDefault();
    errorPalabra = "";
    const p = normalizarPatron(palabra);
    if (!p) { errorPalabra = "Escribe una palabra o frase."; return; }
    if (categoriaPalabra == null) { errorPalabra = "Elige la categoría."; return; }
    const ya = reglas.find((r) => r.tipo === "palabra" && r.patron === p);
    try {
      await guardarRegla(p, categoriaPalabra, "palabra");
      palabra = "";
      if (ya && ya.categoria_id !== categoriaPalabra) errorPalabra = `«${p}» se movió de ${ya.categoria_nombre}.`;
      await cargar();
    } catch (e) {
      errorPalabra = e instanceof Error ? e.message : String(e);
    }
  }

  async function quitar(r: Regla) {
    try { await eliminarRegla(r.id); await cargar(); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
  }

  async function cambiar(r: Regla, id: number) {
    try { await cambiarCategoriaRegla(r.id, id); await cargar(); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
</script>

{#if error}<p class="error-form" role="alert">{error}</p>{/if}

<p class="intro cf-muted">
  Al importar extractos, Cofre sugiere la categoría en este orden: tus reglas aprendidas, lo que ya le diste
  antes a ese comercio y, si no hay nada, las palabras clave.
</p>

<section class="seccion cf-glass cf-card" aria-labelledby="t-aprendidas">
  <header class="seccion-cab">
    <h2 id="t-aprendidas" class="cf-card-title">Aprendidas</h2>
    <span class="caption">{aprendidas.length} {aprendidas.length === 1 ? "comercio" : "comercios"}</span>
  </header>
  {#if !aprendidas.length}
    <p class="cf-muted">Aún no hay. Al importar, cuando cambies una categoría, Cofre te ofrece aprenderla.</p>
  {:else}
    <ul class="lista">
      {#each aprendidas as r (r.id)}
        <li>
          <b class="patron">{r.patron}</b>
          <span class="cf-muted">→</span>
          <span class="cf-field compacto">
            <select value={r.categoria_id} onchange={(e) => cambiar(r, +e.currentTarget.value)} aria-label="Categoría de {r.patron}">
              {#each categorias.filter((c) => c.tipo === r.categoria_tipo) as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
            </select>
          </span>
          <button class="cf-btn cf-btn--icon" onclick={() => quitar(r)} aria-label="Quitar regla {r.patron}" title="Quitar"><Icono nombre="papelera" /></button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="seccion cf-glass cf-card" aria-labelledby="t-palabras">
  <header class="seccion-cab">
    <h2 id="t-palabras" class="cf-card-title">Palabras clave</h2>
    <span class="caption">Se buscan como palabra completa, sin importar tildes ni mayúsculas.</span>
  </header>

  <form class="nueva-palabra" onsubmit={agregar}>
    <label class="campo">
      <span class="etiqueta">Palabra o frase</span>
      <span class="cf-field"><input bind:value={palabra} placeholder="ej. carulla, cruz verde" /></span>
    </label>
    <label class="campo">
      <span class="etiqueta">Categoría</span>
      <span class="cf-field">
        <select bind:value={categoriaPalabra}>
          <option value={null}>Elige…</option>
          {#each opciones as c (c.id)}<option value={c.id}>{c.nombre}{c.tipo === "ingreso" ? " (ingreso)" : ""}</option>{/each}
        </select>
      </span>
    </label>
    <button class="cf-btn cf-btn--primary" type="submit"><Icono nombre="mas" />Agregar</button>
  </form>
  {#if errorPalabra}<p class="caption aviso-palabra" role="status">{errorPalabra}</p>{/if}

  <div class="grupos">
    {#each porCategoria as [id, g] (id)}
      <div class="grupo">
        <span class="cf-overline">{g.nombre}</span>
        <div class="chips">
          {#each g.palabras as r (r.id)}
            <span class="cf-chip cf-chip--sm cf-chip--brand palabra">
              {r.patron}
              <button onclick={() => quitar(r)} aria-label="Quitar {r.patron}" title="Quitar"><Icono nombre="cerrar" /></button>
            </span>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</section>

<style>
  .seccion { gap: var(--space-4); }
  .seccion-cab { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
  .intro { font-size: 14px; line-height: 20px; max-width: 640px; }
  .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .lista li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-top: 1px solid var(--line); }
  .lista li:first-child { border-top: 0; }
  .patron { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .compacto { height: 36px; width: 220px; }
  .compacto select { flex: 1; border: 0; outline: 0; background: transparent; font: 400 14px/20px var(--font-sans); color: var(--ink); }
  .nueva-palabra { display: grid; grid-template-columns: 1fr 240px auto; gap: var(--space-3); align-items: end; }
  .aviso-palabra { color: var(--primary-text); }
  .grupos { display: flex; flex-direction: column; gap: var(--space-4); }
  .grupo { display: flex; flex-direction: column; gap: var(--space-2); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .palabra { padding-right: 4px; }
  .palabra button { display: inline-flex; border: 0; background: transparent; color: inherit; padding: 2px; border-radius: var(--r-full); cursor: pointer; }
  .palabra button:hover { background: rgba(0,0,0,.08); }
  .palabra button:focus-visible { outline: 2px solid var(--primary); }
  .palabra :global(.cf-icon) { width: 12px; height: 12px; }
</style>
