import { db } from "$lib/db";
import { avisarCambio } from "./cambios";
import { eliminarTransacciones } from "./transacciones";

const U = 1;

export interface Importacion {
  id: number;
  archivo: string;
  banco: string;
  cuenta_id: number | null;
  cuenta_nombre: string | null;
  desde: string | null;
  hasta: string | null;
  movimientos: number;
  /** Movimientos de esta importación que siguen en la base (pudieron borrarse a mano). */
  vigentes: number;
  creado_en: string;
}

export async function listarImportaciones(limite = 50): Promise<Importacion[]> {
  return (await db()).select<Importacion[]>(
    `SELECT i.*, c.nombre AS cuenta_nombre,
       (SELECT COUNT(*) FROM transacciones t WHERE t.importacion_id = i.id) AS vigentes
     FROM importaciones i LEFT JOIN cuentas c ON c.id = i.cuenta_id
     WHERE i.usuario_id = $1 ORDER BY i.creado_en DESC, i.id DESC LIMIT $2`,
    [U, limite],
  );
}

/** ¿Este archivo (por su huella) ya se importó? */
export async function importacionPorHuella(huella: string): Promise<Importacion | null> {
  const [f] = await (await db()).select<Importacion[]>(
    `SELECT i.*, c.nombre AS cuenta_nombre, 0 AS vigentes
     FROM importaciones i LEFT JOIN cuentas c ON c.id = i.cuenta_id
     WHERE i.usuario_id = $1 AND i.huella_archivo = $2`,
    [U, huella],
  );
  return f ?? null;
}

export interface ImportacionNueva {
  archivo: string; huella_archivo: string; banco: string; cuenta_id: number;
  desde: string | null; hasta: string | null; movimientos: number;
}

export async function crearImportacion(i: ImportacionNueva): Promise<number> {
  const r = await (await db()).execute(
    `INSERT INTO importaciones (usuario_id, archivo, huella_archivo, banco, cuenta_id, desde, hasta, movimientos)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [U, i.archivo, i.huella_archivo, i.banco, i.cuenta_id, i.desde, i.hasta, i.movimientos],
  );
  return r.lastInsertId as number;
}

/**
 * Borra los movimientos que trajo la importación y el registro (el archivo se puede volver a subir).
 * Los movimientos que ya existían y se unieron con esta importación se sueltan; si se habían
 * convertido en transferencia, vuelven a ser egreso/ingreso de la cuenta de la que se importaron.
 */
export async function deshacerImportacion(id: number): Promise<number> {
  const con = await db();
  await con.execute(
    `UPDATE transacciones SET
       tipo = CASE WHEN tipo <> 'transferencia' OR origen IS NULL THEN tipo
                   WHEN origen = cuenta_id THEN 'egreso' ELSE 'ingreso' END,
       cuenta_id = CASE WHEN tipo = 'transferencia' AND origen IS NOT NULL THEN origen ELSE cuenta_id END,
       cuenta_destino_id = CASE WHEN tipo = 'transferencia' AND origen IS NOT NULL THEN NULL ELSE cuenta_destino_id END,
       huella_par = NULL, importacion_par_id = NULL
     FROM (SELECT t2.id AS tid, i.cuenta_id AS origen FROM transacciones t2
           LEFT JOIN importaciones i ON i.id = t2.importacion_id AND t2.importacion_id IS NOT NULL
           WHERE t2.importacion_par_id = $1) x
     WHERE transacciones.id = x.tid AND usuario_id = $2`,
    [id, U],
  );
  const ids = (await con.select<{ id: number }[]>(
    "SELECT id FROM transacciones WHERE importacion_id = $1 AND usuario_id = $2", [id, U])).map((f) => f.id);
  await eliminarTransacciones(ids);
  await con.execute("DELETE FROM importaciones WHERE id = $1 AND usuario_id = $2", [id, U]);
  const salida = ids.length;
  avisarCambio();
  return salida;
}

/** Cuáles de estas huellas ya están en la base (movimientos importados antes). */
export async function huellasExistentes(huellas: string[]): Promise<Set<string>> {
  if (!huellas.length) return new Set();
  const filas = await (await db()).select<{ huella: string }[]>(
    `SELECT huella FROM transacciones WHERE usuario_id = $1 AND huella IN (SELECT value FROM json_each($2))
     UNION SELECT huella_par FROM transacciones WHERE usuario_id = $1 AND huella_par IN (SELECT value FROM json_each($2))`,
    [U, JSON.stringify(huellas)],
  );
  return new Set(filas.map((f) => f.huella));
}

export interface MovimientoImport {
  huella: string; fecha: string; monto: number; tipo: "ingreso" | "egreso" | "transferencia";
  cuenta_id: number; cuenta_destino_id: number | null; categoria_id: number | null;
  comercio: string | null; notas: string | null;
}

/**
 * Inserta todos los movimientos en una sola sentencia (todo o nada). Los que ya existan por huella
 * se ignoran. Devuelve cuántos entraron y actualiza el conteo de la importación.
 */
export async function insertarMovimientos(importacionId: number, movs: MovimientoImport[]): Promise<number> {
  if (!movs.length) return 0;
  const con = await db();
  const campo = (k: string) => `json_extract(j.value, '$.${k}')`;
  const r = await con.execute(
    `INSERT OR IGNORE INTO transacciones
       (usuario_id, fecha, monto, tipo, cuenta_id, cuenta_destino_id, categoria_id, comercio, notas, huella, importacion_id)
     SELECT $1, ${campo("fecha")}, ${campo("monto")}, ${campo("tipo")}, ${campo("cuenta_id")}, ${campo("cuenta_destino_id")},
            ${campo("categoria_id")}, ${campo("comercio")}, ${campo("notas")}, ${campo("huella")}, $2
     FROM json_each($3) j`,
    [U, importacionId, JSON.stringify(movs)],
  );
  await con.execute(
    `UPDATE importaciones SET movimientos = (SELECT COUNT(*) FROM transacciones WHERE importacion_id = $1) WHERE id = $1`,
    [importacionId],
  );
  avisarCambio();
  return r.rowsAffected;
}

// ---------- Cruce con movimientos que ya existen ----------

export interface Candidato {
  id: number; fecha: string; monto: number; tipo: "ingreso" | "egreso" | "transferencia";
  cuenta_id: number; cuenta_destino_id: number | null; huella: string | null;
  comercio: string | null; notas: string | null;
  /** Cuenta de cuyo extracto salió (null = registrado a mano). */
  cuenta_import: number | null;
  tipo_cuenta: string;
}

/** Movimientos sin «otro lado» enlazado, en el rango de fechas y con alguno de esos montos. */
export async function candidatosCruce(desde: string, hasta: string, montos: number[]): Promise<Candidato[]> {
  if (!montos.length) return [];
  return (await db()).select<Candidato[]>(
    `SELECT t.id, t.fecha, t.monto, t.tipo, t.cuenta_id, t.cuenta_destino_id, t.huella, t.comercio, t.notas,
            i.cuenta_id AS cuenta_import, c.tipo AS tipo_cuenta
     FROM transacciones t
     JOIN cuentas c ON c.id = t.cuenta_id
     LEFT JOIN importaciones i ON i.id = t.importacion_id
     WHERE t.usuario_id = $1 AND t.huella_par IS NULL AND t.fecha BETWEEN date($2, '-4 days') AND date($3, '+4 days')
       AND t.monto IN (SELECT value FROM json_each($4))`,
    [U, desde, hasta, JSON.stringify([...new Set(montos)])],
  );
}

/** El movimiento ya existía: se le anota la huella del extracto para no volver a proponerlo. */
export async function enlazarMovimiento(txId: number, huella: string, importacionId: number): Promise<void> {
  await (await db()).execute(
    "UPDATE transacciones SET huella_par = $1, importacion_par_id = $2 WHERE id = $3 AND usuario_id = $4",
    [huella, importacionId, txId, U],
  );
}

/** Une un egreso/ingreso ya importado con su otro lado: queda como transferencia origen → destino. */
export async function convertirEnTransferencia(txId: number, origen: number, destino: number, huella: string, importacionId: number): Promise<void> {
  await (await db()).execute(
    `UPDATE transacciones SET tipo = 'transferencia', cuenta_id = $1, cuenta_destino_id = $2, categoria_id = NULL,
       huella_par = $3, importacion_par_id = $4
     WHERE id = $5 AND usuario_id = $6`,
    [origen, destino, huella, importacionId, txId, U],
  );
  avisarCambio();
}
