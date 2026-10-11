<script lang="ts">
  import { page } from "$app/state";
  import { pantallas } from "$lib/navegacion";
  const pantalla = $derived(pantallas.find((p) => p.ruta === `/${page.params.seccion}`));
</script>

<header class="encabezado">
  <h1 class="titulo-pantalla">{pantalla?.nombre ?? "No encontrada"}</h1>
</header>
<section class="cf-glass cf-card">
  <p class="cf-muted">Esta pantalla llega en una próxima fase.</p>
</section>
