<script lang="ts">
  import Icono from "$lib/Icono.svelte";
  import type { NombreIcono } from "$lib/iconos";
  import { monto } from "$lib/formato";
  import { eliminarCuenta, type Cuenta, type TipoCuenta } from "$lib/datos";
  import { pantalla } from "$lib/pantalla.svelte";

  let { cuenta, editar, pagar, listo }: {
    cuenta: Cuenta;
    editar: () => void;
    pagar?: () => void;
    /** Después de eliminar o archivar. Recibe qué pasó. */
    listo: (r: "eliminada" | "archivada") => void;
  } = $props();

  const aspecto: Record<TipoCuenta, { icono: NombreIcono; tesela: string; nombre: string }> = {
    debito: { icono: "cuentas", tesela: "cf-tile--brand", nombre: "Débito" },
    credito: { icono: "tarjeta", tesela: "cf-tile--expense", nombre: "Tarjeta de crédito" },
    efectivo: { icono: "billete", tesela: "cf-tile--brand", nombre: "Efectivo" },
    inversion: { icono: "inversiones", tesela: "cf-tile--saving", nombre: "Inversión" },
  };

  const credito = $derived(cuenta.tipo === "credito");
  const a = $derived(aspecto[cuenta.tipo]);
  const pct = (v: number) => (v * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 });
  // Cupo disponible = cupo − deuda (se recalcula cada vez que se carga la pantalla).
  const disponible = $derived(cuenta.cupo != null ? cuenta.cupo - Math.max(cuenta.saldo, 0) : null);
  const uso = $derived(cuenta.cupo ? Math.min(100, Math.max(0, (cuenta.saldo / cuenta.cupo) * 100)) : 0);
  const claseUso = $derived(uso >= 100 ? "cf-bar--over-100" : uso >= 90 ? "cf-bar--warn-90" : uso >= 80 ? "cf-bar--warn-80" : "");
  const enRojo = $derived(credito ? cuenta.saldo > 0 : cuenta.saldo < 0);

  let confirmar = $state(false);
  let error = $state("");

  async function eliminar() {
    error = "";
    try {
      listo(await eliminarCuenta(cuenta.id));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      confirmar = false;
    }
  }
</script>

<article class="fila" class:archivada={cuenta.archivada} class:movil={pantalla.celular}>
  <span class="cf-tile {a.tesela}" title={a.nombre}><Icono nombre={a.icono} /></span>

  <div class="info">
    <div class="titulo">
      <b>{cuenta.nombre}</b>
      {#if cuenta.principal}<span class="cf-chip cf-chip--sm cf-chip--brand"><Icono nombre="estrella" />Principal</span>{/if}
    </div>
    <span class="caption">
      {[a.nombre, cuenta.banco, cuenta.ultimos4 ? `••${cuenta.ultimos4}` : null, cuenta.moneda === "USD" ? "USD" : null]
        .filter(Boolean).join(" · ")}
    </span>
    {#if credito}
      <div class="detalles">
        {#if cuenta.cupo}
          <span class="cupo">
            <span class="cf-bar cf-bar--sm {claseUso}" role="meter" aria-valuemin="0" aria-valuemax="100"
              aria-valuenow={Math.round(uso)} aria-label="Uso del cupo"><span style:width="{uso}%"></span></span>
            <span class="caption">Cupo disp. {monto(disponible ?? 0, cuenta.moneda)}</span>
          </span>
        {/if}
        {#if cuenta.tasa_ea != null}<span class="caption">{pct(cuenta.tasa_ea)} % E.A.</span>{/if}
        {#if !cuenta.interes_una_cuota}<span class="cf-chip cf-chip--sm cf-chip--income">1 cuota sin interés</span>{/if}
        {#if cuenta.dia_corte || cuenta.dia_pago}
          <span class="caption">
            {cuenta.dia_corte ? `Corte ${cuenta.dia_corte}` : ""}{cuenta.dia_corte && cuenta.dia_pago ? " · " : ""}{cuenta.dia_pago ? `Pago ${cuenta.dia_pago}` : ""}
          </span>
        {/if}
      </div>
    {/if}
  </div>

  <div class="saldo">
    <span class="cf-overline">{credito ? "Deuda actual" : "Saldo"}</span>
    <b class="monto" class:cf-amt-expense={enRojo}>{monto(cuenta.saldo, cuenta.moneda, enRojo ? "−" : undefined)}</b>
  </div>

  <div class="acciones">
    {#if confirmar}
      <span class="confirmar" role="alertdialog" aria-label="Confirmar eliminación">
        <span class="caption">
          {cuenta.num_movimientos > 0
            ? `Tiene ${cuenta.num_movimientos} ${cuenta.num_movimientos === 1 ? "movimiento" : "movimientos"}: se archivará para no perderlos.`
            : "¿Eliminar esta cuenta?"}
        </span>
        <button class="cf-btn cf-btn--peligro corto" onclick={eliminar}>{cuenta.num_movimientos > 0 ? "Archivar" : "Eliminar"}</button>
        <button class="cf-btn cf-btn--ghost corto" onclick={() => (confirmar = false)}>No</button>
      </span>
    {:else}
      {#if pagar && !cuenta.archivada}
        <button class="cf-btn cf-btn--secondary corto" onclick={pagar} disabled={cuenta.saldo <= 0}>
          <Icono nombre="transacciones" />Pagar
        </button>
      {/if}
      <!-- Celular: crear y editar cuentas solo en el Mac o la tablet. -->
      {#if !pantalla.celular}
      <button class="cf-btn cf-btn--icon corto" onclick={editar} aria-label="Editar {cuenta.nombre}" title="Editar"><Icono nombre="editar" /></button>
      {/if}
      {#if !cuenta.archivada && !pantalla.celular}
        <button class="cf-btn cf-btn--icon corto peligro" onclick={() => (confirmar = true)} aria-label="Eliminar {cuenta.nombre}" title="Eliminar"><Icono nombre="papelera" /></button>
      {/if}
    {/if}
  </div>
  {#if error}<p class="error-form error" role="alert">{error}</p>{/if}
</article>

<style>
  .fila {
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center;
    gap: var(--space-4); padding: var(--space-4) var(--space-5);
    border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--glass-1);
  }
  .archivada { opacity: .7; }
  .info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .titulo { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
  .titulo b { font-size: 15px; line-height: 20px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detalles { display: flex; align-items: center; flex-wrap: wrap; gap: 6px var(--space-4); margin-top: 6px; }
  .cupo { display: inline-flex; align-items: center; gap: var(--space-2); }
  .cupo .cf-bar { width: 72px; }
  .saldo { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .monto { font: 650 20px/26px var(--font-display); letter-spacing: -.01em; white-space: nowrap; }
  .acciones { display: flex; align-items: center; gap: var(--space-2); }
  .corto { height: 36px; }
  .cf-btn--icon.corto { width: 36px; }
  .cf-btn--secondary.corto, .cf-btn--peligro.corto, .cf-btn--ghost.corto { padding: 0 var(--space-3); }
  .peligro { color: var(--expense); }
  .confirmar { display: flex; align-items: center; gap: var(--space-2); max-width: 360px; }
  .error { grid-column: 1 / -1; }
  .fila.movil { padding: var(--space-3) var(--space-4); gap: var(--space-3); }
  .fila.movil .monto { font-size: 17px; line-height: 22px; }
  .fila.movil .acciones:empty { display: none; }
  @media (max-width: 760px) {
    .fila { grid-template-columns: auto minmax(0, 1fr) auto; }
    .acciones { grid-column: 2 / -1; justify-content: flex-end; }
  }
</style>
