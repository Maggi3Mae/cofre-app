<script lang="ts" module>
  /** Lo que la factura deja listo en el formulario de nuevo movimiento. */
  export interface Prellenado {
    monto: number | null;
    fecha: string | null;
    comercio: string;
    categoriaId: number | null;
    cuentaId: number | null;
    notas: string;
    factura: { cufe: string | null; nit: string | null };
    /** Desde el Simulador: compra a cuotas ya elegida. */
    cuotas?: { numCuotas: number; internacional: boolean };
    /** Foto de la factura (ya girada) para adjuntarla al movimiento. */
    foto?: HTMLCanvasElement;
  }
</script>

<script lang="ts">
  // Panel «Desde factura»: lee la foto (QR + texto), muestra lo encontrado y pasa al formulario.
  import Panel from "$lib/ui/Panel.svelte";
  import Icono from "$lib/Icono.svelte";
  import { pesos } from "$lib/formato";
  import { fechaCorta } from "$lib/periodo";
  import {
    comercioPorNit, movimientoPorCufe, listarReglas, historialCategorias,
    type Cuenta, type Categoria,
  } from "$lib/datos";
  import { crearCategorizador } from "$lib/importar/categorizar";
  import { cargarImagen, rotar, leerFactura, cancelarLectura } from "./ocr";
  import type { DatosFactura, MedioPago } from "./leer";

  let { archivo, cuentas, categorias, cerrar, continuar }: {
    archivo: File | null;
    cuentas: Cuenta[];
    categorias: Categoria[];
    cerrar: () => void;
    continuar: (p: Prellenado) => void;
  } = $props();

  // $state.raw: el lienzo es grande; se reemplaza entero (al girar) y no debe volverse proxy.
  let foto: HTMLCanvasElement | null = $state.raw(null);
  let vista = $state("");
  let etapa = $state("");
  let progreso = $state<number | null>(null);
  let datos = $state<DatosFactura | null>(null);
  let nombreNit = $state<string | null>(null);
  let repetida = $state<{ fecha: string; monto: number; comercio: string | null } | null>(null);
  let error = $state("");
  let leyendo = $state(false);
  let verTexto = $state(false);
  let texto = $state("");

  const medios: Record<MedioPago, string> = {
    efectivo: "Efectivo", debito: "Tarjeta débito", credito: "Tarjeta crédito", transferencia: "Transferencia / billetera",
  };

  $effect(() => {
    const a = archivo;
    if (!a) return;
    abrir(a);
  });

  async function abrir(a: File) {
    datos = null; error = ""; repetida = null; nombreNit = null; vista = ""; texto = ""; verTexto = false;
    try {
      foto = await cargarImagen(a);
      await leer();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function miniatura(c: HTMLCanvasElement) {
    const f = Math.min(1, 640 / Math.max(c.width, c.height));
    const m = document.createElement("canvas");
    m.width = Math.round(c.width * f);
    m.height = Math.round(c.height * f);
    m.getContext("2d")!.drawImage(c, 0, 0, m.width, m.height);
    return m.toDataURL("image/jpeg", 0.8);
  }

  /** Cada lectura tiene su turno: si se gira mientras lee, solo cuenta la última. */
  let turno = 0;
  async function leer() {
    if (!foto) return;
    const t = ++turno;
    leyendo = true; error = ""; datos = null;
    vista = miniatura(foto);
    try {
      const r = await leerFactura(foto, (e, p) => { if (t === turno) { etapa = e; progreso = p ?? null; } }, () => t === turno);
      if (t !== turno) return;
      datos = r.datos;
      texto = r.texto;
      nombreNit = r.datos.nit ? await comercioPorNit(r.datos.nit) : null;
      repetida = r.datos.cufe ? await movimientoPorCufe(r.datos.cufe) : null;
    } catch (e) {
      if (t === turno) error = "No se pudo leer la foto: " + (e instanceof Error ? e.message : String(e));
    } finally {
      if (t === turno) { leyendo = false; etapa = ""; progreso = null; }
    }
  }

  /** Se puede girar en cualquier momento: corta la lectura en curso y empieza otra con la foto girada. */
  async function girar() {
    if (!foto) return;
    foto = rotar(foto, 90);
    vista = miniatura(foto);
    if (leyendo) await cancelarLectura();
    await leer();
  }

  /** Cuenta según el medio de pago: efectivo → tu efectivo; tarjetas → la principal de ese tipo. */
  function cuentaPara(medio: MedioPago | null): number | null {
    const activas = cuentas.filter((c) => !c.archivada);
    const tipo = medio === "efectivo" ? "efectivo" : medio === "credito" ? "credito" : medio ? "debito" : null;
    const delTipo = tipo ? activas.filter((c) => c.tipo === tipo) : [];
    return (delTipo.find((c) => c.principal) ?? delTipo[0] ?? activas.find((c) => c.principal) ?? activas[0])?.id ?? null;
  }

  async function seguir() {
    if (!datos) return;
    const comercio = nombreNit ?? datos.comercio ?? "";
    let categoriaId: number | null = null;
    try {
      const [reglas, hist] = await Promise.all([listarReglas(), historialCategorias()]);
      const sugerir = crearCategorizador(reglas, hist, (id) => categorias.find((c) => c.id === id)?.tipo);
      categoriaId = sugerir(`${datos.comercio ?? ""} ${comercio}`, comercio, "egreso")?.categoriaId ?? null;
    } catch { /* sin sugerencia */ }
    continuar({
      monto: datos.total, fecha: datos.fecha, comercio, categoriaId, cuentaId: cuentaPara(datos.medio),
      notas: datos.numero ? `Factura ${datos.numero}` : "",
      factura: { cufe: repetida ? null : datos.cufe, nit: datos.nit },
      foto: foto ?? undefined,
    });
  }
</script>

<Panel abierto={!!archivo} {cerrar} titulo="Desde factura" subtitulo="Cofre lee la foto en tu equipo">
  <div class="cuerpo">
    {#if vista}
      <div class="foto"><img src={vista} alt="Foto de la factura" /></div>
    {/if}

    {#if error}<p class="error-form" role="alert">{error}</p>{/if}

    {#if leyendo}
      <div class="estado" role="status">
        <span>{etapa}</span>
        {#if progreso != null}
          <div class="cf-bar cf-bar--sm" aria-hidden="true"><span style="width:{Math.round(progreso * 100)}%"></span></div>
        {/if}
      </div>
    {:else if datos}
      {#if repetida}
        <p class="error-form" role="alert">
          Esta factura ya está registrada: {repetida.comercio ?? "movimiento"} · {pesos(repetida.monto)} · {fechaCorta(repetida.fecha)}.
        </p>
      {/if}
      <dl class="datos">
        <div><dt>Comercio</dt><dd>{nombreNit ?? datos.comercio ?? "—"}{#if nombreNit}<small>recordado por su NIT</small>{/if}</dd></div>
        <div><dt>NIT</dt><dd>{datos.nit ?? "—"}</dd></div>
        <div><dt>Fecha</dt><dd>{datos.fecha ? fechaCorta(datos.fecha) : "—"}{#if datos.fechaDudosa}<small class="dudosa">Revisa la fecha: el año no se leyó bien</small>{/if}</dd></div>
        <div><dt>Total</dt><dd class="total">{datos.total != null ? pesos(datos.total) : "—"}</dd></div>
        <div><dt>Pago</dt><dd>{datos.medio ? medios[datos.medio] : "—"}</dd></div>
        <div><dt>Factura electrónica</dt><dd>{datos.cufe ? "Sí (CUFE leído)" : "No se leyó el CUFE"}</dd></div>
      </dl>
      <p class="caption">
        {datos.fuente.qr ? "Datos del código QR DIAN, completados con el texto." : "Sin código QR legible: datos leídos del texto."}
        {#if datos.total == null || !datos.fecha}Lo que falte lo completas en el siguiente paso.{:else}Revísalos en el siguiente paso.{/if}
      </p>
      {#if !datos.total && !datos.comercio}
        <p class="caption">Consejo: foto de frente, con buena luz y el papel estirado. Si está girada, usa «Girar».</p>
      {/if}
      <button class="cf-btn cf-btn--ghost" onclick={() => (verTexto = !verTexto)} aria-expanded={verTexto}>
        <Icono nombre={verTexto ? "ojoTachado" : "ojo"} />{verTexto ? "Ocultar" : "Ver"} texto leído
      </button>
      {#if verTexto}<pre class="texto">{texto}</pre>{/if}
    {/if}
  </div>

  {#snippet pie()}
    <button class="cf-btn cf-btn--secondary" onclick={girar} disabled={!foto}><Icono nombre="deshacer" />Girar</button>
    <button class="cf-btn cf-btn--primary" onclick={seguir} disabled={leyendo || !datos}>Continuar<Icono nombre="siguiente" /></button>
  {/snippet}
</Panel>

<style>
  .cuerpo { display: flex; flex-direction: column; gap: var(--space-4); }
  .foto { border-radius: var(--r-md); overflow: hidden; background: var(--input); border: 1px solid var(--glass-border); max-height: 280px; display: grid; place-items: center; }
  .foto img { max-width: 100%; max-height: 280px; object-fit: contain; display: block; }
  .estado { display: flex; flex-direction: column; gap: var(--space-2); font-size: 14px; color: var(--ink-2); }
  .datos { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin: 0; }
  .datos div { display: flex; flex-direction: column; gap: 2px; }
  .datos dt { font-size: 12px; color: var(--ink-2); }
  .datos dd { margin: 0; font-size: 14px; font-weight: 600; color: var(--ink); overflow-wrap: anywhere; }
  .datos dd small { display: block; font-weight: 400; font-size: 12px; color: var(--primary-text); }
  .datos dd small.dudosa { color: var(--warn-90); }
  .datos .total { font: 650 20px/26px var(--font-display); }
  .texto { max-height: 240px; overflow: auto; margin: 0; padding: var(--space-3); border-radius: var(--r-md); background: var(--input); font: 400 11px/16px var(--font-mono); white-space: pre-wrap; }
</style>
