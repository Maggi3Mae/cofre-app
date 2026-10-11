<script lang="ts" module>
  import type { NombreIcono } from "$lib/iconos";
  export interface Accion {
    texto: string;
    icono: NombreIcono;
    detalle?: string;
    peligro?: boolean;
    accion: () => void;
  }
</script>

<script lang="ts">
  // Botón «⋯» con las acciones que se usan poco o son delicadas (lienzo «Me deben · botones», opción A).
  // Mac/tablet: menú bajo el botón. Celular: hoja desde abajo con título. «Atrás» y Esc lo cierran.
  import { tick } from "svelte";
  import Icono from "$lib/Icono.svelte";
  import { pantalla } from "$lib/pantalla.svelte";
  import { alAtras } from "$lib/atras";

  let { acciones, titulo, subtitulo = "", etiqueta = "Más opciones", tam = 44 }: {
    acciones: Accion[];
    titulo: string;
    subtitulo?: string;
    etiqueta?: string;
    /** Lado del botón en px. */
    tam?: number;
  } = $props();

  let abierto = $state(false);
  let boton = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  let pos = $state({ top: 0, right: 0, arriba: false });
  const id = `menu-${Math.random().toString(36).slice(2, 8)}`;
  let quitarAtras: (() => void) | null = null;

  async function abrir() {
    if (abierto) return cerrar();
    abierto = true;
    quitarAtras = alAtras(cerrar);
    await tick();
    if (!pantalla.celular && boton) {
      const r = boton.getBoundingClientRect();
      const alto = menu?.offsetHeight ?? 200;
      const arriba = window.innerHeight - r.bottom < alto + 16 && r.top > alto;
      pos = { top: arriba ? r.top - 6 : r.bottom + 6, right: Math.max(12, window.innerWidth - r.right), arriba };
    }
    (menu?.querySelector("button") as HTMLButtonElement | null)?.focus();
  }
  function cerrar() {
    if (!abierto) return;
    abierto = false;
    quitarAtras?.(); quitarAtras = null;
  }
  function elegir(a: Accion) {
    cerrar();
    a.accion();
  }
  $effect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu?.contains(t) && !boton?.contains(t)) cerrar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); boton?.focus(); } };
    const mover = () => !pantalla.celular && cerrar();
    addEventListener("pointerdown", fuera, true);
    addEventListener("keydown", tecla, true);
    addEventListener("resize", mover);
    addEventListener("scroll", mover, true);
    return () => {
      removeEventListener("pointerdown", fuera, true);
      removeEventListener("keydown", tecla, true);
      removeEventListener("resize", mover);
      removeEventListener("scroll", mover, true);
    };
  });
  $effect(() => () => quitarAtras?.());

  function aCuerpo(n: HTMLElement) {
    document.body.appendChild(n);
    return { destroy: () => n.remove() };
  }
</script>

<button bind:this={boton} type="button" class="cf-btn cf-btn--icon puntos" style:width="{tam}px" style:height="{tam}px"
  aria-label={etiqueta} title={etiqueta} aria-haspopup="menu" aria-expanded={abierto} aria-controls={id} onclick={abrir}>
  <Icono nombre="puntos" />
</button>

{#if abierto}
  {#if pantalla.celular}
    <div class="velo" use:aCuerpo role="presentation" onclick={cerrar}></div>
    <div class="hoja cf cf-glass-3" bind:this={menu} use:aCuerpo id={id} role="menu" tabindex="-1" aria-label={titulo}>
      <div class="asa" aria-hidden="true"></div>
      <div class="cab"><b>{titulo}</b>{#if subtitulo}<span>{subtitulo}</span>{/if}</div>
      <div class="lista">
        {#each acciones as a (a.texto)}
          <button type="button" role="menuitem" class="op" class:peligro={a.peligro} onclick={() => elegir(a)}>
            <Icono nombre={a.icono} />
            <span>{a.texto}{#if a.detalle}<small>{a.detalle}</small>{/if}</span>
          </button>
        {/each}
      </div>
    </div>
  {:else}
    <div class="pop cf cf-glass-3" class:arriba={pos.arriba} bind:this={menu} use:aCuerpo id={id} role="menu" tabindex="-1" aria-label={titulo}
      style:top="{pos.top}px" style:right="{pos.right}px">
      {#each acciones as a (a.texto)}
        <button type="button" role="menuitem" class="op" class:peligro={a.peligro} onclick={() => elegir(a)}>
          <Icono nombre={a.icono} />
          <span>{a.texto}{#if a.detalle}<small>{a.detalle}</small>{/if}</span>
        </button>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .puntos :global(.cf-icon) { stroke-width: 2.6; }
  .op { display: flex; align-items: center; gap: 12px; width: 100%; border: 0; background: transparent; text-align: left; cursor: pointer;
    font: 500 14px/20px var(--font-sans); color: var(--ink); }
  .op :global(.cf-icon) { width: 20px; height: 20px; color: var(--ink-2); }
  .op small { display: block; font-size: 12px; line-height: 16px; color: var(--ink-2); }
  .op.peligro, .op.peligro :global(.cf-icon) { color: var(--expense); }
  .op:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }

  /* Mac / tablet */
  .pop { position: fixed; z-index: 1000; min-width: 220px; max-width: 300px; padding: 6px; border-radius: var(--r-md); display: flex; flex-direction: column; }
  .pop.arriba { transform: translateY(-100%); }
  .pop .op { min-height: 40px; padding: 8px 10px; border-radius: var(--r-sm); }
  .pop .op:hover { background: var(--primary-soft); }
  .pop .op.peligro:hover { background: var(--expense-soft); }

  /* Celular */
  .velo { position: fixed; inset: 0; z-index: 999; background: rgba(13, 10, 24, .38); }
  .hoja { position: fixed; z-index: 1000; left: 0; right: 0; bottom: 0; border-radius: var(--r-xl) var(--r-xl) 0 0; border-bottom: 0;
    padding: 10px var(--space-5) calc(var(--area-abajo, 0px) + var(--space-5)); display: flex; flex-direction: column; gap: 8px; }
  .asa { align-self: center; width: 40px; height: 5px; border-radius: var(--r-full); background: var(--track); }
  .cab { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 8px 4px; }
  .cab b { font: 650 20px/26px var(--font-display); color: var(--ink); }
  .cab span { font-size: 14px; color: var(--ink-2); white-space: nowrap; }
  .lista .op { min-height: 56px; padding: 0 4px; font-size: 16px; line-height: 22px; border-top: 1px solid var(--line); }
  .lista .op:first-child { border-top: 0; }
  .lista .op :global(.cf-icon) { width: 22px; height: 22px; }
</style>
