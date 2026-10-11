// Sugerencia de categoría al importar. Prioridad:
//   1. regla aprendida (comercio exacto)
//   2. historial (todas las veces que categorizaste ese comercio, la misma categoría)
//   3. palabra clave (diccionario; gana la más específica = la más larga)
// Una sugerencia solo vale si la categoría es del mismo tipo que el movimiento (ingreso/egreso).
import { normalizarPatron, type Regla } from "$lib/datos";

export type OrigenSugerencia = "regla" | "historial" | "palabra";
export interface Sugerencia { categoriaId: number; origen: OrigenSugerencia; detalle: string }

export function crearCategorizador(
  reglas: Regla[],
  historial: { comercio: string; categoria_id: number; n: number }[],
  tipoDe: (categoriaId: number) => "ingreso" | "egreso" | undefined,
) {
  const porComercio = new Map<string, number>();
  for (const r of reglas) if (r.tipo === "comercio") porComercio.set(r.patron, r.categoria_id);

  // Historial: comercio → categoría solo si siempre fue la misma.
  const hist = new Map<string, number | null>();
  for (const h of historial) {
    const k = normalizarPatron(h.comercio);
    hist.set(k, hist.has(k) && hist.get(k) !== h.categoria_id ? null : h.categoria_id);
  }

  const palabras = reglas
    .filter((r) => r.tipo === "palabra")
    .sort((a, b) => b.patron.length - a.patron.length);

  return function sugerir(descripcion: string, comercio: string, tipo: "ingreso" | "egreso"): Sugerencia | null {
    const vale = (id: number | null | undefined) => id != null && tipoDe(id) === tipo;
    const c = normalizarPatron(comercio);
    const r = porComercio.get(c);
    if (vale(r)) return { categoriaId: r!, origen: "regla", detalle: "regla aprendida" };
    const h = hist.get(c);
    if (vale(h)) return { categoriaId: h!, origen: "historial", detalle: "como las veces anteriores" };
    const texto = ` ${normalizarPatron(descripcion)} ${c} `;
    for (const p of palabras)
      if (vale(p.categoria_id) && texto.includes(` ${p.patron} `))
        return { categoriaId: p.categoria_id, origen: "palabra", detalle: `palabra clave «${p.patron}»` };
    return null;
  };
}
