<script lang="ts">
  import CampoFecha from "$lib/ui/CampoFecha.svelte";
  import { tick, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import Panel from "$lib/ui/Panel.svelte";
  import Icono from "$lib/Icono.svelte";
  import CampoMonto from "$lib/ui/CampoMonto.svelte";
  import CampoEtiquetas from "$lib/ui/CampoEtiquetas.svelte";
  import ElegirFoto from "$lib/ui/ElegirFoto.svelte";
  import VisorFoto from "$lib/ui/VisorFoto.svelte";
  import { hoy, leerMonto, monto as fmtMonto, montoEditable, pesos } from "$lib/formato";
  import { fechaCorta } from "$lib/periodo";
  import {
    crearTransaccion, editarTransaccion, eliminarTransacciones, sugerencias, sugerenciasFrecuentes, claseTesela, leerTrm,
    calcularPlan, compraDeTransaccion, guardarPlan, borrarPlanes, cobraInteres,
    marcarFactura, recordarComercioNit, ponerAdjunto, ultimaCuentaUsada, recordarUltimaCuenta,
    type Categoria, type Cuenta, type Sugerencia, type TipoTx, type Transaccion, type TransaccionNueva,
  } from "$lib/datos";
  import type { Prellenado } from "$lib/facturas/LectorFactura.svelte";
  import { comprimirFoto, canvasDeArchivo } from "$lib/adjuntos/comprimir";
  import { guardarAdjunto, leerAdjunto } from "$lib/adjuntos/archivos";
  import { pantalla } from "$lib/pantalla.svelte";

  let { abierto, transaccion, cuentas, categorias, etiquetas, cerrar, listo, prellenado = null, factura: abrirFactura }: {
    abierto: boolean;
    /** null = movimiento nuevo */
    transaccion: Transaccion | null;
    /** Cuentas activas. */
    cuentas: Cuenta[];
    categorias: Categoria[];
    /** Nombres de etiquetas existentes. */
    etiquetas: string[];
    cerrar: () => void;
    listo: (mensaje: string) => void;
    /** Datos leídos de una factura para un movimiento nuevo. */
    prellenado?: Prellenado | null;
    /** Celular: botón «Factura» (foto → lector → este formulario prellenado). */
    factura?: (archivo: File) => void;
  } = $props();

  const tipos: { id: TipoTx; nombre: string }[] = [
    { id: "egreso", nombre: "Egreso" },
    { id: "ingreso", nombre: "Ingreso" },
    { id: "transferencia", nombre: "Transferencia" },
  ];

  let tipo = $state<TipoTx>("egreso");
  let monto = $state("");
  let comercio = $state("");
  let categoriaId = $state<number | null>(null);
  let cuentaId = $state<number | null>(null);
  let destinoId = $state<number | null>(null);
  let montoDestino = $state("");
  /** true cuando la persona escribió el monto de destino (deja de calcularse con la TRM). */
  let destinoManual = $state(false);
  /** Pesos por dólar, configurada en Cuentas. */
  let trm = $state<number | null>(null);
  let fecha = $state(hoy());
  let etiquetasSel = $state<string[]>([]);
  let notas = $state("");
  let masDetalles = $state(false);
  let error = $state("");
  let guardado = $state("");
  let guardando = $state(false);
  let confirmarEliminar = $state(false);
  let campoMonto = $state<HTMLInputElement>();

  // Compras a cuotas (egreso con tarjeta de crédito)
  const opcionesCuotas = [1, 3, 6, 12, 18, 24, 36, 48];
  let numCuotas = $state(1);
  let otraCuota = $state(false);
  let internacional = $state(false);

  // Sugerencias de movimientos anteriores
  let lista = $state<Sugerencia[]>([]);
  let verLista = $state(false);
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  const transf = $derived(tipo === "transferencia");
  const cuenta = $derived(cuentas.find((c) => c.id === cuentaId));
  const destino = $derived(cuentas.find((c) => c.id === destinoId));
  const otraMoneda = $derived(transf && !!cuenta && !!destino && cuenta.moneda !== destino.moneda);
  const cats = $derived(categorias.filter((c) => c.tipo === tipo));
  const tarjetas = $derived(cuentas.filter((c) => c.tipo === "credito"));

  // ---------- Celular ----------
  /** Comercios frecuentes para las sugerencias cuando aún no se escribe nada. */
  let frecuentes = $state<Sugerencia[]>([]);
  let todasCats = $state(false);
  const chipsSug = $derived(comercio.trim().length >= 2 ? lista : frecuentes);
  /** Categorías en botones: las más usadas (y la elegida), o todas con «Más». */
  const catsBotones = $derived.by(() => {
    const orden = [...cats].sort((a, b) => b.num_movimientos - a.num_movimientos);
    if (todasCats) return cats;
    const top = orden.slice(0, 7);
    const elegida = cats.find((c) => c.id === categoriaId);
    if (elegida && !top.includes(elegida)) top[6] = elegida;
    return top;
  });
  function elegirFactura(f: File | undefined) {
    if (f && abrirFactura) { cerrar(); abrirFactura(f); }
  }

  const compraTarjeta = $derived(tipo === "egreso" && cuenta?.tipo === "credito");
  /** Plan calculado en vivo (null si no aplica o no hay monto). */
  const plan = $derived.by(() => {
    if (!compraTarjeta || !cuenta) return null;
    const m = leerMonto(monto);
    if (!m || m <= 0 || numCuotas < 1) return null;
    return calcularPlan(Math.abs(m), numCuotas, internacional, cuenta, fecha);
  });
  const pct = (v: number, d = 2) => (v * 100).toLocaleString("es-CO", { maximumFractionDigits: d });

  /** Tasa implícita en transferencias entre monedas: «1 USD = $ 4.000». */
  const tasa = $derived.by(() => {
    if (!otraMoneda || !cuenta || !destino) return "";
    const a = leerMonto(monto), b = leerMonto(montoDestino);
    if (!a || !b) return "";
    const [cop, usd] = cuenta.moneda === "COP" ? [a, b] : [b, a];
    return `1 USD = ${fmtMonto(Math.round((cop / usd) * 100), "COP")}`;
  });

  /**
   * ¿Este egreso parece un pago de tarjeta? Por texto («pago tarjeta», «pago TC»…)
   * o por los últimos 4 dígitos de una tarjeta.
   */
  const tarjetaSugerida = $derived.by(() => {
    if (tipo !== "egreso" || !comercio.trim() || cuenta?.tipo === "credito") return null;
    const t = comercio.toLowerCase();
    const porDigitos = tarjetas.find((c) => c.ultimos4 && t.includes(c.ultimos4));
    if (porDigitos) return porDigitos;
    if (!/pago\s+(de\s+)?(la\s+)?(tarjeta|tc|tdc|t\.?\s?c\.?)\b/.test(t)) return null;
    return tarjetas.find((c) => t.includes(c.nombre.toLowerCase())) ?? tarjetas[0] ?? null;
  });

  /** Última cuenta usada si sigue activa; si no, la principal o la primera. */
  function principalOPrimera() {
    const ultima = ultimaCuentaUsada();
    const u = ultima != null ? cuentas.find((c) => c.id === ultima && !c.archivada) : undefined;
    return (u ?? cuentas.find((c) => c.principal) ?? cuentas[0])?.id ?? null;
  }

  // ---------- Foto adjunta (WebP en la carpeta de la app) ----------
  let fotoNueva = $state.raw<Uint8Array<ArrayBuffer> | null>(null);
  let fotoActual = $state<string | null>(null);
  let quitarFoto = $state(false);
  let vistaFoto = $state<string | null>(null);
  let fotoGrande = $state(false);
  let comprimiendo = $state(false);
  let entradaAdjunto = $state<HTMLInputElement>();

  function mostrarFoto(b: Blob | null) {
    if (vistaFoto) URL.revokeObjectURL(vistaFoto);
    vistaFoto = b ? URL.createObjectURL(b) : null;
  }

  function reiniciarFoto(t: Transaccion | null) {
    fotoNueva = null;
    quitarFoto = false;
    fotoGrande = false;
    fotoActual = t?.adjunto ?? null;
    mostrarFoto(null);
    if (fotoActual) {
      const nombre = fotoActual;
      leerAdjunto(nombre).then((b) => { if (fotoActual === nombre) mostrarFoto(b); }).catch(() => {});
    }
  }

  async function adjuntarCanvas(c: HTMLCanvasElement) {
    comprimiendo = true;
    try {
      const bytes = await comprimirFoto(c);
      fotoNueva = bytes;
      quitarFoto = false;
      mostrarFoto(new Blob([bytes], { type: "image/webp" }));
    } catch (e) {
      error = "No se pudo preparar la foto: " + (e instanceof Error ? e.message : String(e));
    } finally {
      comprimiendo = false;
    }
  }

  async function elegirAdjunto(f: File | undefined) {
    if (entradaAdjunto) entradaAdjunto.value = "";
    if (!f) return;
    try {
      await adjuntarCanvas(await canvasDeArchivo(f));
    } catch {
      error = "No se pudo abrir esa imagen.";
    }
  }

  function quitarAdjunto() {
    fotoNueva = null;
    quitarFoto = !!fotoActual;
    fotoGrande = false;
    mostrarFoto(null);
  }

  const pesoFoto = $derived(fotoNueva ? `${Math.max(1, Math.round(fotoNueva.byteLength / 1024))} KB` : "");

  /** Guarda o quita la foto del movimiento ya guardado. */
  async function guardarFoto(id: number) {
    if (fotoNueva) await ponerAdjunto(id, await guardarAdjunto(fotoNueva));
    else if (quitarFoto) await ponerAdjunto(id, null);
  }

  function limpiar(mantener: boolean) {
    monto = "";
    montoDestino = "";
    destinoManual = false;
    comercio = "";
    categoriaId = null;
    etiquetasSel = [];
    numCuotas = 1;
    otraCuota = false;
    internacional = false;
    notas = "";
    lista = [];
    verLista = false;
    error = "";
    confirmarEliminar = false;
    reiniciarFoto(null);
    if (!mantener) {
      tipo = "egreso";
      cuentaId = principalOPrimera();
      destinoId = null;
      fecha = hoy();
      masDetalles = false;
      guardado = "";
    }
  }

  // Solo al abrir o cambiar de movimiento; no cuando se recargan cuentas o categorías.
  $effect(() => {
    if (!abierto) return;
    const t = transaccion, p = prellenado;
    untrack(() => {
      cargarFormulario(t);
      if (!t && p) aplicarFactura(p);
    });
    leerTrm().then((v) => (trm = v)).catch(() => (trm = null));
    todasCats = false;
    // Después de que la hoja termina de subir (que la animación no se trabe).
    if (pantalla.celular && !t) setTimeout(() => sugerenciasFrecuentes().then((f) => (frecuentes = f)).catch(() => {}), 260);
  });

  /** Monto de destino calculado con la TRM (en centavos), o null si no se puede. */
  const destinoConTrm = $derived.by(() => {
    if (!otraMoneda || !trm || !cuenta) return null;
    const m = leerMonto(monto);
    if (!m) return null;
    return cuenta.moneda === "USD" ? Math.round(Math.abs(m) * trm) : Math.round(Math.abs(m) / trm);
  });

  // Mientras no se escriba a mano, el destino sigue a la TRM.
  $effect(() => {
    const v = destinoConTrm;
    if (untrack(() => destinoManual)) return;
    montoDestino = v == null ? "" : montoEditable(v);
  });

  function usarTrm() {
    destinoManual = false;
    if (destinoConTrm != null) montoDestino = montoEditable(destinoConTrm);
  }

  /** CUFE y NIT de la factura cargada; se usan una sola vez (al guardar ese movimiento). */
  let factura: Prellenado["factura"] | null = null;

  function aplicarFactura(p: Prellenado) {
    factura = p.factura;
    tipo = "egreso";
    if (p.monto != null) monto = montoEditable(p.monto);
    if (p.fecha) fecha = p.fecha;
    comercio = p.comercio;
    categoriaId = p.categoriaId;
    if (p.cuentaId != null) cuentaId = p.cuentaId;
    notas = p.notas;
    masDetalles = !!p.notas;
    if (p.foto) {
      masDetalles = true;
      adjuntarCanvas(p.foto);
    }
    if (p.cuotas) {
      numCuotas = p.cuotas.numCuotas;
      otraCuota = !opcionesCuotas.includes(p.cuotas.numCuotas);
      internacional = p.cuotas.internacional;
    }
  }

  function cargarFormulario(t: Transaccion | null) {
    factura = null;
    if (!t) {
      limpiar(false);
    } else {
      tipo = t.tipo;
      monto = montoEditable(t.monto);
      montoDestino = montoEditable(t.monto_destino);
      destinoManual = t.monto_destino != null; // se respeta lo guardado
      comercio = t.comercio ?? "";
      categoriaId = t.categoria_id;
      cuentaId = t.cuenta_id;
      destinoId = t.cuenta_destino_id;
      fecha = t.fecha;
      etiquetasSel = t.etiquetas.map((e) => e.nombre);
      reiniciarFoto(t);
      notas = t.notas ?? "";
      masDetalles = !!(t.etiquetas.length || t.notas);
      numCuotas = 1;
      otraCuota = false;
      internacional = false;
      // Si es una compra a cuotas, el campo muestra el monto sin comisión.
      compraDeTransaccion(t.id).then((c) => {
        if (!c || transaccion?.id !== t.id) return;
        numCuotas = c.num_cuotas;
        otraCuota = !opcionesCuotas.includes(c.num_cuotas);
        internacional = c.internacional;
        monto = montoEditable(c.monto_base);
      }).catch(() => {});
      error = "";
      guardado = "";
      confirmarEliminar = false;
      lista = [];
      verLista = false;
    }
    // En el celular el teclado sale solo al tocar el monto.
    if (!pantalla.celular) tick().then(() => campoMonto?.focus());
  }

  function elegirTipo(t: TipoTx) {
    tipo = t;
    // La categoría debe ser del tipo elegido; las transferencias no llevan.
    if (!categorias.some((c) => c.id === categoriaId && c.tipo === t)) categoriaId = null;
    if (t === "transferencia" && destinoId === cuentaId) destinoId = null;
  }

  function escribirComercio() {
    clearTimeout(temporizador);
    const texto = comercio.trim();
    if (texto.length < 2 || transaccion) {
      lista = [];
      verLista = false;
      return;
    }
    temporizador = setTimeout(async () => {
      lista = (await sugerencias(texto).catch(() => [])).filter((s) => s.comercio);
      verLista = lista.length > 0;
    }, 150);
  }

  /** Llena el formulario con un movimiento anterior; la fecha queda en hoy. */
  const conMontoEscrito = $derived((leerMonto(monto) ?? 0) > 0);

  function usarSugerencia(s: Sugerencia) {
    comercio = s.comercio;
    elegirTipo(s.tipo);
    // Con un monto ya escrito (o leído de una factura) solo se identifica el comercio:
    // se respetan monto, cuenta y fecha. Con el monto vacío se repite el movimiento completo.
    if (!conMontoEscrito) {
      monto = montoEditable(s.monto);
      if (cuentas.some((c) => c.id === s.cuenta_id)) cuentaId = s.cuenta_id;
      destinoId = s.cuenta_destino_id;
    } else if (s.tipo === "transferencia") {
      destinoId = s.cuenta_destino_id;
    }
    categoriaId = s.categoria_id;
    verLista = false;
  }

  function convertirEnPago() {
    const tarjeta = tarjetaSugerida; // se lee antes: al cambiar el tipo deja de sugerirse
    if (!tarjeta) return;
    tipo = "transferencia";
    destinoId = tarjeta.id;
    categoriaId = null;
  }

  function datos(): TransaccionNueva | null {
    const m = leerMonto(monto);
    if (m == null || m <= 0) return (error = "Escribe un monto mayor que cero."), null;
    if (cuentaId == null) return (error = "Elige una cuenta."), null;
    if (compraTarjeta && (numCuotas < 1 || numCuotas > 72 || !Number.isInteger(numCuotas)))
      return (error = "El número de cuotas va de 1 a 72."), null;
    return {
      // En compras con tarjeta, el movimiento es el capital (monto + comisión internacional).
      fecha, monto: plan ? plan.capital : Math.abs(m), tipo, cuenta_id: cuentaId,
      cuenta_destino_id: transf ? destinoId : null,
      categoria_id: transf ? null : categoriaId,
      comercio, notas, etiquetas: etiquetasSel,
      monto_destino: otraMoneda ? Math.abs(leerMonto(montoDestino) ?? 0) || null : null,
    };
  }

  async function guardar(otro: boolean) {
    error = "";
    const d = datos();
    if (!d) return;
    guardando = true;
    try {
      let id: number;
      if (transaccion) {
        await editarTransaccion(transaccion.id, d);
        id = transaccion.id;
      } else {
        id = await crearTransaccion(d);
        await recordarUltimaCuenta(d.cuenta_id);
        // Desde factura: CUFE para no repetirla y el nombre que le diste a ese NIT.
        const fac = factura;
        factura = null;
        if (fac?.cufe) await marcarFactura(id, fac.cufe);
        if (fac?.nit && d.comercio) await recordarComercioNit(fac.nit, d.comercio);
      }
      await guardarFoto(id);
      if (plan && cuentaId != null) await guardarPlan(id, cuentaId, d.comercio ?? "", fecha, plan, internacional);
      else if (transaccion) await borrarPlanes([id]); // dejó de ser compra con tarjeta
      const texto = d.comercio?.trim() || (transf ? "Transferencia" : tipo === "ingreso" ? "Ingreso" : "Egreso");
      if (otro) {
        listo(`«${texto}» guardado.`);
        guardado = `«${texto}» guardado. Registra el siguiente.`;
        limpiar(true);
        await tick();
        if (!pantalla.celular) campoMonto?.focus();
      } else {
        listo(transaccion ? "Movimiento actualizado." : `«${texto}» guardado.`);
        cerrar();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      guardando = false;
    }
  }

  async function eliminar() {
    if (!transaccion) return;
    await eliminarTransacciones([transaccion.id]);
    listo("Movimiento eliminado.");
    cerrar();
  }

  // En el celular sin los últimos 4 (no caben en media pantalla).
  const nombreCuenta = (c: Cuenta) => `${c.nombre}${c.ultimos4 && !pantalla.celular ? ` ••${c.ultimos4}` : ""}${c.moneda === "USD" ? " (USD)" : ""}`;
</script>

<Panel {abierto} {cerrar} titulo={transaccion ? "Editar movimiento" : "Nuevo movimiento"}
  subtitulo={transaccion ? `${transaccion.comercio ?? ""} · ${fechaCorta(transaccion.fecha)}` : pantalla.celular ? "" : "Egreso, ingreso o transferencia"}>
  <form id="form-tx" class="form" onsubmit={(e) => { e.preventDefault(); guardar(false); }}>
    {#if guardado}<p class="ok" role="status"><Icono nombre="estrella" />{guardado}</p>{/if}

    <div class="cf-seg tipos" role="group" aria-label="Tipo de movimiento">
      {#each tipos as t}
        <button type="button" aria-pressed={tipo === t.id} onclick={() => elegirTipo(t.id)}>{t.nombre}</button>
      {/each}
    </div>

    <div class="campo" class:monto-m={pantalla.celular}>
      <CampoMonto bind:valor={monto} bind:campo={campoMonto} moneda={cuenta?.moneda ?? "COP"} grande requerido etiqueta="Monto" />
    </div>

    <div class="campo comercio">
      <label class="etiqueta" for="tx-comercio">{transf ? "Descripción" : tipo === "ingreso" ? "De quién" : "Comercio o persona"}</label>
      <span class="cf-field">
        <Icono nombre="buscar" />
        <input id="tx-comercio" bind:value={comercio} oninput={escribirComercio} autocomplete="off"
          placeholder={transf ? "Paso a Nequi" : tipo === "ingreso" ? "Nómina" : "D1, Rappi, Éxito…"}
          onfocus={() => (verLista = lista.length > 0)}
          onkeydown={(e) => { if (e.key === "Escape" && verLista) { e.stopPropagation(); verLista = false; } }} />
      </span>
      {#if verLista && !pantalla.celular}
        <ul class="sugerencias cf-glass-3" aria-label="Movimientos anteriores">
          {#each lista as s (s.comercio)}
            <li>
              <button type="button" onclick={() => usarSugerencia(s)}>
                <span class="cf-tile {claseTesela(categorias.find((c) => c.id === s.categoria_id)?.color)} mini">
                  <Icono nombre={s.categoria_icono ?? (s.tipo === "transferencia" ? "transacciones" : "otros")} />
                </span>
                <span class="sug-texto">
                  <b>{s.comercio}</b>
                  <span class="caption">
                    {categorias.find((c) => c.id === s.categoria_id)?.nombre ?? (s.tipo === "transferencia" ? "Transferencia" : "Sin categoría")}
                    · {cuentas.find((c) => c.id === s.cuenta_id)?.nombre ?? "Cuenta archivada"}
                    · {s.veces} {s.veces === 1 ? "vez" : "veces"}
                  </span>
                </span>
                <!-- Con un monto ya escrito la sugerencia no lo cambia: mostrar el valor anterior confunde. -->
                {#if !conMontoEscrito}
                  <span class="sug-monto" class:cf-amt-income={s.tipo === "ingreso"}>
                    {fmtMonto(s.monto, cuentas.find((c) => c.id === s.cuenta_id)?.moneda)}
                  </span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    {#if pantalla.celular && !transaccion && chipsSug.length}
      <div class="sug-m desliza" role="group" aria-label="Sugerencias">
        {#each chipsSug as s (s.comercio)}
          <button type="button" class="chip-sug" class:on={comercio.trim().toLowerCase() === s.comercio.toLowerCase()} onclick={() => usarSugerencia(s)}>
            {s.comercio}<span>· {categorias.find((c) => c.id === s.categoria_id)?.nombre ?? (s.tipo === "transferencia" ? "Transferencia" : "Sin categoría")}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if tarjetaSugerida}
      <div class="aviso-pago" role="status">
        <p>
          <b>¿Es un pago de tu tarjeta {tarjetaSugerida.nombre}?</b>
          Los pagos se registran como transferencia para no contar el gasto dos veces.
        </p>
        <button type="button" class="cf-btn cf-btn--secondary corto" onclick={convertirEnPago}>Registrar como transferencia</button>
      </div>
    {/if}

    {#if !transf && !pantalla.celular}
      <label class="campo">
        <span class="etiqueta">Categoría</span>
        <span class="cf-field">
          <select bind:value={categoriaId}>
            <option value={null}>Sin categoría</option>
            {#each cats as c (c.id)}
              <option value={c.id}>{c.padre_id != null ? "   · " : ""}{c.nombre}</option>
            {/each}
          </select>
        </span>
      </label>
    {/if}

    <div class="fila-campos">
      <label class="campo">
        <span class="etiqueta">{transf ? "Desde" : "Cuenta"}</span>
        <span class="cf-field">
          <select bind:value={cuentaId} required>
            {#each cuentas as c (c.id)}<option value={c.id}>{nombreCuenta(c)}</option>{/each}
          </select>
        </span>
      </label>
      {#if transf}
        <label class="campo">
          <span class="etiqueta">Hacia</span>
          <span class="cf-field">
            <select bind:value={destinoId} required>
              <option value={null} disabled>Elige una cuenta</option>
              {#each cuentas.filter((c) => c.id !== cuentaId) as c (c.id)}<option value={c.id}>{nombreCuenta(c)}</option>{/each}
            </select>
          </span>
        </label>
      {:else}
        <label class="campo">
          <span class="etiqueta">Fecha</span>
          <CampoFecha bind:valor={fecha} requerido />
        </label>
      {/if}
    </div>

    {#if !transf && pantalla.celular}
      <div class="campo">
        <span class="etiqueta" id="et-cat">Categoría</span>
        <div class="cats-m" role="group" aria-labelledby="et-cat">
          {#each catsBotones as c (c.id)}
            <button type="button" class="cat-m" aria-pressed={categoriaId === c.id} onclick={() => (categoriaId = categoriaId === c.id ? null : c.id)}>
              <span class="cf-tile {claseTesela(c.color)}"><Icono nombre={c.icono ?? "otros"} /></span><span class="cat-nombre">{c.nombre}</span>
            </button>
          {/each}
          {#if cats.length > 7}
            <button type="button" class="cat-m" aria-expanded={todasCats} onclick={() => (todasCats = !todasCats)}>
              <span class="cf-tile neutro"><Icono nombre={todasCats ? "arriba" : "mas"} /></span><span class="cat-nombre">{todasCats ? "Menos" : "Más"}</span>
            </button>
          {/if}
        </div>
      </div>
    {/if}

    {#if compraTarjeta && cuenta}
      <div class="cuotas">
        <div class="campo">
          <span class="etiqueta" id="et-cuotas">Cuotas</span>
          <div class="cf-seg opciones-cuotas" role="group" aria-labelledby="et-cuotas">
            {#each opcionesCuotas as n}
              <button type="button" aria-pressed={!otraCuota && numCuotas === n} onclick={() => { numCuotas = n; otraCuota = false; }}>{n}</button>
            {/each}
            <button type="button" aria-pressed={otraCuota} onclick={() => (otraCuota = true)}>Otra</button>
          </div>
          {#if otraCuota}
            <span class="cf-field otra"><input type="number" min="1" max="72" bind:value={numCuotas} aria-label="Número de cuotas" /><span class="sufijo">cuotas</span></span>
          {/if}
        </div>

        <label class="interruptor">
          <input type="checkbox" bind:checked={internacional} />
          <span>Compra internacional
            <small>Suma la comisión de {cuenta.nombre} ({pct(cuenta.comision_internacional)} %).</small>
          </span>
        </label>

        {#if plan}
          <div class="plan" aria-live="polite">
            {#if plan.numCuotas === 1}
              <b class="plan-cuota">{pesos(plan.total)}</b>
              <span class="caption">
                {plan.tasaEA ? `1 cuota con interés: ${pesos(plan.intereses)}` : "1 cuota sin interés si pagas antes de la fecha límite"}
                · se paga el {fechaCorta(plan.filas[0].fecha)}
              </span>
            {:else}
              <b class="plan-cuota">{plan.numCuotas} cuotas de {pesos(plan.cuota)}</b>
              <span class="caption">
                Total {pesos(plan.total)} · intereses {pesos(plan.intereses)}
                ({pct(plan.intereses / plan.capital, 1)} % sobre el capital)
              </span>
              <span class="caption">
                {plan.tasaEA ? `Tasa ${pct(plan.tasaEA)} % E.A. (${pct(plan.tasaMes)} % mensual)` : "Sin tasa configurada"}
                · primera cuota el {fechaCorta(plan.filas[0].fecha)}
              </span>
            {/if}
            {#if plan.comision}<span class="caption">Incluye comisión internacional de {pesos(plan.comision)}.</span>{/if}
            {#if cobraInteres(plan.numCuotas, cuenta) && !cuenta.tasa_ea}
              <span class="caption aviso-tasa">Configura la tasa E.A. de {cuenta.nombre} en Cuentas: por ahora se calcula sin interés.</span>
            {/if}
          </div>
        {/if}
        <p class="ayuda nota">La deuda sube por {plan ? pesos(plan.capital) : "el monto"}. Los intereses los cobra el banco en cada extracto.</p>
      </div>
    {:else if cuenta?.tipo === "credito" && !transf}
      <p class="ayuda nota">Devolución a la tarjeta: baja la deuda.</p>
    {/if}

    {#if transf}
      {#if otraMoneda && destino}
        <div class="campo">
          <span class="etiqueta">Entra a {destino.nombre}</span>
          <CampoMonto bind:valor={montoDestino} moneda={destino.moneda} requerido etiqueta="Monto que entra"
            alEscribir={() => (destinoManual = true)} />
          <span class="ayuda">
            {#if !trm}
              Escribe cuánto entra en {destino.moneda}. Si configuras la TRM en Cuentas, se calcula solo.
            {:else if !destinoManual}
              Calculado con la TRM de Cuentas ({fmtMonto(Math.round(trm * 100), "COP")} por USD). Puedes cambiarlo.
            {:else}
              {tasa || `Escribe cuánto entra en ${destino.moneda}.`}
              {#if destinoConTrm != null && leerMonto(montoDestino) !== destinoConTrm}
                · <button type="button" class="enlace" onclick={usarTrm}>Usar TRM ({fmtMonto(destinoConTrm, destino.moneda)})</button>
              {/if}
            {/if}
          </span>
        </div>
      {/if}
      <label class="campo">
        <span class="etiqueta">Fecha</span>
        <CampoFecha bind:valor={fecha} requerido />
      </label>
      <p class="ayuda nota">Las transferencias no cuentan como ingreso ni egreso.</p>
    {/if}

    <button type="button" class="cf-btn cf-btn--ghost mas" aria-expanded={masDetalles} onclick={() => (masDetalles = !masDetalles)}>
      <Icono nombre={masDetalles ? "cerrar" : "mas"} />{masDetalles ? "Menos detalles" : pantalla.celular ? "Notas, etiquetas y foto" : "Más detalles"}
      {#if !masDetalles && (etiquetasSel.length || notas)}<span class="caption">({etiquetasSel.length ? `${etiquetasSel.length} etiquetas` : "notas"})</span>{/if}
    </button>

    {#if masDetalles}
      <div class="campo">
        <span class="etiqueta">Etiquetas</span>
        <CampoEtiquetas bind:valor={etiquetasSel} opciones={etiquetas} />
        <span class="ayuda">Enter para agregar. Si no existe, se crea.</span>
      </div>
      <label class="campo">
        <span class="etiqueta">Notas</span>
        <span class="cf-field notas"><textarea bind:value={notas} rows="3" placeholder="Opcional"></textarea></span>
      </label>
      <div class="campo">
        <span class="etiqueta">Foto de la factura</span>
        {#if comprimiendo}
          <span class="caption">Preparando la foto…</span>
        {:else if vistaFoto}
          <div class="adjunto">
            <button type="button" class="miniatura" onclick={() => (fotoGrande = true)} aria-label="Ver la foto en grande">
              <img src={vistaFoto} alt="Foto de la factura" />
            </button>
            <div class="adjunto-acciones">
              {#if pesoFoto}<span class="caption">WebP · {pesoFoto}</span>{/if}
              <button type="button" class="cf-btn cf-btn--ghost" onclick={() => entradaAdjunto?.click()}>Cambiar</button>
              <button type="button" class="cf-btn cf-btn--ghost peligro" onclick={quitarAdjunto}><Icono nombre="papelera" />Quitar</button>
            </div>
          </div>
        {:else}
          <button type="button" class="cf-btn cf-btn--secondary adjuntar" onclick={() => entradaAdjunto?.click()}>
            <Icono nombre="documento" />Adjuntar foto
          </button>
          {#if quitarFoto}<span class="ayuda">La foto se quitará al guardar.</span>{/if}
        {/if}
        <input bind:this={entradaAdjunto} type="file" accept="image/*" hidden onchange={(e) => elegirAdjunto(e.currentTarget.files?.[0])} />
      </div>
    {/if}

    {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  </form>

  {#snippet pie()}
    {#if transaccion}
      {#if confirmarEliminar}
        <span class="caption">¿Eliminar este movimiento?</span>
        <button class="cf-btn cf-btn--ghost" onclick={() => (confirmarEliminar = false)}>No</button>
        <button class="cf-btn cf-btn--secondary peligro" onclick={eliminar}><Icono nombre="papelera" />Eliminar</button>
      {:else}
        <!-- Dos grupos a la derecha: acciones extra arriba si no cabe todo; caneca con Cancelar y Guardar. -->
        <span class="pie-grupo">
          {#if transaccion.tipo === "egreso" && transaccion.cuenta_moneda === "COP" && transaccion.gasto_grupal_id == null
            && transaccion.prestamo_persona_id == null && (transaccion.num_cuotas ?? 1) <= 1}
            <button class="cf-btn cf-btn--ghost" onclick={() => { cerrar(); goto(`/medeben?dividir=${transaccion!.id}`); }}
              title="Repartir este gasto entre varias personas"><Icono nombre="personas" />Dividir</button>
          {/if}
          {#if !pantalla.celular && transaccion.recurrente_id == null && !transaccion.es_inversion && transaccion.prestamo_persona_id == null
            && transaccion.gasto_grupal_id == null && (transaccion.num_cuotas ?? 1) <= 1
            && (transaccion.tipo !== "transferencia" || transaccion.cuenta_destino_moneda === transaccion.cuenta_moneda)}
            <button class="cf-btn cf-btn--ghost" onclick={() => { cerrar(); goto(`/recurrentes?desde=${transaccion!.id}`); }}
              title="Programar este movimiento para que se repita"><Icono nombre="repetir" />Recurrente</button>
          {/if}
        </span>
        <span class="pie-grupo">
          <button class="cf-btn cf-btn--icon peligro" onclick={() => (confirmarEliminar = true)} title="Eliminar" aria-label="Eliminar movimiento"><Icono nombre="papelera" /></button>
          {#if !pantalla.celular}<button class="cf-btn cf-btn--secondary" onclick={cerrar}>Cancelar</button>{/if}
          <button class="cf-btn cf-btn--primary" type="submit" form="form-tx" disabled={guardando}>Guardar cambios</button>
        </span>
      {/if}
    {:else if pantalla.celular}
      <div class="pie-m">
        {#if abrirFactura}
          <ElegirFoto elegir={elegirFactura}><Icono nombre="documento" />Factura</ElegirFoto>
        {/if}
        <button class="cf-btn cf-btn--primary" type="submit" form="form-tx" disabled={guardando}>Registrar</button>
      </div>
    {:else}
      <button class="cf-btn cf-btn--secondary" onclick={() => guardar(true)} disabled={guardando}>Guardar y registrar otro</button>
      <button class="cf-btn cf-btn--primary" type="submit" form="form-tx" disabled={guardando}>Guardar</button>
    {/if}
  {/snippet}
{#if fotoGrande && vistaFoto}
  <VisorFoto src={vistaFoto} alt="Foto de la factura" cerrar={() => (fotoGrande = false)} />
{/if}
</Panel>

<style>
  .form { display: flex; flex-direction: column; gap: var(--space-4); }
  .tipos { display: flex; }
  .tipos button { flex: 1; }
  .comercio { position: relative; }
  .sugerencias {
    position: absolute; z-index: 5; top: calc(100% + 4px); left: 0; right: 0;
    margin: 0; padding: var(--space-1); list-style: none; border-radius: var(--r-md);
    max-height: 320px; overflow-y: auto;
  }
  .sugerencias button {
    display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: 8px 10px;
    border: 0; border-radius: var(--r-sm); background: none; color: var(--ink); text-align: left; cursor: pointer; font: inherit;
  }
  .sugerencias button:hover, .sugerencias button:focus-visible { background: var(--primary-soft); outline: none; }
  .mini { width: 32px; height: 32px; border-radius: 10px; }
  .mini :global(.cf-icon) { width: 16px; height: 16px; }
  .sug-texto { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .sug-texto b { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sug-texto .caption { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sug-monto { font-weight: 600; font-size: 14px; white-space: nowrap; }
  .aviso-pago { display: flex; flex-direction: column; gap: var(--space-3); padding: 12px 14px; border-radius: var(--r-md); background: var(--warn-80-soft); font-size: 13px; line-height: 18px; color: var(--ink); }
  .aviso-pago b { color: var(--warn-80); }
  .corto { height: 36px; align-self: flex-start; padding: 0 var(--space-4); }
  .nota { margin-top: calc(-1 * var(--space-2)); font-size: 12px; line-height: 16px; color: var(--ink-2); }
  .mas { align-self: flex-start; padding: 0 var(--space-2); height: 36px; }
  .notas { height: auto; padding: 10px 14px; align-items: flex-start; }
  .notas textarea { flex: 1; border: 0; outline: 0; background: transparent; resize: vertical; font: 400 14px/20px var(--font-sans); color: var(--ink); }
  .ok { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: var(--r-md); background: var(--income-soft); color: var(--income); font-size: 13px; font-weight: 500; }
  .ok :global(.cf-icon) { width: 16px; height: 16px; }
  .peligro { color: var(--expense); }
  .espacio { flex: 1; }
  .pie-grupo { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-3); flex-wrap: wrap; }
  .pie-grupo:empty { display: none; }
  .cuotas { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-radius: var(--r-lg); background: var(--glass-1); border: 1px solid var(--line); }
  .opciones-cuotas { display: flex; flex-wrap: wrap; }
  .opciones-cuotas button { flex: 1; padding: 0 6px; min-width: 36px; }
  .otra { max-width: 180px; height: 40px; margin-top: var(--space-2); }
  .otra input { width: 100%; }
  .plan { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: var(--r-md); background: var(--primary-soft); }
  .plan-cuota { font: 650 20px/26px var(--font-display); letter-spacing: -.01em; color: var(--primary-text); }
  .aviso-tasa { color: var(--warn-80); font-weight: 600; }
  .cuotas .nota { margin-top: 0; }
  .enlace { padding: 0; border: 0; background: none; font: inherit; font-weight: 600; color: var(--primary-text); cursor: pointer; }
  .enlace:hover { text-decoration: underline; }
  .adjunto { display: flex; gap: var(--space-3); align-items: center; }
  .miniatura { width: 72px; height: 96px; padding: 0; border: 1px solid var(--line); border-radius: var(--r-sm); overflow: hidden; background: var(--input); cursor: zoom-in; flex: none; }
  .miniatura img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .adjunto-acciones { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
  .adjuntar { align-self: flex-start; }
  .peligro { color: var(--expense); }

  /* ---------- Celular ---------- */
  /* Monto en el celular: el mismo campo del Mac, un poco más grande. */
  .monto-m :global(.cf-field.grande input) { font-size: 34px; line-height: 40px; }
  .sug-m { display: flex; gap: 8px; margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-4)) 0; padding: 0 var(--space-4); }
  .chip-sug {
    flex: none; display: inline-flex; align-items: center; gap: 4px; min-height: 36px; padding: 0 12px; border-radius: var(--r-full);
    border: 1px solid var(--line); background: var(--input); color: var(--ink); font: 600 13px/18px var(--font-sans); white-space: nowrap;
  }
  .chip-sug span { font-weight: 500; color: var(--ink-2); }
  .chip-sug.on { background: var(--primary-soft); color: var(--primary-text); border-color: transparent; }
  .chip-sug.on span { color: inherit; }
  .cats-m { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .cat-m {
    display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px; min-height: 72px; min-width: 0;
    border-radius: 16px; border: 1px solid transparent; background: transparent; color: var(--ink);
    font: 500 12px/16px var(--font-sans); text-align: center; -webkit-tap-highlight-color: transparent;
  }
  .cat-nombre { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cat-m[aria-pressed="true"] { background: var(--primary-soft); border-color: var(--violet-200); color: var(--primary-text); font-weight: 600; }
  .cat-m .cf-tile { width: 36px; height: 36px; }
  .cat-m .cf-tile :global(.cf-icon) { width: 18px; height: 18px; }
  .cat-m .neutro { background: var(--track); color: var(--ink-2); }
  .pie-m { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap: 10px; }
  .pie-m .cf-btn, .pie-m :global(.cf-btn) { height: 52px; width: 100%; }
  .pie-m > .cf-btn:only-child { grid-column: 1 / -1; }
</style>
