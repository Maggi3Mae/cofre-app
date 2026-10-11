<script lang="ts">
  // Ajustes → «Datos para pagarte»: lo que sale al final del resumen que compartes desde «Me deben».
  // Se comparte con los otros equipos (el QR viaja con las fotos).
  import { onMount } from "svelte";
  import Icono from "$lib/Icono.svelte";
  import ElegirFoto from "$lib/ui/ElegirFoto.svelte";
  import { leerDatosPago, guardarDatosPago } from "$lib/datos/ajustes";
  import { guardarAdjunto, leerAdjunto, borrarAdjunto } from "$lib/adjuntos/archivos";
  import { canvasDeArchivo, comprimirQr } from "$lib/adjuntos/comprimir";

  let linea1 = $state("");
  let linea2 = $state("");
  let qr = $state<string | null>(null);
  let verQr = $state<string | null>(null);
  let aviso = $state("");
  let error = $state("");
  let ocupado = $state(false);

  async function mostrarQr(nombre: string | null) {
    if (verQr) URL.revokeObjectURL(verQr);
    verQr = nombre ? URL.createObjectURL(await leerAdjunto(nombre).catch(() => new Blob())) : null;
  }

  onMount(() => {
    leerDatosPago().then((d) => {
      linea1 = d.lineas[0] ?? ""; linea2 = d.lineas[1] ?? ""; qr = d.qr;
      mostrarQr(qr);
    });
    return () => { if (verQr) URL.revokeObjectURL(verQr); };
  });

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    aviso = ""; error = "";
    try {
      await guardarDatosPago({ lineas: [linea1, linea2], qr });
      aviso = "Guardado. Sale en el resumen que compartes desde «Me deben».";
    } catch (err) { error = err instanceof Error ? err.message : String(err); }
  }

  async function elegirQr(f: File) {
    ocupado = true; aviso = ""; error = "";
    try {
      const nuevo = await guardarAdjunto(await comprimirQr(await canvasDeArchivo(f)));
      const viejo = qr;
      qr = nuevo;
      await guardarDatosPago({ lineas: [linea1, linea2], qr });
      if (viejo) await borrarAdjunto(viejo);
      await mostrarQr(qr);
      aviso = "QR guardado.";
    } catch (err) {
      error = `No se pudo usar esa imagen: ${err instanceof Error ? err.message : String(err)}`;
    } finally { ocupado = false; }
  }

  async function quitarQr() {
    const viejo = qr;
    qr = null;
    await guardarDatosPago({ lineas: [linea1, linea2], qr });
    if (viejo) await borrarAdjunto(viejo);
    await mostrarQr(null);
  }
</script>

<form class="cf-glass cf-card seccion" onsubmit={guardar} aria-labelledby="t-pago">
  <h2 id="t-pago" class="cf-card-title">Datos para pagarte</h2>
  <p class="intro">Salen al final del resumen que compartes con quien te debe. Opcional. Nunca se muestran tus cuentas.</p>
  <div class="rejilla">
    <label class="campo">
      <span class="etiqueta">Línea 1</span>
      <span class="cf-field"><input bind:value={linea1} maxlength="40" placeholder="Nequi · 300 123 4567" /></span>
    </label>
    <label class="campo">
      <span class="etiqueta">Línea 2</span>
      <span class="cf-field"><input bind:value={linea2} maxlength="40" placeholder="Llave Bre-B: @tu-llave" /></span>
    </label>
  </div>
  <span class="ayuda">Lo que va después de «·» o «:» sale en negrita (el número o la llave).</span>

  <div class="qr-fila">
    <div class="qr-caja" class:vacia={!verQr}>
      {#if verQr}<img src={verQr} alt="Tu QR de pago" />{:else}<Icono nombre="foto" />{/if}
    </div>
    <div class="qr-texto">
      <b>QR de pago</b>
      <span class="ayuda">Descárgalo desde la app de tu banco (Nequi, BBVA, Bre-B) y súbelo aquí. Se guarda solo en tus equipos.</span>
      <div class="fila">
        <ElegirFoto elegir={elegirQr} clase="cf-btn cf-btn--secondary">{qr ? "Cambiar QR" : "Subir QR"}</ElegirFoto>
        {#if qr}<button type="button" class="cf-btn cf-btn--ghost" onclick={quitarQr} disabled={ocupado}>Quitar</button>{/if}
      </div>
    </div>
  </div>

  {#if aviso}<p class="ok" role="status">{aviso}</p>{/if}
  {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  <div class="acciones"><button class="cf-btn cf-btn--primary" type="submit" disabled={ocupado}>Guardar</button></div>
</form>

<style>
  .seccion { gap: var(--space-4); max-width: 820px; }
  .intro { font-size: 14px; line-height: 20px; color: var(--ink-2); max-width: 640px; }
  .rejilla { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-4); }
  .ayuda { font-size: 12px; line-height: 16px; color: var(--ink-2); }
  .qr-fila { display: flex; gap: var(--space-4); align-items: center; padding: var(--space-4); border-radius: var(--r-lg); border: 1px solid var(--line); background: var(--glass-1); }
  .qr-caja { width: 104px; height: 104px; flex: none; border-radius: var(--r-md); background: #FFFFFF; display: grid; place-items: center; overflow: hidden; }
  .qr-caja.vacia { background: var(--track); color: var(--ink-3); }
  .qr-caja img { width: 100%; height: 100%; object-fit: contain; }
  .qr-texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .qr-texto b { font-size: 15px; }
  .fila { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: 4px; }
  .ok { font-size: 13px; font-weight: 500; color: var(--primary-text); }
  .acciones { display: flex; justify-content: flex-end; }
</style>
