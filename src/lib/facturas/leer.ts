// Interpretación de facturas: el texto del QR DIAN y el texto del OCR → datos para un movimiento.
// Funciones puras (sin navegador) para poder probarlas con texto real.
import { comercioLegible } from "$lib/importar/lectores";

export type MedioPago = "efectivo" | "debito" | "credito" | "transferencia";

export interface DatosFactura {
  comercio: string | null;
  nit: string | null;
  fecha: string | null;   // AAAA-MM-DD
  /** La fecha leída no era creíble y se corrigió el año: hay que confirmarla. */
  fechaDudosa: boolean;
  total: number | null;   // centavos
  medio: MedioPago | null;
  cufe: string | null;
  numero: string | null;
  /** De dónde salió cada dato, para mostrar qué revisar. */
  fuente: { qr: boolean; ocr: boolean };
}

const vacio = (): DatosFactura => ({
  comercio: null, nit: null, fecha: null, fechaDudosa: false, total: null, medio: null, cufe: null, numero: null,
  fuente: { qr: false, ocr: false },
});

const soloDigitos = (s: string) => s.replace(/\D/g, "");

/** NIT sin dígito de verificación ni puntos: «890.319.193-3» → «890319193». */
export function normalizarNit(s: string): string | null {
  const m = s.replace(/[\s.]/g, "").match(/(\d{6,10})(?:-\d)?/);
  return m ? m[1] : null;
}

/** Monto en pesos escrito en una factura → centavos. «36,000» / «$17.900» / «2,666.67» / «17900.00». */
export function montoFactura(s: string): number | null {
  const t = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(t)) return null;
  const ult = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  // Dos dígitos después del último separador = centavos; si no, los separadores son de miles.
  if (ult >= 0 && /^\d{2}$/.test(t.slice(ult + 1))) {
    const entero = soloDigitos(t.slice(0, ult));
    return Number(entero || "0") * 100 + Number(t.slice(ult + 1));
  }
  return Number(soloDigitos(t)) * 100;
}

function fechaValida(a: number, m: number, d: number): string | null {
  if (a < 100) a += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 2000 || a > 2100) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const iso = (f: Date) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;

/**
 * Una factura es de hace máximo 2 años y no del futuro. Si el año no cuadra (el OCR leyó «2006» por
 * «2026»), se usa el año actual, o el anterior si así quedaría en el futuro, y se marca como dudosa.
 */
export function fechaCreible(f: string, hoy = new Date()): { fecha: string; dudosa: boolean } | null {
  const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);
  const minimo = new Date(hoy); minimo.setFullYear(minimo.getFullYear() - 2);
  if (f >= iso(minimo) && f <= iso(manana)) return { fecha: f, dudosa: false };
  const [, m, d] = f.split("-").map(Number);
  for (const a of [hoy.getFullYear(), hoy.getFullYear() - 1]) {
    const g = fechaValida(a, m, d);
    if (g && g <= iso(manana)) return { fecha: g, dudosa: true };
  }
  return null;
}

/** Primera fecha creíble del texto: AAAA/M/D, AAAA-MM-DD o D/MM/AAAA. */
export function buscarFecha(texto: string, hoy = new Date()): { fecha: string; dudosa: boolean } | null {
  const lineas = texto.split("\n");
  // Primero las líneas que dicen FECHA, luego todo el texto.
  const orden = [...lineas.filter((l) => /FECHA|CREADO|PAGADA/i.test(l)), ...lineas];
  let dudosa: { fecha: string; dudosa: boolean } | null = null;
  for (const l of orden) {
    const candidatas: (string | null)[] = [];
    let m = l.match(/\b(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\b/);
    if (m) candidatas.push(fechaValida(+m[1], +m[2], +m[3]));
    m = l.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/);
    if (m) candidatas.push(fechaValida(+m[3], +m[2], +m[1]));
    for (const c of candidatas) {
      const r = c ? fechaCreible(c, hoy) : null;
      if (r && !r.dudosa) return r;
      dudosa ??= r;
    }
  }
  return dudosa;
}

// ---------- QR DIAN ----------
// Formato con datos, separado por saltos de línea o por «;» (D1):
//   NumFac: 171P-178427\nFecFac: 2026-09-27\n...NitFac: 890904478\n...ValTolFac: 17900.00\nCUFE: ...
//   NumFac=G4O685404;FecFac=2026-10-13;...;ValTotalFac=14199.99;CUFE=...;QRCode=https://...
// Formato solo enlace: https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=<CUFE>
// Enlace del comercio con parámetros (Dollarcity): ...?transdate=2026-10-15&prefix=F6G1&correlative=2048594&total=6000.00
//   No trae CUFE ni NIT: se toman fecha, número y total.

export function leerQrDian(qr: string): DatosFactura | null {
  const d = vacio();
  // El valor va hasta el fin de línea, un «;» o (en enlaces) un «&».
  const campo = (...nombres: string[]) => {
    for (const n of nombres) {
      const v = qr.match(new RegExp(`(?:^|[\\s;?&])${n}\\s*[:=]\\s*([^\\n\\r;&]+)`, "i"))?.[1].trim();
      if (v) return v;
    }
    return null;
  };
  const cufe = campo("CUFE", "documentkey") ?? null;
  if (cufe && /^[0-9a-f]{64,}$/i.test(cufe)) d.cufe = cufe.toLowerCase();
  const prefijo = campo("prefix"), consecutivo = campo("correlative");
  d.numero = campo("NumFac") ?? (prefijo && consecutivo ? `${prefijo}-${consecutivo}` : null);
  const nit = campo("NitFac");
  d.nit = nit ? normalizarNit(nit) : null;
  const fec = campo("FecFac", "transdate");
  const f = fec ? buscarFecha(fec) : null;
  d.fecha = f?.fecha ?? null;
  d.fechaDudosa = f?.dudosa ?? false;
  const total = campo("ValTolFac", "ValTotFac", "ValTotalFac", "total");
  d.total = total ? Math.round(Number(total.replace(/[^\d.]/g, "")) * 100) || null : null;
  if (!d.cufe && !d.nit && !d.total) return null; // no es un QR de factura
  d.fuente.qr = true;
  return d;
}

// ---------- OCR ----------

const MONTO = String.raw`\$?\s?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\$\s?\d{4,}(?:[.,]\d{2})?`;
const reMonto = new RegExp(MONTO, "g");
const montosDe = (l: string) => (l.match(reMonto) ?? []).map((x) => montoFactura(x)).filter((x): x is number => x != null && x > 0);

/** Sufijo de sociedad colombiana al final de una línea: S.A., S.A.S., LTDA, E.U., S.C.A., S.EN C. */
const reSociedad = /\s+(?:S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?|LTDA\.?|E\.?\s?U\.?|S\.?\s?C\.?\s?A\.?|S\.?\s?EN\s?C\.?)\s*$/i;
const limpiarLinea = (l: string) => l.replace(/[^\p{L}\d&.\- ]/gu, " ").replace(/\s+/g, " ").trim();
const letras = (l: string) => (l.match(/\p{L}/gu) ?? []).length;

/** Razón social con su sufijo («FARMATODO COLOMBIA S.A») → nombre legible sin el sufijo («Farmatodo Colombia»). */
function sinSociedad(l: string): string | null {
  // El OCR suele leer la «S» de «S.A» como «$» o «5».
  const base = limpiarLinea(l.replace(/(\s)[$5](?=\.?\s?A\b)/g, "$1S")).replace(/\bN\.?I\.?T\b.*$/i, "").trim();
  if (!reSociedad.test(base)) return null;
  const nombre = base.replace(reSociedad, "").replace(/[.\-&\s]+$/, "").trim();
  return letras(nombre) >= 3 ? comercioLegible(nombre) : null;
}

/**
 * `nitConocido`: el NIT que ya se sabe (p. ej. el del QR de la DIAN). Sirve para ubicar en el texto el
 * encabezado del comercio aunque el OCR lea mal la palabra «NIT».
 */
export function leerTextoFactura(texto: string, nitConocido: string | null = null): DatosFactura {
  const d = vacio();
  d.fuente.ocr = true;
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);

  // NIT del comercio: el primero (el del cliente viene después, como «Nit o C.C»). Se saltan los del pie
  // de la factura electrónica (proveedor tecnológico, rango autorizado, resolución).
  const pie = /PROVEEDOR|TECNOL|RANGO|RESOLUCI|AUTORIZ|PREFIJO|VIGENCIA|\bVIG\b|MESES DEL|DIAN|SOFTWARE|NOMBRE DEL SW/i;
  const esNit = (l: string, i: number) =>
    /\bN\.?I\.?T\b/i.test(l) && !/C\.?\s?C/i.test(l) && !pie.test(l) && !pie.test(lineas[i - 1] ?? "");
  const mitad = Math.ceil(lineas.length / 2);
  let iNit = -1;
  if (nitConocido) iNit = lineas.findIndex((l) => soloDigitos(l).includes(nitConocido));
  if (iNit < 0) iNit = lineas.findIndex((l, i) => i < mitad && esNit(l, i));
  // El NIT del comercio va arriba: si el QR ya lo dio y no aparece en la primera mitad, no se busca en el pie.
  if (iNit < 0 && !nitConocido) iNit = lineas.findIndex(esNit);
  if (nitConocido) d.nit = nitConocido;
  else if (iNit >= 0) d.nit = normalizarNit(lineas[iNit].replace(/^.*?N\.?I\.?T\.?\s*[:.]?/i, ""));

  // Comercio, en orden de confianza:
  // 1. La razón social (termina en S.A., S.A.S., LTDA…) en la línea del NIT o en las 3 de arriba.
  // 2. Una razón social en la primera mitad del tiquete (lejos del pie, donde está el proveedor tecnológico).
  // 3. La línea con más letras antes del NIT (o la primera con letras).
  const cerca = iNit >= 0 ? lineas.slice(Math.max(0, iNit - 3), iNit + 1).reverse() : [];
  const razon =
    cerca.map(sinSociedad).find((x) => x) ??
    lineas.slice(0, mitad).filter((l) => !pie.test(l)).map(sinSociedad).find((x) => x);
  if (razon) d.comercio = razon;
  else {
    const antes = (iNit > 0 ? lineas.slice(Math.max(0, iNit - 3), iNit) : lineas.slice(0, 4))
      .map(limpiarLinea)
      .filter((l) => letras(l) >= 4 && !pie.test(l));
    // De cada candidata se toma la racha más larga de palabras en mayúscula (el OCR deja basura alrededor).
    const nombres = antes
      .map((l) => (l.match(/(?:\p{Lu}[\p{Lu}&.\-]+\s?)+/gu) ?? []).map((x) => x.trim()).sort((a, b) => b.length - a.length)[0] ?? "")
      .filter((x) => x.length >= 4);
    // Con NIT: la más larga de las 3 líneas de arriba. Sin NIT: la primera (el nombre suele abrir el
    // tiquete; las siguientes son eslogan y dirección).
    if (nombres.length) d.comercio = comercioLegible(iNit > 0 ? [...nombres].sort((a, b) => b.length - a.length)[0] : nombres[0]);
  }

  const f = buscarFecha(texto);
  d.fecha = f?.fecha ?? null;
  d.fechaDudosa = f?.dudosa ?? false;

  // Total: línea TOTAL (no subtotal, productos, ítems, bruto ni IVA) → su último monto.
  const esTotal = (l: string) => /\bTOTAL\b/i.test(l) && !/SUB|PRODUCTO|ITEM|[IÍ]TEMS|BRUTO|IVA|IMPUESTO/i.test(l);
  for (const l of lineas.filter(esTotal)) {
    const ms = montosDe(l);
    if (ms.length) { d.total = ms[ms.length - 1]; break; }
  }
  // Si no, el monto del medio de pago.
  if (d.total == null)
    for (const l of lineas.filter((l) => /EFECTIVO|TARJETA|D[EÉ]BITO|CR[EÉ]DITO|NEQUI|DAVIPLATA/i.test(l))) {
      const ms = montosDe(l);
      if (ms.length) { d.total = ms[ms.length - 1]; break; }
    }

  if (/TARJETA\s+D[EÉ]BITO|D[EÉ]BITO/i.test(texto)) d.medio = "debito";
  else if (/TARJETA\s+CR[EÉ]DITO|CR[EÉ]DITO/i.test(texto)) d.medio = "credito";
  else if (/NEQUI|DAVIPLATA|BRE-?B|TRANSFERENCIA/i.test(texto)) d.medio = "transferencia";
  else if (/EFECTIVO/i.test(texto)) d.medio = "efectivo";

  // CUFE impreso (96 caracteres hex); solo si el OCR lo leyó completo.
  const cufe = texto.match(/CUFE\s*:?\s*([0-9a-f\s]{90,})/i)?.[1].replace(/\s/g, "");
  if (cufe && /^[0-9a-f]{96}$/i.test(cufe)) d.cufe = cufe.toLowerCase();
  const num = texto.match(/FACTURA[^\n]*VENTA\s*:?\s*\n?\s*([A-Z0-9]{2,6}-?\d{3,})/i);
  if (num) d.numero = num[1];
  return d;
}

/** Une QR (más confiable) con OCR (completa lo que falte). */
export function combinar(qr: DatosFactura | null, ocr: DatosFactura | null): DatosFactura {
  const r = vacio();
  for (const k of ["comercio", "nit", "total", "medio", "cufe", "numero"] as const)
    (r as any)[k] = qr?.[k] ?? ocr?.[k] ?? null;
  const conFecha = qr?.fecha ? qr : ocr;
  r.fecha = conFecha?.fecha ?? null;
  r.fechaDudosa = conFecha?.fechaDudosa ?? false;
  r.fuente = { qr: !!qr, ocr: !!ocr };
  return r;
}
