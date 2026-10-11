// Formatos de extracto que la usuaria le enseña a Cofre (ver importar/plantilla.ts).
import { db } from "$lib/db";
import type { TipoCuenta } from "./tipos";

const U = 1;

export type Rol = "fecha" | "descripcion" | "valor" | "cargo" | "abono" | "saldo" | "ignorar";
export type OrdenFecha = "DMA" | "AMD" | "MDA";
export type Signo = "negativo_es_gasto" | "positivo_es_gasto" | "saldo";

export interface ColumnaPlantilla {
  rol: Rol;
  /** Hoja de cálculo: posición de la columna. */
  indice?: number;
  /** PDF: posición horizontal del trozo de texto en la línea de ejemplo. */
  x?: number;
  x2?: number;
}

export interface ConfigPlantilla {
  documento: "pdf" | "hoja";
  hoja?: string;
  /** Hoja de cálculo: fila de títulos; los movimientos van debajo. */
  filaTitulos?: number;
  columnas: ColumnaPlantilla[];
  ordenFecha: OrdenFecha;
  decimal: "," | ".";
  signo: Signo;
}

export interface Plantilla {
  id: number;
  nombre: string;
  banco: string;
  tipo_cuenta: TipoCuenta;
  cuenta_id: number | null;
  frase: string;
  documento: "pdf" | "hoja";
  config: ConfigPlantilla;
}

export async function listarPlantillas(): Promise<Plantilla[]> {
  const filas = await (await db()).select<(Omit<Plantilla, "config"> & { config: string })[]>(
    "SELECT id, nombre, banco, tipo_cuenta, cuenta_id, frase, documento, config FROM plantillas_banco WHERE usuario_id = $1 ORDER BY nombre COLLATE NOCASE",
    [U],
  );
  return filas.map((f) => ({ ...f, config: JSON.parse(f.config) as ConfigPlantilla }));
}

export async function guardarPlantilla(p: Omit<Plantilla, "id">, id?: number): Promise<number> {
  if (!p.nombre.trim()) throw new Error("Ponle un nombre al formato.");
  if (!p.frase.trim()) throw new Error("Falta la frase que identifica el extracto.");
  const v = [p.nombre.trim(), p.banco.trim() || p.nombre.trim(), p.tipo_cuenta, p.cuenta_id, p.frase.trim(), p.documento, JSON.stringify(p.config)];
  const con = await db();
  if (id) {
    await con.execute(
      `UPDATE plantillas_banco SET nombre=$1, banco=$2, tipo_cuenta=$3, cuenta_id=$4, frase=$5, documento=$6, config=$7
       WHERE id=$8 AND usuario_id=$9`, [...v, id, U]);
    return id;
  }
  const r = await con.execute(
    `INSERT INTO plantillas_banco (nombre, banco, tipo_cuenta, cuenta_id, frase, documento, config, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [...v, U]);
  return r.lastInsertId as number;
}

export async function eliminarPlantilla(id: number): Promise<void> {
  await (await db()).execute("DELETE FROM plantillas_banco WHERE id = $1 AND usuario_id = $2", [id, U]);
}
