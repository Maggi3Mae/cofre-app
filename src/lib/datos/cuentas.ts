import { db } from "$lib/db";
import type { Cuenta, CuentaNueva } from "./tipos";

const U = 1; // usuario único por ahora

// Movimiento neto de la cuenta: ingresos − egresos − transferencias que salen + las que entran.
// Retiros de un CDT o cajita (cdt_origen_id / cajita_origen_id) y abonos de un préstamo (prestamo_origen_id) entran a cuenta_id.
// El egreso de un préstamo perdido (prestamo_perdido_id) no toca el saldo: la plata ya había salido con el préstamo.
// Débito/efectivo/inversión: saldo = inicial + neto.
// Crédito (deuda en positivo): deuda = inicial − neto → compras la suben; pagos y devoluciones la bajan.
const SQL_CUENTAS = `
SELECT c.*,
  c.saldo_inicial + (CASE WHEN c.tipo = 'credito' THEN -1 ELSE 1 END) * (
    COALESCE((SELECT SUM(CASE WHEN t.tipo = 'ingreso' OR t.cdt_origen_id IS NOT NULL OR t.cajita_origen_id IS NOT NULL
                                OR t.prestamo_origen_id IS NOT NULL
                              THEN t.monto ELSE -t.monto END)
              FROM transacciones t WHERE t.cuenta_id = c.id AND t.prestamo_perdido_id IS NULL), 0)
  + COALESCE((SELECT SUM(COALESCE(t.monto_destino, t.monto)) FROM transacciones t
              WHERE t.cuenta_destino_id = c.id AND t.tipo = 'transferencia'), 0)
  ) AS saldo,
  (SELECT COUNT(*) FROM transacciones t
   WHERE t.cuenta_id = c.id OR t.cuenta_destino_id = c.id) AS num_movimientos
FROM cuentas c
WHERE c.usuario_id = $1`;

type Bool = "principal" | "archivada" | "interes_una_cuota";
type Fila = Omit<Cuenta, Bool> & Record<Bool, number>;
const mapear = (f: Fila): Cuenta => ({
  ...f,
  principal: !!f.principal,
  archivada: !!f.archivada,
  interes_una_cuota: !!f.interes_una_cuota,
});

export async function listarCuentas(incluirArchivadas = false): Promise<Cuenta[]> {
  const filtro = incluirArchivadas ? "" : " AND c.archivada = 0";
  const filas = await (await db()).select<Fila[]>(
    `${SQL_CUENTAS}${filtro} ORDER BY c.archivada, c.principal DESC, c.nombre COLLATE NOCASE`,
    [U],
  );
  return filas.map(mapear);
}

function validar(c: CuentaNueva) {
  if (!c.nombre.trim()) throw new Error("La cuenta necesita un nombre.");
  if (c.ultimos4 && !/^\d{4}$/.test(c.ultimos4)) throw new Error("Los últimos 4 dígitos deben ser 4 números.");
  for (const d of [c.dia_corte, c.dia_pago])
    if (d != null && (d < 1 || d > 31)) throw new Error("Los días de corte y pago van de 1 a 31.");
  if (c.comision_internacional < 0 || c.comision_internacional >= 1)
    throw new Error("La comisión internacional debe estar entre 0 % y 100 %.");
}

function valores(c: CuentaNueva) {
  const credito = c.tipo === "credito";
  return [
    c.nombre.trim(), c.tipo, c.moneda, c.banco?.trim() || null, c.ultimos4 || null,
    // Tal cual: el formulario ya pasa a positivo la deuda escrita; el punto de partida de una tarjeta
    // puede ser negativo si las compras registradas suman más que la deuda de hoy.
    c.saldo_inicial,
    credito ? c.cupo : null, credito ? c.dia_corte : null, credito ? c.dia_pago : null,
    c.tasa_ea, c.principal ? 1 : 0,
    c.interes_una_cuota ? 1 : 0, c.comision_internacional,
  ];
}

/** Solo una cuenta puede ser principal. */
async function quitarPrincipal(excepto: number) {
  await (await db()).execute(
    "UPDATE cuentas SET principal = 0 WHERE usuario_id = $1 AND id <> $2", [U, excepto]);
}

export async function crearCuenta(c: CuentaNueva): Promise<number> {
  validar(c);
  const r = await (await db()).execute(
    `INSERT INTO cuentas (nombre, tipo, moneda, banco, ultimos4, saldo_inicial, cupo, dia_corte,
       dia_pago, tasa_ea, principal, interes_una_cuota, comision_internacional, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [...valores(c), U],
  );
  const id = r.lastInsertId as number;
  if (c.principal) await quitarPrincipal(id);
  return id;
}

export async function editarCuenta(id: number, c: CuentaNueva): Promise<void> {
  validar(c);
  await (await db()).execute(
    `UPDATE cuentas SET nombre=$1, tipo=$2, moneda=$3, banco=$4, ultimos4=$5, saldo_inicial=$6,
       cupo=$7, dia_corte=$8, dia_pago=$9, tasa_ea=$10, principal=$11,
       interes_una_cuota=$12, comision_internacional=$13
     WHERE id=$14 AND usuario_id=$15`,
    [...valores(c), id, U],
  );
  if (c.principal) await quitarPrincipal(id);
}

export async function archivarCuenta(id: number, archivada = true): Promise<void> {
  await (await db()).execute(
    "UPDATE cuentas SET archivada=$1, principal = CASE WHEN $1 = 1 THEN 0 ELSE principal END WHERE id=$2 AND usuario_id=$3",
    [archivada ? 1 : 0, id, U],
  );
}

/**
 * Sin movimientos ni compras a cuotas: se borra.
 * Con movimientos: se archiva, para no perder el historial.
 */
export async function eliminarCuenta(id: number): Promise<"eliminada" | "archivada"> {
  const [{ n }] = await (await db()).select<{ n: number }[]>(
    `SELECT (SELECT COUNT(*) FROM transacciones WHERE cuenta_id=$1 OR cuenta_destino_id=$1)
          + (SELECT COUNT(*) FROM compras_credito WHERE cuenta_id=$1) AS n`, [id]);
  if (n > 0) {
    await archivarCuenta(id);
    return "archivada";
  }
  await (await db()).execute("DELETE FROM cuentas WHERE id=$1 AND usuario_id=$2", [id, U]);
  return "eliminada";
}
