<script lang="ts">
  import Panel from "$lib/ui/Panel.svelte";
  import Icono from "$lib/Icono.svelte";
  import { iconosCategoria, nombresIconoCategoria, type NombreIcono } from "$lib/iconos";
  import {
    crearCategoria, editarCategoria, clavesColor, paleta, claseTesela,
    type Categoria, type CategoriaNueva, type ClaveColor, type TipoCategoria,
  } from "$lib/datos";

  let { abierto, categoria, categorias, tipoInicial = "egreso", cerrar, listo }: {
    abierto: boolean;
    /** null = categoría nueva */
    categoria: Categoria | null;
    /** Todas, para elegir el padre. */
    categorias: Categoria[];
    tipoInicial?: TipoCategoria;
    cerrar: () => void;
    /** Recibe el id de la categoría creada o editada. */
    listo: (id: number) => void;
  } = $props();

  const colorPorTipo: Record<TipoCategoria, ClaveColor> = { egreso: "egreso", ingreso: "ingreso" };

  let tipo = $state<TipoCategoria>("egreso");
  let nombre = $state("");
  let icono = $state<NombreIcono>("otros");
  let color = $state<ClaveColor>("egreso");
  let padreId = $state<number | null>(null);
  let colorTocado = $state(false);
  let error = $state("");
  let guardando = $state(false);

  // Reglas de edición
  const tipoBloqueado = $derived(!!categoria && (categoria.num_movimientos > 0 || categoria.num_hijas > 0));
  const padreBloqueado = $derived(!!categoria && categoria.num_hijas > 0);
  const posiblesPadres = $derived(
    categorias.filter((c) => c.padre_id == null && c.tipo === tipo && c.id !== categoria?.id),
  );

  $effect(() => {
    if (!abierto) return;
    const c = categoria;
    // Variable propia: si el efecto leyera `tipo`, se re-ejecutaría al elegir Ingreso y lo devolvería a Egreso.
    const t = c?.tipo ?? tipoInicial;
    tipo = t;
    nombre = c?.nombre ?? "";
    icono = c?.icono ?? "otros";
    color = c?.color ?? colorPorTipo[t];
    padreId = c?.padre_id ?? null;
    colorTocado = !!c;
    error = "";
  });

  function elegirTipo(t: TipoCategoria) {
    if (tipoBloqueado) return;
    tipo = t;
    padreId = null; // el padre debe ser del mismo tipo
    if (!colorTocado) color = colorPorTipo[t];
  }

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    const datos: CategoriaNueva = { nombre, tipo, icono, color, padre_id: padreId };
    guardando = true;
    try {
      let id = categoria?.id;
      if (categoria) await editarCategoria(categoria.id, datos);
      else id = await crearCategoria(datos);
      listo(id!);
      cerrar();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      guardando = false;
    }
  }
</script>

<Panel {abierto} {cerrar} titulo={categoria ? "Editar categoría" : "Nueva categoría"}
  subtitulo={categoria ? categoria.nombre : "Clasifica tus ingresos y egresos"}>
  <form id="form-categoria" class="form" onsubmit={guardar}>
    <div class="vista">
      <span class="cf-tile {claseTesela(color)}"><Icono nombre={icono} /></span>
      <div>
        <b>{nombre.trim() || "Nombre de la categoría"}</b>
        <span class="caption">
          {tipo === "egreso" ? "Egreso" : "Ingreso"}{#if padreId != null} · en {categorias.find((c) => c.id === padreId)?.nombre}{/if}
        </span>
      </div>
    </div>

    <div class="campo">
      <span class="etiqueta">Tipo</span>
      <div class="cf-seg" role="group" aria-label="Tipo de categoría">
        <button type="button" aria-pressed={tipo === "egreso"} disabled={tipoBloqueado && tipo !== "egreso"} onclick={() => elegirTipo("egreso")}>Egreso</button>
        <button type="button" aria-pressed={tipo === "ingreso"} disabled={tipoBloqueado && tipo !== "ingreso"} onclick={() => elegirTipo("ingreso")}>Ingreso</button>
      </div>
      {#if tipoBloqueado}<span class="ayuda">No se puede cambiar: ya tiene movimientos o subcategorías.</span>{/if}
    </div>

    <label class="campo">
      <span class="etiqueta">Nombre</span>
      <span class="cf-field"><input bind:value={nombre} placeholder="Restaurantes" required maxlength="40" /></span>
    </label>

    <label class="campo">
      <span class="etiqueta">Dentro de</span>
      <span class="cf-field">
        <select bind:value={padreId} disabled={padreBloqueado}>
          <option value={null}>Ninguna (categoría principal)</option>
          {#each posiblesPadres as p (p.id)}<option value={p.id}>{p.nombre}</option>{/each}
        </select>
      </span>
      <span class="ayuda">
        {padreBloqueado ? "Tiene subcategorías, así que debe ser principal." : "Opcional. Por ejemplo, Restaurantes dentro de Comida."}
      </span>
    </label>

    <div class="campo">
      <span class="etiqueta" id="et-icono">Ícono</span>
      <div class="rejilla-iconos" role="radiogroup" aria-labelledby="et-icono">
        {#each iconosCategoria as i}
          <button type="button" role="radio" aria-checked={icono === i} aria-label={nombresIconoCategoria[i]} title={nombresIconoCategoria[i]}
            class="opcion cf-tile {icono === i ? claseTesela(color) : ''}" onclick={() => (icono = i)}>
            <Icono nombre={i} />
          </button>
        {/each}
      </div>
    </div>

    <div class="campo">
      <span class="etiqueta" id="et-color">Color</span>
      <div class="colores" role="radiogroup" aria-labelledby="et-color">
        {#each clavesColor as k}
          <button type="button" role="radio" aria-checked={color === k} class="color"
            onclick={() => { color = k; colorTocado = true; }}>
            <span class="cf-tile {paleta[k].clase} muestra"><Icono nombre={icono} /></span>
            {paleta[k].nombre}
          </button>
        {/each}
      </div>
    </div>

    {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  </form>

  {#snippet pie()}
    <button class="cf-btn cf-btn--secondary" onclick={cerrar}>Cancelar</button>
    <button class="cf-btn cf-btn--primary" type="submit" form="form-categoria" disabled={guardando}>
      {categoria ? "Guardar cambios" : "Crear categoría"}
    </button>
  {/snippet}
</Panel>

<style>
  .form { display: flex; flex-direction: column; gap: var(--space-4); }
  .vista { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); border-radius: var(--r-lg); background: var(--glass-1); border: 1px solid var(--line); }
  .vista div { display: flex; flex-direction: column; }
  .vista b { font-size: 15px; line-height: 20px; }
  .rejilla-iconos { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: var(--space-2); }
  .opcion { width: 44px; height: 44px; border: 1px solid var(--line); background: var(--input); color: var(--ink-2); cursor: pointer; }
  .opcion[aria-checked="true"] { border-color: transparent; outline: 2px solid currentColor; outline-offset: 1px; }
  .opcion:focus-visible, .color:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .colores { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2); }
  .color { display: flex; align-items: center; gap: var(--space-3); height: 52px; padding: 0 var(--space-3); border-radius: var(--r-md); border: 1px solid var(--line); background: var(--input); font: 500 14px/20px var(--font-sans); color: var(--ink); cursor: pointer; }
  .color[aria-checked="true"] { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
  .muestra { width: 32px; height: 32px; border-radius: 10px; }
  .muestra :global(.cf-icon) { width: 16px; height: 16px; }
  .cf-seg button:disabled { opacity: .45; cursor: not-allowed; }
</style>
