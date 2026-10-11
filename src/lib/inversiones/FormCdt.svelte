<script lang="ts">
  import CampoFecha from "$lib/ui/CampoFecha.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import CampoMonto from "$lib/ui/CampoMonto.svelte";
  import { hoy, leerMonto, montoEditable, pesos } from "$lib/formato";
  import { calcularCdt } from "./calculo";
  import { fechaLarga } from "./fechas";
  import { crearCdt, editarCdt, type Cdt, type CdtNuevo, type Cuenta } from "$lib/datos";

  let { abierto, cdt, cuentas, cerrar, listo, inicial = null }: {
    abierto: boolean;
    /** null = CDT nuevo */
    cdt: Cdt | null;
    /** Cuentas que pueden ser origen (débito/efectivo en pesos). */
    cuentas: Cuenta[];
    cerrar: () => void;
    listo: (mensaje: string) => void;
    /** Valores iniciales para un CDT nuevo (desde el Simulador). */
    inicial?: Partial<CdtNuevo> | null;
  } = $props();

  const PLAZOS = [90, 180, 360, 540];

  let nombre = $state("");
  let banco = $state("");
  let monto = $state("");
  let tasa = $state("");
  let inicio = $state(hoy());
  let plazo = $state("90");
  let retencion = $state("4");
  let origen = $state<number | null>(null);
  let renovacion = $state(false);
  let notas = $state("");
  let error = $state("");
  let guardando = $state(false);

  const pct = (v: number) => (v * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 });
  const leerPct = (t: string) => {
    const n = Number(t.replace(/[^\d,.]/g, "").replace(",", "."));
    return t.trim() && !isNaN(n) ? n / 100 : null;
  };

  $effect(() => {
    if (!abierto) return;
    const c = cdt ?? (inicial as Cdt | null);
    nombre = c?.nombre ?? "";
    banco = c?.banco ?? "";
    monto = montoEditable(c?.monto ?? null);
    tasa = c?.tasa_ea != null ? pct(c.tasa_ea) : "";
    inicio = c?.fecha_inicio ?? hoy();
    plazo = String(c?.plazo_dias ?? 90);
    retencion = pct(c?.retencion ?? 0.04);
    origen = c?.cuenta_origen_id ?? null;
    renovacion = c?.renovacion_auto ?? false;
    notas = c?.notas ?? "";
    error = "";
  });

  function datos(): CdtNuevo | null {
    const m = leerMonto(monto), t = leerPct(tasa), r = leerPct(retencion), p = Number(plazo);
    if (m == null || t == null || r == null || !Number.isInteger(p)) return null;
    return {
      nombre, banco: banco || null, monto: m, tasa_ea: t, fecha_inicio: inicio, plazo_dias: p,
      renovacion_auto: renovacion, retencion: r, cuenta_origen_id: origen, notas: notas || null,
    };
  }

  /** Vista previa en vivo. */
  const previa = $derived.by(() => {
    const d = datos();
    if (!d || d.monto <= 0 || d.tasa_ea <= 0 || d.plazo_dias < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(d.fecha_inicio)) return null;
    return calcularCdt(d, hoy());
  });

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    const d = datos();
    if (!d) return void (error = "Revisa el monto, la tasa, el plazo y la retención.");
    guardando = true;
    try {
      if (cdt) await editarCdt(cdt.id, d);
      else await crearCdt(d);
      const cuenta = cuentas.find((c) => c.id === d.cuenta_origen_id)?.nombre;
      listo(cdt ? "CDT actualizado." : cuenta ? `CDT creado. Salieron ${pesos(d.monto)} de ${cuenta}.` : "CDT creado.");
      cerrar();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      guardando = false;
    }
  }
</script>

<Panel {abierto} {cerrar} titulo={cdt ? "Editar CDT" : "Nuevo CDT"} subtitulo={cdt ? cdt.nombre : "Certificado de depósito a término"}>
  <form id="form-cdt" class="form" onsubmit={guardar}>
    <div class="fila-campos">
      <label class="campo">
        <span class="etiqueta">Nombre</span>
        <span class="cf-field"><input bind:value={nombre} placeholder="CDT Nu 90 días" required /></span>
      </label>
      <label class="campo">
        <span class="etiqueta">Banco</span>
        <span class="cf-field"><input bind:value={banco} placeholder="Nu, BBVA…" /></span>
      </label>
    </div>
    <label class="campo">
      <span class="etiqueta">Monto invertido</span>
      <CampoMonto bind:valor={monto} requerido grande />
    </label>
    <div class="fila-campos">
      <label class="campo">
        <span class="etiqueta">Tasa E.A.</span>
        <span class="cf-field"><input bind:value={tasa} inputmode="decimal" placeholder="9,5" required /><span class="sufijo">%</span></span>
      </label>
      <label class="campo">
        <span class="etiqueta">Fecha de inicio</span>
        <CampoFecha bind:valor={inicio} requerido titulo="Fecha de inicio" />
      </label>
    </div>
    <div class="campo">
      <span class="etiqueta">Plazo</span>
      <div class="plazo">
        <span class="cf-field corto"><input bind:value={plazo} inputmode="numeric" maxlength="4" required aria-label="Plazo en días" /><span class="sufijo">días</span></span>
        <div class="cf-seg" role="group" aria-label="Plazos comunes">
          {#each PLAZOS as p}
            <button type="button" aria-pressed={plazo === String(p)} onclick={() => (plazo = String(p))}>{p}</button>
          {/each}
        </div>
      </div>
    </div>
    <div class="fila-campos">
      <label class="campo">
        <span class="etiqueta">Cuenta origen</span>
        <span class="cf-field">
          <select bind:value={origen}>
            <option value={null}>Ninguna (ya lo tenía)</option>
            {#each cuentas as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
          </select>
        </span>
      </label>
      <label class="campo">
        <span class="etiqueta">Retención en la fuente</span>
        <span class="cf-field"><input bind:value={retencion} inputmode="decimal" /><span class="sufijo">%</span></span>
      </label>
    </div>
    <p class="ayuda">
      {#if origen != null}
        Se registra una transferencia por el monto, desde la cuenta elegida, en la fecha de inicio. No es un gasto.
      {:else}
        Solo se registra el CDT; ninguna cuenta cambia.
      {/if}
    </p>
    <label class="interruptor">
      <input type="checkbox" bind:checked={renovacion} />
      <span>Renovación automática <small>Al vencer, se reinicia con el total neto como nuevo capital, la misma tasa y el mismo plazo.</small></span>
    </label>
    <label class="campo">
      <span class="etiqueta">Notas</span>
      <span class="cf-field"><input bind:value={notas} placeholder="Opcional" /></span>
    </label>

    {#if previa}
      <div class="previa">
        <span class="cf-overline">Al vencimiento · {fechaLarga(previa.vencimiento)}</span>
        <b>{pesos(previa.totalNetoVencimiento)}</b>
        <span class="caption">
          Rendimiento neto {pesos(previa.netoVencimiento)} (bruto {pesos(previa.brutoVencimiento)} − retención {pesos(previa.retencionVencimiento)})
        </span>
      </div>
    {/if}
    {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  </form>
  {#snippet pie()}
    <button class="cf-btn cf-btn--secondary" onclick={cerrar}>Cancelar</button>
    <button class="cf-btn cf-btn--primary" type="submit" form="form-cdt" disabled={guardando}>{cdt ? "Guardar cambios" : "Crear CDT"}</button>
  {/snippet}
</Panel>

<style>
  .form { display: flex; flex-direction: column; gap: var(--space-4); }
  .plazo { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
  .corto { width: 120px; }
  .ayuda { font-size: 12px; line-height: 16px; color: var(--ink-2); margin-top: calc(-1 * var(--space-2)); }
  .previa {
    display: flex; flex-direction: column; gap: 2px; padding: var(--space-4); border-radius: var(--r-lg);
    background: var(--primary-soft);
  }
  .previa b { font: 650 24px/30px var(--font-display); color: var(--primary-text); }
</style>
