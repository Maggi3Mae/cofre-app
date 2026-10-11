// Reglas de categoría: aprendidas (comercio exacto) y palabras clave (diccionario, editable).
import { db } from "$lib/db";

const U = 1;

export type TipoRegla = "comercio" | "palabra";
export type OrigenRegla = "aprendida" | "fabrica";

export interface Regla {
  id: number;
  patron: string;
  categoria_id: number;
  categoria_nombre: string;
  categoria_tipo: "ingreso" | "egreso";
  tipo: TipoRegla;
  origen: OrigenRegla;
}

/** Minúsculas, sin tildes y solo letras/números separados por un espacio: «Droguería  CRUZ-Verde» → «drogueria cruz verde». */
export function normalizarPatron(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();
}

export async function listarReglas(): Promise<Regla[]> {
  return (await db()).select<Regla[]>(
    `SELECT r.id, r.patron, r.categoria_id, r.tipo, r.origen, c.nombre AS categoria_nombre, c.tipo AS categoria_tipo
     FROM reglas r JOIN categorias c ON c.id = r.categoria_id
     WHERE r.usuario_id = $1 ORDER BY r.tipo, c.nombre COLLATE NOCASE, r.patron`,
    [U],
  );
}

/** Crea la regla o, si ya existe ese patrón, le cambia la categoría. */
export async function guardarRegla(patron: string, categoriaId: number, tipo: TipoRegla, origen: OrigenRegla = "aprendida"): Promise<void> {
  const p = normalizarPatron(patron);
  if (!p) throw new Error("La palabra clave no puede quedar vacía.");
  await (await db()).execute(
    `INSERT INTO reglas (usuario_id, patron, categoria_id, tipo, origen) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (usuario_id, tipo, patron) DO UPDATE SET categoria_id = excluded.categoria_id, origen = excluded.origen`,
    [U, p, categoriaId, tipo, origen],
  );
}

export async function eliminarRegla(id: number): Promise<void> {
  await (await db()).execute("DELETE FROM reglas WHERE id = $1 AND usuario_id = $2", [id, U]);
}

export async function cambiarCategoriaRegla(id: number, categoriaId: number): Promise<void> {
  await (await db()).execute("UPDATE reglas SET categoria_id = $1 WHERE id = $2 AND usuario_id = $3", [categoriaId, id, U]);
}

/** Categorías que ya le diste a cada comercio (para sugerir aunque no haya regla). */
export async function historialCategorias(): Promise<{ comercio: string; categoria_id: number; n: number }[]> {
  return (await db()).select(
    `SELECT comercio, categoria_id, COUNT(*) AS n FROM transacciones
     WHERE usuario_id = $1 AND categoria_id IS NOT NULL AND comercio IS NOT NULL AND tipo <> 'transferencia'
     GROUP BY comercio COLLATE NOCASE, categoria_id`,
    [U],
  );
}
