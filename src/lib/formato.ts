// Moneda es-CO: «$ 1.250.000», signo − (U+2212) para egresos.
const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Montos en centavos → texto. */
export function pesos(centavos: number, signo?: "+" | "−"): string {
  const t = cop.format(Math.abs(centavos) / 100);
  return signo ? `${signo} ${t}` : t;
}

/** Abreviado para gráficas: «$ 9,85 M». */
export function pesosCorto(centavos: number): string {
  const v = Math.abs(centavos) / 100;
  if (v >= 1e6) return `$ ${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 2 })} M`;
  if (v >= 1e3) return `$ ${Math.round(v / 1e3).toLocaleString("es-CO")} mil`;
  return cop.format(v);
}

const usd = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", currencyDisplay: "code", maximumFractionDigits: 2 });

/** Monto en centavos según la moneda de la cuenta. */
export function monto(centavos: number, moneda: "COP" | "USD" = "COP", signo?: "+" | "−"): string {
  if (moneda === "COP") return pesos(centavos, signo);
  const t = usd.format(Math.abs(centavos) / 100);
  return signo ? `${signo} ${t}` : t;
}

// ---------- Calculadora en los campos de monto ----------
// «91.000+220.000», «3x45.000+10.000», «600.000/3»: + − * (o x, ×) / (o ÷) con prioridad normal.
// Parser propio (sin eval). Un «-» al inicio es signo. Lo que quede a medias al final («91000+») se ignora.

const OPERADOR = /[+\-−*x×X/÷]/;

/** ¿El texto tiene una operación (un operador después del primer número)? */
export function esOperacion(texto: string): boolean {
  return OPERADOR.test(texto.trim().replace(/^[-−]/, ""));
}

/** Número escrito en formato es-CO («1.250.000,5») → número. */
const numeroEsCo = (t: string) => Number(t.replace(/\./g, "").replace(",", "."));

/** Resultado de la operación en pesos (con decimales), o null si no se puede calcular. */
export function evaluarOperacion(texto: string): number | null {
  // Fichas: números y operadores normalizados a + - * /
  const fichas = texto.replace(/\s+/g, "").match(/[\d.,]+|[+\-−*x×X/÷]/g);
  if (!fichas?.length) return null;
  const norm = fichas.map((f) => (/[x×X*]/.test(f) ? "*" : f === "÷" || f === "/" ? "/" : f === "−" || f === "-" ? "-" : f));
  // Signo inicial
  let i = 0, signo = 1;
  if (norm[0] === "-") { signo = -1; i = 1; }
  // Sumas de productos: [número, (op número)*]
  let total = 0, termino: number | null = null, opSuma = signo;
  let esperoNumero = true, opMult: string | null = null;
  for (; i < norm.length; i++) {
    const f = norm[i];
    if (esperoNumero) {
      if (!/\d/.test(f)) return null; // dos operadores seguidos
      const n = numeroEsCo(f);
      if (isNaN(n)) return null;
      termino = termino == null ? n : opMult === "*" ? termino * n : n === 0 ? NaN : termino / n;
      esperoNumero = false;
    } else {
      if (f === "+" || f === "-") { total += opSuma * (termino ?? 0); termino = null; opSuma = f === "+" ? 1 : -1; opMult = null; }
      else { opMult = f; }
      esperoNumero = true;
    }
  }
  if (termino != null) total += opSuma * termino; // un operador colgando al final se ignora
  else if (i <= 1) return null;
  return isFinite(total) ? total : null;
}

/** Texto escrito por la persona («1.250.000», «-500000», «45,90» o una operación «91.000+220.000») → centavos. null si no es número. */
export function leerMonto(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  if (esOperacion(t)) {
    const v = evaluarOperacion(t);
    return v == null ? null : Math.round(v * 100);
  }
  const negativo = /^[-−]/.test(t);
  const limpio = t.replace(/[^\d,]/g, "").replace(",", ".");
  if (!limpio || isNaN(Number(limpio))) return null;
  const v = Math.round(Number(limpio) * 100);
  return negativo ? -v : v;
}

/** Centavos → texto editable sin símbolo («1.250.000» o «45,9»). */
export function montoEditable(centavos: number | null | undefined): string {
  if (centavos == null) return "";
  return (centavos / 100).toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

/** Fecha local de hoy en «AAAA-MM-DD». */
export function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Formatea lo que se va escribiendo en un campo de monto: «1250000» → «1.250.000», conserva signo y hasta 2 decimales.
 *  Con una operación formatea cada número y deja los operadores («91000+220000» → «91.000+220.000»). */
export function formatearEscritura(texto: string): string {
  if (esOperacion(texto)) {
    const negativo = /^\s*[-−]/.test(texto);
    const partes = texto.replace(/^\s*[-−]/, "").split(/\s*([+\-−*x×X/÷])\s*/);
    const simbolo: Record<string, string> = { "+": "+", "-": "−", "−": "−", "*": "×", x: "×", X: "×", "×": "×", "/": "÷", "÷": "÷" };
    return (negativo ? "-" : "") + partes
      .map((p, i) => (i % 2 ? simbolo[p] : p ? formatearNumero(p) : ""))
      .join("");
  }
  return formatearNumero(texto);
}

function formatearNumero(texto: string): string {
  const negativo = /^\s*[-−]/.test(texto);
  const [entero = "", ...resto] = texto.replace(/[^\d,]/g, "").split(",");
  const digitos = entero.replace(/^0+(?=\d)/, "");
  const agrupado = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimales = resto.length ? "," + resto.join("").slice(0, 2) : "";
  return (negativo ? "-" : "") + agrupado + decimales;
}
