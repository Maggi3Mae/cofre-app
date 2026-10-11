<script lang="ts">
  import CampoFecha from "$lib/ui/CampoFecha.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import CampoMonto from "$lib/ui/CampoMonto.svelte";
  import { leerMonto, montoEditable, pesos } from "$lib/formato";
  import { crearCajita, editarCajita, type Cajita, type CajitaNueva, type Cuenta } from "$lib/datos";

  let { abierto, cajita, cuentas, cerrar, listo }: {
    abierto: boolean;
    /** null = cajita nueva */
    cajita: Cajita | null;
    cuentas: Cuenta[];
    cerrar: () => void;
    listo: (mensaje: string) => void;
  } = $props();

  let nombre = $state("");
  let banco = $state("Nu");
  let saldo = $state("");
  let tasa = $state("");
  let meta = $state("");
  let fechaMeta = $state("");
  let notas = $state("");
  let origen = $state<number | null>(null);
  let error = $state("");
  let guardando = $state(false);

  const pct = (v: number) => (v * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 });
  const leerPct = (t: string) => {
    const n = Number(t.replace(/[^\d,.]/g, "").replace(",", "."));
    return t.trim() && !isNaN(n) ? n / 100 : null;
  };

  $effect(() => {
    if (!abierto) return;
    const c = cajita;
    nombre = c?.nombre ?? "";
    banco = c ? c.banco ?? "" : "Nu";
    saldo = "";
    tasa = c ? pct(c.tasa_ea) : "";
    meta = montoEditable(c?.meta ?? null);
    fechaMeta = c?.fecha_meta ?? "";
    notas = c?.notas ?? "";
    origen = null;
    error = "";
  });

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    const t = leerPct(tasa);
    if (t == null) return void (error = "Escribe la tasa E.A.");
    const datos: CajitaNueva = {
      nombre, banco: banco || null, tasa_ea: t, meta: leerMonto(meta), fecha_meta: fechaMeta || null, notas: notas || null,
    };
    guardando = true;
    try {
      if (cajita) {
        await editarCajita(cajita.id, datos);
        listo("Cajita actualizada.");
      } else {
        const s = leerMonto(saldo) ?? 0;
        await crearCajita(datos, s, origen);
        const cuenta = cuentas.find((c) => c.id === origen)?.nombre;
        listo(cuenta ? `Cajita creada. Salieron ${pesos(s)} de ${cuenta}.` : "Cajita creada.");
      }
      cerrar();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      guardando = false;
    }
  }
</script>

<Panel {abierto} {cerrar} titulo={cajita ? "Editar cajita" : "Nueva cajita"} subtitulo={cajita ? cajita.nombre : "Ahorro con rendimiento diario"}>
  <form id="form-cajita" class="form" onsubmit={guardar}>
    <div class="fila-campos">
      <label class="campo">
        <span class="etiqueta">Nombre</span>
        <span class="cf-field"><input bind:value={nombre} placeholder="Viaje, Emergencias…" required /></span>
      </label>
      <label class="campo">
        <span class="etiqueta">Banco</span>
        <span class="cf-field"><input bind:value={banco} placeholder="Nu" /></span>
      </label>
    </div>
    {#if !cajita}
      <label class="campo">
        <span class="etiqueta">Saldo de hoy</span>
        <CampoMonto bind:valor={saldo} grande />
      </label>
      <label class="campo">
        <span class="etiqueta">Cuenta origen</span>
        <span class="cf-field">
          <select bind:value={origen}>
            <option value={null}>Ninguna (ya la tenía)</option>
            {#each cuentas as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
          </select>
        </span>
        <span class="ayuda">
          {origen != null ? "El saldo sale de esa cuenta como transferencia. No es un gasto." : "Solo se registra la cajita; ninguna cuenta cambia."}
        </span>
      </label>
    {:else}
      <p class="ayuda">El saldo se cambia con Aportar, Retirar o Ajustar saldo.</p>
    {/if}
    <label class="campo">
      <span class="etiqueta">Tasa E.A.</span>
      <span class="cf-field"><input bind:value={tasa} inputmode="decimal" placeholder="9,3" required /><span class="sufijo">%</span></span>
    </label>
    <div class="fila-campos">
      <label class="campo">
        <span class="etiqueta">Meta</span>
        <CampoMonto bind:valor={meta} placeholder="Opcional" />
      </label>
      <label class="campo">
        <span class="etiqueta">Fecha meta</span>
        <CampoFecha bind:valor={fechaMeta} opcional titulo="Fecha meta" />
      </label>
    </div>
    <label class="campo">
      <span class="etiqueta">Notas</span>
      <span class="cf-field"><input bind:value={notas} placeholder="Opcional" /></span>
    </label>
    {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  </form>
  {#snippet pie()}
    <button class="cf-btn cf-btn--secondary" onclick={cerrar}>Cancelar</button>
    <button class="cf-btn cf-btn--primary" type="submit" form="form-cajita" disabled={guardando}>{cajita ? "Guardar cambios" : "Crear cajita"}</button>
  {/snippet}
</Panel>

<style>
  .form { display: flex; flex-direction: column; gap: var(--space-4); }
  .ayuda { font-size: 12px; line-height: 16px; color: var(--ink-2); }
</style>
