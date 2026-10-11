<script lang="ts">
  // «Compartir resumen» de una persona en «Me deben»: vista previa de la imagen, qué incluir y
  // Copiar / Guardar (Mac) o Compartir (Android: menú del sistema → WhatsApp…).
  import { invoke } from "@tauri-apps/api/core";
  import { save } from "@tauri-apps/plugin-dialog";
  import Panel from "$lib/ui/Panel.svelte";
  import Icono from "$lib/Icono.svelte";
  import { esAndroid } from "$lib/plataforma";
  import { leerDatosPago, leerAjuste, guardarAjuste } from "$lib/datos/ajustes";
  import { imagenResumen, nombreArchivo, OPCIONES_INICIALES, type OpcionesResumen } from "./resumen";

  let { abierto, personaId, persona, pendiente, cerrar }: {
    abierto: boolean;
    personaId: number;
    persona: string;
    pendiente: string;
    cerrar: () => void;
  } = $props();

  let o = $state<OpcionesResumen>({ ...OPCIONES_INICIALES });
  // Recuerda lo que elegiste la última vez (en este equipo).
  let cargadas = $state(false);
  leerAjuste("resumen_opciones").then((v) => {
    try { if (v) o = { ...OPCIONES_INICIALES, ...JSON.parse(v) }; } catch { /* se quedan las de fábrica */ }
  }).catch(() => {}).finally(() => (cargadas = true));
  $effect(() => {
    const v = JSON.stringify(o);
    if (cargadas) guardarAjuste("resumen_opciones", v).catch(() => {});
  });
  let vista = $state<string | null>(null);
  let hayPago = $state(true);
  let aviso = $state("");
  let error = $state("");
  let ocupado = $state(false);

  // Vista previa liviana (mitad de tamaño, JPEG) al abrir y al cambiar una opción.
  let turno = 0;
  $effect(() => {
    if (!abierto || !cargadas) return;
    const op = { ...o };
    const t = ++turno;
    error = "";
    imagenResumen(personaId, persona, op, "vista").then(({ blob }) => {
      if (t !== turno) return;
      if (vista) URL.revokeObjectURL(vista);
      vista = URL.createObjectURL(blob);
    }).catch((e) => { if (t === turno) error = e instanceof Error ? e.message : String(e); });
  });
  $effect(() => {
    if (!abierto) return;
    aviso = "";
    leerDatosPago().then((d) => (hayPago = d.lineas.length > 0 || !!d.qr)).catch(() => {});
  });
  $effect(() => () => { if (vista) URL.revokeObjectURL(vista); });

  /** La imagen completa se arma solo al usarla. */
  async function completa(formato: "png" | "jpeg"): Promise<Blob> {
    return (await imagenResumen(personaId, persona, { ...o }, formato)).blob;
  }

  async function hacer(f: () => Promise<string | void>) {
    if (!vista || ocupado) return;
    ocupado = true; aviso = ""; error = "";
    try { aviso = (await f()) ?? ""; }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
    finally { ocupado = false; }
  }

  const copiar = () => hacer(async () => {
    // Safari/WebKit pide la promesa dentro del gesto: se le pasa sin esperar.
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": completa("png") })]); }
    catch { throw new Error("El Mac no dejó copiar la imagen. Usa «Guardar imagen»."); }
    return "Imagen copiada: pégala en WhatsApp.";
  });

  const guardar = () => hacer(async () => {
    const ruta = await save({ defaultPath: nombreArchivo(persona), filters: [{ name: "Imagen PNG", extensions: ["png"] }] });
    if (!ruta) return;
    const b = await completa("png");
    await invoke("imagen_guardar", new Uint8Array(await b.arrayBuffer()), { headers: { "x-ruta": encodeURIComponent(ruta) } });
    return "Imagen guardada.";
  });

  const compartir = () => hacer(async () => {
    const blob = await completa("jpeg");
    const b = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    const ok = window.CofreCompartir?.imagen(btoa(bin), nombreArchivo(persona, "jpg"));
    if (!ok) throw new Error("No se pudo abrir el menú para compartir.");
  });

  const opciones: [keyof OpcionesResumen, string][] = [
    ["cuotas", "Cuotas y próxima fecha"], ["abonos", "Abonos recibidos"], ["pagados", "Préstamos ya pagados"],
  ];
</script>


<Panel {abierto} {cerrar} titulo="Compartir resumen" subtitulo="{persona} · te debe {pendiente}">
  <div class="cuerpo">
    <div class="vista" aria-busy={!vista}>
      {#if vista}<img src={vista} alt="Vista previa del resumen para {persona}" />{:else}<span class="caption">Armando la imagen…</span>{/if}
    </div>

    <div class="opciones">
      <span class="etiqueta">Qué incluir</span>
      {#each opciones as [k, t] (k)}
        <label class="interruptor"><input type="checkbox" bind:checked={o[k]} /><span>{t}</span></label>
      {/each}
      <label class="interruptor">
        <input type="checkbox" bind:checked={o.pago} disabled={!hayPago} />
        <span>Datos para pagarme
          <small>{hayPago ? "Tus líneas y tu QR · se cambian en Ajustes" : "Aún no los tienes: agrégalos en Ajustes → Datos para pagarte"}</small></span>
      </label>
      <span class="ayuda">Nunca se muestran tus cuentas ni de dónde salió la plata.</span>
    </div>

    {#if aviso}<p class="ok" role="status">{aviso}</p>{/if}
    {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  </div>

  {#snippet pie()}
    {#if esAndroid}
      <button class="cf-btn cf-btn--primary" onclick={compartir} disabled={!vista || ocupado}><Icono nombre="compartir" />Compartir</button>
    {:else}
      <button class="cf-btn cf-btn--secondary" onclick={copiar} disabled={!vista || ocupado}><Icono nombre="copiar" />Copiar imagen</button>
      <button class="cf-btn cf-btn--primary" onclick={guardar} disabled={!vista || ocupado}><Icono nombre="importar" />Guardar imagen</button>
    {/if}
  {/snippet}
</Panel>

<style>
  .cuerpo { display: flex; flex-direction: column; gap: var(--space-5); }
  .vista { align-self: center; width: 240px; aspect-ratio: 9 / 16; border-radius: var(--r-lg); overflow: hidden; background: var(--track);
    display: grid; place-items: center; box-shadow: var(--shadow-2); }
  .vista img { width: 100%; height: 100%; display: block; }
  .opciones { display: flex; flex-direction: column; gap: var(--space-3); }
  .etiqueta { font-size: 13px; line-height: 18px; font-weight: 600; }
  .interruptor small { display: block; }
  .ayuda { font-size: 12px; line-height: 16px; color: var(--ink-2); }
  .ok { font-size: 13px; font-weight: 500; color: var(--primary-text); }
</style>
