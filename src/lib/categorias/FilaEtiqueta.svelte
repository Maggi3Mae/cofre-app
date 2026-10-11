<script lang="ts">
  import Icono from "$lib/Icono.svelte";
  import { pesos } from "$lib/formato";
  import {
    renombrarEtiqueta, unirEtiquetas, eliminarEtiqueta, MAX_ETIQUETA, type Etiqueta,
  } from "$lib/datos";

  let { etiqueta, listo }: { etiqueta: Etiqueta; listo: (mensaje: string) => void } = $props();

  type Modo = "ver" | "renombrar" | "unir" | "eliminar";
  let modo = $state<Modo>("ver");
  let nombre = $state("");
  let choque = $state<{ id: number; nombre: string } | null>(null);
  let error = $state("");

  const n = $derived(etiqueta.num_movimientos);
  const plural = (k: number, uno: string, varios: string) => `${k.toLocaleString("es-CO")} ${k === 1 ? uno : varios}`;

  function empezarRenombrar() {
    nombre = etiqueta.nombre;
    error = "";
    modo = "renombrar";
  }

  async function guardarNombre(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    if (nombre.trim() === etiqueta.nombre) return void (modo = "ver");
    try {
      const r = await renombrarEtiqueta(etiqueta.id, nombre);
      if (r.choque) {
        choque = r.choque;
        modo = "unir";
      } else {
        listo(`Etiqueta renombrada a «${nombre.trim()}».`);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function unir() {
    if (!choque) return;
    await unirEtiquetas(etiqueta.id, choque.id);
    listo(`«${etiqueta.nombre}» se unió a «${choque.nombre}».`);
  }

  async function eliminar() {
    await eliminarEtiqueta(etiqueta.id);
    listo(`«${etiqueta.nombre}» se eliminó${n ? ` de ${plural(n, "movimiento", "movimientos")}` : ""}.`);
  }

  function enfocar(nodo: HTMLInputElement) {
    nodo.focus();
    nodo.select();
  }
</script>

<article class="fila">
  {#if modo === "renombrar"}
    <form class="renombrar" onsubmit={guardarNombre}>
      <span class="cf-field"><input bind:value={nombre} maxlength={MAX_ETIQUETA} aria-label="Nuevo nombre" use:enfocar
        onkeydown={(e) => e.key === "Escape" && (modo = "ver")} /></span>
      <button class="cf-btn cf-btn--ghost" type="button" onclick={() => (modo = "ver")}>Cancelar</button>
      <button class="cf-btn cf-btn--primary corto" type="submit">Guardar</button>
    </form>
    {#if error}<p class="error-form ancho" role="alert">{error}</p>{/if}
  {:else}
    <a class="principal" href="/transacciones?etiqueta={etiqueta.id}" title="Ver movimientos con {etiqueta.nombre}">
      <span class="cf-chip cf-chip--brand">{etiqueta.nombre}</span>
      <span class="caption">{plural(n, "movimiento", "movimientos")}</span>
    </a>

    <span class="totales">
      {#if etiqueta.gastado}
        <span class="total"><span class="cf-overline">Gastado</span><b>{pesos(etiqueta.gastado, "−")}</b></span>
      {/if}
      {#if etiqueta.recibido}
        <span class="total"><span class="cf-overline">Recibido</span><b class="cf-amt-income">{pesos(etiqueta.recibido, "+")}</b></span>
      {/if}
      {#if !etiqueta.gastado && !etiqueta.recibido}<span class="caption">Sin movimientos</span>{/if}
    </span>

    <span class="acciones">
      <button class="cf-btn cf-btn--icon corto" onclick={empezarRenombrar} aria-label="Renombrar {etiqueta.nombre}" title="Renombrar"><Icono nombre="editar" /></button>
      <button class="cf-btn cf-btn--icon corto peligro" onclick={() => (modo = "eliminar")} aria-label="Eliminar {etiqueta.nombre}" title="Eliminar"><Icono nombre="papelera" /></button>
    </span>
  {/if}

  {#if modo === "unir" && choque}
    <div class="aviso marca" role="alertdialog" aria-label="Unir etiquetas">
      <p>Ya existe <b>«{choque.nombre}»</b>. ¿Unir las dos? Los movimientos de «{etiqueta.nombre}» quedarán con «{choque.nombre}».</p>
      <div class="botones">
        <button class="cf-btn cf-btn--ghost" onclick={() => (modo = "ver")}>Cancelar</button>
        <button class="cf-btn cf-btn--primary corto" onclick={unir}>Unir</button>
      </div>
    </div>
  {:else if modo === "eliminar"}
    <div class="aviso peligro-fondo" role="alertdialog" aria-label="Eliminar {etiqueta.nombre}">
      <p>
        <b>¿Eliminar «{etiqueta.nombre}»?</b>
        {n ? `Se quitará de ${plural(n, "movimiento", "movimientos")}. Los movimientos no se borran.` : ""}
      </p>
      <div class="botones">
        <button class="cf-btn cf-btn--ghost" onclick={() => (modo = "ver")}>Cancelar</button>
        <button class="cf-btn cf-btn--secondary peligro corto" onclick={eliminar}><Icono nombre="papelera" />Eliminar</button>
      </div>
    </div>
  {/if}
</article>

<style>
  .fila {
    display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center;
    gap: var(--space-4); padding: var(--space-3) var(--space-4) var(--space-3) var(--space-5);
    border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--glass-1); min-height: 64px;
  }
  .principal { display: flex; align-items: center; gap: var(--space-3); min-width: 0; color: inherit; text-decoration: none; border-radius: var(--r-md); }
  .principal:focus-visible { outline: 2px solid var(--primary); outline-offset: 4px; }
  .principal .cf-chip { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .totales { display: flex; gap: var(--space-5); }
  .total { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .total b { font: 650 17px/22px var(--font-display); white-space: nowrap; }
  .acciones { display: flex; gap: var(--space-2); }
  .corto { height: 36px; }
  .cf-btn--icon.corto { width: 36px; }
  .cf-btn--primary.corto, .cf-btn--secondary.corto { padding: 0 var(--space-4); }
  .peligro { color: var(--expense); }
  .renombrar { grid-column: 1 / -1; display: flex; align-items: center; gap: var(--space-2); }
  .renombrar .cf-field { flex: 1; max-width: 360px; height: 40px; }
  .ancho, .aviso { grid-column: 1 / -1; }
  .aviso { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; padding: var(--space-3) var(--space-4); border-radius: var(--r-md); font-size: 13px; line-height: 18px; }
  .marca { background: var(--primary-soft); color: var(--primary-text); }
  .peligro-fondo { background: var(--expense-soft); color: var(--ink); }
  .botones { display: flex; gap: var(--space-2); }
</style>
