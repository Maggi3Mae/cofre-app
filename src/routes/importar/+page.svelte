<script lang="ts">
  // Importar extractos: leer el archivo (con clave si la tiene), reconocer banco y cuenta,
  // leer y validar los movimientos, revisarlos y guardarlos.
  import { onMount } from "svelte";
  import Icono from "$lib/Icono.svelte";
  import FormCategoria from "$lib/categorias/FormCategoria.svelte";
  import { goto } from "$app/navigation";
  import { dejarFactura } from "$lib/facturas/pendiente";
  import {
    listarCuentas, listarImportaciones, importacionPorHuella, deshacerImportacion, listarCategorias,
    crearImportacion, insertarMovimientos, huellasExistentes, candidatosCruce, enlazarMovimiento,
    convertirEnTransferencia, listarReglas, historialCategorias, guardarRegla, normalizarPatron,
    listarPlantillas, eliminarPlantilla, type Plantilla,
    type Cuenta, type Importacion, type Categoria, type MovimientoImport,
  } from "$lib/datos";
  import { leerDocumento, tipoArchivo, huellaArchivo, ClaveRequerida, type Documento, type TipoArchivo } from "$lib/importar/documento";
  import { todosLosFormatos, detectar, formatoPorId } from "$lib/importar/bancos";
  import AsistentePlantilla from "$lib/importar/AsistentePlantilla.svelte";
  import { clavesGuardadas, guardarClave } from "$lib/importar/claves";
  import { esEscritorio } from "$lib/plataforma";
  import { anonimizar } from "$lib/importar/anonimizar";
  import { fechaCorta } from "$lib/periodo";
  import { pesos } from "$lib/formato";
  import type { Lectura } from "$lib/importar/lectores";
  import { proponerFilas, huellas, type FilaImport } from "$lib/importar/propuesta";
  import { crearCategorizador } from "$lib/importar/categorizar";
  import { cruzar } from "$lib/importar/cruce";

  type Estado = "inicio" | "leyendo" | "clave" | "listo";

  let cuentas = $state<Cuenta[]>([]);
  let historial = $state<Importacion[]>([]);
  let categorias = $state<Categoria[]>([]);
  let plantillas = $state<Plantilla[]>([]);

  // Asistente para enseñar un formato nuevo (o ajustar uno enseñado).
  let asistente = $state(false);
  let borrarPlantillaId = $state<number | null>(null);

  async function plantillaGuardada(id: number) {
    plantillas = await listarPlantillas();
    asistente = false;
    formatoId = `plantilla:${id}`;
    const p = plantillas.find((x) => x.id === id);
    if (p?.cuenta_id) cuentaId = p.cuenta_id;
    aviso = `Formato «${p?.nombre}» guardado. La próxima vez se reconoce solo.`;
  }

  async function quitarPlantilla(p: Plantilla) {
    try {
      await eliminarPlantilla(p.id);
      plantillas = await listarPlantillas();
      if (formatoId === `plantilla:${p.id}`) formatoId = "";
      borrarPlantillaId = null;
      aviso = `Se borró el formato «${p.nombre}». Lo ya importado no cambia.`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  let estado = $state<Estado>("inicio");
  let error = $state("");
  let aviso = $state("");

  // Archivo en curso
  let nombre = $state("");
  let tipo = $state<TipoArchivo>("pdf");
  let bytes: Uint8Array<ArrayBuffer> | null = null;
  let huella = "";
  let previa = $state<Importacion | null>(null);
  let doc = $state<Documento | null>(null);
  let formatoId = $state("");
  let cuentaId = $state<number | null>(null);
  let ultimos4 = $state<string | null>(null);

  // Clave
  let clave = $state("");
  let recordar = $state(false);
  let errorClave = $state("");
  let claveEscrita = ""; // la que funcionó, para guardarla si se pidió «Recordar»

  // Texto extraído
  let verTexto = $state(false);
  let sinDatos = $state(true);
  let copiado = $state(false);

  let arrastrando = $state(false);
  let entrada: HTMLInputElement;
  let confirmarId = $state<number | null>(null);

  // Movimientos leídos
  let lectura = $state<Lectura | null>(null);
  let filas = $state<FilaImport[]>([]);
  let errorLectura = $state("");
  let importando = $state(false);

  // Reglas por aprender después de importar
  interface Aprendible { comercio: string; patron: string; categoriaId: number; elegida: boolean }
  let aprendibles = $state<Aprendible[]>([]);

  // «+ Nueva categoría…» desde la vista previa: al crearla queda puesta en esa fila.
  const NUEVA = -1;
  let filaNueva = $state<FilaImport | null>(null);
  let panelCategoria = $state(false);

  function elegirCategoria(f: FilaImport, valor: string) {
    if (+valor === NUEVA) {
      filaNueva = f;
      panelCategoria = true;
      return;
    }
    f.categoriaId = valor === "" ? null : +valor;
  }

  async function categoriaCreada(id: number) {
    categorias = await listarCategorias();
    if (filaNueva) filaNueva.categoriaId = id;
    filaNueva = null;
  }

  const formato = $derived(formatoPorId(formatoId, plantillas));
  const cuentasActivas = $derived(cuentas.filter((c) => !c.archivada));
  const cuentasSugeridas = $derived(formato ? cuentasActivas.filter((c) => c.tipo === formato.tipoCuenta) : cuentasActivas);
  const texto = $derived(doc ? (sinDatos ? anonimizar(doc.texto) : doc.texto) : "");
  const nLineas = $derived(doc ? doc.texto.split("\n").filter((l) => l.trim()).length : 0);
  const cuenta = $derived(cuentas.find((c) => c.id === cuentaId) ?? null);
  const elegidas = $derived(filas.filter((f) => f.incluir));
  const transferSinCuenta = $derived(elegidas.filter((f) => f.tipo === "transferencia" && !f.contraparteId).length);
  const todas = $derived(filas.length > 0 && filas.every((f) => f.incluir || f.existe));
  const categoriasOrdenadas = $derived.by(() => {
    const padres = categorias.filter((c) => !c.padre_id);
    return padres.flatMap((p) => [
      { ...p, etiqueta: p.nombre },
      ...categorias.filter((h) => h.padre_id === p.id).map((h) => ({ ...h, etiqueta: `   ${h.nombre}` })),
    ]);
  });

  // Leer movimientos cada vez que cambia el formato o la cuenta.
  let consultaLectura = 0;
  $effect(() => {
    const d = doc, f = formato, c = cuenta, cs = cuentas;
    lectura = null; filas = []; errorLectura = "";
    if (!d || !f || !c) return;
    const id = ++consultaLectura;
    (async () => {
      try {
        const l = f.leer(d);
        if (!l.movimientos.length) { errorLectura = `No se encontraron movimientos con el formato ${f.nombre}. ¿Es el formato correcto?`; return; }
        const hs = huellas(c.id, l);
        const [existentes, reglas, hist, candidatos] = await Promise.all([
          huellasExistentes(hs), listarReglas(), historialCategorias(),
          l.desde && l.hasta ? candidatosCruce(l.desde, l.hasta, l.movimientos.map((m) => m.monto)) : Promise.resolve([]),
        ]);
        if (id !== consultaLectura) return;
        const tipoDe = (cid: number) => categorias.find((x) => x.id === cid)?.tipo;
        const nuevas = proponerFilas(l, c, cs, existentes, hs, crearCategorizador(reglas, hist, tipoDe));
        cruzar(nuevas, c, candidatos, cs);
        lectura = l;
        filas = nuevas;
      } catch (e) {
        errorLectura = e instanceof Error ? e.message : String(e);
      }
    })();
  });

  async function aprender() {
    const elegidas = aprendibles.filter((a) => a.elegida);
    try {
      for (const a of elegidas) await guardarRegla(a.patron, a.categoriaId, "comercio");
      aviso = `${elegidas.length} ${elegidas.length === 1 ? "regla aprendida" : "reglas aprendidas"}. La próxima vez esos comercios llegan categorizados.`;
      aprendibles = [];
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const nombreCategoria = (id: number) => categorias.find((c) => c.id === id)?.nombre ?? "";

  function alternarTodas() {
    const valor = !todas;
    for (const f of filas) if (!f.existe) f.incluir = valor;
  }

  function cambiarTipo(f: FilaImport, t: FilaImport["tipo"]) {
    f.tipo = t;
    f.categoriaId = null;
    f.sugerida = null;
    if (t !== "transferencia") f.contraparteId = null;
  }

  /** La fila se une con su otro lado en vez de insertarse como movimiento nuevo. */
  const seConvierte = (f: FilaImport) =>
    f.incluir && f.cruce?.accion === "convertir" && f.tipo === "transferencia" && f.contraparteId === f.cruce.cuentaId;

  const catsDe = (f: FilaImport) =>
    categoriasOrdenadas.filter((c) => c.tipo === (f.tipo === "ingreso" ? "ingreso" : "egreso"));

  function aMovimiento(f: FilaImport, cuentaId: number): MovimientoImport {
    const transf = f.tipo === "transferencia";
    // Transferencia: si es cargo sale de esta cuenta hacia la otra; si es abono, entra desde la otra.
    const [origen, destino] = !transf ? [cuentaId, null] : f.sentido === "cargo" ? [cuentaId, f.contraparteId] : [f.contraparteId!, cuentaId];
    return {
      huella: f.huella, fecha: f.fecha, monto: f.monto, tipo: f.tipo,
      cuenta_id: origen, cuenta_destino_id: destino, categoria_id: transf ? null : f.categoriaId,
      comercio: f.comercio.trim() || null, notas: f.descripcion,
    };
  }

  async function importar() {
    if (!cuenta || !formato || !lectura || importando) return;
    importando = true; error = "";
    try {
      const nuevos = elegidas.filter((f) => !seConvierte(f));
      const convertir = elegidas.filter(seConvierte);
      const enlazar = filas.filter((f) => !f.incluir && f.cruce?.accion === "enlazar");
      const movs = nuevos.map((f) => aMovimiento(f, cuenta.id));
      const impId = previa?.id ?? await crearImportacion({
        archivo: nombre, huella_archivo: huella, banco: formato.id, cuenta_id: cuenta.id,
        desde: lectura.desde, hasta: lectura.hasta, movimientos: 0,
      });
      const n = await insertarMovimientos(impId, movs);
      for (const f of convertir) {
        const [origen, destino] = f.sentido === "cargo" ? [cuenta.id, f.contraparteId!] : [f.contraparteId!, cuenta.id];
        await convertirEnTransferencia(f.cruce!.txId, origen, destino, f.huella, impId);
      }
      for (const f of enlazar) await enlazarMovimiento(f.cruce!.txId, f.huella, impId);

      // Categorías que elegiste distintas de la sugerida → proponer aprenderlas.
      const porPatron = new Map<string, Aprendible>();
      for (const f of nuevos)
        if (f.tipo !== "transferencia" && f.categoriaId != null && f.categoriaId !== f.sugerida?.categoriaId) {
          const patron = normalizarPatron(f.comercio);
          if (patron) porPatron.set(patron, { comercio: f.comercio.trim(), patron, categoriaId: f.categoriaId, elegida: true });
        }

      const omitidos = movs.length - n;
      const archivo = nombre;
      reiniciar();
      aprendibles = [...porPatron.values()];
      const partes = [`${n} ${n === 1 ? "movimiento nuevo" : "movimientos nuevos"}`];
      if (convertir.length) partes.push(`${convertir.length} ${convertir.length === 1 ? "unido como transferencia" : "unidos como transferencias"}`);
      if (enlazar.length) partes.push(`${enlazar.length} ya ${enlazar.length === 1 ? "registrado" : "registrados"}`);
      if (omitidos) partes.push(`${omitidos} ya ${omitidos === 1 ? "existía" : "existían"}`);
      aviso = `«${archivo}» importado: ${partes.join(", ")}.`;
      await cargar();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      importando = false;
    }
  }

  async function cargar() {
    try {
      [cuentas, historial, categorias, plantillas] = await Promise.all([listarCuentas(true), listarImportaciones(), listarCategorias(), listarPlantillas()]);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  onMount(cargar);

  function reiniciar() {
    estado = "inicio"; error = ""; aviso = ""; nombre = ""; bytes = null; huella = ""; previa = null; doc = null;
    formatoId = ""; cuentaId = null; ultimos4 = null; clave = ""; recordar = false; errorClave = ""; claveEscrita = "";
    verTexto = false; sinDatos = true; copiado = false; lectura = null; filas = []; errorLectura = ""; asistente = false;
    if (entrada) entrada.value = "";
  }

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    reiniciar();
    // Una foto es una factura: se lee en Transacciones.
    if (archivo.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp)$/i.test(archivo.name)) {
      dejarFactura(archivo);
      goto("/transacciones?factura=1");
      return;
    }
    const t = tipoArchivo(archivo.name);
    if (!t) { error = "Ese tipo de archivo no se puede importar. Usa PDF, Excel (.xlsx, .xls), CSV o una foto de factura."; return; }
    nombre = archivo.name; tipo = t; estado = "leyendo"; aprendibles = [];
    try {
      bytes = new Uint8Array(await archivo.arrayBuffer());
      huella = await huellaArchivo(bytes);
      previa = await importacionPorHuella(huella);
      await abrir();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      estado = "inicio";
    }
  }

  /** Abre el archivo; si tiene clave, prueba primero las guardadas en el llavero. */
  async function abrir() {
    try {
      listo(await leerDocumento(bytes!, tipo));
    } catch (e) {
      if (!(e instanceof ClaveRequerida)) throw e;
      for (const g of await clavesGuardadas().catch(() => [])) {
        try { listo(await leerDocumento(bytes!, tipo, g.clave)); return; } catch { /* siguiente */ }
      }
      estado = "clave";
    }
  }

  async function enviarClave(ev: SubmitEvent) {
    ev.preventDefault();
    if (!clave) return;
    errorClave = "";
    try {
      const d = await leerDocumento(bytes!, tipo, clave);
      claveEscrita = clave;
      listo(d);
      if (recordar) {
        if (formato) {
          await guardarClave(formato.id, claveEscrita)
            .then(() => (aviso = `Clave guardada en el Llavero para ${formato!.nombre}.`))
            .catch(() => (aviso = "No se pudo guardar la clave en el Llavero; te la pediremos la próxima vez."));
        } else aviso = "No se reconoció el banco, así que la clave no se guardó.";
      }
    } catch (e) {
      if (e instanceof ClaveRequerida) errorClave = "La clave no es correcta. Revísala e intenta de nuevo.";
      else { error = e instanceof Error ? e.message : String(e); estado = "inicio"; }
    }
  }

  function listo(d: Documento) {
    doc = d;
    const det = detectar(d, cuentas, plantillas);
    formatoId = det.formato?.id ?? "";
    cuentaId = det.cuentaId;
    ultimos4 = det.ultimos4;
    estado = "listo";
  }

  async function copiar() {
    await navigator.clipboard.writeText(texto);
    copiado = true;
    setTimeout(() => (copiado = false), 2000);
  }

  async function deshacer(i: Importacion) {
    try {
      const n = await deshacerImportacion(i.id);
      aviso = `Se deshizo «${i.archivo}»: ${n} ${n === 1 ? "movimiento borrado" : "movimientos borrados"}.`;
      confirmarId = null;
      if (previa?.id === i.id) previa = null;
      await cargar();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    arrastrando = false;
    elegir(e.dataTransfer?.files[0]);
  }
</script>

<header class="encabezado">
  <div>
    <h1 class="titulo-pantalla">Importar</h1>
    <p class="caption">Extractos de BBVA y Nequi en PDF, Excel o CSV. Todo se lee en tu equipo.</p>
  </div>
  {#if estado !== "inicio"}
    <div class="encabezado-acciones">
      <button class="cf-btn cf-btn--secondary" onclick={reiniciar}><Icono nombre="cerrar" />Otro archivo</button>
    </div>
  {/if}
</header>

{#if error}<p class="error-form" role="alert">{error}</p>{/if}
{#if aviso}<p class="aviso" role="status">{aviso}</p>{/if}

{#if aprendibles.length && estado === "inicio"}
  <section class="cf-glass cf-card aprender" aria-labelledby="t-aprender">
    <div>
      <h2 id="t-aprender" class="cf-card-title">¿Aprender estas reglas?</h2>
      <p class="caption">Elegiste estas categorías. Si las aprendes, la próxima vez esos comercios llegan categorizados.</p>
    </div>
    <ul>
      {#each aprendibles as a (a.patron)}
        <li><label class="interruptor compacto"><input type="checkbox" bind:checked={a.elegida} />
          <span><b>{a.comercio}</b> → {nombreCategoria(a.categoriaId)}</span></label></li>
      {/each}
    </ul>
    <div class="acciones">
      <button class="cf-btn cf-btn--primary" onclick={aprender} disabled={!aprendibles.some((a) => a.elegida)}>Aprender</button>
      <button class="cf-btn cf-btn--ghost" onclick={() => (aprendibles = [])}>Ahora no</button>
    </div>
  </section>
{/if}

<input bind:this={entrada} type="file" accept=".pdf,.xlsx,.xls,.xlsm,.ods,.csv,.txt,image/*,.heic,.heif" class="cf-sr" tabindex="-1"
  onchange={(e) => elegir(e.currentTarget.files?.[0])} />

{#if estado === "inicio"}
  <button class="zona cf-glass" class:arrastrando
    onclick={() => entrada.click()}
    ondragover={(e) => { e.preventDefault(); arrastrando = true; }}
    ondragleave={() => (arrastrando = false)}
    ondrop={soltar}>
    <span class="cf-tile cf-tile--brand"><Icono nombre="importar" /></span>
    <b>Suelta aquí tu extracto</b>
    <span class="cf-muted">o haz clic para elegirlo · PDF, XLSX, XLS, CSV o foto de una factura</span>
  </button>

{:else if estado === "leyendo"}
  <section class="cf-glass cf-card"><p class="cf-muted">Leyendo «{nombre}»…</p></section>

{:else if estado === "clave"}
  <section class="cf-glass cf-card clave">
    <div class="fila-titulo">
      <span class="cf-tile cf-tile--brand"><Icono nombre="candado" /></span>
      <div>
        <h2 class="cf-card-title">Este extracto tiene clave</h2>
        <p class="caption">{nombre} · suele ser tu número de cédula.</p>
      </div>
    </div>
    <form onsubmit={enviarClave} class="form-clave">
      <label class="campo">
        <span class="etiqueta">Clave del PDF</span>
        <span class="cf-field">
          <Icono nombre="candado" />
          <!-- svelte-ignore a11y_autofocus -->
          <input type="password" bind:value={clave} autocomplete="off" autofocus />
        </span>
        {#if errorClave}<span class="ayuda cf-amt-expense" role="alert">{errorClave}</span>{/if}
      </label>
      {#if esEscritorio}
        <label class="interruptor">
          <input type="checkbox" bind:checked={recordar} />
          <span>Recordar para este banco <small>Se guarda en el Llavero de macOS, no en Cofre.</small></span>
        </label>
      {/if}
      <div><button class="cf-btn cf-btn--primary" type="submit" disabled={!clave}>Abrir extracto</button></div>
    </form>
  </section>

{:else if estado === "listo" && doc}
  {#if previa}
    <p class="error-form" role="alert">
      Este archivo ya se importó el {fechaCorta(previa.creado_en.slice(0, 10))}
      {previa.cuenta_nombre ? `en ${previa.cuenta_nombre}` : ""} ({previa.movimientos} movimientos).
      Si lo vuelves a importar no se duplicará nada.
    </p>
  {/if}

  <section class="cf-glass cf-card">
    <div class="fila-titulo">
      <span class="cf-tile cf-tile--brand"><Icono nombre="documento" /></span>
      <div>
        <h2 class="cf-card-title">{nombre}</h2>
        <p class="caption">
          {doc.tipo === "pdf" ? `${doc.paginas.length} ${doc.paginas.length === 1 ? "página" : "páginas"}` : `${doc.hojas.length} ${doc.hojas.length === 1 ? "hoja" : "hojas"}`}
          · {nLineas} líneas de texto
          {#if ultimos4}· termina en {ultimos4}{/if}
        </p>
      </div>
    </div>

    <div class="selecciones">
      <label class="campo">
        <span class="etiqueta">Formato</span>
        <span class="cf-field">
          <select bind:value={formatoId}>
            <option value="">No reconocido</option>
            {#each todosLosFormatos(plantillas) as f (f.id)}<option value={f.id}>{f.nombre}</option>{/each}
          </select>
        </span>
        <span class="ayuda">{formato ? "Reconocido automáticamente; cámbialo si no es." : "Si no está en la lista, enséñale este formato a Cofre."}</span>
      </label>
      <label class="campo">
        <span class="etiqueta">Cuenta</span>
        <span class="cf-field">
          <select bind:value={cuentaId}>
            <option value={null}>Elige la cuenta</option>
            {#each cuentasSugeridas as c (c.id)}<option value={c.id}>{c.nombre}{c.ultimos4 ? ` · ${c.ultimos4}` : ""}</option>{/each}
          </select>
        </span>
        <span class="ayuda">
          {#if cuentaId == null && ultimos4}Ninguna cuenta termina en {ultimos4}. Agrégale esos dígitos en Cuentas para que se reconozca sola.
          {:else}Se reconoce por los últimos 4 dígitos.{/if}
        </span>
      </label>
    </div>
  </section>

  {#if asistente}
    <AsistentePlantilla {doc} cuentas={cuentasActivas} plantilla={formato?.plantilla ?? null}
      cancelar={() => (asistente = false)} guardado={plantillaGuardada} />
  {:else}
  <section class="cf-glass cf-card">
    <div class="seccion-cab">
      <div>
        <h2 class="cf-card-title">Movimientos</h2>
        {#if lectura}
          <p class="caption">
            {filas.length} leídos{lectura.desde && lectura.hasta ? ` · ${fechaCorta(lectura.desde)} – ${fechaCorta(lectura.hasta)}` : ""}
            · {elegidas.length} para importar
          </p>
        {/if}
      </div>
      <button class="cf-btn cf-btn--primary" onclick={importar}
        disabled={!lectura || !elegidas.length || transferSinCuenta > 0 || importando}>
        <Icono nombre="importar" />{importando ? "Importando…" : `Importar ${elegidas.length || ""}`}
      </button>
    </div>

    {#if formato?.plantilla}
      <p class="caption">Formato enseñado por ti. <button class="enlace" onclick={() => (asistente = true)}>Ajustar columnas</button></p>
    {/if}
    {#if !formato}
      <div class="ensenar">
        <p class="cf-muted">Cofre no reconoce este extracto. Elige el formato en la lista o enséñaselo: marcas las columnas una vez y la próxima vez lo lee solo.</p>
        <button class="cf-btn cf-btn--primary" onclick={() => (asistente = true)}><Icono nombre="mas" />Enseñarle este formato</button>
      </div>
    {:else if !cuenta}
      <p class="cf-muted">Elige a qué cuenta pertenece este extracto.</p>
    {:else if errorLectura}
      <p class="error-form" role="alert">{errorLectura}</p>
    {:else if lectura}
      <div class="validacion" class:ok={lectura.validacion.ok}>
        <span class="cf-chip cf-chip--sm {lectura.validacion.ok ? 'cf-chip--income' : 'cf-chip--warn-90'}">
          {lectura.validacion.ok ? "Cuadra con el extracto" : "Revisar"}
        </span>
        <ul>{#each lectura.validacion.mensajes as m}<li>{m}</li>{/each}</ul>
      </div>
      {#if transferSinCuenta}
        <p class="error-form" role="alert">
          {transferSinCuenta} {transferSinCuenta === 1 ? "transferencia no tiene" : "transferencias no tienen"} la otra cuenta. Elígela o cámbiale el tipo.
        </p>
      {/if}

      <div class="tabla" role="table" aria-label="Movimientos del extracto">
        <div class="fila cab" role="row">
          <span role="columnheader"><input type="checkbox" checked={todas} onchange={alternarTodas} aria-label="Seleccionar todos" /></span>
          <span role="columnheader">Fecha</span>
          <span role="columnheader">Comercio</span>
          <span role="columnheader">Tipo</span>
          <span role="columnheader">Categoría / cuenta</span>
          <span role="columnheader" class="der">Monto</span>
        </div>
        {#each filas as f (f.huella)}
          <div class="fila" class:apagada={!f.incluir} class:no-cuadra={f.cuadra === false} role="row">
            <span role="cell"><input type="checkbox" bind:checked={f.incluir} disabled={f.existe} aria-label="Incluir {f.comercio}" /></span>
            <span role="cell" class="caption">{fechaCorta(f.fecha)}</span>
            <span role="cell" class="comercio">
              <input class="en-linea" bind:value={f.comercio} aria-label="Comercio" />
              <span class="caption desc" title={f.descripcion}>{f.descripcion}</span>
              {#if f.nota}<span class="cf-chip cf-chip--sm {f.existe || f.cruce ? 'cf-chip--brand' : 'cf-chip--warn-80'}">{f.nota}</span>{/if}
              {#if f.cuadra === false}<span class="cf-chip cf-chip--sm cf-chip--over-100">No cuadra con el saldo</span>{/if}
            </span>
            <span role="cell">
              <select class="en-linea" value={f.tipo} onchange={(e) => cambiarTipo(f, e.currentTarget.value as FilaImport["tipo"])} aria-label="Tipo">
                <option value="egreso">Egreso</option>
                <option value="ingreso">Ingreso</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </span>
            <span role="cell">
              {#if f.tipo === "transferencia"}
                <select class="en-linea" bind:value={f.contraparteId} aria-label={f.sentido === "cargo" ? "Hacia la cuenta" : "Desde la cuenta"}>
                  <option value={null}>{f.sentido === "cargo" ? "Hacia…" : "Desde…"}</option>
                  {#each cuentasActivas.filter((c) => c.id !== cuentaId) as c (c.id)}<option value={c.id}>{f.sentido === "cargo" ? "→" : "←"} {c.nombre}</option>{/each}
                </select>
              {:else}
                <select class="en-linea" value={f.categoriaId ?? ""} onchange={(e) => { elegirCategoria(f, e.currentTarget.value); e.currentTarget.value = String(f.categoriaId ?? ""); }} aria-label="Categoría">
                  <option value="">Sin categoría</option>
                  {#each catsDe(f) as c (c.id)}<option value={c.id}>{c.etiqueta}</option>{/each}
                  <option value={NUEVA}>+ Nueva categoría…</option>
                </select>
                {#if f.sugerida && f.categoriaId === f.sugerida.categoriaId}
                  <span class="caption sugerida" title="Sugerida por {f.sugerida.detalle}">Sugerida · {f.sugerida.detalle}</span>
                {/if}
              {/if}
            </span>
            <span role="cell" class="der monto"
              class:cf-amt-income={f.tipo === "ingreso"} class:cf-amt-expense={f.tipo === "egreso"}>
              {pesos(f.monto, f.tipo === "ingreso" ? "+" : f.tipo === "egreso" ? "−" : undefined)}
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="cf-muted">Leyendo movimientos…</p>
    {/if}

    <div class="texto-cab">
      <button class="cf-btn cf-btn--ghost" onclick={() => (verTexto = !verTexto)} aria-expanded={verTexto}>
        <Icono nombre={verTexto ? "ojoTachado" : "ojo"} />{verTexto ? "Ocultar" : "Ver"} texto extraído
      </button>
      {#if verTexto}
        <label class="interruptor compacto">
          <input type="checkbox" bind:checked={sinDatos} />
          <span>Ocultar números de cuenta y documentos</span>
        </label>
        <button class="cf-btn cf-btn--secondary" onclick={copiar}><Icono nombre="copiar" />{copiado ? "Copiado" : "Copiar"}</button>
      {/if}
    </div>
    {#if verTexto}
      <pre class="texto">{texto}</pre>
      <p class="caption">Los nombres de personas no se ocultan: revísalos antes de compartir el texto.</p>
    {/if}
  </section>
  {/if}
{/if}

{#if plantillas.length}
  <section class="cf-glass cf-card">
    <div class="seccion-cab">
      <h2 class="cf-card-title">Formatos que enseñaste</h2>
      <span class="caption">Para ajustarlos, abre un extracto de ese banco.</span>
    </div>
    <ul class="historial">
      {#each plantillas as p (p.id)}
        <li>
          <span class="cf-tile cf-tile--brand"><Icono nombre="documento" /></span>
          <div class="h-info">
            <b>{p.nombre}</b>
            <span class="caption">{p.documento === "pdf" ? "PDF" : "Hoja de cálculo"} · reconoce «{p.frase}»{p.cuenta_id ? ` · ${cuentas.find((c) => c.id === p.cuenta_id)?.nombre ?? ""}` : ""}</span>
          </div>
          {#if borrarPlantillaId === p.id}
            <div class="confirmar" role="alertdialog" aria-label="Borrar {p.nombre}">
              <span class="caption">¿Borrar el formato?</span>
              <button class="cf-btn cf-btn--peligro" onclick={() => quitarPlantilla(p)}>Borrar</button>
              <button class="cf-btn cf-btn--ghost" onclick={() => (borrarPlantillaId = null)}>Cancelar</button>
            </div>
          {:else}
            <button class="cf-btn cf-btn--icon" onclick={() => (borrarPlantillaId = p.id)} aria-label="Borrar formato {p.nombre}" title="Borrar"><Icono nombre="papelera" /></button>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<section class="cf-glass cf-card">
  <div class="seccion-cab">
    <h2 class="cf-card-title">Historial</h2>
    <span class="caption">{historial.length} {historial.length === 1 ? "importación" : "importaciones"}</span>
  </div>
  {#if !historial.length}
    <p class="cf-muted">Aún no has importado extractos.</p>
  {:else}
    <ul class="historial">
      {#each historial as i (i.id)}
        <li>
          <span class="cf-tile cf-tile--brand"><Icono nombre="documento" /></span>
          <div class="h-info">
            <b>{i.archivo}</b>
            <span class="caption">
              {formatoPorId(i.banco, plantillas)?.nombre ?? i.banco}{i.cuenta_nombre ? ` · ${i.cuenta_nombre}` : ""}
              {#if i.desde && i.hasta}· {fechaCorta(i.desde)} – {fechaCorta(i.hasta)}{/if}
              · {i.vigentes} de {i.movimientos} movimientos · {fechaCorta(i.creado_en.slice(0, 10))}
            </span>
          </div>
          {#if confirmarId === i.id}
            <div class="confirmar" role="alertdialog" aria-label="Deshacer {i.archivo}">
              <span class="caption">¿Borrar sus {i.vigentes} movimientos?</span>
              <button class="cf-btn cf-btn--peligro" onclick={() => deshacer(i)}>Deshacer</button>
              <button class="cf-btn cf-btn--ghost" onclick={() => (confirmarId = null)}>Cancelar</button>
            </div>
          {:else}
            <button class="cf-btn cf-btn--ghost" onclick={() => (confirmarId = i.id)}><Icono nombre="deshacer" />Deshacer</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<FormCategoria abierto={panelCategoria} categoria={null} {categorias}
  tipoInicial={filaNueva?.tipo === "ingreso" ? "ingreso" : "egreso"}
  cerrar={() => (panelCategoria = false)} listo={categoriaCreada} />

<style>
  .aviso { padding: 10px 14px; border-radius: var(--r-md); background: var(--primary-soft); color: var(--primary-text); font-size: 13px; font-weight: 500; align-self: flex-start; }
  .zona {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2);
    min-height: 220px; padding: var(--space-6); border-radius: var(--r-xl); cursor: pointer; text-align: center;
    border: 1.5px dashed var(--primary); color: var(--ink); font: inherit;
    transition: background-color .15s, transform .15s;
  }
  .zona b { font: 650 18px/24px var(--font-display); }
  .zona:hover, .zona.arrastrando { background: var(--primary-soft); }
  .zona.arrastrando { transform: scale(1.01); }
  .zona:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .cf-card { gap: var(--space-4); }
  .fila-titulo { display: flex; align-items: center; gap: var(--space-3); }
  .fila-titulo .cf-card-title { overflow-wrap: anywhere; }
  .clave { max-width: 520px; }
  .form-clave { display: flex; flex-direction: column; gap: var(--space-4); }
  .selecciones { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
  .seccion-cab { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
  .texto-cab { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .interruptor.compacto { flex: 1; }
  .texto {
    max-height: 420px; overflow: auto; margin: 0; padding: var(--space-4); border-radius: var(--r-md);
    background: var(--input); border: 1px solid var(--glass-border);
    font: 400 12px/18px var(--font-mono); color: var(--ink); white-space: pre;
  }
  .historial { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .historial li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--line); }
  .historial li:first-child { border-top: 0; }
  .h-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .h-info b { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .confirmar { display: flex; align-items: center; gap: var(--space-2); }

  .validacion { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3); border-radius: var(--r-md); background: var(--warn-90-soft); }
  .validacion.ok { background: var(--income-soft); }
  .validacion ul { margin: 0; padding: 0; list-style: none; font-size: 13px; line-height: 18px; color: var(--ink); }
  .tabla { display: flex; flex-direction: column; }
  .fila {
    display: grid; grid-template-columns: 28px 72px minmax(0, 1fr) 150px 200px 130px;
    gap: var(--space-3); align-items: center; padding: 8px 4px; border-bottom: 1px solid var(--line);
  }
  .fila.cab { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); padding-top: 0; }
  .fila.apagada > :not(:first-child) { opacity: .45; }
  .fila.no-cuadra { background: var(--over-100-soft); border-radius: var(--r-sm); }
  .comercio { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
  .comercio .desc { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .en-linea {
    width: 100%; min-width: 0; padding: 4px 6px; margin-left: -6px; border: 1px solid transparent; border-radius: var(--r-sm);
    background: transparent; font: 600 14px/20px var(--font-sans); color: var(--ink);
  }
  select.en-linea { font-weight: 500; font-size: 13px; cursor: pointer; }
  .en-linea:hover { border-color: var(--line); background: var(--input); }
  .en-linea:focus-visible { outline: 2px solid var(--primary); outline-offset: 0; background: var(--input); }
  .der { text-align: right; }
  .ensenar { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3); }
  .enlace { border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--primary-text); cursor: pointer; text-decoration: underline; }
  .sugerida { display: block; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--primary-text); }
  .aprender ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .aprender .acciones { display: flex; gap: var(--space-2); }
  .monto { font-size: 14px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
</style>
