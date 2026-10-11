import { db } from "$lib/db";
import type { Etiqueta } from "./tipos";

const U = 1;
export const MAX_ETIQUETA = 30;

/** Alfabéticas, con movimientos y totales históricos (las transferencias no cuentan). */
export async function listarEtiquetas(): Promise<Etiqueta[]> {
  return (await db()).select<Etiqueta[]>(
    `SELECT e.id, e.nombre,
       COUNT(t.id) AS num_movimientos,
       COALESCE(SUM(CASE WHEN t.tipo = 'egreso' THEN t.monto END), 0) AS gastado,
       COALESCE(SUM(CASE WHEN t.tipo = 'ingreso' THEN t.monto END), 0) AS recibido
     FROM etiquetas e
     LEFT JOIN transaccion_etiquetas te ON te.etiqueta_id = e.id
     LEFT JOIN transacciones t ON t.id = te.transaccion_id
     WHERE e.usuario_id = $1
     GROUP BY e.id
     ORDER BY e.nombre COLLATE NOCASE`,
    [U],
  );
}

function limpiar(nombre: string): string {
  const n = nombre.trim().replace(/\s+/g, " ");
  if (!n) throw new Error("La etiqueta necesita un nombre.");
  if (n.length > MAX_ETIQUETA) throw new Error(`Máximo ${MAX_ETIQUETA} caracteres.`);
  return n;
}

async function buscarPorNombre(nombre: string, excepto = 0) {
  const [f] = await (await db()).select<{ id: number; nombre: string }[]>(
    "SELECT id, nombre FROM etiquetas WHERE usuario_id=$1 AND nombre=$2 COLLATE NOCASE AND id<>$3",
    [U, nombre, excepto]);
  return f ?? null;
}

/** Devuelve el id de la etiqueta; la crea si no existe (sin distinguir mayúsculas). */
export async function obtenerOCrearEtiqueta(nombre: string): Promise<number> {
  const n = limpiar(nombre);
  const existe = await buscarPorNombre(n);
  if (existe) return existe.id;
  const r = await (await db()).execute("INSERT INTO etiquetas (nombre, usuario_id) VALUES ($1,$2)", [n, U]);
  return r.lastInsertId as number;
}

/**
 * Renombra. Si ya existe otra con ese nombre no cambia nada y la devuelve,
 * para que la pantalla ofrezca unirlas.
 */
export async function renombrarEtiqueta(id: number, nombre: string): Promise<{ choque: { id: number; nombre: string } | null }> {
  const n = limpiar(nombre);
  const choque = await buscarPorNombre(n, id);
  if (choque) return { choque };
  await (await db()).execute("UPDATE etiquetas SET nombre=$1 WHERE id=$2 AND usuario_id=$3", [n, id, U]);
  return { choque: null };
}

/** Pasa los movimientos de `origen` a `destino` (sin duplicar) y borra `origen`. */
export async function unirEtiquetas(origen: number, destino: number): Promise<void> {
  if (origen === destino) return;
  const conexion = await db();
  await conexion.execute(
    `INSERT OR IGNORE INTO transaccion_etiquetas (transaccion_id, etiqueta_id)
     SELECT transaccion_id, $2 FROM transaccion_etiquetas WHERE etiqueta_id = $1`,
    [origen, destino]);
  await conexion.execute("DELETE FROM etiquetas WHERE id=$1 AND usuario_id=$2", [origen, U]);
}

/** Quita la etiqueta de todos sus movimientos (los movimientos no se borran). */
export async function eliminarEtiqueta(id: number): Promise<void> {
  await (await db()).execute("DELETE FROM etiquetas WHERE id=$1 AND usuario_id=$2", [id, U]);
}
