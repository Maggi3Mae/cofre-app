// Reparto de un gasto grupal (puro, sin base de datos). Montos en centavos; las partes salen en pesos enteros.
// Los pesos que sobran al redondear van a tu parte (o a la última si no participas), para que a los demás
// les toque un número redondo.

export type ModoReparto = "igual" | "montos" | "porcentaje";

export interface Participante {
  /** Identificador libre (id de la persona, «yo»…). */
  clave: string;
  yo: boolean;
  /** montos: centavos sin propina; porcentaje: fracción 0–1. No se usa en «igual». */
  valor?: number;
}

export interface Reparto {
  propina: number;
  /** Lo que se pagó en total: base + propina. */
  total: number;
  partes: { clave: string; yo: boolean; monto: number }[];
  /** false si los montos no suman la base o los porcentajes no suman 100 %. */
  cuadra: boolean;
  /** Lo que falta por asignar (montos: en centavos; porcentaje: en fracción). Negativo si sobra. */
  falta: number;
}

const aPesos = (centavos: number) => Math.floor(centavos / 100) * 100;

/** Pone el sobrante en tu parte (o en la última) para que la suma dé exacto. */
function ajustar(partes: Reparto["partes"], total: number) {
  if (!partes.length) return;
  const resto = total - partes.reduce((s, p) => s + p.monto, 0);
  const destino = partes.find((p) => p.yo) ?? partes[partes.length - 1];
  destino.monto += resto;
}

export function repartir(base: number, propinaPct: number, modo: ModoReparto, participantes: Participante[]): Reparto {
  const propina = propinaPct > 0 ? Math.round((base * propinaPct) / 100) * 100 : 0;
  const total = base + propina;
  const n = participantes.length;
  let partes: Reparto["partes"] = [];
  let cuadra = n > 0, falta = 0;

  if (modo === "igual") {
    const cada = n ? aPesos(total / n) : 0;
    partes = participantes.map((p) => ({ clave: p.clave, yo: p.yo, monto: cada }));
    ajustar(partes, total);
  } else if (modo === "montos") {
    const suma = participantes.reduce((s, p) => s + (p.valor ?? 0), 0);
    falta = base - suma;
    cuadra = cuadra && falta === 0;
    // La propina se reparte en proporción a lo que consumió cada uno.
    partes = participantes.map((p) => {
      const v = p.valor ?? 0;
      return { clave: p.clave, yo: p.yo, monto: v + (suma > 0 ? aPesos((propina * v) / suma) : 0) };
    });
    if (cuadra) ajustar(partes, total);
  } else {
    const suma = participantes.reduce((s, p) => s + (p.valor ?? 0), 0);
    falta = Math.round((1 - suma) * 10000) / 10000; // a 2 decimales de porcentaje
    cuadra = cuadra && falta === 0;
    partes = participantes.map((p) => ({ clave: p.clave, yo: p.yo, monto: aPesos(total * (p.valor ?? 0)) }));
    if (cuadra) ajustar(partes, total);
  }
  return { propina, total, partes, cuadra, falta };
}
