<script lang="ts">
  // Celular y tablet: «Sincronizar con el Mac» (emparejar en 2 pasos, o estado y «Sincronizar ahora»).
  import Icono from "$lib/Icono.svelte";
  import SincEquipo from "$lib/sinc/SincEquipo.svelte";
  import { centro } from "$lib/sinc/estado-sinc.svelte";
</script>

<a href="/mas" class="volver"><Icono nombre="siguiente" clase="atras" />Más</a>
<h1 class="titulo-pantalla">Sincronizar con el {centro()}</h1>
<SincEquipo pantalla />

<style>
  .volver { align-self: flex-start; display: inline-flex; align-items: center; gap: 2px; min-height: 44px; margin: -8px 0 -8px -8px; padding: 0 8px;
    color: var(--primary-text); font-weight: 600; font-size: 15px; text-decoration: none; }
  .volver :global(.atras) { transform: scaleX(-1); }
</style>
