import { db } from "$lib/db";
import { avisarCambio } from "./cambios";
import { obtenerOCrearEtiqueta } from "./etiquetas";
import { borrarPlanes } from "./cuotas";
import { borrarAdjunto } from "$lib/adjuntos/archivos";
import type { FiltroTx, Moneda, Sugerencia, TotalesTx, Transaccion, TransaccionNueva } from "./tipos";

const U = 1;
const SEP_ITEM = "\u001e"; // separador entre etiquetas
const SEP_CAMPO = "\u001f"; // separador id/nombre

/** Escapa % y _ para LIKE con ESCAPE '\'. */
const patron = (t: string) => `%${t.replace(/[\\%_]/g, (c) => "\\" + c)}%`;

/** Arma el WHERE con parámetros numerados ($1, $2…). */
function condiciones(f: FiltroTx) {
  const where = ["t.usuario_id = $1"];
  const params: unknown[] = [U];
  const p = (v: unknown) => (params.push(v), `$${params.length}`);
  if (f.texto?.trim()) {
    const x = p(patron(f.texto.trim()));
    where.push(`(t.comercio LIKE ${x} ESCAPE '\\' OR t.notas LIKE ${x} ESCAPE '\\')`);
  }
  if (f.tipo) where.push(`t.tipo = ${p(f.tipo)}`);
  if (f.cuentaId != null) {
    const x = p(f.cuentaId);
    where.push(`(t.cuenta_id = ${x} OR t.cuenta_destino_id = ${x})`);
  }
  if (f.sinCategoria) where.push(`t.categoria_id IS NULL AND t.tipo <> 'transferencia'`);
  if (f.categoriaId != null) {
    const x = p(f.categoriaId);
    where.push(`(t.categoria_id = ${x} OR t.categoria_id IN (SELECT id FROM categorias WHERE padre_id = ${x}))`);
  }
  if (f.etiquetaId != null)
    where.push(`EXISTS (SELECT 1 FROM transaccion_etiquetas te WHERE te.transaccion_id = t.id AND te.etiqueta_id = ${p(f.etiquetaId)})`);
  if (f.desde) where.push(`t.fecha >= ${p(f.desde)}`);
  if (f.hasta) where.push(`t.fecha <= ${p(f.hasta)}`);
  return { where: where.join(" AND "), params, p };
}

type Fila = Omit<Transaccion, "etiquetas"> & { etiquetas_raw: string | null };

export async function listarTransacciones(f: FiltroTx = {}): Promise<Transaccion[]> {
  const { where, params, p } = condiciones(f);
  const lim = p(f.limite ?? 200);
  const off = p(f.desplazamiento ?? 0);
  const filas = await (await db()).select<Fila[]>(
    `SELECT t.id, t.fecha, t.monto, t.tipo, t.cuenta_id, t.cuenta_destino_id, t.categoria_id,
       t.comercio, t.notas, t.monto_destino, t.adjunto, t.gasto_grupal_id, t.recurrente_id,
       -- Retiro de un CDT/cajita: se muestra «CDT → cuenta»; apertura o aporte: «cuenta → CDT».
       -- Préstamo: «cuenta → persona»; abono: «persona → cuenta».
       CASE WHEN t.cdt_origen_id IS NOT NULL THEN 'CDT ' || ko.nombre
            WHEN t.cajita_origen_id IS NOT NULL THEN 'Cajita ' || jo.nombre
            WHEN t.prestamo_origen_id IS NOT NULL THEN po.persona
            ELSE c.nombre END AS cuenta_nombre,
       c.tipo AS cuenta_tipo, c.moneda AS cuenta_moneda,
       CASE WHEN t.cdt_origen_id IS NOT NULL OR t.cajita_origen_id IS NOT NULL OR t.prestamo_origen_id IS NOT NULL THEN c.nombre
            WHEN t.cdt_destino_id IS NOT NULL THEN 'CDT ' || kd.nombre
            WHEN t.cajita_destino_id IS NOT NULL THEN 'Cajita ' || jd.nombre
            WHEN t.prestamo_destino_id IS NOT NULL THEN pd.persona
            ELSE d.nombre END AS cuenta_destino_nombre,
       CASE WHEN t.cdt_origen_id IS NOT NULL OR t.cajita_origen_id IS NOT NULL OR t.prestamo_origen_id IS NOT NULL
                 OR t.prestamo_destino_id IS NOT NULL THEN c.moneda ELSE d.moneda END AS cuenta_destino_moneda,
       COALESCE(pd.persona_id, po.persona_id, pp.persona_id) AS prestamo_persona_id,
       (t.cdt_destino_id IS NOT NULL OR t.cdt_origen_id IS NOT NULL
        OR t.cajita_destino_id IS NOT NULL OR t.cajita_origen_id IS NOT NULL) AS es_inversion,
       k.nombre AS categoria_nombre, k.icono AS categoria_icono, k.color AS categoria_color,
       (SELECT GROUP_CONCAT(e.id || char(31) || e.nombre, char(30))
        FROM transaccion_etiquetas te JOIN etiquetas e ON e.id = te.etiqueta_id
        WHERE te.transaccion_id = t.id) AS etiquetas_raw,
       (SELECT cc.num_cuotas FROM compras_credito cc WHERE cc.transaccion_id = t.id) AS num_cuotas
     FROM transacciones t
     JOIN cuentas c ON c.id = t.cuenta_id
     LEFT JOIN cuentas d ON d.id = t.cuenta_destino_id
     LEFT JOIN cdts kd ON kd.id = t.cdt_destino_id
     LEFT JOIN cdts ko ON ko.id = t.cdt_origen_id
     LEFT JOIN cajitas jd ON jd.id = t.cajita_destino_id
     LEFT JOIN cajitas jo ON jo.id = t.cajita_origen_id
     LEFT JOIN (SELECT p.id, p.persona_id, pe.nombre AS persona FROM prestamos p JOIN personas pe ON pe.id = p.persona_id) pd
       ON pd.id = t.prestamo_destino_id
     LEFT JOIN (SELECT p.id, p.persona_id, pe.nombre AS persona FROM prestamos p JOIN personas pe ON pe.id = p.persona_id) po
       ON po.id = t.prestamo_origen_id
     LEFT JOIN prestamos pp ON pp.id = t.prestamo_perdido_id
     LEFT JOIN categorias k ON k.id = t.categoria_id
     WHERE ${where}
     ORDER BY t.fecha DESC, t.id DESC
     LIMIT ${lim} OFFSET ${off}`,
    params,
  );
  return filas.map(({ etiquetas_raw, ...t }) => ({
    ...t,
    es_inversion: !!t.es_inversion,
    etiquetas: etiquetas_raw
      ? etiquetas_raw.split(SEP_ITEM).map((s) => {
          const [id, nombre] = s.split(SEP_CAMPO);
          return { id: Number(id), nombre };
        })
      : [],
  }));
}

/** Totales del filtro (sin límite), por moneda. Las transferencias no cuentan como ingreso ni egreso. */
export async function totalesTransacciones(f: FiltroTx = {}): Promise<TotalesTx> {
  const { where, params } = condiciones(f);
  const conexion = await db();
  const filas = await conexion.select<{ moneda: Moneda; ingresos: number; egresos: number }[]>(
    `SELECT c.moneda,
            COALESCE(SUM(CASE WHEN t.tipo='ingreso' THEN t.monto END), 0) AS ingresos,
            COALESCE(SUM(CASE WHEN t.tipo='egreso' THEN t.monto END), 0) AS egresos
     FROM transacciones t JOIN cuentas c ON c.id = t.cuenta_id
     WHERE ${where} AND t.tipo <> 'transferencia'
     GROUP BY c.moneda ORDER BY c.moneda`,
    params,
  );
  const [{ n }] = await conexion.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM transacciones t WHERE ${where}`, params);
  return {
    cantidad: n,
    porMoneda: filas.map((r) => ({ ...r, balance: r.ingresos - r.egresos })),
  };
}

/** Último movimiento de cada comercio que coincide, ordenados por frecuencia. */
export async function sugerencias(texto: string, limite = 6): Promise<Sugerencia[]> {
  if (!texto.trim()) return [];
  return (await db()).select<Sugerencia[]>(
    `SELECT s.comercio, s.monto, s.tipo, s.cuenta_id, s.cuenta_destino_id, s.categoria_id,
            k.icono AS categoria_icono, s.veces, s.fecha AS ultima
     FROM (
       SELECT t.*,
         ROW_NUMBER() OVER (PARTITION BY lower(t.comercio) ORDER BY t.fecha DESC, t.id DESC) AS rn,
         COUNT(*) OVER (PARTITION BY lower(t.comercio)) AS veces
       FROM transacciones t
       WHERE t.usuario_id = $1 AND t.comercio LIKE $2 ESCAPE '\\'
     ) s
     LEFT JOIN categorias k ON k.id = s.categoria_id
     WHERE s.rn = 1
     ORDER BY s.veces DESC, s.fecha DESC
     LIMIT $3`,
    [U, patron(texto.trim()), limite],
  );
}

/** Comercios más usados en los últimos 90 días (su último movimiento), para las sugerencias del celular. */
export async function sugerenciasFrecuentes(limite = 8): Promise<Sugerencia[]> {
  return (await db()).select<Sugerencia[]>(
    `SELECT s.comercio, s.monto, s.tipo, s.cuenta_id, s.cuenta_destino_id, s.categoria_id,
            k.icono AS categoria_icono, s.veces, s.fecha AS ultima
     FROM (
       SELECT t.*,
         ROW_NUMBER() OVER (PARTITION BY lower(t.comercio) ORDER BY t.fecha DESC, t.id DESC) AS rn,
         COUNT(*) OVER (PARTITION BY lower(t.comercio)) AS veces
       FROM transacciones t
       WHERE t.usuario_id = $1 AND t.comercio IS NOT NULL AND trim(t.comercio) <> ''
         AND t.fecha >= date('now', 'localtime', '-90 days')
     ) s
     LEFT JOIN categorias k ON k.id = s.categoria_id
     WHERE s.rn = 1
     ORDER BY s.veces DESC, s.fecha DESC
     LIMIT $2`,
    [U, limite],
  );
}

async function validar(t: TransaccionNueva) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.fecha)) throw new Error("La fecha no es válida.");
  if (!Number.isInteger(t.monto) || t.monto <= 0) throw new Error("El monto debe ser mayor que cero.");
  if (t.tipo !== "transferencia") return;
  if (t.cuenta_destino_id == null) throw new Error("Elige la cuenta destino de la transferencia.");
  if (t.cuenta_destino_id === t.cuenta_id) throw new Error("La cuenta destino debe ser distinta a la de origen.");
  const [m] = await (await db()).select<{ a: Moneda; b: Moneda }[]>(
    "SELECT (SELECT moneda FROM cuentas WHERE id=$1) AS a, (SELECT moneda FROM cuentas WHERE id=$2) AS b",
    [t.cuenta_id, t.cuenta_destino_id]);
  if (m && m.a !== m.b && !(Number.isInteger(t.monto_destino) && (t.monto_destino ?? 0) > 0))
    throw new Error(`Las cuentas son de distinta moneda: escribe cuánto entra en ${m.b}.`);
}

/** monto_destino solo se guarda si las monedas son distintas. */
async function montoDestino(t: TransaccionNueva): Promise<number | null> {
  if (t.tipo !== "transferencia" || t.cuenta_destino_id == null || !t.monto_destino) return null;
  const [m] = await (await db()).select<{ a: Moneda; b: Moneda }[]>(
    "SELECT (SELECT moneda FROM cuentas WHERE id=$1) AS a, (SELECT moneda FROM cuentas WHERE id=$2) AS b",
    [t.cuenta_id, t.cuenta_destino_id]);
  return m && m.a !== m.b ? t.monto_destino : null;
}

function valores(t: TransaccionNueva, destino: number | null) {
  const transf = t.tipo === "transferencia";
  return [
    t.fecha, t.monto, t.tipo, t.cuenta_id,
    transf ? t.cuenta_destino_id : null,
    transf ? null : t.categoria_id ?? null,
    t.comercio?.trim() || null, t.notas?.trim() || null,
    destino,
  ];
}

async function ponerEtiquetas(id: number, nombres: string[] = []) {
  const conexion = await db();
  await conexion.execute("DELETE FROM transaccion_etiquetas WHERE transaccion_id=$1", [id]);
  const ids = new Set<number>();
  for (const n of nombres) if (n.trim()) ids.add(await obtenerOCrearEtiqueta(n));
  for (const e of ids)
    await conexion.execute("INSERT INTO transaccion_etiquetas (transaccion_id, etiqueta_id) VALUES ($1,$2)", [id, e]);
}

export async function crearTransaccion(t: TransaccionNueva): Promise<number> {
  await validar(t);
  const r = await (await db()).execute(
    `INSERT INTO transacciones (fecha, monto, tipo, cuenta_id, cuenta_destino_id, categoria_id, comercio, notas,
       monto_destino, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [...valores(t, await montoDestino(t)), U],
  );
  const id = r.lastInsertId as number;
  await ponerEtiquetas(id, t.etiquetas);
  avisarCambio();
  return id;
}

export async function editarTransaccion(id: number, t: TransaccionNueva): Promise<void> {
  await validar(t);
  await (await db()).execute(
    `UPDATE transacciones SET fecha=$1, monto=$2, tipo=$3, cuenta_id=$4, cuenta_destino_id=$5,
       categoria_id=$6, comercio=$7, notas=$8, monto_destino=$9
     WHERE id=$10 AND usuario_id=$11`,
    [...valores(t, await montoDestino(t)), id, U],
  );
  await ponerEtiquetas(id, t.etiquetas);
  avisarCambio();
}

/** Lista de ids como JSON para usar con json_each (sin armar SQL a mano). */
const enLista = "SELECT value FROM json_each($1)";

export async function eliminarTransacciones(ids: number[]): Promise<void> {
  if (!ids.length) return;
  await borrarPlanes(ids); // el plan de cuotas no sobrevive a su compra
  const fotos = await (await db()).select<{ adjunto: string }[]>(
    `SELECT adjunto FROM transacciones WHERE id IN (${enLista}) AND adjunto IS NOT NULL`, [JSON.stringify(ids)]);
  // Si se borra el retiro de un CDT, el CDT vuelve a «Vencido» (sin retirar).
  await (await db()).execute(
    `UPDATE cdts SET retirado_en = NULL
     WHERE renovado = 0 AND id IN (SELECT cdt_origen_id FROM transacciones WHERE id IN (${enLista}) AND cdt_origen_id IS NOT NULL)`,
    [JSON.stringify(ids)]);
  // Si se borra un aporte o retiro de cajita, el saldo de la cajita se devuelve (sin el interés de esos días).
  await (await db()).execute(
    `UPDATE cajitas SET saldo = MAX(0, saldo
       - COALESCE((SELECT SUM(t.monto) FROM transacciones t WHERE t.id IN (${enLista}) AND t.cajita_destino_id = cajitas.id), 0)
       + COALESCE((SELECT SUM(t.monto) FROM transacciones t WHERE t.id IN (${enLista}) AND t.cajita_origen_id = cajitas.id), 0))
     WHERE id IN (SELECT COALESCE(cajita_destino_id, cajita_origen_id) FROM transacciones
                  WHERE id IN (${enLista}) AND (cajita_destino_id IS NOT NULL OR cajita_origen_id IS NOT NULL))`,
    [JSON.stringify(ids)]);
  // Préstamos: borrar el «perdido» lo vuelve activo; borrar la salida lo deja como solo registro.
  // (Borrar un abono no necesita nada: lo pendiente se calcula con los abonos que quedan.)
  await (await db()).execute(
    `UPDATE prestamos SET perdido_en = NULL
     WHERE id IN (SELECT prestamo_perdido_id FROM transacciones WHERE id IN (${enLista}) AND prestamo_perdido_id IS NOT NULL)`,
    [JSON.stringify(ids)]);
  await (await db()).execute(
    `UPDATE prestamos SET cuenta_origen_id = NULL
     WHERE id IN (SELECT prestamo_destino_id FROM transacciones WHERE id IN (${enLista}) AND prestamo_destino_id IS NOT NULL)`,
    [JSON.stringify(ids)]);
  await (await db()).execute(
    `DELETE FROM transacciones WHERE id IN (${enLista}) AND usuario_id=$2`, [JSON.stringify(ids), U]);
  for (const f of fotos) await borrarAdjunto(f.adjunto); // la foto se va con su movimiento
  avisarCambio();
}

/** Asigna una categoría a varios movimientos; ignora transferencias. */
export async function categorizarTransacciones(ids: number[], categoriaId: number | null): Promise<void> {
  if (!ids.length) return;
  await (await db()).execute(
    `UPDATE transacciones SET categoria_id=$3
     WHERE id IN (${enLista}) AND usuario_id=$2 AND tipo <> 'transferencia'`,
    [JSON.stringify(ids), U, categoriaId],
  );
  avisarCambio();
}

/** Agrega una etiqueta (la crea si no existe) a varios movimientos. */
export async function etiquetarTransacciones(ids: number[], nombre: string): Promise<void> {
  if (!ids.length) return;
  const etiquetaId = await obtenerOCrearEtiqueta(nombre);
  await (await db()).execute(
    `INSERT OR IGNORE INTO transaccion_etiquetas (transaccion_id, etiqueta_id)
     SELECT t.id, $3 FROM transacciones t WHERE t.id IN (${enLista}) AND t.usuario_id=$2`,
    [JSON.stringify(ids), U, etiquetaId],
  );
}

/**
 * Convierte egresos en pagos de tarjeta: transferencias cuenta → tarjeta, sin categoría.
 * Solo aplica a egresos de cuentas que no son crédito, en la misma moneda de la tarjeta.
 * Devuelve cuántos se convirtieron.
 */
export async function marcarComoPagoTarjeta(ids: number[], tarjetaId: number): Promise<number> {
  if (!ids.length) return 0;
  const r = await (await db()).execute(
    `UPDATE transacciones SET tipo='transferencia', cuenta_destino_id=$3, categoria_id=NULL, monto_destino=NULL
     WHERE id IN (${enLista}) AND usuario_id=$2 AND tipo='egreso' AND cuenta_id <> $3
       AND cuenta_id IN (SELECT id FROM cuentas WHERE tipo <> 'credito'
                         AND moneda = (SELECT moneda FROM cuentas WHERE id=$3))`,
    [JSON.stringify(ids), U, tarjetaId],
  );
  // Los que ahora son transferencias ya no son compras a cuotas.
  const convertidos = await (await db()).select<{ id: number }[]>(
    `SELECT id FROM transacciones WHERE id IN (${enLista}) AND usuario_id=$2 AND tipo='transferencia'`,
    [JSON.stringify(ids), U]);
  await borrarPlanes(convertidos.map((c) => c.id));
  return r.rowsAffected;
}

/** Pone o quita la foto adjunta del movimiento (y borra el archivo anterior si cambió). */
export async function ponerAdjunto(id: number, nombre: string | null): Promise<void> {
  const conexion = await db();
  const [antes] = await conexion.select<{ adjunto: string | null }[]>(
    "SELECT adjunto FROM transacciones WHERE id = $1 AND usuario_id = $2", [id, U]);
  await conexion.execute("UPDATE transacciones SET adjunto = $1 WHERE id = $2 AND usuario_id = $3", [nombre, id, U]);
  if (antes?.adjunto && antes.adjunto !== nombre) await borrarAdjunto(antes.adjunto);
}
