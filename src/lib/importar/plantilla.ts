// Lector genérico para los formatos que enseña la usuaria: columnas marcadas, formato de fecha,
// separador decimal y convención de signo (ver datos/plantillas.ts). Funciones puras: se prueban sin la app.
import type { ColumnaPlantilla, ConfigPlantilla, OrdenFecha, Rol } from "$lib/datos/plantillas";
import type { Documento, Celda } from "./documento";
import type { Lectura, MovLeido } from "./lectores";

// ---------- reconocer trozos ----------

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const reMes = /(\d{1,2})\s*[\/\-. ]?\s*(ene|feb|mar|abr|may|jun|jul|ago|sept?|set|oct|nov|dic)[a-z]*\.?(?:\s*[\/\-. ]?\s*(\d{2,4}))?/i;

export const pareceFecha = (s: string) =>
  /\b\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?\b|\b\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}\b|^\d{8}$/.test(s.trim()) || reMes.test(s);

export const pareceMonto = (s: string) => {
  const t = s.trim().replace(/\s/g, "");
  return /\d/.test(t) && /^\(?[-+]?\$?[-+]?(\d{1,3}([.,]\d{3})+|\d+)([.,]\d{1,2})?\)?-?$/.test(t) && !/^\d{8}$/.test(t);
};

/** Montos de un trozo según el separador decimal: «1.234,56» / «$-1,234.56» / «(500)» / «12.000-». */
export function montoCon(s: string, decimal: "," | "."): number | null {
  const t = s.trim();
  if (!/\d/.test(t)) return null;
  const neg = /-/.test(t) || /\(.*\)/.test(t);
  let n = t.replace(/[^\d.,]/g, "");
  n = decimal === "," ? n.replace(/\./g, "").replace(",", ".") : n.replace(/,/g, "");
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const c = Math.round(v * 100);
  return neg ? -c : c;
}

const iso = (a: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 && a >= 2000 && a <= 2100
    ? `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;

/** Sin año en la fecha: el año actual, o el anterior si quedaría en el futuro. */
function conAno(m: number, d: number, hoy: Date): string | null {
  const a = hoy.getFullYear();
  const f = iso(a, m, d);
  const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);
  const lim = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, "0")}-${String(manana.getDate()).padStart(2, "0")}`;
  return f && f > lim ? iso(a - 1, m, d) : f;
}

export function leerFecha(s: string, orden: OrdenFecha, hoy = new Date()): string | null {
  const t = s.trim();
  const ano = (x?: string) => (!x ? null : x.length === 2 ? 2000 + +x : +x);
  const mm = t.match(reMes);
  if (mm) {
    const m = MESES.indexOf(mm[2].slice(0, 3).toLowerCase().replace("set", "sep")) + 1;
    const a = ano(mm[3]);
    return a ? iso(a, m, +mm[1]) : conAno(m, +mm[1], hoy);
  }
  const c = t.match(/^(\d{8})$/) ?? t.match(/\b(\d{8})\b/);
  if (c) {
    const g = c[1];
    if (orden === "AMD") return iso(+g.slice(0, 4), +g.slice(4, 6), +g.slice(6));
    if (orden === "MDA") return iso(+g.slice(4), +g.slice(0, 2), +g.slice(2, 4));
    return iso(+g.slice(4), +g.slice(2, 4), +g.slice(0, 2));
  }
  const p = t.match(/(\d{1,4})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
  if (!p) return null;
  const [x, y, z] = [p[1], +p[2], p[3]];
  if (x.length === 4) return iso(+x, y, z ? +z : 0);
  if (!z) return orden === "MDA" ? conAno(+x, y, hoy) : conAno(y, +x, hoy);
  const a = ano(z)!;
  return orden === "MDA" ? iso(a, +x, y) : iso(a, y, +x);
}

/** Orden de fecha probable a partir de ejemplos («31/07/2026» → DMA, «2026-07-31» → AMD). */
export function detectarOrden(ejemplos: string[]): OrdenFecha {
  let dma = 0, mda = 0;
  for (const e of ejemplos) {
    if (/\b\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}\b/.test(e) || /^20\d{6}$/.test(e.trim())) return "AMD";
    const m = e.match(/\b(\d{1,2})[\/\-.](\d{1,2})/);
    if (m) { if (+m[1] > 12) dma++; if (+m[2] > 12) mda++; }
  }
  return mda > dma ? "MDA" : "DMA";
}

/** Separador decimal probable: «1.234,56» → «,»; «1,234.56» → «.». */
export function detectarDecimal(ejemplos: string[]): "," | "." {
  let coma = 0, punto = 0;
  for (const e of ejemplos) {
    if (/\d,\d{1,2}\)?-?\s*$/.test(e) || /\d\.\d{3},/.test(e)) coma++;
    if (/\d\.\d{1,2}\)?-?\s*$/.test(e) || /\d,\d{3}\./.test(e)) punto++;
  }
  return coma > punto ? "," : ".";
}

// ---------- filas del documento ----------

interface FilaCruda { porRol: Partial<Record<Rol, string>> }

/** A qué columna pertenece un trozo de un PDF: la que más se le superpone, o la más cercana. */
function columnaDe(c: Celda, cols: ColumnaPlantilla[]): ColumnaPlantilla | null {
  let mejor: ColumnaPlantilla | null = null, puntaje = -Infinity;
  for (const k of cols) {
    if (k.x == null || k.x2 == null) continue;
    const solape = Math.min(c.x2, k.x2) - Math.max(c.x, k.x);
    const p = solape > 0 ? solape : -Math.abs((c.x + c.x2) / 2 - (k.x + k.x2) / 2);
    if (p > puntaje) { puntaje = p; mejor = k; }
  }
  return mejor;
}

function filasCrudas(doc: Documento, cfg: ConfigPlantilla): FilaCruda[] {
  const filas: FilaCruda[] = [];
  const agregar = (rol: Rol, txt: string, f: FilaCruda) => {
    if (rol === "ignorar" || !txt.trim()) return;
    f.porRol[rol] = f.porRol[rol] ? `${f.porRol[rol]} ${txt.trim()}` : txt.trim();
  };
  if (doc.tipo === "hoja") {
    const hoja = doc.hojas.find((h) => h.nombre === cfg.hoja) ?? doc.hojas[0];
    for (const fila of hoja?.filas.slice((cfg.filaTitulos ?? -1) + 1) ?? []) {
      const f: FilaCruda = { porRol: {} };
      for (const k of cfg.columnas) if (k.indice != null) agregar(k.rol, fila[k.indice] ?? "", f);
      filas.push(f);
    }
  } else {
    for (const l of doc.paginas.flatMap((p) => p.lineas)) {
      const f: FilaCruda = { porRol: {} };
      for (const c of l.celdas) { const k = columnaDe(c, cfg.columnas); if (k) agregar(k.rol, c.texto, f); }
      filas.push(f);
    }
  }
  return filas;
}

// ---------- lectura ----------

export function leerConPlantilla(doc: Documento, cfg: ConfigPlantilla, hoy = new Date()): Lectura {
  let movs: MovLeido[] = [];
  for (const { porRol: r } of filasCrudas(doc, cfg)) {
    const fecha = r.fecha ? leerFecha(r.fecha, cfg.ordenFecha, hoy) : null;
    if (!fecha) continue;
    const num = (s?: string) => (s && pareceMonto(s) ? montoCon(s, cfg.decimal) : null);
    const saldo = num(r.saldo) ?? undefined;
    let monto: number | null = null, sentido: MovLeido["sentido"] = "cargo";
    const cargo = num(r.cargo), abono = num(r.abono);
    if (cargo || abono) {
      if (Math.abs(cargo ?? 0) > 0) { monto = Math.abs(cargo!); sentido = "cargo"; }
      else { monto = Math.abs(abono!); sentido = "abono"; }
    } else {
      const v = num(r.valor);
      if (v == null || v === 0) continue;
      monto = Math.abs(v);
      sentido = cfg.signo === "positivo_es_gasto" ? (v > 0 ? "cargo" : "abono") : (v < 0 ? "cargo" : "abono");
    }
    if (!monto) continue;
    movs.push({ fecha, descripcion: (r.descripcion ?? "").replace(/\s+/g, " ").trim() || "(sin descripción)", monto, sentido, saldo, cuadra: null });
  }
  // Extractos que van de reciente a antiguo: se ponen en orden cronológico.
  if (movs.length > 1 && movs[0].fecha > movs[movs.length - 1].fecha) movs = movs.reverse();

  const mensajes: string[] = [];
  let ok = false;
  const conSaldo = movs.filter((m) => m.saldo != null).length;
  if (conSaldo === movs.length && movs.length > 1) {
    // La primera fila es la referencia; de ahí en adelante cada saldo debe cuadrar.
    let malas = 0;
    for (let i = 1; i < movs.length; i++) {
      const m = movs[i], prev = movs[i - 1].saldo!;
      if (cfg.signo === "saldo") {
        if (prev - m.monto === m.saldo) { m.sentido = "cargo"; m.cuadra = true; }
        else if (prev + m.monto === m.saldo) { m.sentido = "abono"; m.cuadra = true; }
        else m.cuadra = false;
      } else m.cuadra = prev + (m.sentido === "abono" ? m.monto : -m.monto) === m.saldo;
      if (!m.cuadra) malas++;
    }
    if (cfg.signo === "saldo") {
      // Primera fila: el sentido que hace cuadrar con la segunda no se puede saber; se usa la descripción.
      movs[0].sentido = /ABONO|RECIB|DEP[OÓ]SITO|INTERES|CONSIGNA|TRANSFERENCIA DE|^DE /i.test(movs[0].descripcion) ? "abono" : "cargo";
    }
    ok = malas === 0;
    mensajes.push(ok
      ? "Cada fila cuadra con el saldo (la primera es la referencia)."
      : `${malas} ${malas === 1 ? "fila no cuadra" : "filas no cuadran"} con el saldo: revisa las columnas o el signo.`);
  } else {
    mensajes.push("Este formato no trae saldo por fila: revisa que montos y signos estén bien.");
  }
  if (!movs.length) mensajes.unshift("No se encontraron movimientos con estas columnas.");
  const fs = movs.map((m) => m.fecha).sort();
  return { movimientos: movs, desde: fs[0] ?? null, hasta: fs[fs.length - 1] ?? null, validacion: { ok, mensajes } };
}

// ---------- propuestas automáticas para el asistente ----------

const TITULOS: [Rol, RegExp][] = [
  ["fecha", /fecha/i],
  ["saldo", /saldo/i],
  ["cargo", /cargo|d[eé]bito|retiro|egreso|salida/i],
  ["abono", /abono|cr[eé]dito|dep[oó]sito|ingreso|entrada/i],
  ["valor", /valor|monto|importe|cantidad/i],
  ["descripcion", /descrip|concepto|detalle|transacci|movimiento|referencia|comercio/i],
];

/** Hoja de cálculo: fila de títulos probable (la primera con 2+ títulos conocidos). */
export function proponerFilaTitulos(filas: string[][]): number {
  const i = filas.slice(0, 40).findIndex((f) => f.filter((c) => TITULOS.some(([, re]) => re.test(c))).length >= 2);
  return i;
}

export function rolPorTitulo(titulo: string): Rol {
  return TITULOS.find(([, re]) => re.test(titulo))?.[0] ?? "ignorar";
}

/** PDF: rol probable de cada trozo de una línea de ejemplo. */
export function rolesDeLinea(celdas: Celda[]): Rol[] {
  const montos = celdas.map((c, i) => (pareceMonto(c.texto) ? i : -1)).filter((i) => i >= 0);
  let fechaPuesta = false;
  return celdas.map((c, i) => {
    if (!fechaPuesta && pareceFecha(c.texto) && !pareceMonto(c.texto)) { fechaPuesta = true; return "fecha"; }
    if (montos.includes(i)) return montos.length >= 2 && i === montos[montos.length - 1] ? "saldo" : "valor";
    if (/[a-zA-ZÁÉÍÓÚÑáéíóúñ]{3,}/.test(c.texto)) return "descripcion";
    return "ignorar";
  });
}

/** Una línea distintiva del encabezado para reconocer el extracto (letras, pocos números). */
export function proponerFrase(texto: string): string {
  const lineas = texto.split("\n").slice(0, 25).map((l) => l.replace(/\s{3,}/g, " ").trim())
    .filter((l) => l.length >= 6 && l.length <= 60 && (l.match(/\d/g) ?? []).length <= l.length * 0.2 && /[A-Za-zÁÉÍÓÚÑ]{4,}/.test(l));
  return lineas.find((l) => /extracto|banco|cuenta|estado|nequi|daviplata|lulo|nu\b|bancolombia|davivienda|tarjeta/i.test(l)) ?? lineas[0] ?? "";
}

export const normalizarFrase = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
