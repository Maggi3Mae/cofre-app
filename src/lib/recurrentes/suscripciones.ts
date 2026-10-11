// Detectar suscripciones y pagos que se repiten cada mes (sin dependencias; se prueba en pruebas/recurrentes.prueba.ts).
// Regla: egresos del mismo comercio en ≥ 3 meses seguidos, día ±5 y monto ±10 % de lo típico,
// el último hace ≤ 40 días. No cuenta lo que ya es recurrente ni lo descartado.

export interface EgresoVisto {
  fecha: string;
  monto: number;
  comercio: string;
  cuenta_id: number;
  categoria_id: number | null;
  recurrente_id: number | null;
}

export interface SugerenciaSuscripcion {
  /** Comercio normalizado: identifica la sugerencia (para descartarla). */
  clave: string;
  /** Como aparece en el último movimiento. */
  comercio: string;
  monto: number;
  /** Día típico (31 = último día del mes). */
  dia: number;
  meses: number;
  ultima: string;
  cuenta_id: number;
  categoria_id: number | null;
}

export const MIN_MESES = 3;
const TOLERANCIA_DIA = 5;
const TOLERANCIA_MONTO = 0.1;
const MAX_DIAS_ULTIMA = 40;

/** «NETFLIX.COM 4521» y «Netflix.com» → «netflix com». Sin tildes (ñ → n), números ni signos. */
export function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z]+/g, " ").trim().replace(/\s+/g, " ");
}

const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
/** Distancia entre días del mes, sabiendo que el 30 y el 2 están cerca. */
const distDia = (a: number, b: number) => { const d = Math.abs(a - b); return Math.min(d, 30 - d); };
const moda = <T,>(v: T[]): T => {
  const n = new Map<T, number>();
  for (const x of v) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0][0];
};
const mesDe = (f: string) => Number(f.slice(0, 4)) * 12 + Number(f.slice(5, 7)) - 1;
const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export function detectar(egresos: EgresoVisto[], hoy: string, excluir: Set<string>): SugerenciaSuscripcion[] {
  const grupos = new Map<string, EgresoVisto[]>();
  for (const e of egresos) {
    const k = normalizar(e.comercio ?? "");
    if (k.length < 2 || excluir.has(k)) continue;
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(e);
  }
  const out: SugerenciaSuscripcion[] = [];
  for (const [clave, lista] of grupos) {
    if (lista.some((e) => e.recurrente_id != null)) continue; // ya está programado
    const porMes = new Map<number, EgresoVisto[]>();
    for (const e of lista) (porMes.get(mesDe(e.fecha)) ?? porMes.set(mesDe(e.fecha), []).get(mesDe(e.fecha))!).push(e);
    if ([...porMes.values()].some((m) => m.length > 2)) continue; // compras frecuentes, no una suscripción
    // Racha de meses seguidos que termina en el último mes con movimiento.
    const meses = [...porMes.keys()].sort((a, b) => b - a);
    let racha = 1;
    while (racha < meses.length && meses[racha] === meses[racha - 1] - 1) racha++;
    if (racha < MIN_MESES) continue;
    const base = mediana(lista.map((e) => e.monto));
    // Un movimiento por mes: el más parecido al monto típico.
    const elegidos = meses.slice(0, racha).map((m) =>
      porMes.get(m)!.reduce((a, b) => (Math.abs(b.monto - base) < Math.abs(a.monto - base) ? b : a)));
    const monto = mediana(elegidos.map((e) => e.monto));
    const dia = mediana(elegidos.map((e) => Number(e.fecha.slice(8, 10))));
    if (elegidos.some((e) => Math.abs(e.monto - monto) > monto * TOLERANCIA_MONTO)) continue;
    if (elegidos.some((e) => distDia(Number(e.fecha.slice(8, 10)), dia) > TOLERANCIA_DIA)) continue;
    const ultimo = elegidos[0];
    if (dias(ultimo.fecha, hoy) > MAX_DIAS_ULTIMA) continue;
    out.push({
      clave, comercio: ultimo.comercio.trim(), monto, dia: dia >= 29 ? 31 : dia, meses: racha, ultima: ultimo.fecha,
      cuenta_id: moda(elegidos.map((e) => e.cuenta_id)), categoria_id: moda(elegidos.map((e) => e.categoria_id)),
    });
  }
  return out.sort((a, b) => b.monto - a.monto);
}

/** Lo que equivale al mes: semanal × 52/12, quincenal × 2, anual / 12. */
export function alMes(frecuencia: "mensual" | "quincenal" | "semanal" | "anual", monto: number): number {
  return frecuencia === "semanal" ? Math.round((monto * 52) / 12)
    : frecuencia === "quincenal" ? monto * 2
    : frecuencia === "anual" ? Math.round(monto / 12)
    : monto;
}
