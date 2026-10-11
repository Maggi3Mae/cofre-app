// Compras a cuotas con tarjeta de crédito: cálculo (anualidad) y plan.
// Las cuotas futuras NO son transacciones: son el plan teórico. El pago real llega del extracto.
import { db } from "$lib/db";

const U = 1;

/** Tasa mensual equivalente a una E.A.: (1 + EA)^(1/12) − 1. */
export const tasaMensual = (ea: number) => Math.pow(1 + ea, 1 / 12) - 1;

export interface FilaCuota { numero: number; fecha: string; capital: number; interes: number; saldo: number }

export interface Plan {
  /** Monto escrito (sin comisión). */
  montoBase: number;
  comision: number;
  /** montoBase + comisión: lo que sube la deuda. */
  capital: number;
  numCuotas: number;
  /** E.A. aplicada (0 si esa compra no cobra interés). */
  tasaEA: number;
  tasaMes: number;
  cuota: number;
  total: number;
  intereses: number;
  filas: FilaCuota[];
}

export interface DatosTarjeta {
  tasa_ea: number | null;
  interes_una_cuota: boolean;
  comision_internacional: number;
  dia_corte: number | null;
  dia_pago: number | null;
}

/** ¿Esta compra cobra interés? A 1 cuota depende de la tarjeta; con más cuotas siempre cobra. */
export const cobraInteres = (n: number, t: DatosTarjeta) => n > 1 || t.interes_una_cuota;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Fecha con el día dado en ese mes, sin desbordar (día 31 en febrero → 28/29). */
function enDia(a: number, m: number, dia: number): Date {
  const ultimo = new Date(a, m + 1, 0).getDate();
  return new Date(a, m, Math.min(dia, ultimo));
}

/**
 * Fechas de pago de las cuotas. La primera es el primer día de pago después del primer corte
 * que incluye la compra; luego, una por mes. Sin corte/pago configurados: mismo día, mes siguiente.
 */
export function fechasCuotas(fechaCompra: string, n: number, diaCorte: number | null, diaPago: number | null): string[] {
  const [a, m, d] = fechaCompra.split("-").map(Number);
  const compra = new Date(a, m - 1, d);
  let primera: Date;
  if (diaCorte && diaPago) {
    let corte = enDia(a, m - 1, diaCorte);
    if (corte < compra) corte = enDia(a, m, diaCorte);
    primera = enDia(corte.getFullYear(), corte.getMonth(), diaPago);
    if (primera <= corte) primera = enDia(corte.getFullYear(), corte.getMonth() + 1, diaPago);
  } else {
    primera = enDia(a, m, d);
  }
  const dia = diaPago ?? d;
  return Array.from({ length: n }, (_, k) => iso(enDia(primera.getFullYear(), primera.getMonth() + k, k === 0 ? primera.getDate() : dia)));
}

/** Plan de cuotas con cuota fija (anualidad). Montos en centavos. */
export function calcularPlan(montoBase: number, n: number, internacional: boolean, t: DatosTarjeta, fechaCompra: string): Plan {
  const comision = internacional ? Math.round(montoBase * t.comision_internacional) : 0;
  const capital = montoBase + comision;
  const tasaEA = cobraInteres(n, t) ? t.tasa_ea ?? 0 : 0;
  const i = tasaEA ? tasaMensual(tasaEA) : 0;
  const cuota = i ? Math.round((capital * i) / (1 - Math.pow(1 + i, -n))) : Math.round(capital / n);
  const fechas = fechasCuotas(fechaCompra, n, t.dia_corte, t.dia_pago);

  const filas: FilaCuota[] = [];
  let saldo = capital;
  for (let k = 1; k <= n; k++) {
    const interes = Math.round(saldo * i);
    // La última cuota ajusta el redondeo para que el capital cierre exacto.
    const abono = k === n ? saldo : Math.min(saldo, cuota - interes);
    saldo -= abono;
    filas.push({ numero: k, fecha: fechas[k - 1], capital: abono, interes, saldo });
  }
  const total = filas.reduce((s, f) => s + f.capital + f.interes, 0);
  return { montoBase, comision, capital, numCuotas: n, tasaEA, tasaMes: i, cuota, total, intereses: total - capital, filas };
}

export interface CompraGuardada { id: number; monto_base: number; internacional: boolean; num_cuotas: number }

export async function compraDeTransaccion(transaccionId: number): Promise<CompraGuardada | null> {
  const [f] = await (await db()).select<(Omit<CompraGuardada, "internacional"> & { internacional: number })[]>(
    "SELECT id, monto_base, internacional, num_cuotas FROM compras_credito WHERE transaccion_id = $1 AND usuario_id = $2",
    [transaccionId, U]);
  return f ? { ...f, internacional: !!f.internacional } : null;
}

/** Quita el plan de cuotas de estos movimientos (sus cuotas se borran en cascada). */
export async function borrarPlanes(transaccionIds: number[]): Promise<void> {
  if (!transaccionIds.length) return;
  await (await db()).execute(
    "DELETE FROM compras_credito WHERE transaccion_id IN (SELECT value FROM json_each($1)) AND usuario_id = $2",
    [JSON.stringify(transaccionIds), U]);
}

/**
 * Reemplaza el plan del movimiento. Se guarda si hay más de una cuota o si es internacional
 * (para recordar el monto base y la comisión).
 */
export async function guardarPlan(transaccionId: number, cuentaId: number, comercio: string, fecha: string, plan: Plan, internacional: boolean): Promise<void> {
  await borrarPlanes([transaccionId]);
  if (plan.numCuotas < 2 && !internacional) return;
  const conexion = await db();
  const r = await conexion.execute(
    `INSERT INTO compras_credito (usuario_id, cuenta_id, transaccion_id, comercio, fecha, monto_base, internacional,
       comision, capital, num_cuotas, tasa_ea, cuota, total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [U, cuentaId, transaccionId, comercio || "Compra", fecha, plan.montoBase, internacional ? 1 : 0,
      plan.comision, plan.capital, plan.numCuotas, plan.tasaEA, plan.cuota, plan.total],
  );
  const compraId = r.lastInsertId as number;
  for (const f of plan.filas)
    await conexion.execute(
      "INSERT INTO cuotas (compra_id, numero, fecha, capital, interes, saldo) VALUES ($1,$2,$3,$4,$5,$6)",
      [compraId, f.numero, f.fecha, f.capital, f.interes, f.saldo]);
}
