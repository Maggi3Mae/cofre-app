<script lang="ts">
  // Inicio: tablero completo en escritorio y tablet; versión reducida en el celular.
  import Tablero from "$lib/dashboard/Tablero.svelte";
  import InicioMovil from "$lib/movil/InicioMovil.svelte";
  import { pantalla } from "$lib/pantalla.svelte";
</script>

{#if pantalla.celular}<InicioMovil />{:else}<Tablero />{/if}
