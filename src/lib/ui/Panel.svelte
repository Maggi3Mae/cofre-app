<script lang="ts" module>
  // Mientras haya algún panel abierto, la página de fondo no se desplaza
  // (contador por si se abre un panel encima de otro).
  let abiertos = 0;
  function bloquearFondo() {
    if (abiertos++ === 0) {
      const html = document.documentElement.style;
      html.scrollbarGutter = "stable"; // que no salte el contenido al quitar la barra
      html.overflow = "hidden";
    }
  }
  function liberarFondo() {
    if (--abiertos === 0) {
      const html = document.documentElement.style;
      html.overflow = "";
      html.scrollbarGutter = "";
    }
  }
</script>

<script lang="ts">
  // Panel lateral flotante (vidrio glass-3). Se cierra con Esc o clic afuera.
  import type { Snippet } from "svelte";
  import Icono from "$lib/Icono.svelte";
  import { pantalla } from "$lib/pantalla.svelte";
  import { alAtras } from "$lib/atras";

  let { abierto, titulo, subtitulo = "", cerrar, children, pie }: {
    abierto: boolean;
    titulo: string;
    subtitulo?: string;
    cerrar: () => void;
    children: Snippet;
    pie?: Snippet;
  } = $props();

  $effect(() => {
    if (!abierto) return;
    bloquearFondo();
    const quitar = alAtras(() => cerrar()); // «atrás» de Android cierra el panel
    return () => { quitar(); liberarFondo(); };
  });

  // Celular: hoja desde abajo que se cierra arrastrándola hacia abajo desde la cabecera.
  let arrastre = $state(0);
  let inicioY: number | null = null;
  function bajarEmpieza(e: PointerEvent) {
    if (!pantalla.celular || (e.target as HTMLElement).closest("button")) return;
    inicioY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function bajarMueve(e: PointerEvent) {
    if (inicioY != null) arrastre = Math.max(0, e.clientY - inicioY);
  }
  function bajarSuelta() {
    if (inicioY == null) return;
    inicioY = null;
    if (arrastre > 110) cerrar();
    arrastre = 0;
  }

  function tecla(e: KeyboardEvent) {
    if (abierto && e.key === "Escape") cerrar();
  }
</script>

<svelte:window onkeydown={tecla} />

{#if abierto}
  <div class="velo" onclick={cerrar} aria-hidden="true"></div>
  <div class="panel cf cf-glass-3" class:movil={pantalla.celular} class:arrastrando={arrastre > 0} role="dialog" aria-modal="true" aria-label={titulo}
    style:transform={arrastre ? `translateY(${arrastre}px)` : undefined}>
    <!-- svelte-ignore a11y_no_static_element_interactions (arrastrar es un extra: el botón Cerrar sigue ahí) -->
    <header class="panel-cab" onpointerdown={bajarEmpieza} onpointermove={bajarMueve} onpointerup={bajarSuelta} onpointercancel={bajarSuelta}>
      {#if pantalla.celular}<span class="asa" aria-hidden="true"></span>{/if}
      <div>
        <h2 class="cf-card-title">{titulo}</h2>
        {#if subtitulo}<p class="caption">{subtitulo}</p>{/if}
      </div>
      <button class="cf-btn cf-btn--icon" onclick={cerrar} aria-label="Cerrar"><Icono nombre="cerrar" /></button>
    </header>
    <div class="panel-cuerpo">{@render children()}</div>
    {#if pie}<footer class="panel-pie">{@render pie()}</footer>{/if}
  </div>
{/if}

<style>
  .velo { position: fixed; inset: 0; z-index: 20; background: rgba(13, 10, 24, .28); }
  .panel {
    position: fixed; z-index: 21; top: var(--space-5); right: var(--space-5); bottom: var(--space-5);
    width: min(440px, calc(100vw - 2 * var(--space-5))); border-radius: var(--r-xl);
    display: flex; flex-direction: column; overflow: hidden;
    animation: entrar .18s ease-out;
  }
  .panel-cab { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); padding: var(--space-6) var(--space-6) var(--space-4); }
  .panel-cuerpo { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 0 var(--space-6) var(--space-6); display: flex; flex-direction: column; gap: var(--space-4); }
  .panel-pie { display: flex; flex-wrap: wrap; gap: var(--space-3); justify-content: flex-end; padding: var(--space-4) var(--space-6); border-top: 1px solid var(--line); }
  /* Celular: hoja desde abajo (alto según el contenido, hasta casi toda la pantalla). */
  .panel.movil {
    top: auto; bottom: 0; left: 0; right: 0; width: auto;
    max-height: calc(100dvh - var(--area-arriba, 0px) - var(--space-4));
    border-radius: 28px 28px 0 0; border-bottom: 0;
    animation: subir .22s ease-out; transition: transform .18s ease-out;
  }
  .panel.movil.arrastrando { transition: none; }
  .panel.movil .panel-cab { position: relative; padding: var(--space-6) var(--space-4) var(--space-3); touch-action: none; }
  .asa { position: absolute; top: 10px; left: 50%; width: 40px; height: 5px; margin-left: -20px; border-radius: 999px; background: var(--track); }
  .panel.movil .panel-cuerpo { padding: 0 var(--space-4) var(--space-5); }
  .panel.movil .panel-cuerpo:last-child { padding-bottom: calc(var(--area-abajo, 0px) + var(--space-5)); }
  .panel.movil .panel-pie { flex-wrap: wrap; padding: var(--space-3) var(--space-4) calc(var(--area-abajo, 0px) + var(--space-3)); }
  @keyframes subir { from { transform: translateY(40%); opacity: .6; } }
  @keyframes entrar { from { transform: translateX(24px); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .panel, .panel.movil { animation: none; } }
</style>
