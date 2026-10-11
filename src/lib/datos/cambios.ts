// Aviso de «los movimientos cambiaron»: lo escuchan las alertas de presupuesto para revisarse solas.
const oyentes = new Set<() => void>();

export function alCambiarDatos(f: () => void): () => void {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

export function avisarCambio(): void {
  for (const f of oyentes) f();
}
