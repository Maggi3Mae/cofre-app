// Facturas: nombre recordado por NIT y CUFE para no registrar dos veces la misma factura.
import { db } from "$lib/db";

const U = 1;

export async function comercioPorNit(nit: string): Promise<string | null> {
  const [f] = await (await db()).select<{ nombre: string }[]>(
    "SELECT nombre FROM comercios_nit WHERE usuario_id = $1 AND nit = $2", [U, nit]);
  return f?.nombre ?? null;
}

export async function recordarComercioNit(nit: string, nombre: string): Promise<void> {
  if (!nit || !nombre.trim()) return;
  await (await db()).execute(
    `INSERT INTO comercios_nit (usuario_id, nit, nombre) VALUES ($1,$2,$3)
     ON CONFLICT (usuario_id, nit) DO UPDATE SET nombre = excluded.nombre`,
    [U, nit, nombre.trim()],
  );
}

/** Movimiento ya registrado con esa factura, si existe. */
export async function movimientoPorCufe(cufe: string): Promise<{ id: number; fecha: string; monto: number; comercio: string | null } | null> {
  const [f] = await (await db()).select<{ id: number; fecha: string; monto: number; comercio: string | null }[]>(
    "SELECT id, fecha, monto, comercio FROM transacciones WHERE usuario_id = $1 AND cufe = $2", [U, cufe]);
  return f ?? null;
}

export async function marcarFactura(txId: number, cufe: string): Promise<void> {
  await (await db()).execute("UPDATE transacciones SET cufe = $1 WHERE id = $2 AND usuario_id = $3", [cufe, txId, U]);
}
