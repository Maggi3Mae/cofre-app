<script lang="ts">
  // Fila de un movimiento en el celular: ícono, comercio, «Categoría · Cuenta» y monto.
  import Icono from "$lib/Icono.svelte";
  import { monto } from "$lib/formato";
  import { nombreDia, fechaCorta } from "$lib/periodo";
  import { claseTesela, type Transaccion } from "$lib/datos";

  let { tx, abrir, conFecha = false }: { tx: Transaccion; abrir?: () => void; conFecha?: boolean } = $props();

  const transf = $derived(tx.tipo === "transferencia");
  const titulo = $derived(tx.comercio || (transf ? "Transferencia" : tx.tipo === "ingreso" ? "Ingreso" : "Egreso"));
  const signo = $derived(tx.tipo === "ingreso" ? "+" : tx.tipo === "egreso" ? "−" : undefined);
  const dia = $derived.by(() => { const n = nombreDia(tx.fecha); return n === "Hoy" || n === "Ayer" ? n : fechaCorta(tx.fecha); });
  const detalle = $derived(
    [
      conFecha ? dia : null,
      transf ? `${tx.cuenta_nombre} → ${tx.cuenta_destino_nombre}` : conFecha ? tx.cuenta_nombre : `${tx.categoria_nombre ?? "Sin categoría"} · ${tx.cuenta_nombre}`,
      tx.num_cuotas && tx.num_cuotas > 1 ? `${tx.num_cuotas} cuotas` : null,
    ].filter(Boolean).join(" · "),
  );
</script>

{#snippet contenido()}
  {#if transf}
    <span class="cf-tile cf-tile--brand t"><Icono nombre="transacciones" /></span>
  {:else if tx.categoria_id == null}
    <span class="cf-tile t sin"><Icono nombre="categorias" /></span>
  {:else}
    <span class="cf-tile {claseTesela(tx.categoria_color)} t"><Icono nombre={tx.categoria_icono ?? "otros"} /></span>
  {/if}
  <span class="txt">
    <b>{titulo}{#if tx.recurrente_id != null}<Icono nombre="repetir" clase="clip" /><span class="cf-sr">Recurrente</span>{/if}{#if tx.adjunto}<Icono nombre="documento" clase="clip" /><span class="cf-sr">Con foto</span>{/if}</b>
    <span>{detalle}</span>
  </span>
  <span class="monto" class:ing={tx.tipo === "ingreso"} class:egr={tx.tipo === "egreso"}>{monto(tx.monto, tx.cuenta_moneda, signo)}</span>
{/snippet}

{#if abrir}
  <button type="button" class="fila" onclick={abrir} aria-label="Editar {titulo}">{@render contenido()}</button>
{:else}
  <div class="fila">{@render contenido()}</div>
{/if}

<style>
  .fila {
    width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 0; min-height: 44px;
    border: 0; border-top: 1px solid var(--line); background: none; color: var(--ink); font: inherit; text-align: left;
    -webkit-tap-highlight-color: transparent;
  }
    .fila:first-child { border-top: 0; }
  .t { width: 36px; height: 36px; }
  .t.sin { background: var(--track); color: var(--ink-3); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .txt b { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px; }
  .txt b :global(.clip) { width: 14px; height: 14px; color: var(--ink-3); }
  .txt > span { font-size: 12px; line-height: 16px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .monto { font-size: 14px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--ink-2); }
  .monto.ing { color: var(--income); }
  .monto.egr { color: var(--expense); }
</style>
