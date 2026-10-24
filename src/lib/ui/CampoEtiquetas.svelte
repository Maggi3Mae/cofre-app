<script lang="ts">
  // Etiquetas como chips: Enter o coma agrega, Retroceso en vacío quita la última.
  // Lista de sugerencias propia bajo el campo (lienzo «Cofre · Etiquetas»): la <datalist> nativa
  // en Android salía en la barra del teclado. Si escribes una nueva, se crea al guardar.
  import Icono from "$lib/Icono.svelte";

  let { valor = $bindable([]), opciones = [], max = 30 }: {
    valor?: string[];
    opciones?: string[];
    max?: number;
  } = $props();

  const MAX_SUGERENCIAS = 6;
  let texto = $state("");
  let abierta = $state(false);
  let activa = $state(-1); // opción resaltada con las flechas (Mac)
  const id = `etq-${Math.random().toString(36).slice(2, 8)}`;

  /** Sin tildes ni mayúsculas, para comparar y buscar. */
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const igual = (a: string, b: string) => norm(a) === norm(b);

  const disponibles = $derived(opciones.filter((o) => !valor.some((v) => igual(v, o))));
  const q = $derived(norm(texto));
  const sugerencias = $derived(
    (q ? disponibles.filter((o) => norm(o).includes(q)) : disponibles).slice(0, MAX_SUGERENCIAS),
  );
  /** «Crear «X»» si lo escrito no es una etiqueta existente ni una ya puesta. */
  const crear = $derived(q && !opciones.some((o) => igual(o, texto)) && !valor.some((v) => igual(v, texto)) ? texto.trim().replace(/\s+/g, " ").slice(0, max) : "");
  const filas = $derived([...sugerencias, ...(crear ? [crear] : [])]);
  const visible = $derived(abierta && filas.length > 0);

  function agregar(nombre: string) {
    const n = nombre.trim().replace(/\s+/g, " ").slice(0, max);
    if (!n || valor.some((v) => igual(v, n))) return;
    // Si ya existe con otras mayúsculas o tildes, usar el nombre existente.
    valor = [...valor, opciones.find((o) => igual(o, n)) ?? n];
  }

  function elegir(nombre: string) {
    agregar(nombre);
    texto = "";
    activa = -1;
  }

  function tecla(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      if (visible && activa >= 0) { e.preventDefault(); elegir(filas[activa]); return; }
      if (!texto.trim()) return;
      e.preventDefault();
      elegir(texto);
    } else if (e.key === "ArrowDown" && filas.length) {
      e.preventDefault();
      abierta = true;
      activa = (activa + 1) % filas.length;
    } else if (e.key === "ArrowUp" && filas.length) {
      e.preventDefault();
      activa = activa <= 0 ? filas.length - 1 : activa - 1;
    } else if (e.key === "Escape" && visible) {
      // Cierra solo la lista, no el panel.
      e.preventDefault(); e.stopPropagation();
      abierta = false;
    } else if (e.key === "Backspace" && !texto && valor.length) {
      valor = valor.slice(0, -1);
    }
  }

  // Android no siempre reporta la tecla «,» en keydown: se revisa lo escrito.
  function escribir() {
    abierta = true;
    activa = -1;
    if (!texto.includes(",")) return;
    const partes = texto.split(",");
    const resto = partes.pop() ?? "";
    for (const p of partes) agregar(p);
    texto = resto.trimStart();
  }

  function salir() {
    abierta = false;
    activa = -1;
    agregar(texto);
    texto = "";
  }
</script>

<div class="envoltura">
  <div class="cf-field etiquetas">
    {#each valor as v (v)}
      <span class="cf-chip cf-chip--sm cf-chip--brand">
        {v}
        <button type="button" class="quitar" aria-label="Quitar {v}" onclick={() => (valor = valor.filter((x) => x !== v))}>
          <Icono nombre="cerrar" />
        </button>
      </span>
    {/each}
    <input bind:value={texto} maxlength={max} onkeydown={tecla} oninput={escribir}
      onfocus={() => (abierta = true)} onblur={salir}
      autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="done"
      role="combobox" aria-expanded={visible} aria-controls={id} aria-autocomplete="list"
      aria-activedescendant={visible && activa >= 0 ? `${id}-${activa}` : undefined}
      placeholder={valor.length ? "" : "Viaje Cartagena, Reembolsable…"} aria-label="Agregar etiqueta" />
  </div>
  {#if visible}
    <div class="lista cf" id={id} role="listbox" aria-label="Sugerencias de etiquetas">
      {#if sugerencias.length}<span class="titulo">Tus etiquetas</span>{/if}
      {#each sugerencias as s, i (s)}
        <!-- onpointerdown + preventDefault: el campo no pierde el foco ni se cierra el teclado. -->
        <button type="button" class="opcion" class:activa={activa === i} id="{id}-{i}" role="option" aria-selected={activa === i}
          tabindex="-1" onpointerdown={(e) => e.preventDefault()} onclick={() => elegir(s)}>
          <Icono nombre="etiqueta" />{s}
        </button>
      {/each}
      {#if crear}
        {@const i = sugerencias.length}
        <button type="button" class="opcion crear" class:activa={activa === i} class:solo={!sugerencias.length} id="{id}-{i}" role="option" aria-selected={activa === i}
          tabindex="-1" onpointerdown={(e) => e.preventDefault()} onclick={() => elegir(crear)}>
          <Icono nombre="mas" />Crear «{crear}»
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .envoltura { position: relative; }
  .etiquetas { flex-wrap: wrap; height: auto; min-height: 44px; padding: 6px 10px; gap: 6px; }
  .etiquetas input { flex: 1 1 120px; min-width: 120px; height: 30px; }
  .quitar { display: inline-flex; padding: 0; margin: 0 -2px 0 2px; border: 0; background: none; color: inherit; cursor: pointer; }
  .quitar :global(.cf-icon) { width: 12px; height: 12px; }
  .lista {
    position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 20;
    display: flex; flex-direction: column; padding: 6px; max-height: 300px; overflow-y: auto; overscroll-behavior: contain;
    border-radius: var(--r-md); background: var(--glass-3); border: 1px solid var(--line); box-shadow: var(--shadow-2);
    backdrop-filter: blur(24px) saturate(1.4); -webkit-backdrop-filter: blur(24px) saturate(1.4);
  }
  .titulo { padding: 6px 12px 4px; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); }
  .opcion {
    display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 0 12px; flex: none;
    border: 0; border-radius: 10px; background: transparent; text-align: left; cursor: pointer;
    font: 500 14px/20px var(--font-sans); color: var(--ink); -webkit-tap-highlight-color: transparent;
  }
  .opcion :global(.cf-icon) { width: 16px; height: 16px; color: var(--ink-2); flex: none; }
  .opcion:hover, .opcion.activa { background: var(--primary-soft); }
  .crear { color: var(--primary-text); font-weight: 600; border-top: 1px solid var(--line); border-radius: 0 0 10px 10px; margin-top: 2px; }
  .crear.solo { border-top: 0; border-radius: 10px; margin-top: 0; }
  .crear :global(.cf-icon) { color: var(--primary-text); }
  /* Celular y tablet: toques de 48 px y texto de 16 px. */
  :global(html.celular) .opcion, :global(html.tablet) .opcion { min-height: 48px; font-size: 16px; }
</style>
