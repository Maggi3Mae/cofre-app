<script lang="ts">
  // Asistente para enseñarle a Cofre un formato de extracto: columnas → formatos → reconocerlo.
  // La vista previa se recalcula en vivo con el mismo lector que se usará al importar.
  import Icono from "$lib/Icono.svelte";
  import { pesos } from "$lib/formato";
  import { fechaCorta } from "$lib/periodo";
  import {
    guardarPlantilla, type Cuenta, type Plantilla, type ConfigPlantilla, type Rol, type OrdenFecha, type Signo,
  } from "$lib/datos";
  import type { TipoCuenta } from "$lib/datos";
  import type { Documento, Linea } from "./documento";
  import {
    leerConPlantilla, rolesDeLinea, rolPorTitulo, proponerFilaTitulos, proponerFrase, detectarOrden,
    detectarDecimal, pareceFecha, pareceMonto, normalizarFrase,
  } from "./plantilla";

  let { doc, cuentas, plantilla = null, cancelar, guardado }: {
    doc: Documento;
    cuentas: Cuenta[];
    /** Para ajustar un formato ya enseñado. */
    plantilla?: Plantilla | null;
    cancelar: () => void;
    guardado: (id: number) => void;
  } = $props();

  const ROLES: { id: Rol; nombre: string }[] = [
    { id: "ignorar", nombre: "Ignorar" }, { id: "fecha", nombre: "Fecha" }, { id: "descripcion", nombre: "Descripción" },
    { id: "valor", nombre: "Valor (con signo)" }, { id: "cargo", nombre: "Cargo / débito" }, { id: "abono", nombre: "Abono / crédito" },
    { id: "saldo", nombre: "Saldo" },
  ];
  const TIPOS: { id: TipoCuenta; nombre: string }[] = [
    { id: "debito", nombre: "Débito / ahorros" }, { id: "credito", nombre: "Tarjeta de crédito" }, { id: "efectivo", nombre: "Efectivo" },
  ];

  // ---------- Paso 1: columnas ----------
  // El asistente se monta para un documento y una plantilla; sus valores iniciales se toman una vez.
  const cfg0 = (() => plantilla?.config)();
  let hojaNombre = $state("");
  const hoja = $derived(doc.tipo === "hoja" ? (doc.hojas.find((h) => h.nombre === hojaNombre) ?? doc.hojas[0]) : null);
  let filaTitulos = $state(-1);
  let rolesHoja = $state<Rol[]>([]);

  // PDF: líneas candidatas (tienen una fecha y un monto) y la elegida como ejemplo.
  const candidatas = $derived(
    doc.tipo === "pdf"
      ? doc.paginas.flatMap((p) => p.lineas).filter((l) => l.celdas.length >= 2 && l.celdas.some((c) => pareceFecha(c.texto)) && l.celdas.some((c) => pareceMonto(c.texto)))
      : [],
  );
  let ejemplo = $state<Linea | null>(null);
  let rolesLinea = $state<Rol[]>([]);

  function iniciar() {
    if (doc.tipo === "hoja" && hoja) {
      filaTitulos = cfg0?.filaTitulos ?? proponerFilaTitulos(hoja.filas);
      const ancho = Math.max(0, ...hoja.filas.slice(0, 60).map((f) => f.length));
      rolesHoja = Array.from({ length: ancho }, (_, i) =>
        cfg0 ? (cfg0.columnas.find((c) => c.indice === i)?.rol ?? "ignorar")
          : filaTitulos >= 0 ? rolPorTitulo(hoja.filas[filaTitulos][i] ?? "") : "ignorar");
    } else if (doc.tipo === "pdf") {
      elegirLinea(candidatas[0] ?? null);
    }
  }

  function elegirLinea(l: Linea | null) {
    ejemplo = l;
    if (!l) { rolesLinea = []; return; }
    if (cfg0?.documento === "pdf") {
      // Ajustar un formato existente: cada trozo toma el rol de la columna guardada que más se le parece.
      rolesLinea = l.celdas.map((c) => {
        let mejor: Rol = "ignorar", d = Infinity;
        for (const k of cfg0.columnas) {
          const dist = Math.abs((c.x + c.x2) / 2 - ((k.x ?? 0) + (k.x2 ?? 0)) / 2);
          if (dist < d) { d = dist; mejor = k.rol; }
        }
        return mejor;
      });
    } else rolesLinea = rolesDeLinea(l.celdas);
  }

  // ---------- Paso 2: formatos ----------
  const muestrasFecha = $derived.by(() => {
    if (doc.tipo === "hoja" && hoja) {
      const i = rolesHoja.indexOf("fecha");
      return i < 0 ? [] : hoja.filas.slice(filaTitulos + 1, filaTitulos + 30).map((f) => f[i] ?? "");
    }
    return candidatas.slice(0, 30).flatMap((l) => l.celdas.filter((c) => pareceFecha(c.texto)).map((c) => c.texto));
  });
  const muestrasMonto = $derived.by(() => {
    if (doc.tipo === "hoja" && hoja)
      return hoja.filas.slice(filaTitulos + 1, filaTitulos + 30).flatMap((f) => f.filter((_, i) => ["valor", "cargo", "abono", "saldo"].includes(rolesHoja[i])));
    return candidatas.slice(0, 30).flatMap((l) => l.celdas.filter((c) => pareceMonto(c.texto)).map((c) => c.texto));
  });

  let ordenFecha = $state<OrdenFecha>("DMA");
  let decimal = $state<"," | ".">(".");
  let signo = $state<Signo>("negativo_es_gasto");

  // ---------- Paso 3: reconocerlo ----------
  let nombre = $state("");
  let banco = $state("");
  let tipoCuenta = $state<TipoCuenta>("debito");
  let cuentaId = $state<number | null>(null);
  let frase = $state("");
  let error = $state("");
  let guardando = $state(false);

  // Valores iniciales (una sola vez, al montar).
  function valoresIniciales() {
    if (doc.tipo === "hoja") hojaNombre = cfg0?.hoja ?? doc.hojas[0]?.nombre ?? "";
    iniciar();
    ordenFecha = cfg0?.ordenFecha ?? detectarOrden(muestrasFecha);
    decimal = cfg0?.decimal ?? detectarDecimal(muestrasMonto);
    signo = cfg0?.signo ?? (muestrasMonto.some((m) => /-|\(/.test(m)) ? "negativo_es_gasto" : "saldo");
    nombre = plantilla?.nombre ?? "";
    banco = plantilla?.banco ?? "";
    tipoCuenta = plantilla?.tipo_cuenta ?? "debito";
    cuentaId = plantilla?.cuenta_id ?? null;
    frase = plantilla?.frase ?? proponerFrase(doc.texto);
  }
  valoresIniciales();

  const roles = $derived(doc.tipo === "hoja" ? rolesHoja : rolesLinea);
  const usaValor = $derived(roles.includes("valor") && !roles.includes("cargo") && !roles.includes("abono"));
  const faltan = $derived([
    !roles.includes("fecha") && "la fecha",
    !roles.includes("valor") && !roles.includes("cargo") && !roles.includes("abono") && "el valor (o cargo y abono)",
  ].filter(Boolean) as string[]);

  const config = $derived<ConfigPlantilla>(
    doc.tipo === "hoja"
      ? { documento: "hoja", hoja: hoja?.nombre, filaTitulos, ordenFecha, decimal, signo,
          columnas: rolesHoja.map((rol, indice) => ({ rol, indice })).filter((c) => c.rol !== "ignorar") }
      : { documento: "pdf", ordenFecha, decimal, signo,
          columnas: (ejemplo?.celdas ?? []).map((c, i) => ({ rol: rolesLinea[i] ?? "ignorar", x: c.x, x2: c.x2 })) },
  );
  const previa = $derived(faltan.length ? null : leerConPlantilla(doc, config));
  const fraseOk = $derived(!!frase.trim() && normalizarFrase(doc.texto).includes(normalizarFrase(frase)));
  const cuentasDelTipo = $derived(cuentas.filter((c) => !c.archivada && c.tipo === tipoCuenta));

  async function guardar() {
    error = "";
    if (!previa?.movimientos.length) { error = "Aún no se lee ningún movimiento con estas columnas."; return; }
    if (!fraseOk) { error = "La frase debe aparecer tal cual en este extracto."; return; }
    guardando = true;
    try {
      const id = await guardarPlantilla(
        { nombre, banco: banco || nombre, tipo_cuenta: tipoCuenta, cuenta_id: cuentaId, frase, documento: doc.tipo, config },
        plantilla?.id,
      );
      guardado(id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      guardando = false;
    }
  }
</script>

<section class="cf-glass cf-card asistente" aria-labelledby="t-asistente">
  <header class="cab">
    <div>
      <h2 id="t-asistente" class="cf-card-title">{plantilla ? `Ajustar «${plantilla.nombre}»` : "Enseñarle este formato"}</h2>
      <p class="caption">Marca las columnas una vez; la próxima vez Cofre lo reconoce solo.</p>
    </div>
    <button class="cf-btn cf-btn--ghost" onclick={cancelar}><Icono nombre="cerrar" />Cancelar</button>
  </header>

  <!-- Paso 1 -->
  <div class="paso">
    <h3><span class="num">1</span> Columnas</h3>
    {#if doc.tipo === "hoja" && hoja}
      <div class="fila-campos">
        {#if doc.hojas.length > 1}
          <label class="campo"><span class="etiqueta">Hoja</span>
            <span class="cf-field"><select bind:value={hojaNombre} onchange={iniciar}>{#each doc.hojas as h (h.nombre)}<option>{h.nombre}</option>{/each}</select></span>
          </label>
        {/if}
        <label class="campo"><span class="etiqueta">Fila de títulos</span>
          <span class="cf-field">
            <select bind:value={filaTitulos}>
              <option value={-1}>Sin títulos (los datos empiezan arriba)</option>
              {#each hoja.filas.slice(0, 30) as f, i}<option value={i}>Fila {i + 1}: {f.filter(Boolean).slice(0, 4).join(" · ").slice(0, 60)}</option>{/each}
            </select>
          </span>
        </label>
      </div>
      <div class="tabla-hoja">
        <table>
          <thead>
            <tr>{#each rolesHoja as _, i}<th>
              <select bind:value={rolesHoja[i]} aria-label="Columna {i + 1}">{#each ROLES as r (r.id)}<option value={r.id}>{r.nombre}</option>{/each}</select>
              {#if filaTitulos >= 0}<small>{hoja.filas[filaTitulos][i] ?? ""}</small>{/if}
            </th>{/each}</tr>
          </thead>
          <tbody>
            {#each hoja.filas.slice(filaTitulos + 1, filaTitulos + 7) as f}
              <tr>{#each rolesHoja as rol, i}<td class:apagada={rol === "ignorar"}>{f[i] ?? ""}</td>{/each}</tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if doc.tipo === "pdf"}
      {#if !candidatas.length}
        <p class="error-form">No encontré líneas con fecha y monto en este PDF. ¿Es un extracto con texto (no escaneado)?</p>
      {:else}
        <label class="campo"><span class="etiqueta">Línea de ejemplo (un movimiento)</span>
          <span class="cf-field">
            <select value={ejemplo ? candidatas.indexOf(ejemplo) : -1} onchange={(e) => elegirLinea(candidatas[+e.currentTarget.value] ?? null)}>
              {#each candidatas.slice(0, 40) as l, i}<option value={i}>{l.texto.slice(0, 90)}</option>{/each}
            </select>
          </span>
          <span class="ayuda">Cofre lee las demás líneas usando la posición de cada trozo de esta.</span>
        </label>
        {#if ejemplo}
          <div class="trozos">
            {#each ejemplo.celdas as c, i}
              <div class="trozo" class:apagada={rolesLinea[i] === "ignorar"}>
                <span class="txt" title={c.texto}>{c.texto}</span>
                <select bind:value={rolesLinea[i]} aria-label="Qué es «{c.texto}»">{#each ROLES as r (r.id)}<option value={r.id}>{r.nombre}</option>{/each}</select>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    {/if}
    {#if faltan.length}<p class="caption aviso-paso">Falta marcar {faltan.join(" y ")}.</p>{/if}
  </div>

  <!-- Paso 2 -->
  <div class="paso">
    <h3><span class="num">2</span> Formatos</h3>
    <div class="fila-campos">
      <div class="campo"><span class="etiqueta">Fecha</span>
        <div class="cf-seg" role="group" aria-label="Formato de fecha">
          <button aria-pressed={ordenFecha === "DMA"} onclick={() => (ordenFecha = "DMA")}>Día/mes/año</button>
          <button aria-pressed={ordenFecha === "AMD"} onclick={() => (ordenFecha = "AMD")}>Año/mes/día</button>
          <button aria-pressed={ordenFecha === "MDA"} onclick={() => (ordenFecha = "MDA")}>Mes/día/año</button>
        </div>
      </div>
      <div class="campo"><span class="etiqueta">Números</span>
        <div class="cf-seg" role="group" aria-label="Separador decimal">
          <button aria-pressed={decimal === ","} onclick={() => (decimal = ",")}>1.234,56</button>
          <button aria-pressed={decimal === "."} onclick={() => (decimal = ".")}>1,234.56</button>
        </div>
      </div>
    </div>
    {#if usaValor}
      <div class="campo"><span class="etiqueta">¿Cómo vienen los gastos?</span>
        <div class="cf-seg" role="group" aria-label="Signo de los gastos">
          <button aria-pressed={signo === "negativo_es_gasto"} onclick={() => (signo = "negativo_es_gasto")}>En negativo</button>
          <button aria-pressed={signo === "positivo_es_gasto"} onclick={() => (signo = "positivo_es_gasto")}>En positivo</button>
          <button aria-pressed={signo === "saldo"} onclick={() => (signo = "saldo")} disabled={!roles.includes("saldo")}>Deducir con el saldo</button>
        </div>
        <span class="ayuda">En tarjetas de crédito las compras suelen venir en positivo.</span>
      </div>
    {/if}
  </div>

  <!-- Vista previa -->
  {#if previa}
    <div class="previa">
      <div class="validacion" class:ok={previa.validacion.ok}>
        <span class="cf-chip cf-chip--sm {previa.validacion.ok ? 'cf-chip--income' : 'cf-chip--warn-90'}">
          {previa.movimientos.length} {previa.movimientos.length === 1 ? "movimiento" : "movimientos"}
        </span>
        <ul>{#each previa.validacion.mensajes as m}<li>{m}</li>{/each}</ul>
      </div>
      <ul class="muestra">
        {#each previa.movimientos.slice(0, 6) as m}
          <li class:no-cuadra={m.cuadra === false}>
            <span class="caption">{fechaCorta(m.fecha)}</span>
            <span class="desc">{m.descripcion}</span>
            <b class={m.sentido === "abono" ? "cf-amt-income" : "cf-amt-expense"}>{pesos(m.monto, m.sentido === "abono" ? "+" : "−")}</b>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Paso 3 -->
  <div class="paso">
    <h3><span class="num">3</span> Reconocerlo la próxima vez</h3>
    <div class="fila-campos">
      <label class="campo"><span class="etiqueta">Nombre del formato</span>
        <span class="cf-field"><input bind:value={nombre} placeholder="ej. Daviplata" /></span>
      </label>
      <label class="campo"><span class="etiqueta">Banco</span>
        <span class="cf-field"><input bind:value={banco} placeholder={nombre || "ej. Davivienda"} /></span>
      </label>
    </div>
    <div class="fila-campos">
      <div class="campo"><span class="etiqueta">Tipo de cuenta</span>
        <div class="cf-seg" role="group" aria-label="Tipo de cuenta">
          {#each TIPOS as t (t.id)}<button aria-pressed={tipoCuenta === t.id} onclick={() => { tipoCuenta = t.id; cuentaId = null; }}>{t.nombre}</button>{/each}
        </div>
      </div>
      <label class="campo"><span class="etiqueta">Cuenta</span>
        <span class="cf-field">
          <select bind:value={cuentaId}>
            <option value={null}>Elegirla al importar</option>
            {#each cuentasDelTipo as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
          </select>
        </span>
      </label>
    </div>
    <label class="campo"><span class="etiqueta">Frase que lo identifica</span>
      <span class="cf-field"><input bind:value={frase} /></span>
      <span class="ayuda" class:mal={!fraseOk}>
        {fraseOk ? "Aparece en este extracto. Elige algo que salga en todos los meses (no fechas ni saldos)." : "Esta frase no aparece en el extracto."}
      </span>
    </label>
  </div>

  {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  <div class="acciones">
    <button class="cf-btn cf-btn--ghost" onclick={cancelar}>Cancelar</button>
    <button class="cf-btn cf-btn--primary" onclick={guardar} disabled={guardando || !previa?.movimientos.length || !fraseOk || !nombre.trim()}>
      {plantilla ? "Guardar cambios" : "Guardar formato"}
    </button>
  </div>
</section>

<style>
  .asistente { gap: var(--space-5); }
  .cab { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
  .paso { display: flex; flex-direction: column; gap: var(--space-3); }
  .paso h3 { display: flex; align-items: center; gap: var(--space-2); font: 650 15px/20px var(--font-sans); }
  .num { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: var(--r-full); background: var(--primary-soft); color: var(--primary-text); font-size: 12px; }
  .fila-campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-4); }
  .tabla-hoja { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--r-md); }
  .tabla-hoja table { border-collapse: collapse; font-size: 12px; min-width: 100%; }
  .tabla-hoja th { padding: 6px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); background: var(--input); }
  .tabla-hoja th select { font: 600 12px/16px var(--font-sans); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px 4px; background: var(--surface); color: var(--ink); }
  .tabla-hoja th small { display: block; margin-top: 4px; font-weight: 400; color: var(--ink-2); white-space: nowrap; }
  .tabla-hoja td { padding: 6px; border-bottom: 1px solid var(--line); white-space: nowrap; max-width: 260px; overflow: hidden; text-overflow: ellipsis; color: var(--ink); }
  .apagada { opacity: .4; }
  .trozos { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .trozo { display: flex; flex-direction: column; gap: 4px; padding: 8px; border-radius: var(--r-md); border: 1px solid var(--line); background: var(--input); max-width: 260px; }
  .trozo .txt { font: 500 12px/16px var(--font-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .trozo select { font: 600 12px/16px var(--font-sans); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px 4px; background: var(--surface); color: var(--ink); }
  .aviso-paso { color: var(--warn-90); }
  .previa { display: flex; flex-direction: column; gap: var(--space-3); }
  .validacion { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3); border-radius: var(--r-md); background: var(--warn-90-soft); }
  .validacion.ok { background: var(--income-soft); }
  .validacion ul { margin: 0; padding: 0; list-style: none; font-size: 13px; line-height: 18px; color: var(--ink); }
  .muestra { list-style: none; margin: 0; padding: 0; }
  .muestra li { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: var(--space-3); padding: 6px 0; border-bottom: 1px solid var(--line); align-items: center; font-size: 13px; }
  .muestra li.no-cuadra { background: var(--over-100-soft); }
  .muestra .desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ayuda.mal { color: var(--expense); }
  .acciones { display: flex; justify-content: flex-end; gap: var(--space-2); }
  .cf-seg { display: flex; flex-wrap: wrap; }
</style>
