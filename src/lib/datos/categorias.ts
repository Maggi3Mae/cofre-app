import { db } from "$lib/db";
import { leerAjuste, guardarAjuste } from "./ajustes";
import type { Categoria, CategoriaNueva } from "./tipos";

const U = 1;

/** «AAAA-MM» del mes actual (hora local). */
function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Lista ordenada: por tipo (egresos primero), y dentro de cada tipo alfabética,
 * con cada subcategoría justo debajo de su padre.
 * total_mes del padre incluye a sus hijas.
 */
export async function listarCategorias(): Promise<Categoria[]> {
  const filas = await (await db()).select<Categoria[]>(
    `SELECT c.id, c.nombre, c.tipo, c.icono, c.color, c.padre_id,
       (SELECT COUNT(*) FROM transacciones t WHERE t.categoria_id = c.id) AS num_movimientos,
       (SELECT COALESCE(SUM(t.monto), 0) FROM transacciones t
        WHERE t.categoria_id = c.id AND strftime('%Y-%m', t.fecha) = $2) AS total_mes,
       (SELECT COUNT(*) FROM categorias h WHERE h.padre_id = c.id) AS num_hijas
     FROM categorias c WHERE c.usuario_id = $1`,
    [U, mesActual()],
  );
  // Sumar las hijas al padre
  const porId = new Map(filas.map((c) => [c.id, c]));
  for (const c of filas) {
    const padre = c.padre_id != null ? porId.get(c.padre_id) : undefined;
    if (padre) padre.total_mes += c.total_mes;
  }
  const alfa = (a: Categoria, b: Categoria) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
  const raices = filas.filter((c) => c.padre_id == null || !porId.has(c.padre_id)).sort(alfa);
  const orden: Categoria[] = [];
  for (const tipo of ["egreso", "ingreso"] as const)
    for (const r of raices.filter((c) => c.tipo === tipo)) {
      orden.push(r);
      orden.push(...filas.filter((h) => h.padre_id === r.id).sort(alfa));
    }
  return orden;
}

/** Movimientos de ingreso/egreso que aún no tienen categoría. */
export async function contarSinCategoria(): Promise<number> {
  const [{ n }] = await (await db()).select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM transacciones
     WHERE usuario_id = $1 AND categoria_id IS NULL AND tipo <> 'transferencia'`, [U]);
  return n;
}

/**
 * Para el aviso del Dashboard: total sin categoría, o 0 si se descartó y no han llegado nuevos
 * (se guarda el id más alto que había al descartar).
 */
export async function avisoSinCategoria(): Promise<number> {
  const hasta = Number(await leerAjuste("sin_categoria_descartado")) || 0;
  const [{ n, nuevos }] = await (await db()).select<{ n: number; nuevos: number }[]>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(id > $2), 0) AS nuevos FROM transacciones
     WHERE usuario_id = $1 AND categoria_id IS NULL AND tipo <> 'transferencia'`, [U, hasta]);
  return nuevos > 0 ? n : 0;
}

/** Oculta el aviso hasta que haya movimientos sin categoría nuevos. */
export async function descartarAvisoSinCategoria(): Promise<void> {
  const [{ m }] = await (await db()).select<{ m: number | null }[]>(
    `SELECT MAX(id) AS m FROM transacciones WHERE usuario_id = $1 AND categoria_id IS NULL AND tipo <> 'transferencia'`, [U]);
  await guardarAjuste("sin_categoria_descartado", String(m ?? 0));
}

async function validar(c: CategoriaNueva, id?: number) {
  const conexion = await db();
  const nombre = c.nombre.trim();
  if (!nombre) throw new Error("La categoría necesita un nombre.");

  const [repetida] = await conexion.select<{ id: number }[]>(
    `SELECT id FROM categorias WHERE usuario_id=$1 AND tipo=$2 AND nombre=$3 COLLATE NOCASE AND id <> $4`,
    [U, c.tipo, nombre, id ?? 0]);
  if (repetida) throw new Error(`Ya existe la categoría «${nombre}» en ${c.tipo === "egreso" ? "egresos" : "ingresos"}.`);

  if (id != null) {
    const [actual] = await conexion.select<{ tipo: string; num_mov: number; num_hijas: number }[]>(
      `SELECT tipo,
         (SELECT COUNT(*) FROM transacciones WHERE categoria_id = $1) AS num_mov,
         (SELECT COUNT(*) FROM categorias WHERE padre_id = $1) AS num_hijas
       FROM categorias WHERE id = $1`, [id]);
    if (actual && actual.tipo !== c.tipo && (actual.num_mov > 0 || actual.num_hijas > 0))
      throw new Error("No puedes cambiar el tipo: esta categoría ya tiene movimientos o subcategorías.");
    if (c.padre_id != null && actual?.num_hijas)
      throw new Error("Esta categoría tiene subcategorías; no puede ser subcategoría de otra.");
  }

  if (c.padre_id == null) return;
  if (c.padre_id === id) throw new Error("Una categoría no puede ser su propio padre.");
  const [padre] = await conexion.select<{ tipo: string; padre_id: number | null }[]>(
    "SELECT tipo, padre_id FROM categorias WHERE id=$1 AND usuario_id=$2", [c.padre_id, U]);
  if (!padre) throw new Error("La categoría padre no existe.");
  if (padre.padre_id != null) throw new Error("Solo se permite un nivel de subcategorías.");
  if (padre.tipo !== c.tipo) throw new Error("El padre debe ser del mismo tipo (ingreso o egreso).");
}

export async function crearCategoria(c: CategoriaNueva): Promise<number> {
  await validar(c);
  const r = await (await db()).execute(
    "INSERT INTO categorias (nombre, tipo, icono, color, padre_id, usuario_id) VALUES ($1,$2,$3,$4,$5,$6)",
    [c.nombre.trim(), c.tipo, c.icono, c.color, c.padre_id, U],
  );
  return r.lastInsertId as number;
}

export async function editarCategoria(id: number, c: CategoriaNueva): Promise<void> {
  await validar(c, id);
  await (await db()).execute(
    "UPDATE categorias SET nombre=$1, tipo=$2, icono=$3, color=$4, padre_id=$5 WHERE id=$6 AND usuario_id=$7",
    [c.nombre.trim(), c.tipo, c.icono, c.color, c.padre_id, id, U],
  );
}

/**
 * Elimina la categoría.
 * · Sus movimientos pasan a `moverA` (del mismo tipo) o quedan sin categoría (null).
 * · Sus subcategorías pasan a ser categorías principales.
 * · Se borran su presupuesto y sus reglas automáticas.
 */
export async function eliminarCategoria(id: number, moverA: number | null = null): Promise<void> {
  const conexion = await db();
  if (moverA != null) {
    if (moverA === id) throw new Error("Elige una categoría distinta para mover los movimientos.");
    const [par] = await conexion.select<{ a: string; b: string }[]>(
      `SELECT (SELECT tipo FROM categorias WHERE id=$1) AS a, (SELECT tipo FROM categorias WHERE id=$2) AS b`,
      [id, moverA]);
    if (!par?.b) throw new Error("La categoría destino no existe.");
    if (par.a !== par.b) throw new Error("La categoría destino debe ser del mismo tipo.");
  }
  await conexion.execute(
    "UPDATE transacciones SET categoria_id=$1 WHERE categoria_id=$2 AND usuario_id=$3", [moverA, id, U]);
  await conexion.execute("DELETE FROM categorias WHERE id=$1 AND usuario_id=$2", [id, U]);
}
