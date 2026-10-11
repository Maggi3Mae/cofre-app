<script lang="ts">
  // Barra inferior flotante del celular (vidrio glass-3), según el lienzo «Cofre en el celular».
  import { page } from "$app/state";
  import Icono from "$lib/Icono.svelte";
  import type { NombreIcono } from "$lib/iconos";
  import { avisos } from "$lib/alertas/estado-alertas.svelte";
  import { rutasMas } from "$lib/navegacion";
  import { abrirNuevo } from "$lib/movil/hoja.svelte";

  // Con el teclado abierto la barra se esconde (el WebView se encoge: interactive-widget=resizes-content).
  let altoInicial = typeof window !== "undefined" ? window.innerHeight : 0;
  let teclado = $state(false);
  function medir() {
    if (window.innerHeight > altoInicial) altoInicial = window.innerHeight;
    teclado = window.innerHeight < altoInicial * 0.78;
  }

  const ruta = $derived(page.url.pathname);
  const activo = (r: string) =>
    r === "/mas" ? ruta === "/mas" || ruta === "/sincronizar" || rutasMas.some((m) => ruta.startsWith(m.ruta)) : ruta === r;

  const izquierda: { ruta: string; nombre: string; icono: NombreIcono }[] = [
    { ruta: "/", nombre: "Inicio", icono: "dashboard" },
    { ruta: "/transacciones", nombre: "Movimientos", icono: "transacciones" },
  ];
</script>

{#snippet item(r: string, nombre: string, icono: NombreIcono, punto = 0, clasePunto = "")}
  <a href={r} class="item" class:on={activo(r)} aria-current={activo(r) ? "page" : undefined}>
    <span class="pastilla"><Icono nombre={icono} clase={icono === "puntos" ? "gruesa" : ""} />
      {#if punto > 0}<span class="cf-aviso cf-aviso--icono {clasePunto}" aria-label="{punto} avisos">{punto}</span>{/if}
    </span>{nombre}
  </a>
{/snippet}

<svelte:window onresize={medir} />

<div class="barra" class:teclado>
  <nav class="cf-glass-3" aria-label="Principal">
    {#each izquierda as i}{@render item(i.ruta, i.nombre, i.icono)}{/each}
    <button type="button" class="nuevo" onclick={abrirNuevo} aria-label="Registrar movimiento"><Icono nombre="mas" /></button>
    {@render item("/medeben", "Me deben", "personas", avisos.prestamosVencidos, "cf-aviso--vencido")}
    {@render item("/mas", "Más", "puntos", avisos.enRiesgo, "cf-aviso--aviso")}
  </nav>
</div>

<style>
  .barra {
    position: fixed; z-index: 15; left: 0; right: 0; bottom: 0;
    padding: 0 12px calc(var(--area-abajo, 0px) + 10px);
    pointer-events: none;
  }
  .barra.teclado { display: none; }
  nav {
    pointer-events: auto; height: 68px; box-sizing: border-box; padding: 6px; border-radius: 26px;
    display: flex; align-items: center; gap: 2px;
  }
  .item {
    flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    min-height: 56px; border-radius: var(--r-md); text-decoration: none; color: var(--ink-2);
    font: 600 11px/14px var(--font-sans); -webkit-tap-highlight-color: transparent;
  }
  .item.on { color: var(--primary-text); }
  .pastilla { position: relative; width: 52px; height: 30px; border-radius: var(--r-full); display: grid; place-items: center; }
  .item.on .pastilla { background: var(--primary-soft); }
  .pastilla :global(.gruesa) { stroke-width: 2.6; }
  .nuevo {
    width: 56px; height: 56px; flex: none; margin-top: -26px; border: 0; padding: 0; border-radius: var(--r-full);
    display: grid; place-items: center; color: #fff; background: var(--grad-brand); box-shadow: var(--glow-brand);
    -webkit-tap-highlight-color: transparent;
  }
  .nuevo :global(.cf-icon) { width: 26px; height: 26px; stroke-width: 2.2; }
  .pastilla :global(.cf-aviso--icono) { top: -4px; right: 2px; }
</style>
