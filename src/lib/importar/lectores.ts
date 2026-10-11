// Lectores de extractos: convierten el texto del documento en movimientos y los validan con los
// totales o saldos que trae el mismo extracto. Un lector por formato (ver bancos.ts).
import type { Documento } from "./documento";

export type Sentido = "cargo" | "abono";

export interface MovLeido {
  fecha: string;          // AAAA-MM-DD
  descripcion: string;    // tal como viene en el extracto
  monto: number;          // centavos, siempre positivo
  sentido: Sentido;       // cargo = sale plata / sube la deuda; abono = entra / baja la deuda
  saldo?: number;         // saldo después del movimiento, si el extracto lo trae
  /** El saldo de esta fila cuadra con la anterior (null = el extracto no trae saldo por fila). */
  cuadra: boolean | null;
  cuota?: { n: number; de: number };
}

export interface Lectura {
  movimientos: MovLeido[];
  desde: string | null;
  hasta: string | null;
  /** ok = todo cuadra con el extracto; los mensajes explican qué se comprobó o qué falló. */
  validacion: { ok: boolean; mensajes: string[] };
}

// ---------- utilidades ----------

const NUM = String.raw`\d{1,3}(?:,\d{3})*\.\d{2}`;
const reNum = new RegExp(NUM, "g");

/** «1,234.56» / «$-50,000.00» / «- 5,000.00» → centavos (con signo). */
export function aCentavos(s: string): number {
  const neg = /-/.test(s);
  const [ent, dec = "0"] = s.replace(/[^\d.]/g, "").split(".");
  const v = Number(ent || "0") * 100 + Number(dec.padEnd(2, "0").slice(0, 2));
  return neg ? -v : v;
}

/** Centavos → «1,349,589.00» (como lo escriben los extractos), para buscar totales en el texto. */
export const comoExtracto = (c: number) =>
  (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pesos = (c: number) => "$ " + Math.round(Math.abs(c) / 100).toLocaleString("es-CO");

function lineas(doc: Documento): string[] {
  return doc.tipo === "pdf"
    ? doc.paginas.flatMap((p) => p.lineas.map((l) => l.texto))
    : doc.hojas.flatMap((h) => h.filas.map((f) => f.filter(Boolean).join("   ")));
}

function rango(movs: MovLeido[]) {
  const f = movs.map((m) => m.fecha).sort();
  return { desde: f[0] ?? null, hasta: f[f.length - 1] ?? null };
}

/**
 * Recorre movimientos en orden cronológico comprobando saldo anterior ± monto = saldo de la fila.
 * Si `deducir` es verdadero, el sentido (cargo/abono) se toma de lo que haga cuadrar el saldo.
 */
function encadenarSaldos(movs: MovLeido[], inicial: number | null, final: number | null, deducir: boolean): Lectura["validacion"] {
  const mensajes: string[] = [];
  let previo = inicial;
  let malas = 0;
  for (const m of movs) {
    if (m.saldo == null || previo == null) { m.cuadra = null; previo = m.saldo ?? null; continue; }
    if (deducir) {
      if (previo - m.monto === m.saldo) { m.sentido = "cargo"; m.cuadra = true; }
      else if (previo + m.monto === m.saldo) { m.sentido = "abono"; m.cuadra = true; }
      else m.cuadra = false;
    } else {
      m.cuadra = previo + (m.sentido === "abono" ? m.monto : -m.monto) === m.saldo;
    }
    if (!m.cuadra) malas++;
    previo = m.saldo;
  }
  if (inicial == null) mensajes.push("No se encontró el saldo anterior para comprobar la primera fila.");
  if (malas) mensajes.push(`${malas} ${malas === 1 ? "fila no cuadra" : "filas no cuadran"} con el saldo: revísalas.`);
  const ultimo = movs.length ? movs[movs.length - 1].saldo : inicial;
  if (final != null && ultimo != null && ultimo !== final)
    mensajes.push(`El saldo final leído (${pesos(ultimo)}) no coincide con el del extracto (${pesos(final)}).`);
  const ok = inicial != null && !malas && (final == null || ultimo === final);
  if (ok) mensajes.push(`Cada fila cuadra con el saldo, de ${pesos(inicial!)} a ${pesos(ultimo ?? inicial!)}.`);
  return { ok, mensajes };
}

// ---------- BBVA · tarjeta de crédito ----------
// 15012026   001234   DROGUERIA EJEMPLO   .00   35,000.00
// 18012026   000000   Pagaste usando tus Puntos   -   5,000.00
// 25012026   000000   PAGO TARJETA DE CRED   - 500,000.00
// 20012026   005678   SUPERMERCADO EJEMPLO   .00   01 DE 01   60,000.00   60,000.00   60,000.00   00.00
//   (valor original, saldo a corte, cargos del mes, saldo diferido)

export function leerBbvaCredito(doc: Documento): Lectura {
  const movs: MovLeido[] = [];
  for (const l of lineas(doc)) {
    const m = l.match(/^(\d{2})(\d{2})(\d{4})\s+\d{6}\s+(.*)$/);
    if (!m) continue;
    const partes = m[4].split(/\s{3,}/);
    const descripcion = partes.shift()!.trim();
    let resto = partes.join("   ").trim();
    const abono = /^-(\s|$)/.test(resto);
    resto = resto.replace(/^(-|\.00|\d+\.\d{2}%?)(\s{3,}|$)/, "").replace(/^-\s*/, "");
    const cuota = resto.match(/(\d{2})\s+DE\s+(\d{2})/);
    const montos = (resto.replace(/\d{2}\s+DE\s+\d{2}/, "").match(reNum) ?? []).map(aCentavos);
    if (!montos.length) continue;
    const c = cuota ? { n: +cuota[1], de: +cuota[2] } : undefined;
    // Desde la 2.ª cuota lo que se cobra este mes es «cargos del mes», no el valor original.
    const monto = c && c.n > 1 && montos[2] != null ? montos[2] : montos[0];
    movs.push({ fecha: `${m[3]}-${m[2]}-${m[1]}`, descripcion, monto, sentido: abono ? "abono" : "cargo", cuadra: null, cuota: c });
  }
  const cargos = movs.filter((x) => x.sentido === "cargo").reduce((s, x) => s + x.monto, 0);
  const abonos = movs.filter((x) => x.sentido === "abono").reduce((s, x) => s + x.monto, 0);
  const enTexto = (v: number) => new RegExp(String.raw`(^|\s)${comoExtracto(v).replace(/[.,]/g, "\\$&")}(\s|$)`, "m").test(doc.texto);
  const okC = enTexto(cargos), okA = !abonos || enTexto(abonos);
  const mensajes = [
    okC ? `Las compras suman ${pesos(cargos)}, igual a la facturación del mes.` : `Las compras suman ${pesos(cargos)} y no coinciden con la facturación del extracto.`,
  ];
  if (abonos) mensajes.push(okA ? `Pagos y abonos suman ${pesos(abonos)}, igual al extracto.` : `Pagos y abonos suman ${pesos(abonos)} y no coinciden con el extracto.`);
  return { movimientos: movs, ...rango(movs), validacion: { ok: okC && okA && movs.length > 0, mensajes } };
}

// ---------- BBVA · cuenta de ahorros ----------
// 101   10-01-2026   10-01-2026   PAGO DE TARJETA DE CREDITO *1234   500,000.00   1,500,000.00
// (sin número)  31-01-2026   31-01-2026   ABONO POR INTERESES DE CUENTA   25.00   1,500,025.00
// Cargos y abonos quedan en la misma posición del texto: el sentido se deduce del saldo.

export function leerBbvaAhorros(doc: Documento): Lectura {
  const re = new RegExp(String.raw`^(?:\d+\s+)?(\d{2})-(\d{2})-(\d{4})\s+\d{2}-\d{2}-\d{4}\s+(.+?)\s+(${NUM})\s+(-?${NUM})$`);
  const movs: MovLeido[] = [];
  for (const l of lineas(doc)) {
    const m = l.trim().match(re);
    if (!m) continue;
    const descripcion = m[4].trim();
    movs.push({
      fecha: `${m[3]}-${m[2]}-${m[1]}`, descripcion, monto: aCentavos(m[5]), saldo: aCentavos(m[6]),
      // provisional: lo corrige el saldo
      sentido: /^ABONO|INTERESES|^RECIBI/i.test(descripcion) ? "abono" : "cargo", cuadra: null,
    });
  }
  const ini = doc.texto.match(new RegExp(String.raw`SALDO CIERRE MES ANTERIOR\s+(-?${NUM})`));
  const fin = doc.texto.match(new RegExp(String.raw`SALDO FINAL\s+(-?${NUM})`));
  const validacion = encadenarSaldos(movs, ini ? aCentavos(ini[1]) : null, fin ? aCentavos(fin[1]) : null, true);
  return { movimientos: movs, ...rango(movs), validacion };
}

// ---------- Nequi ----------
// 30/01/2026   COMPRA EN SUPERMERCADO   $-50,000.00   $150,000.00   (de más reciente a más antiguo)

export function leerNequi(doc: Documento): Lectura {
  const re = new RegExp(String.raw`^(\d{2})/(\d{2})/(\d{4})\s+(.+?)\s+\$\s?(-?${NUM})\s+\$\s?(-?${NUM})$`);
  const movs: MovLeido[] = [];
  for (const l of lineas(doc)) {
    const m = l.trim().match(re);
    if (!m) continue;
    const v = aCentavos(m[5]);
    movs.push({
      fecha: `${m[3]}-${m[2]}-${m[1]}`, descripcion: m[4].trim(), monto: Math.abs(v),
      sentido: v < 0 ? "cargo" : "abono", saldo: aCentavos(m[6]), cuadra: null,
    });
  }
  movs.reverse(); // a orden cronológico
  const ini = doc.texto.match(new RegExp(String.raw`Saldo anterior\s+\$\s?(-?${NUM})`));
  const fin = doc.texto.match(new RegExp(String.raw`Saldo actual\s+\$\s?(-?${NUM})`));
  const validacion = encadenarSaldos(movs, ini ? aCentavos(ini[1]) : null, fin ? aCentavos(fin[1]) : null, false);
  return { movimientos: movs, ...rango(movs), validacion };
}

// ---------- comercio legible ----------

const PREFIJOS = [
  /^COMPRA PSE EN\s+/i, /^COMPRA EN\s+/i, /^PAGO POR PSE A\s+/i, /^PAGO EN QR BRE-B:\s*/i,
  /^RECIBI POR BRE-B DE:\s*/i, /^De\s+/, /^ABONO DOMI\.\s*\S+\s+/i,
];
const MAYUS = new Set(["SAS", "S.A", "S.A.", "SA", "IPS", "CC", "QR", "PSE", "II", "III", "IV", "SOAT", "IVA", "D1", "H12"]);
const MENORES = new Set(["de", "del", "la", "las", "el", "los", "en", "y", "a", "por", "con"]);

/** «COMPRA EN CARNICA IV» → «Carnica IV»; «EPY*JEAN PENA» → «Jean Pena»; «PAGO POR PSE A TIGO - COLOMBIA» → «Tigo - Colombia». */
export function comercioLegible(desc: string): string {
  let s = desc.trim();
  for (const p of PREFIJOS) s = s.replace(p, "");
  s = s.replace(/^[A-Z]{2,5}\*(?=\S)/, ""); // procesadores de pago: EPY*, BOLD*, DLO*
  s = s.replace(/\*[A-Z0-9]{1,3}$/, ""); // sufijos de pasarela: UBER RIDES*DL
  return s
    .split(/\s+/)
    .map((w, i, arr) => {
      const u = w.toUpperCase();
      if (MAYUS.has(u) || /\d/.test(w) || w.includes("*")) return u;
      const l = w.toLowerCase();
      if (i > 0 && i < arr.length - 1 && MENORES.has(l)) return l;
      return l.replace(/(^|-)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
    })
    .join(" ");
}
