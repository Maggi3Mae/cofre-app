<script lang="ts">
  // Campo de monto con formato automático es-CO mientras se escribe ($ 500.000).
  // También calcula: «91.000+220.000» muestra «= $ 311.000» y al salir (o con Enter) queda el resultado.
  import { formatearEscritura, esOperacion, leerMonto, montoEditable, monto } from "$lib/formato";
  import { esAndroid } from "$lib/plataforma";

  let { valor = $bindable(""), placeholder = "0", requerido = false, moneda = "COP", grande = false, etiqueta = "", campo = $bindable(), alEscribir, operadores }: {
    valor?: string;
    placeholder?: string;
    requerido?: boolean;
    moneda?: "COP" | "USD";
    /** Versión destacada para el monto principal. */
    grande?: boolean;
    etiqueta?: string;
    /** Referencia al input (para enfocarlo). */
    campo?: HTMLInputElement;
    /** Se llama cuando la persona escribe (no cuando el valor cambia por código). */
    alEscribir?: () => void;
    /** Botones + − × ÷. Por defecto en los campos grandes en Android (celular y tablet): su teclado numérico no los trae. */
    operadores?: boolean;
  } = $props();

  const conOperadores = $derived(operadores ?? (esAndroid && grande));

  /** Inserta el operador donde está el cursor sin cerrar el teclado. */
  function operar(op: string) {
    const c = campo;
    if (!c) return;
    const ini = c.selectionStart ?? valor.length, fin = c.selectionEnd ?? valor.length;
    const nuevo = formatearEscritura(valor.slice(0, ini) + op + valor.slice(fin));
    valor = nuevo;
    c.value = nuevo;
    c.focus();
    c.setSelectionRange(nuevo.length, nuevo.length);
    alEscribir?.();
  }

  const resultado = $derived(esOperacion(valor) ? leerMonto(valor) : null);

  /** Cambia la operación por su resultado. */
  function resolver(e: Event & { currentTarget: HTMLInputElement }) {
    if (!esOperacion(valor)) return;
    const r = leerMonto(valor);
    if (r == null) return;
    valor = montoEditable(r);
    e.currentTarget.value = valor;
    alEscribir?.();
  }

  function tecla(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (e.key === "Enter") resolver(e); // y el formulario se envía con el resultado
  }

  function escribir(e: Event & { currentTarget: HTMLInputElement }) {
    valor = formatearEscritura(e.currentTarget.value);
    e.currentTarget.value = valor;
    alEscribir?.();
  }
</script>

{#snippet caja()}
<span class="cf-field" class:grande>
  <span class="sufijo">{moneda === "USD" ? "USD" : "$"}</span>
  <input bind:this={campo} value={valor} oninput={escribir} onblur={resolver} onkeydown={tecla} inputmode="decimal" {placeholder} required={requerido}
    aria-label={etiqueta || undefined} />
  {#if resultado != null}
    <span class="resultado" aria-live="polite">= {monto(resultado, moneda)}</span>
  {/if}
</span>
{/snippet}

{#if conOperadores}
  <div class="con-operadores">
    {@render caja()}
    <div class="operadores" role="group" aria-label="Operaciones">
      {#each [["+", "Sumar"], ["−", "Restar"], ["×", "Multiplicar"], ["÷", "Dividir"]] as [op, nombre]}
        <button type="button" onpointerdown={(e) => e.preventDefault()} onclick={() => operar(op)} aria-label={nombre}>{op}</button>
      {/each}
    </div>
  </div>
{:else}
  {@render caja()}
{/if}

<style>
  .con-operadores { display: flex; flex-direction: column; gap: 8px; }
  .operadores { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .operadores button {
    height: 40px; border-radius: var(--r-md); border: 1px solid var(--glass-border); background: var(--input); box-shadow: var(--shadow-1);
    color: var(--ink); font: 600 20px/1 var(--font-sans); -webkit-tap-highlight-color: transparent;
  }
  .operadores button:active { background: var(--primary-soft); color: var(--primary-text); }
  .grande { height: 64px; border-radius: var(--r-lg); }
  .grande input { font: 650 30px/36px var(--font-display); letter-spacing: -.02em; }
  .resultado { flex: none; font-size: 14px; font-weight: 600; color: var(--ink-3); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .grande .resultado { font: 600 18px/24px var(--font-display); }
  .grande .sufijo { font: 600 22px/28px var(--font-display); color: var(--ink-2); }
</style>
