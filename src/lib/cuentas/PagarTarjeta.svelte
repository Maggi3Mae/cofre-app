<script lang="ts">
  import CampoFecha from "$lib/ui/CampoFecha.svelte";
  // Pago de tarjeta = TRANSFERENCIA (origen → tarjeta). No cuenta como egreso:
  // las compras ya se registraron como egresos en la tarjeta.
  import Panel from "$lib/ui/Panel.svelte";
  import { hoy, leerMonto, monto, montoEditable } from "$lib/formato";
  import { crearTransaccion, type Cuenta } from "$lib/datos";

  let { abierto, tarjeta, cuentas, cerrar, listo }: {
    abierto: boolean;
    tarjeta: Cuenta | null;
    /** Todas las cuentas activas; se filtran los orígenes válidos. */
    cuentas: Cuenta[];
    cerrar: () => void;
    listo: () => void;
  } = $props();

  let valor = $state("");
  let origenId = $state<number | null>(null);
  let fecha = $state(hoy());
  let error = $state("");
  let guardando = $state(false);

  // Orígenes: cuentas que no son crédito y están en la misma moneda que la tarjeta.
  const origenes = $derived(
    cuentas.filter((c) => c.tipo !== "credito" && c.moneda === tarjeta?.moneda),
  );

  $effect(() => {
    if (!abierto || !tarjeta) return;
    valor = montoEditable(Math.max(tarjeta.saldo, 0));
    origenId = (origenes.find((c) => c.principal) ?? origenes[0])?.id ?? null;
    fecha = hoy();
    error = "";
  });

  async function pagar(e: SubmitEvent) {
    e.preventDefault();
    if (!tarjeta) return;
    error = "";
    const m = leerMonto(valor);
    if (m == null || m <= 0) return void (error = "Escribe un monto mayor que cero.");
    if (origenId == null) return void (error = "Elige desde qué cuenta pagas.");
    guardando = true;
    try {
      await crearTransaccion({
        fecha, monto: m, tipo: "transferencia",
        cuenta_id: origenId, cuenta_destino_id: tarjeta.id,
        comercio: `Pago tarjeta ${tarjeta.nombre}`,
      });
      listo();
      cerrar();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      guardando = false;
    }
  }
</script>

<Panel {abierto} {cerrar} titulo="Pagar tarjeta"
  subtitulo={tarjeta ? `${tarjeta.nombre} · deuda actual ${monto(tarjeta.saldo, tarjeta.moneda)}` : ""}>
  <form id="form-pago" class="form" onsubmit={pagar}>
    <p class="nota">
      Se registra como <b>transferencia</b>: baja el saldo de la cuenta de origen y la deuda de la tarjeta,
      pero no suma a tus egresos. Las compras ya cuentan como gasto.
    </p>

    <label class="campo">
      <span class="etiqueta">Monto</span>
      <span class="cf-field"><span class="sufijo">$</span><input bind:value={valor} inputmode="decimal" required /></span>
      <span class="ayuda">Viene con la deuda total; cámbialo si pagas otra cantidad.</span>
    </label>

    <label class="campo">
      <span class="etiqueta">Pagar desde</span>
      {#if origenes.length}
        <span class="cf-field">
          <select bind:value={origenId}>
            {#each origenes as c}
              <option value={c.id}>{c.nombre}{c.ultimos4 ? ` ••${c.ultimos4}` : ""} · {monto(c.saldo, c.moneda)}</option>
            {/each}
          </select>
        </span>
      {:else}
        <span class="error-form">No tienes cuentas de débito, efectivo o inversión en {tarjeta?.moneda}. Crea una primero.</span>
      {/if}
    </label>

    <label class="campo">
      <span class="etiqueta">Fecha</span>
      <CampoFecha bind:valor={fecha} requerido />
    </label>

    {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  </form>

  {#snippet pie()}
    <button class="cf-btn cf-btn--secondary" onclick={cerrar}>Cancelar</button>
    <button class="cf-btn cf-btn--primary" type="submit" form="form-pago" disabled={guardando || !origenes.length}>
      Registrar pago
    </button>
  {/snippet}
</Panel>

<style>
  .form { display: flex; flex-direction: column; gap: var(--space-4); }
  .nota { padding: 12px 14px; border-radius: var(--r-md); background: var(--primary-soft); color: var(--primary-text); font-size: 13px; line-height: 18px; }
</style>
