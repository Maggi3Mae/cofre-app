<script lang="ts">
  import Icono from "$lib/Icono.svelte";
  import { pesos } from "$lib/formato";
  import { claseTesela, eliminarCategoria, type Categoria } from "$lib/datos";

  let { categoria, categorias, editar, listo }: {
    categoria: Categoria;
    /** Todas, para elegir a dónde mover los movimientos al eliminar. */
    categorias: Categoria[];
    editar: () => void;
    listo: (mensaje: string) => void;
  } = $props();

  const hija = $derived(categoria.padre_id != null);
  const n = $derived(categoria.num_movimientos);
  const plural = (k: number, uno: string, varios: string) => `${k.toLocaleString("es-CO")} ${k === 1 ? uno : varios}`;
  /** «Su movimiento …» / «Sus 3 movimientos …» */
  const sus = (k: number, uno: string, varios: string) => (k === 1 ? `Su ${uno}` : `Sus ${k.toLocaleString("es-CO")} ${varios}`);
  // Destinos posibles: mismo tipo, distinta de ella.
  const destinos = $derived(categorias.filter((c) => c.tipo === categoria.tipo && c.id !== categoria.id));

  let confirmar = $state(false);
  let moverA = $state<number | null>(null);
  let error = $state("");

  function abrirConfirmar() {
    moverA = null;
    error = "";
    confirmar = true;
  }

  async function eliminar() {
    error = "";
    try {
      await eliminarCategoria(categoria.id, n > 0 ? moverA : null);
      const destino = destinos.find((c) => c.id === moverA)?.nombre;
      listo(n > 0
        ? `«${categoria.nombre}» se eliminó. ${sus(n, "movimiento pasó", "movimientos pasaron")} a ${destino ? `«${destino}»` : "Sin categoría"}.`
        : `«${categoria.nombre}» se eliminó.`);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<article class="fila" class:hija>
  <a class="principal" href="/transacciones?categoria={categoria.id}" title="Ver movimientos de {categoria.nombre}">
    <span class="cf-tile {claseTesela(categoria.color)}"><Icono nombre={categoria.icono ?? "otros"} /></span>
    <span class="info">
      <b>{categoria.nombre}</b>
      <span class="caption">
        {plural(n, "movimiento", "movimientos")}{#if categoria.num_hijas}{" · "}{plural(categoria.num_hijas, "subcategoría", "subcategorías")}{/if}
      </span>
    </span>
  </a>

  <span class="total">
    <span class="cf-overline">Este mes</span>
    <b class:cf-amt-income={categoria.tipo === "ingreso" && categoria.total_mes > 0}>
      {categoria.total_mes ? pesos(categoria.total_mes, categoria.tipo === "ingreso" ? "+" : "−") : "—"}
    </b>
  </span>

  <span class="acciones">
    <button class="cf-btn cf-btn--icon corto" onclick={editar} aria-label="Editar {categoria.nombre}" title="Editar"><Icono nombre="editar" /></button>
    <button class="cf-btn cf-btn--icon corto peligro" onclick={abrirConfirmar} aria-label="Eliminar {categoria.nombre}" title="Eliminar"><Icono nombre="papelera" /></button>
  </span>

  {#if confirmar}
    <div class="confirmar" role="alertdialog" aria-label="Eliminar {categoria.nombre}">
      <p><b>¿Eliminar «{categoria.nombre}»?</b></p>
      <ul class="caption">
        {#if n > 0}<li>{sus(n, "movimiento se moverá", "movimientos se moverán")} a la categoría que elijas.</li>{/if}
        {#if categoria.num_hijas}<li>{sus(categoria.num_hijas, "subcategoría pasará", "subcategorías pasarán")} a ser {categoria.num_hijas === 1 ? "principal" : "principales"}.</li>{/if}
        <li>Se borran su presupuesto y sus reglas automáticas, si tiene.</li>
      </ul>
      {#if n > 0}
        <label class="campo">
          <span class="etiqueta">Mover sus movimientos a</span>
          <span class="cf-field">
            <select bind:value={moverA}>
              <option value={null}>Sin categoría</option>
              {#each destinos as d (d.id)}<option value={d.id}>{d.padre_id != null ? "  · " : ""}{d.nombre}</option>{/each}
            </select>
          </span>
        </label>
      {/if}
      {#if error}<p class="error-form" role="alert">{error}</p>{/if}
      <div class="botones">
        <button class="cf-btn cf-btn--ghost" onclick={() => (confirmar = false)}>Cancelar</button>
        <button class="cf-btn cf-btn--secondary peligro" onclick={eliminar}><Icono nombre="papelera" />Eliminar</button>
      </div>
    </div>
  {/if}
</article>

<style>
  .fila {
    display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center;
    gap: var(--space-4); padding: var(--space-3) var(--space-4) var(--space-3) var(--space-5);
    border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--glass-1);
  }
  .hija { margin-left: var(--space-10); }
  .principal { display: flex; align-items: center; gap: var(--space-3); min-width: 0; color: inherit; text-decoration: none; border-radius: var(--r-md); }
  .principal:hover b { color: var(--primary-text); }
  .principal:focus-visible { outline: 2px solid var(--primary); outline-offset: 4px; }
  .info { display: flex; flex-direction: column; min-width: 0; }
  .info b { font-size: 15px; line-height: 20px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .total { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; min-width: 120px; }
  .total b { font: 650 17px/22px var(--font-display); white-space: nowrap; }
  .acciones { display: flex; gap: var(--space-2); }
  .corto { width: 36px; height: 36px; }
  .peligro { color: var(--expense); }
  .confirmar {
    grid-column: 1 / -1; display: flex; flex-direction: column; gap: var(--space-3);
    padding: var(--space-4); border-radius: var(--r-md); background: var(--expense-soft);
  }
  .confirmar ul { margin: 0; padding-left: 18px; color: var(--ink); }
  .confirmar .cf-field { max-width: 360px; }
  .botones { display: flex; justify-content: flex-end; gap: var(--space-2); }
  @media (max-width: 760px) { .hija { margin-left: var(--space-5); } .total { min-width: 0; } }
</style>
