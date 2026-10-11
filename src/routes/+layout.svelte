<script lang="ts">
  import "@fontsource-variable/bricolage-grotesque";
  import "@fontsource-variable/geist";
  import "@fontsource-variable/geist-mono";
  import "$lib/styles/tokens.css";
  import "$lib/styles/bundle.css";
  import "$lib/styles/app.css";
  import "$lib/styles/formularios.css";
  import { page } from "$app/state";
  import Icono from "$lib/Icono.svelte";
  import { pantallas, fueraDelCelular } from "$lib/navegacion";
  import { pantalla } from "$lib/pantalla.svelte";
  import BarraInferior from "$lib/ui/BarraInferior.svelte";
  import HojaNuevo from "$lib/movil/HojaNuevo.svelte";
  import JalarParaSincronizar from "$lib/movil/JalarParaSincronizar.svelte";
  import { iniciarCompartido, iniciarAtajos } from "$lib/movil/compartido";
  import { goto } from "$app/navigation";
  import { esAndroid } from "$lib/plataforma";
  import { alAtras } from "$lib/atras";

  // Tablet en vertical: el menú se recoge a íconos y ☰ lo abre encima; se cierra al cambiar de pantalla.
  let menuAbierto = $state(false);
  $effect(() => { page.url.pathname; pantalla.vertical; menuAbierto = false; });
  $effect(() => (menuAbierto ? alAtras(() => (menuAbierto = false)) : undefined));
  import { tema, cambiarTema } from "$lib/tema.svelte";
  import { onMount } from "svelte";
  import Avisos from "$lib/alertas/Avisos.svelte";
  import { avisos, iniciarAlertas } from "$lib/alertas/estado-alertas.svelte";
  import { iniciarCentro } from "$lib/sinc/puente";
  import { esDemo } from "$lib/demo/modo";
  import { iniciarSincAutomatica } from "$lib/sinc/estado-sinc.svelte";

  let { children } = $props();

  onMount(iniciarAlertas);
  // En el Mac: atender a celular y tablet cuando sincronizan.
  onMount(() => {
    if (esDemo) return; // la demostración no atiende equipos
    const limpiar = iniciarCentro();
    return () => void limpiar.then((f) => f());
  });
  // En celular y tablet: sincronizar sola con el Mac.
  onMount(iniciarSincAutomatica);
  // Android: foto compartida desde otra app → factura.
  onMount(() => {
    if (!esAndroid) return;
    const fin = [iniciarCompartido(), iniciarAtajos()];
    return () => fin.forEach((f) => f());
  });

  // Celular: lo que solo está en el Mac y la tablet vuelve a Inicio.
  $effect(() => {
    if (pantalla.celular && fueraDelCelular.some((r) => page.url.pathname.startsWith(r))) void goto("/", { replaceState: true });
  });
</script>

{#if pantalla.celular}
  <div class="cf app-movil">
    <main class="contenido">
      {@render children()}
    </main>
  </div>
  <BarraInferior />
  <HojaNuevo />
  <JalarParaSincronizar />
{:else}
<div class="cf app" class:menu-abierto={menuAbierto}>
  {#if menuAbierto}<div class="velo-menu" onclick={() => (menuAbierto = false)} aria-hidden="true"></div>{/if}
  <aside class="lateral cf-glass">
    <div class="logo">
      {#if pantalla.tablet}
        <button class="cf-btn cf-btn--icon abrir-menu" onclick={() => (menuAbierto = !menuAbierto)}
          aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuAbierto}><Icono nombre={menuAbierto ? "cerrar" : "menu"} /></button>
      {/if}
      <span class="logo-tesela"><Icono nombre="cofre" /></span>
      <span class="logo-nombre">Cofre</span>
    </div>
    <nav class="cf-nav" aria-label="Principal">
      {#each pantallas as p}
        <a href={p.ruta} aria-current={page.url.pathname === p.ruta || (p.ruta === "/transacciones" && page.url.pathname === "/recurrentes") ? "page" : undefined} title={p.nombre}>
          <Icono nombre={p.icono} /><span>{p.nombre}</span>
          {#if p.ruta === "/presupuestos" && avisos.enRiesgo > 0}
            <span class="cf-aviso cf-aviso--aviso" title="{avisos.enRiesgo} presupuesto{avisos.enRiesgo === 1 ? '' : 's'} cerca del tope o excedido"
              aria-label="{avisos.enRiesgo} en riesgo">{avisos.enRiesgo}</span>
          {/if}
          {#if p.ruta === "/transacciones" && avisos.porConfirmar > 0}
            <span class="cf-aviso" title="{avisos.porConfirmar} recurrente{avisos.porConfirmar === 1 ? '' : 's'} por confirmar"
              aria-label="{avisos.porConfirmar} por confirmar">{avisos.porConfirmar}</span>
          {/if}
          {#if p.ruta === "/medeben" && avisos.prestamosVencidos > 0}
            <span class="cf-aviso cf-aviso--vencido" title="{avisos.prestamosVencidos} préstamo{avisos.prestamosVencidos === 1 ? '' : 's'} vencido{avisos.prestamosVencidos === 1 ? '' : 's'}"
              aria-label="{avisos.prestamosVencidos} vencidos">{avisos.prestamosVencidos}</span>
          {/if}
        </a>
      {/each}
    </nav>
    <div class="cf-seg tema" role="group" aria-label="Tema">
      <button aria-pressed={tema.preferencia === "auto"} onclick={() => cambiarTema("auto")} aria-label="Tema del sistema" title="Sistema"><Icono nombre="ajustes" /></button>
      <button aria-pressed={tema.preferencia === "light"} onclick={() => cambiarTema("light")} aria-label="Tema claro" title="Claro"><Icono nombre="sol" /></button>
      <button aria-pressed={tema.preferencia === "dark"} onclick={() => cambiarTema("dark")} aria-label="Tema oscuro" title="Oscuro"><Icono nombre="luna" /></button>
    </div>
  </aside>
  <main class="contenido">
    {@render children()}
  </main>
</div>
{#if esAndroid}<JalarParaSincronizar />{/if}
{/if}
<Avisos />

<style>
</style>
