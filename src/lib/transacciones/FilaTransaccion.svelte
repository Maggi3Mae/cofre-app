<script lang="ts">
  import Icono from "$lib/Icono.svelte";
  import { monto } from "$lib/formato";
  import { fechaCorta } from "$lib/periodo";
  import { claseTesela, type Transaccion } from "$lib/datos";

  let { tx, seleccionada, alternar, abrir, conFecha = false }: {
    tx: Transaccion;
    seleccionada: boolean;
    alternar: () => void;
    abrir: () => void;
    /** Mostrar la fecha en la fila (cuando la lista se agrupa por semana). */
    conFecha?: boolean;
  } = $props();

  const transf = $derived(tx.tipo === "transferencia");
  const sinCat = $derived(!transf && tx.categoria_id == null);
  const titulo = $derived(tx.comercio || (transf ? "Transferencia" : tx.tipo === "ingreso" ? "Ingreso" : "Egreso"));
  const signo = $derived(tx.tipo === "ingreso" ? "+" : tx.tipo === "egreso" ? "−" : undefined);
  const etiquetasVisibles = $derived(tx.etiquetas.slice(0, 1));
  const extra = $derived(tx.etiquetas.length - etiquetasVisibles.length);
</script>

<div class="fila" class:seleccionada>
  <label class="casilla">
    <input type="checkbox" checked={seleccionada} onchange={alternar} aria-label="Seleccionar {titulo}" />
  </label>

  <button type="button" class="cuerpo" onclick={abrir} aria-label="Editar {titulo}">
    <span class="cf-txn-name">
      {#if transf}
        <span class="cf-tile cf-tile--brand"><Icono nombre="transacciones" /></span>
      {:else if sinCat}
        <span class="cf-tile sin"><Icono nombre="categorias" /></span>
      {:else}
        <span class="cf-tile {claseTesela(tx.categoria_color)}"><Icono nombre={tx.categoria_icono ?? "otros"} /></span>
      {/if}
      <span class="nombre">
        <b>{titulo}{#if tx.recurrente_id != null}<span class="clip" title="Recurrente"><Icono nombre="repetir" /><span class="cf-sr">Recurrente</span></span>{/if}{#if tx.adjunto}<span class="clip" title="Tiene foto de la factura"><Icono nombre="documento" /><span class="cf-sr">Con foto</span></span>{/if}</b>
        <span class="caption">
          {[conFecha ? fechaCorta(tx.fecha) : null, tx.num_cuotas && tx.num_cuotas > 1 ? `${tx.num_cuotas} cuotas` : null, tx.notas]
            .filter(Boolean).join(" · ")}
        </span>
      </span>
    </span>

    <span class="col categoria" class:muted={sinCat}>
      {transf ? "Transferencia" : (tx.categoria_nombre ?? "Sin categoría")}
    </span>

    <span class="col cuenta">
      {#if transf}{tx.cuenta_nombre} → {tx.cuenta_destino_nombre}{:else}{tx.cuenta_nombre}{/if}
    </span>

    <span class="col etiquetas">
      {#each etiquetasVisibles as e (e.id)}<span class="cf-chip cf-chip--sm cf-chip--brand">{e.nombre}</span>{/each}
      {#if extra > 0}<span class="caption">+{extra}</span>{/if}
    </span>

    <span class="cf-txn-amt monto" class:cf-amt-income={tx.tipo === "ingreso"} class:cf-amt-expense={tx.tipo === "egreso"}>
      {monto(tx.monto, tx.cuenta_moneda, signo)}
      {#if transf && tx.monto_destino && tx.cuenta_destino_moneda}
        <span class="caption destino">→ {monto(tx.monto_destino, tx.cuenta_destino_moneda)}</span>
      {/if}
    </span>
  </button>
</div>

<style>
  .fila { display: flex; align-items: center; border-bottom: 1px solid var(--line); }
  .fila:last-child { border-bottom: 0; }
  .seleccionada { background: var(--primary-soft); }
  .casilla { display: grid; place-items: center; width: 44px; align-self: stretch; cursor: pointer; flex: none; }
  .casilla input { width: 16px; height: 16px; accent-color: var(--primary); cursor: pointer; }
  .cuerpo {
    flex: 1; min-width: 0; display: grid; align-items: center; gap: var(--space-3);
    grid-template-columns: minmax(0, 2.2fr) minmax(0, 1.1fr) minmax(0, 1.2fr) minmax(0, 1.1fr) minmax(120px, auto);
    padding: 10px var(--space-3) 10px 0; border: 0; background: none; text-align: left; cursor: pointer;
    font: 400 13px/18px var(--font-sans); color: var(--ink-2);
  }
  .cuerpo:hover .nombre b { color: var(--primary-text); }
  .cuerpo:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; border-radius: var(--r-sm); }
  .nombre { display: flex; flex-direction: column; min-width: 0; }
  .nombre .caption { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sin { background: var(--track); color: var(--ink-2); }
  .col { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .muted { font-style: italic; }
  .etiquetas { display: flex; gap: 4px; align-items: center; }
  .monto { display: flex; flex-direction: column; align-items: flex-end; color: var(--ink); }
  .monto.cf-amt-income { color: var(--income); }
  .monto.cf-amt-expense { color: var(--expense); }
  .destino { font-weight: 500; }
  @media (max-width: 1100px) {
    .cuerpo { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(110px, auto); }
    .etiquetas { display: none; }
  }
  @media (max-width: 760px) {
    .cuerpo { grid-template-columns: minmax(0, 1fr) auto; }
    .categoria, .cuenta { display: none; }
  }
  .clip { display: inline-flex; vertical-align: -2px; margin-left: 6px; color: var(--ink-3); }
  .clip :global(.cf-icon) { width: 14px; height: 14px; }
</style>
