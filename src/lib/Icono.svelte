<script lang="ts">
  import { iconos, type NombreIcono } from "./iconos";
  let { nombre, clase = "" }: { nombre: NombreIcono; clase?: string } = $props();
</script>

<svg class="cf-icon {clase}" viewBox="0 0 24 24" aria-hidden="true"><path d={iconos[nombre]} /></svg>
