<script lang="ts">
  // Foto en grande (facturas): encima de todo, con velo opaco.
  // «Ajustar» = entera en pantalla; «Ancho completo» = a lo ancho con scroll (facturas largas, y en Android no hay zoom).
  import { onMount } from "svelte";
  import Icono from "$lib/Icono.svelte";
  import { alAtras } from "$lib/atras";

  let { src, alt = "Foto", cerrar }: { src: string; alt?: string; cerrar: () => void } = $props();

  let ancho = $state(false);
  let decidido = false;

  /** Las fotos muy alargadas (tiquetes) abren a lo ancho; las demás, enteras. */
  function cargada(e: Event) {
    if (decidido) return;
    decidido = true;
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget as HTMLImageElement;
    ancho = w > 0 && h / w > 2;
  }

  /** Lleva el visor al <body>: dentro del panel quedaba recortado y con el formulario detrás. */
  function aCuerpo(n: HTMLElement) {
    document.body.appendChild(n);
    return { destroy: () => n.remove() };
  }

  onMount(() => {
    const quitarAtras = alAtras(cerrar);
    // En captura: Esc cierra solo el visor, no el panel que está debajo.
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
      cerrar();
    };
    addEventListener("keydown", tecla, true);
    return () => { quitarAtras(); removeEventListener("keydown", tecla, true); };
  });
</script>

<div class="visor cf" use:aCuerpo role="dialog" aria-modal="true" aria-label={alt}>
  <button type="button" class="velo" onclick={cerrar} aria-label="Cerrar" tabindex="-1"></button>
  <div class="barra">
    <button type="button" class="cf-btn cf-btn--secondary" onclick={() => (ancho = !ancho)} aria-pressed={ancho}>
      {ancho ? "Ajustar" : "Ancho completo"}
    </button>
    <button type="button" class="cf-btn cf-btn--icon cf-btn--secondary" onclick={cerrar} aria-label="Cerrar"><Icono nombre="cerrar" /></button>
  </div>
  <div class="lienzo" class:ancho>
    <button type="button" class="foto" onclick={() => (ancho = !ancho)} aria-label={ancho ? "Ajustar a la pantalla" : "Ver a lo ancho"}>
      <img {src} {alt} onload={cargada} draggable="false" />
    </button>
  </div>
</div>

<style>
  .visor {
    position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column;
    padding: calc(var(--area-arriba, 0px) + var(--space-3)) var(--space-3) calc(var(--area-abajo, 0px) + var(--space-3));
    box-sizing: border-box;
  }
  .velo { position: absolute; inset: 0; border: 0; padding: 0; background: rgb(12 8 24 / .88); cursor: zoom-out; }
  .barra { position: relative; display: flex; justify-content: flex-end; gap: var(--space-2); flex: none; margin-bottom: var(--space-3); }
  .lienzo {
    position: relative; flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain;
    display: flex; justify-content: center; align-items: center;
  }
  .lienzo.ancho { align-items: flex-start; }
  .foto { padding: 0; border: 0; background: none; display: block; cursor: zoom-in; max-width: 100%; max-height: 100%; }
  .ancho .foto { cursor: zoom-out; max-height: none; width: min(100%, 760px); }
  .foto img { display: block; max-width: 100%; max-height: calc(100vh - var(--area-arriba, 0px) - var(--area-abajo, 0px) - 88px); object-fit: contain; border-radius: var(--r-md); margin: 0 auto; }
  .ancho .foto img { width: 100%; max-height: none; height: auto; }
</style>
