<script lang="ts">
  // Celular → «Más»: estado de la sincronización y las secciones que no van en la barra inferior.
  import Icono from "$lib/Icono.svelte";
  import { rutasMas } from "$lib/navegacion";
  import { avisos } from "$lib/alertas/estado-alertas.svelte";
  import { sinc, haceCuanto } from "$lib/sinc/estado-sinc.svelte";

  const sincTitulo = $derived(
    !sinc.emparejado ? "Sincronizar con el Mac"
    : sinc.enCurso ? "Sincronizando…"
    : sinc.error ? "No se pudo sincronizar"
    : `Sincronizado con ${sinc.mac ?? "el Mac"}`,
  );
  const sincDetalle = $derived(
    !sinc.emparejado ? "Empareja este celular para ver tus datos"
    : sinc.error ? "Toca para ver qué pasó"
    : haceCuanto(sinc.ultima).replace(/^h/, "H"),
  );
</script>

<h1 class="titulo-pantalla">Más</h1>

<a href="/sincronizar" class="sinc cf-glass">
  <span class="cf-tile" class:cf-tile--income={sinc.emparejado && !sinc.error} class:cf-tile--expense={!!sinc.error}
    class:cf-tile--brand={!sinc.emparejado}><Icono nombre="sincronizar" /></span>
  <span class="t"><b>{sincTitulo}</b><small>{sincDetalle}</small></span>
  <Icono nombre="siguiente" clase="chev" />
</a>

<nav class="lista cf-glass" aria-label="Más secciones">
  {#each rutasMas as r}
    <a href={r.ruta} class="item">
      <span class="cf-tile" class:cf-tile--brand={r.tono === "brand"} class:cf-tile--saving={r.tono === "saving"}
        class:neutro={r.tono === "neutro"}><Icono nombre={r.icono} /></span>
      <span class="t"><b>{r.nombre}</b><small>{r.detalle}</small></span>
      {#if r.ruta === "/recurrentes" && avisos.porConfirmar > 0}
        <span class="cf-chip cf-chip--sm punto" aria-label="{avisos.porConfirmar} por confirmar">{avisos.porConfirmar}</span>
      {/if}
      {#if r.ruta === "/presupuestos" && avisos.enRiesgo > 0}
        <span class="cf-chip cf-chip--sm punto" aria-label="{avisos.enRiesgo} en riesgo">{avisos.enRiesgo}</span>
      {/if}
      <Icono nombre="siguiente" clase="chev" />
    </a>
  {/each}
</nav>

<p class="caption nota">Importar extractos, categorías, reglas, simulador y Excel están en el Mac y en la tablet.</p>

<style>
  .sinc { border-radius: 20px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--ink); }
  .lista { border-radius: 24px; padding: 2px 16px; display: flex; flex-direction: column; }
  .item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); text-decoration: none; color: var(--ink); min-height: 48px; }
  .item:first-child { border-top: 0; }
  .t { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .t b { font-size: 15px; }
  .t small { font-size: 12px; line-height: 16px; color: var(--ink-2); }
  .neutro { background: var(--track); color: var(--ink-2); }
  .punto { background: var(--warn-90); color: var(--on-primary); font-weight: 700; }
  :global(.chev) { color: var(--ink-3); }
  .nota { padding: 0 4px; }
</style>
