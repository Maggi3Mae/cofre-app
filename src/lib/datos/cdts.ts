// CDT: registro, renovación automática, retiro a una cuenta e historial.
// La apertura con cuenta origen crea una transferencia cuenta → CDT; el retiro, una CDT → cuenta.
import { db } from "$lib/db";
import { hoy } from "$lib/formato";
import { calcularCdt, type CalculoCdt } from "$lib/inversiones/calculo";
import { avisarCambio } from "./cambios";

const U = 1;

export interface Cdt {
  id: number;
  nombre: string;
  banco: string | null;
  monto: number;
  tasa_ea: number;
  fecha_inicio: string;
  plazo_dias: number;
  renovacion_auto: boolean;
  retencion: number;
  cuenta_origen_id: number | null;
  cuenta_origen_nombre: string | null;
  notas: string | null;
  retirado_en: string | null;
  renovado: boolean;
  cdt_anterior_id: number | null;
  /** Cuenta que recibió el retiro (si lo hubo). */
  cuenta_retiro_nombre: string | null;
  calculo: CalculoCdt;
}

export type CdtNuevo = Pick<Cdt,
  "nombre" | "banco" | "monto" | "tasa_ea" | "fecha_inicio" | "plazo_dias" | "renovacion_auto" | "retencion"
  | "cuenta_origen_id" | "notas">;

type Fila = Omit<Cdt, "renovacion_auto" | "renovado" | "calculo"> & { renovacion_auto: number; renovado: number };

const SQL = `
SELECT k.id, k.nombre, k.banco, k.monto, k.tasa_ea, k.fecha_inicio, k.plazo_dias, k.renovacion_auto, k.retencion,
       k.cuenta_origen_id, co.nombre AS cuenta_origen_nombre, k.notas, k.retirado_en, k.renovado, k.cdt_anterior_id,
       (SELECT c.nombre FROM transacciones t JOIN cuentas c ON c.id = t.cuenta_id WHERE t.cdt_origen_id = k.id LIMIT 1)
         AS cuenta_retiro_nombre
FROM cdts k LEFT JOIN cuentas co ON co.id = k.cuenta_origen_id
WHERE k.usuario_id = $1`;

const mapear = (f: Fila, dia: string): Cdt => ({
  ...f, renovacion_auto: !!f.renovacion_auto, renovado: !!f.renovado, calculo: calcularCdt(f, dia),
});

/** Todos los CDT (abiertos e historial), con sus cálculos a la fecha `dia`. Renueva primero los que tocan. */
export async function listarCdts(dia = hoy()): Promise<Cdt[]> {
  await renovarVencidos(dia);
  const filas = await (await db()).select<Fila[]>(`${SQL} ORDER BY k.fecha_inicio DESC, k.id DESC`, [U]);
  return filas.map((f) => mapear(f, dia));
}

/** Valor neto de hoy de los CDT sin retirar (vencidos: su total al vencimiento). Para el Patrimonio. */
export async function valorCdts(dia = hoy()): Promise<number> {
  return (await listarCdts(dia)).filter((c) => !c.retirado_en).reduce((s, c) => s + c.calculo.totalNetoHoy, 0);
}

/**
 * Renovación automática: un CDT vencido con renovación se cierra y nace uno nuevo con el total neto
 * como capital, desde la fecha de vencimiento, con la misma tasa y plazo (editable después).
 */
async function renovarVencidos(dia: string): Promise<void> {
  const conexion = await db();
  let cambio = false;
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    const filas = (await conexion.select<Fila[]>(
      `${SQL} AND k.retirado_en IS NULL AND k.renovacion_auto = 1`, [U])).map((f) => mapear(f, dia));
    const vencidos = filas.filter((c) => c.calculo.estado === "vencido");
    if (!vencidos.length) break;
    for (const c of vencidos) {
      const fin = c.calculo.vencimiento;
      await conexion.execute(
        `INSERT INTO cdts (usuario_id, nombre, banco, monto, tasa_ea, fecha_inicio, plazo_dias, renovacion_auto,
           retencion, notas, cdt_anterior_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10)`,
        [U, c.nombre, c.banco, c.calculo.totalNetoVencimiento, c.tasa_ea, fin, c.plazo_dias, c.retencion, c.notas, c.id]);
      await conexion.execute("UPDATE cdts SET retirado_en = $1, renovado = 1 WHERE id = $2", [fin, c.id]);
      cambio = true;
    }
  }
  if (cambio) avisarCambio();
}

async function validar(c: CdtNuevo) {
  if (!c.nombre.trim()) throw new Error("El CDT necesita un nombre.");
  if (!Number.isInteger(c.monto) || c.monto <= 0) throw new Error("El monto invertido debe ser mayor que cero.");
  if (!(c.tasa_ea > 0 && c.tasa_ea < 1)) throw new Error("La tasa E.A. debe estar entre 0 % y 100 %.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha_inicio)) throw new Error("La fecha de inicio no es válida.");
  if (!Number.isInteger(c.plazo_dias) || c.plazo_dias < 1 || c.plazo_dias > 3650)
    throw new Error("El plazo debe estar entre 1 y 3.650 días.");
  if (!(c.retencion >= 0 && c.retencion < 1)) throw new Error("La retención debe estar entre 0 % y 100 %.");
  if (c.cuenta_origen_id != null) {
    const [cta] = await (await db()).select<{ tipo: string; moneda: string }[]>(
      "SELECT tipo, moneda FROM cuentas WHERE id = $1 AND usuario_id = $2", [c.cuenta_origen_id, U]);
    if (!cta) throw new Error("La cuenta origen no existe.");
    if (cta.tipo === "credito") throw new Error("La cuenta origen no puede ser una tarjeta de crédito.");
    if (cta.moneda !== "COP") throw new Error("Por ahora los CDT son solo en pesos: elige una cuenta en COP.");
  }
}

const valores = (c: CdtNuevo) => [
  c.nombre.trim(), c.banco?.trim() || null, c.monto, c.tasa_ea, c.fecha_inicio, c.plazo_dias,
  c.renovacion_auto ? 1 : 0, c.retencion, c.cuenta_origen_id, c.notas?.trim() || null,
];

/** Transferencia de apertura: se rehace con los datos actuales (o se quita si ya no hay cuenta origen). */
async function sincronizarApertura(id: number, c: CdtNuevo) {
  const conexion = await db();
  await conexion.execute("DELETE FROM transacciones WHERE cdt_destino_id = $1 AND usuario_id = $2", [id, U]);
  if (c.cuenta_origen_id == null) return;
  await conexion.execute(
    `INSERT INTO transacciones (usuario_id, fecha, monto, tipo, cuenta_id, cdt_destino_id, comercio)
     VALUES ($1,$2,$3,'transferencia',$4,$5,$6)`,
    [U, c.fecha_inicio, c.monto, c.cuenta_origen_id, id, `Apertura CDT ${c.nombre.trim()}`]);
}

export async function crearCdt(c: CdtNuevo): Promise<number> {
  await validar(c);
  const r = await (await db()).execute(
    `INSERT INTO cdts (nombre, banco, monto, tasa_ea, fecha_inicio, plazo_dias, renovacion_auto, retencion,
       cuenta_origen_id, notas, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [...valores(c), U]);
  const id = r.lastInsertId as number;
  await sincronizarApertura(id, c);
  avisarCambio();
  return id;
}

export async function editarCdt(id: number, c: CdtNuevo): Promise<void> {
  await validar(c);
  await (await db()).execute(
    `UPDATE cdts SET nombre=$1, banco=$2, monto=$3, tasa_ea=$4, fecha_inicio=$5, plazo_dias=$6, renovacion_auto=$7,
       retencion=$8, cuenta_origen_id=$9, notas=$10
     WHERE id=$11 AND usuario_id=$12`,
    [...valores(c), id, U]);
  await sincronizarApertura(id, c);
  avisarCambio();
}

/** Borra el CDT y sus transferencias (apertura y retiro): los saldos de las cuentas vuelven a como estaban. */
export async function eliminarCdt(id: number): Promise<void> {
  const conexion = await db();
  await conexion.execute(
    "DELETE FROM transacciones WHERE (cdt_destino_id = $1 OR cdt_origen_id = $1) AND usuario_id = $2", [id, U]);
  await conexion.execute("DELETE FROM cdts WHERE id = $1 AND usuario_id = $2", [id, U]);
  avisarCambio();
}

/**
 * Retira un CDT vencido: transfiere su total neto a la cuenta elegida (o solo lo marca si cuentaId es null).
 */
export async function retirarCdt(id: number, cuentaId: number | null, dia = hoy()): Promise<void> {
  const conexion = await db();
  const [f] = await conexion.select<Fila[]>(`${SQL} AND k.id = $2`, [U, id]);
  if (!f) throw new Error("El CDT no existe.");
  const c = mapear(f, dia);
  if (c.retirado_en) throw new Error("Este CDT ya se retiró.");
  if (c.calculo.estado !== "vencido") throw new Error("Solo puedes retirar un CDT que ya venció.");
  if (cuentaId != null) {
    const [cta] = await conexion.select<{ tipo: string; moneda: string }[]>(
      "SELECT tipo, moneda FROM cuentas WHERE id = $1 AND usuario_id = $2", [cuentaId, U]);
    if (!cta || cta.tipo === "credito" || cta.moneda !== "COP") throw new Error("Elige una cuenta de débito o efectivo en pesos.");
    await conexion.execute(
      `INSERT INTO transacciones (usuario_id, fecha, monto, tipo, cuenta_id, cdt_origen_id, comercio)
       VALUES ($1,$2,$3,'transferencia',$4,$5,$6)`,
      [U, dia, c.calculo.totalNetoVencimiento, cuentaId, id, `Retiro CDT ${c.nombre}`]);
  }
  await conexion.execute("UPDATE cdts SET retirado_en = $1, renovacion_auto = 0 WHERE id = $2", [dia, id]);
  avisarCambio();
}

/** Deshace un retiro manual (no una renovación): borra la transferencia y el CDT vuelve a «Vencido». */
export async function deshacerRetiroCdt(id: number): Promise<void> {
  const conexion = await db();
  await conexion.execute("DELETE FROM transacciones WHERE cdt_origen_id = $1 AND usuario_id = $2", [id, U]);
  await conexion.execute("UPDATE cdts SET retirado_en = NULL WHERE id = $1 AND renovado = 0 AND usuario_id = $2", [id, U]);
  avisarCambio();
}
