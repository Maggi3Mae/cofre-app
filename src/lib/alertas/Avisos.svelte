<script lang="ts">
  // Pila de toasts (abajo a la derecha). Se anuncian a lectores de pantalla.
  import Icono from "$lib/Icono.svelte";
  import { avisos, cerrarAviso } from "./estado-alertas.svelte";
  import { claseNivel } from "$lib/datos";
  import { pantalla } from "$lib/pantalla.svelte";

  const textoEnlace = (e: string) =>
    e.startsWith("/inversiones") ? "Ver inversiones" : e === "/ajustes" ? "Ir a Ajustes" : "Ver presupuestos";
</script>

<div class="pila" class:movil={pantalla.celular} role="region" aria-label="Avisos" aria-live="polite">
  {#each avisos.lista as a (a.id)}
    <div class="aviso cf-glass nivel-{claseNivel[a.nivel]}" role="status">
      <span class="icono"><Icono nombre="campana" /></span>
      <div class="texto">
        <b>{a.titulo}</b>
        <span class="caption">{a.cuerpo}</span>
        {#if a.enlace}<a href={a.enlace} onclick={() => cerrarAviso(a.id)}>{textoEnlace(a.enlace)}</a>{/if}
      </div>
      <button class="cf-btn cf-btn--icon" onclick={() => cerrarAviso(a.id)} aria-label="Cerrar aviso"><Icono nombre="cerrar" /></button>
    </div>
  {/each}
</div>

<style>
  .pila {
    position: fixed; right: var(--space-6); bottom: var(--space-6); z-index: 60;
    display: flex; flex-direction: column; gap: var(--space-2); width: min(380px, calc(100vw - 32px));
    pointer-events: none;
  }
  .aviso {
    pointer-events: auto; display: grid; grid-template-columns: auto 1fr auto; gap: var(--space-3); align-items: start;
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4); border-radius: var(--r-lg);
    background: var(--glass-3); box-shadow: var(--shadow-3); animation: entrar .2s ease-out;
    --tono: var(--primary); --tono-suave: var(--primary-soft);
  }
  .nivel-income { --tono: var(--income); --tono-suave: var(--income-soft); }
  .nivel-warn-80 { --tono: var(--warn-80); --tono-suave: var(--warn-80-soft); }
  .nivel-warn-90 { --tono: var(--warn-90); --tono-suave: var(--warn-90-soft); }
  .nivel-over-100 { --tono: var(--over-100); --tono-suave: var(--over-100-soft); }
  .icono {
    width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
    background: var(--tono-suave); color: var(--tono);
  }
  .icono :global(.cf-icon) { width: 18px; height: 18px; }
  .texto { display: flex; flex-direction: column; gap: 2px; padding-top: 2px; }
  .texto b { font-size: 14px; line-height: 20px; color: var(--tono); }
  .texto a { font-size: 13px; font-weight: 600; color: var(--primary-text); margin-top: 4px; }
  @keyframes entrar { from { opacity: 0; transform: translateY(8px); } }
  @media (prefers-reduced-motion: reduce) { .aviso { animation: none; } }
  /* Celular: arriba de la barra inferior, a lo ancho. */
  /* Tablet: por encima de la barra de navegación de Android. */
  :global(html.tablet) .pila { bottom: calc(var(--area-abajo, 0px) + var(--space-5)); }
  .pila.movil { left: 12px; right: 12px; width: auto; bottom: calc(var(--area-abajo, 0px) + 88px); }
</style>
