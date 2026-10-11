// Cajitas de ahorro (Nu): saldo + fecha_saldo como base del interés compuesto diario (sin retención).
// Aportes y retiros son transferencias con tus cuentas; cada movimiento suma el interés ganado al saldo
// y reinicia la fecha. «Ajustar saldo» cuadra con lo que muestra el banco sin crear movimientos.
import { db } from "$lib/db";
import { hoy } from "$lib/formato";
import { calcularCajita, type CalculoCajita } from "$lib/inversiones/calculo";
import { avisarCambio } from "./cambios";

const U = 1;

export interface Cajita {
  id: number;
  nombre: string;
  banco: string | null;
  saldo: number;
  tasa_ea: number;
  meta: number | null;
  fecha_meta: string | null;
  notas: string | null;
  fecha_saldo: string;
  num_movimientos: number;
  calculo: CalculoCajita;
}

export type CajitaNueva = Pick<Cajita, "nombre" | "banco" | "tasa_ea" | "meta" | "fecha_meta" | "notas">;

const SQL = `
SELECT j.id, j.nombre, j.banco, j.saldo, j.tasa_ea, j.meta, j.fecha_meta, j.notas,
       COALESCE(j.fecha_saldo, date(j.creado_en)) AS fecha_saldo,
       (SELECT COUNT(*) FROM transacciones t WHERE t.cajita_destino_id = j.id OR t.cajita_origen_id = j.id) AS num_movimientos
FROM cajitas j WHERE j.usuario_id = $1`;

const mapear = (f: Omit<Cajita, "calculo">, dia: string): Cajita => ({ ...f, calculo: calcularCajita(f, dia) });

export async function listarCajitas(dia = hoy()): Promise<Cajita[]> {
  const filas = await (await db()).select<Omit<Cajita, "calculo">[]>(`${SQL} ORDER BY j.nombre COLLATE NOCASE`, [U]);
  return filas.map((f) => mapear(f, dia));
}

async function obtener(id: number, dia: string): Promise<Cajita> {
  const [f] = await (await db()).select<Omit<Cajita, "calculo">[]>(`${SQL} AND j.id = $2`, [U, id]);
  if (!f) throw new Error("La cajita no existe.");
  return mapear(f, dia);
}

/** Valor de hoy de todas las cajitas. Para el Patrimonio. */
export async function valorCajitas(dia = hoy()): Promise<number> {
  return (await listarCajitas(dia)).reduce((s, c) => s + c.calculo.valorHoy, 0);
}

function validar(c: CajitaNueva) {
  if (!c.nombre.trim()) throw new Error("La cajita necesita un nombre.");
  if (!(c.tasa_ea >= 0 && c.tasa_ea < 1)) throw new Error("La tasa E.A. debe estar entre 0 % y 100 %.");
  if (c.meta != null && (!Number.isInteger(c.meta) || c.meta <= 0)) throw new Error("La meta debe ser mayor que cero.");
  if (c.fecha_meta && !/^\d{4}-\d{2}-\d{2}$/.test(c.fecha_meta)) throw new Error("La fecha meta no es válida.");
}

async function validarCuenta(cuentaId: number) {
  const [cta] = await (await db()).select<{ tipo: string; moneda: string }[]>(
    "SELECT tipo, moneda FROM cuentas WHERE id = $1 AND usuario_id = $2", [cuentaId, U]);
  if (!cta || cta.tipo === "credito" || cta.moneda !== "COP") throw new Error("Elige una cuenta de débito o efectivo en pesos.");
}

function validarMonto(m: number) {
  if (!Number.isInteger(m) || m <= 0) throw new Error("El monto debe ser mayor que cero.");
}

const valores = (c: CajitaNueva) => [
  c.nombre.trim(), c.banco?.trim() || null, c.tasa_ea, c.meta, c.fecha_meta || null, c.notas?.trim() || null,
];

/** Crea la cajita con su saldo de hoy. Con cuenta origen, ese saldo sale de la cuenta como transferencia. */
export async function crearCajita(c: CajitaNueva, saldo: number, cuentaOrigenId: number | null, dia = hoy()): Promise<number> {
  validar(c);
  if (!Number.isInteger(saldo) || saldo < 0) throw new Error("El saldo no puede ser negativo.");
  if (cuentaOrigenId != null) {
    validarMonto(saldo);
    await validarCuenta(cuentaOrigenId);
  }
  const conexion = await db();
  const r = await conexion.execute(
    `INSERT INTO cajitas (nombre, banco, tasa_ea, meta, fecha_meta, notas, saldo, fecha_saldo, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [...valores(c), saldo, dia, U]);
  const id = r.lastInsertId as number;
  if (cuentaOrigenId != null)
    await conexion.execute(
      `INSERT INTO transacciones (usuario_id, fecha, monto, tipo, cuenta_id, cajita_destino_id, comercio)
       VALUES ($1,$2,$3,'transferencia',$4,$5,$6)`,
      [U, dia, saldo, cuentaOrigenId, id, `Apertura cajita ${c.nombre.trim()}`]);
  avisarCambio();
  return id;
}

/** Edita los datos de la cajita (el saldo se cambia con Aportar, Retirar o Ajustar saldo). */
export async function editarCajita(id: number, c: CajitaNueva): Promise<void> {
  validar(c);
  await (await db()).execute(
    `UPDATE cajitas SET nombre=$1, banco=$2, tasa_ea=$3, meta=$4, fecha_meta=$5, notas=$6 WHERE id=$7 AND usuario_id=$8`,
    [...valores(c), id, U]);
  avisarCambio();
}

/** Guarda un nuevo saldo base desde `dia`. */
async function rebasar(id: number, saldo: number, dia: string) {
  await (await db()).execute(
    "UPDATE cajitas SET saldo = $1, fecha_saldo = $2 WHERE id = $3 AND usuario_id = $4", [saldo, dia, id, U]);
}

export async function aportarCajita(id: number, cuentaId: number, monto: number, dia = hoy()): Promise<void> {
  validarMonto(monto);
  await validarCuenta(cuentaId);
  const c = await obtener(id, dia);
  await rebasar(id, c.calculo.valorHoy + monto, dia);
  await (await db()).execute(
    `INSERT INTO transacciones (usuario_id, fecha, monto, tipo, cuenta_id, cajita_destino_id, comercio)
     VALUES ($1,$2,$3,'transferencia',$4,$5,$6)`,
    [U, dia, monto, cuentaId, id, `Aporte cajita ${c.nombre}`]);
  avisarCambio();
}

export async function retirarCajita(id: number, cuentaId: number, monto: number, dia = hoy()): Promise<void> {
  validarMonto(monto);
  await validarCuenta(cuentaId);
  const c = await obtener(id, dia);
  if (monto > c.calculo.valorHoy) throw new Error("No puedes retirar más de lo que hay en la cajita.");
  await rebasar(id, c.calculo.valorHoy - monto, dia);
  await (await db()).execute(
    `INSERT INTO transacciones (usuario_id, fecha, monto, tipo, cuenta_id, cajita_origen_id, comercio)
     VALUES ($1,$2,$3,'transferencia',$4,$5,$6)`,
    [U, dia, monto, cuentaId, id, `Retiro cajita ${c.nombre}`]);
  avisarCambio();
}

/** Cuadra con el banco: el saldo escrito pasa a ser la base desde hoy, sin movimientos. */
export async function ajustarSaldoCajita(id: number, saldo: number, dia = hoy()): Promise<void> {
  if (!Number.isInteger(saldo) || saldo < 0) throw new Error("El saldo no puede ser negativo.");
  await rebasar(id, saldo, dia);
  avisarCambio();
}

/** Borra la cajita y sus transferencias: los saldos de las cuentas vuelven a como estaban. */
export async function eliminarCajita(id: number): Promise<void> {
  const conexion = await db();
  await conexion.execute(
    "DELETE FROM transacciones WHERE (cajita_destino_id = $1 OR cajita_origen_id = $1) AND usuario_id = $2", [id, U]);
  await conexion.execute("DELETE FROM cajitas WHERE id = $1 AND usuario_id = $2", [id, U]);
  avisarCambio();
}
