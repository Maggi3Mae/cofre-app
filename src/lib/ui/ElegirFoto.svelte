<script lang="ts">
  // Botón para elegir la foto de una factura. En Android el WebView no ofrece cámara y galería a la vez:
  // al tocar sale un menú con «Tomar foto» (abre la cámara) y «Elegir de la galería». En el Mac abre el archivo.
  import type { Snippet } from "svelte";
  import Icono from "$lib/Icono.svelte";
  import { esAndroid } from "$lib/plataforma";
  import { alAtras } from "$lib/atras";

  let { elegir, clase = "cf-btn cf-btn--secondary", hacia = "arriba", children }: {
    elegir: (f: File) => void;
    clase?: string;
    /** Dónde abre el menú (abajo si el botón está arriba de la pantalla). */
    hacia?: "arriba" | "abajo";
    children: Snippet;
  } = $props();

  let camara = $state<HTMLInputElement>();
  let galeria = $state<HTMLInputElement>();
  let abierto = $state(false);

  $effect(() => (abierto ? alAtras(() => (abierto = false)) : undefined));

  function tomar(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    abierto = false;
    if (f) elegir(f);
  }
</script>

<span class="elegir">
  <button type="button" class={clase} aria-haspopup={esAndroid ? "menu" : undefined} aria-expanded={esAndroid ? abierto : undefined}
    onclick={() => (esAndroid ? (abierto = !abierto) : galeria?.click())}>{@render children()}</button>
  {#if abierto}
    <div class="velo" onclick={() => (abierto = false)} aria-hidden="true"></div>
    <div class="menu cf-glass-3" class:abajo={hacia === "abajo"} role="menu">
      <button type="button" role="menuitem" onclick={() => camara?.click()}><Icono nombre="foto" />Tomar foto</button>
      <button type="button" role="menuitem" onclick={() => galeria?.click()}><Icono nombre="documento" />Elegir de la galería</button>
    </div>
  {/if}
  <input bind:this={camara} type="file" accept="image/*" capture="environment" class="cf-sr" tabindex="-1" onchange={tomar} />
  <input bind:this={galeria} type="file" accept="image/*,.heic,.heif" class="cf-sr" tabindex="-1" onchange={tomar} />
</span>

<style>
  .elegir { position: relative; display: grid; }
  .velo { position: fixed; inset: 0; z-index: 30; }
  .menu {
    position: absolute; z-index: 31; left: 0; bottom: calc(100% + 8px); min-width: 230px;
    display: flex; flex-direction: column; padding: 6px; border-radius: var(--r-lg);
  }
  .menu.abajo { bottom: auto; top: calc(100% + 8px); left: auto; right: 0; }
  .menu button {
    display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 12px; border: 0; border-radius: var(--r-md);
    background: none; color: var(--ink); font: 600 15px/20px var(--font-sans); text-align: left;
  }
  .menu button:active { background: var(--primary-soft); }
  .menu :global(.cf-icon) { width: 20px; height: 20px; color: var(--primary-text); }
</style>
