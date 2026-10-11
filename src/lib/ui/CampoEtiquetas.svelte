<script lang="ts">
  // Etiquetas como chips: Enter o coma agrega, Retroceso en vacío quita la última.
  // Sugiere las existentes; si escribes una nueva, se crea al guardar.
  import Icono from "$lib/Icono.svelte";

  let { valor = $bindable([]), opciones = [], max = 30 }: {
    valor?: string[];
    opciones?: string[];
    max?: number;
  } = $props();

  let texto = $state("");
  const id = `etq-${Math.random().toString(36).slice(2, 8)}`;
  const igual = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" }) === 0;
  const disponibles = $derived(opciones.filter((o) => !valor.some((v) => igual(v, o))));

  function agregar(nombre: string) {
    const n = nombre.trim().replace(/\s+/g, " ").slice(0, max);
    if (!n || valor.some((v) => igual(v, n))) return;
    // Si ya existe con otras mayúsculas, usar el nombre existente.
    valor = [...valor, opciones.find((o) => igual(o, n)) ?? n];
  }

  function tecla(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      if (!texto.trim()) return;
      e.preventDefault();
      agregar(texto);
      texto = "";
    } else if (e.key === "Backspace" && !texto && valor.length) {
      valor = valor.slice(0, -1);
    }
  }

  // Elegir de la lista nativa dispara input con el valor completo.
  function escribir() {
    if (opciones.some((o) => igual(o, texto))) {
      agregar(texto);
      texto = "";
    }
  }
</script>

<div class="cf-field etiquetas">
  {#each valor as v (v)}
    <span class="cf-chip cf-chip--sm cf-chip--brand">
      {v}
      <button type="button" class="quitar" aria-label="Quitar {v}" onclick={() => (valor = valor.filter((x) => x !== v))}>
        <Icono nombre="cerrar" />
      </button>
    </span>
  {/each}
  <input bind:value={texto} list={id} maxlength={max} onkeydown={tecla} oninput={escribir}
    onblur={() => { agregar(texto); texto = ""; }}
    placeholder={valor.length ? "" : "Viaje Cartagena, Reembolsable…"} aria-label="Agregar etiqueta" />
  <datalist {id}>
    {#each disponibles as o (o)}<option value={o}></option>{/each}
  </datalist>
</div>

<style>
  .etiquetas { flex-wrap: wrap; height: auto; min-height: 44px; padding: 6px 10px; gap: 6px; }
  .etiquetas input { min-width: 120px; height: 30px; }
  .quitar { display: inline-flex; padding: 0; margin: 0 -2px 0 2px; border: 0; background: none; color: inherit; cursor: pointer; }
  .quitar :global(.cf-icon) { width: 12px; height: 12px; }
</style>
