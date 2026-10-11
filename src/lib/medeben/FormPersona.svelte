<script lang="ts">
  import Panel from "$lib/ui/Panel.svelte";
  import { crearPersona, editarPersona, type Persona } from "$lib/datos";

  let { abierto, persona, cerrar, listo }: {
    abierto: boolean;
    /** null = persona nueva */
    persona: Persona | null;
    cerrar: () => void;
    listo: (mensaje: string, id: number) => void;
  } = $props();

  let nombre = $state("");
  let notas = $state("");
  let error = $state("");
  let guardando = $state(false);

  $effect(() => {
    if (!abierto) return;
    nombre = persona?.nombre ?? "";
    notas = persona?.notas ?? "";
    error = "";
  });

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    guardando = true;
    try {
      if (persona) {
        await editarPersona(persona.id, nombre, notas || null);
        listo("Persona actualizada.", persona.id);
      } else {
        const id = await crearPersona(nombre, notas || null);
        listo(`«${nombre.trim()}» quedó en tu lista.`, id);
      }
      cerrar();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      guardando = false;
    }
  }
</script>

<Panel {abierto} {cerrar} titulo={persona ? "Editar persona" : "Nueva persona"} subtitulo={persona ? persona.nombre : "Alguien a quien le prestas plata"}>
  <form id="form-persona" class="form" onsubmit={guardar}>
    <label class="campo">
      <span class="etiqueta">Nombre</span>
      <span class="cf-field"><input bind:value={nombre} placeholder="Camila, Mamá…" required /></span>
    </label>
    <label class="campo">
      <span class="etiqueta">Notas</span>
      <span class="cf-field"><input bind:value={notas} placeholder="Opcional" /></span>
    </label>
    {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  </form>
  {#snippet pie()}
    <button class="cf-btn cf-btn--secondary" onclick={cerrar}>Cancelar</button>
    <button class="cf-btn cf-btn--primary" type="submit" form="form-persona" disabled={guardando}>{persona ? "Guardar cambios" : "Agregar"}</button>
  {/snippet}
</Panel>

<style>
  .form { display: flex; flex-direction: column; gap: var(--space-4); }
</style>
