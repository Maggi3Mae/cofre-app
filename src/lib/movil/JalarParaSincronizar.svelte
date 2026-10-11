<script lang="ts">
  // Celular: jalar hacia abajo (estando arriba del todo) sincroniza con el Mac.
  import Icono from "$lib/Icono.svelte";
  import { mostrarAviso } from "$lib/alertas/estado-alertas.svelte";
  import { sinc, sincronizar } from "$lib/sinc/estado-sinc.svelte";

  // Gesto largo a propósito (antes se disparaba solo al hacer scroll): hay que jalar unos 250 px
  // con el dedo, y no cuenta hasta pasar los primeros 30 px.
  const HOLGURA = 30;
  const FRENO = 0.45;
  const UMBRAL = 100; // px ya frenados
  const MAX = 130;

  let inicio: { x: number; y: number } | null = null;
  let jalando = $state(false);
  let distancia = $state(0);
  let girando = $state(false);

  /** Hay una hoja abierta (Panel bloquea el scroll de la página). */
  const hayHoja = () => document.documentElement.style.overflow === "hidden";

  function empieza(e: TouchEvent) {
    if (girando || e.touches.length !== 1 || window.scrollY > 0 || hayHoja()) return;
    inicio = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function mueve(e: TouchEvent) {
    if (!inicio) return;
    const dx = e.touches[0].clientX - inicio.x, dy = e.touches[0].clientY - inicio.y;
    if (!jalando) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > dy) { inicio = null; return; } // deslizar de lado (chips)
      if (dy < HOLGURA || window.scrollY > 0) return;
      if (Math.abs(dx) > dy * 0.6) { inicio = null; return; } // diagonal: no es jalar
      jalando = true;
    }
    distancia = Math.min(MAX, Math.max(0, dy - HOLGURA) * FRENO);
  }

  async function suelta() {
    if (!inicio) return;
    inicio = null;
    const listo = jalando && distancia >= UMBRAL;
    jalando = false;
    if (!listo) { distancia = 0; return; }
    if (!sinc.emparejado) {
      distancia = 0;
      mostrarAviso({ titulo: "Sin emparejar", cuerpo: "Empareja este celular en Más → Sincronizar con el Mac.", nivel: "w80" });
      return;
    }
    girando = true;
    distancia = UMBRAL;
    try {
      const r = await sincronizar(true);
      if (r) mostrarAviso({ titulo: "Sincronizado", cuerpo: r.recibidas ? `${r.recibidas} cambios recibidos.` : "Todo estaba al día.", nivel: "ok" });
    } catch (err) {
      mostrarAviso({ titulo: "No se pudo sincronizar", cuerpo: String(err), nivel: "w90" });
    } finally {
      girando = false;
      distancia = 0;
    }
  }
</script>

<svelte:window ontouchstart={empieza} ontouchmove={mueve} ontouchend={suelta} ontouchcancel={suelta} />

{#if distancia > 0 || girando}
  <div class="jalar" class:suelto={!jalando} style:transform="translate(-50%, {distancia}px)" role="status" aria-live="polite">
    <span class="bola cf-glass-3" class:girando class:listo={distancia >= UMBRAL}
      style:rotate={girando ? undefined : `${(distancia / UMBRAL) * 270}deg`}>
      <Icono nombre="sincronizar" />
    </span>
    {#if girando}<span class="cf-sr">Sincronizando con el Mac</span>{/if}
  </div>
{/if}

<style>
  .jalar {
    position: fixed; z-index: 30; left: 50%; top: calc(var(--area-arriba, 0px) - 36px); pointer-events: none;
  }
  .jalar.suelto { transition: transform .2s ease-out; }
  .bola { width: 40px; height: 40px; border-radius: 999px; display: grid; place-items: center; color: var(--ink-2); }
  .bola.listo, .bola.girando { color: var(--primary-text); }
  .bola :global(.cf-icon) { width: 20px; height: 20px; stroke-width: 2.2; }
  .girando { animation: girar .8s linear infinite; }
  @keyframes girar { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .girando { animation: none; } .jalar.suelto { transition: none; } }
</style>
