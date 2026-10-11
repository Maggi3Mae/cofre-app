// Consultas de la página Reportes. Igual que el Dashboard: todo en pesos (USD × TRM; sin TRM
// los dólares valen 0), transferencias excluidas y subcategorías sumadas a su padre.
// Filtro común: año, mes opcional (1–12) y cuenta opcional.
import { db } from "$lib/db";
import type { NombreIcono } from "$lib/iconos";
import type { ClaveColor } from "./paleta";

const U = 1;

export interface FiltroReporte {
  ano: number;
  /** 1–12; null = todo el año. */
  mes: number | null;
  /** null = todas las cuentas. */
  cuentaId: number | null;
}

const dos = (n: number) => String(n).padStart(2, "0");
const ultimoDia = (a: number, m: number) => new Date(a, m, 0).getDate();

/** Rango de fechas del filtro. */
export function rangoReporte(f: Pick<FiltroReporte, "ano" | "mes">): { desde: string; hasta: string } {
  if (f.mes) return { desde: `${f.ano}-${dos(f.mes)}-01`, hasta: `${f.ano}-${dos(f.mes)}-${dos(ultimoDia(f.ano, f.mes))}` };
  return { desde: `${f.ano}-01-01`, hasta: `${f.ano}-12-31` };
}

/** Período anterior: mes anterior, o año anterior si es el año completo. */
export function filtroAnterior(f: FiltroReporte): FiltroReporte {
  if (!f.mes) return { ...f, ano: f.ano - 1 };
  return f.mes === 1 ? { ...f, ano: f.ano - 1, mes: 12 } : { ...f, mes: f.mes - 1 };
}

/** WHERE común (usuario, sin transferencias, fechas, cuenta). $1 = usuario, $2 = TRM. */
function donde(f: FiltroReporte, params: unknown[]): string {
  const r = rangoReporte(f);
  params.push(r.desde, r.hasta);
  let w = `t.usuario_id = $1 AND t.tipo <> 'transferencia' AND t.fecha >= $${params.length - 1} AND t.fecha <= $${params.length}`;
  if (f.cuentaId != null) { params.push(f.cuentaId); w += ` AND t.cuenta_id = $${params.length}`; }
  return w;
}

const PESOS = `(CASE WHEN c.moneda = 'USD' THEN t.monto * $2 ELSE t.monto END)`;
const SUMA = (tipo: "ingreso" | "egreso") => `COALESCE(SUM(CASE WHEN t.tipo='${tipo}' THEN ${PESOS} END), 0)`;

// ---------- Resumen ----------

export interface ResumenReporte {
  ingresos: number;
  egresos: number;
  balance: number;
  /** balance / ingresos (0–1, puede ser negativo); null sin ingresos. */
  tasaAhorro: number | null;
  movimientos: number;
}

export async function resumenReporte(f: FiltroReporte, trm: number | null): Promise<ResumenReporte> {
  const params: unknown[] = [U, trm ?? 0];
  const [r] = await (await db()).select<{ ingresos: number; egresos: number; n: number }[]>(
    `SELECT ${SUMA("ingreso")} AS ingresos, ${SUMA("egreso")} AS egresos, COUNT(*) AS n
     FROM transacciones t JOIN cuentas c ON c.id = t.cuenta_id
     WHERE ${donde(f, params)}`,
    params,
  );
  const ingresos = Math.round(r?.ingresos ?? 0), egresos = Math.round(r?.egresos ?? 0);
  const balance = ingresos - egresos;
  return { ingresos, egresos, balance, tasaAhorro: ingresos > 0 ? balance / ingresos : null, movimientos: r?.n ?? 0 };
}

/** Variación relativa (null si la base es 0). */
export const variacion = (actual: number, antes: number) => (antes ? (actual - antes) / Math.abs(antes) : null);

// ---------- Evolución mensual ----------

export interface MesReporte { mes: number; ingresos: number; egresos: number; balance: number }

/** Los 12 meses del año (sin huecos). Ignora `mes` del filtro. */
export async function mensualReporte(f: FiltroReporte, trm: number | null): Promise<MesReporte[]> {
  const params: unknown[] = [U, trm ?? 0];
  const filas = await (await db()).select<{ mes: string; ingresos: number; egresos: number }[]>(
    `SELECT substr(t.fecha, 6, 2) AS mes, ${SUMA("ingreso")} AS ingresos, ${SUMA("egreso")} AS egresos
     FROM transacciones t JOIN cuentas c ON c.id = t.cuenta_id
     WHERE ${donde({ ...f, mes: null }, params)}
     GROUP BY 1`,
    params,
  );
  const mapa = new Map(filas.map((x) => [Number(x.mes), x]));
  return Array.from({ length: 12 }, (_, i) => {
    const x = mapa.get(i + 1);
    const ingresos = Math.round(x?.ingresos ?? 0), egresos = Math.round(x?.egresos ?? 0);
    return { mes: i + 1, ingresos, egresos, balance: ingresos - egresos };
  });
}

/** Año elegido contra el anterior, mes a mes. */
export async function anoVsAno(f: FiltroReporte, trm: number | null): Promise<{ actual: MesReporte[]; anterior: MesReporte[] }> {
  const [actual, anterior] = await Promise.all([
    mensualReporte(f, trm),
    mensualReporte({ ...f, ano: f.ano - 1 }, trm),
  ]);
  return { actual, anterior };
}

// ---------- Tops ----------

export interface CategoriaReporte {
  id: number | null;
  nombre: string;
  icono: NombreIcono | null;
  color: ClaveColor | null;
  total: number;
  /** Sobre el total del tipo en el período (0–1). */
  porcentaje: number;
}

/** Top de categorías de egreso o ingreso. id null = sin categoría. */
export async function topCategoriasReporte(
  f: FiltroReporte, tipo: "ingreso" | "egreso", trm: number | null, limite = 10,
): Promise<CategoriaReporte[]> {
  const params: unknown[] = [U, trm ?? 0];
  const w = donde(f, params);
  params.push(tipo);
  const filas = await (await db()).select<Omit<CategoriaReporte, "porcentaje">[]>(
    `SELECT p.id AS id, COALESCE(p.nombre, 'Sin categoría') AS nombre, p.icono, p.color, SUM(${PESOS}) AS total
     FROM transacciones t
     JOIN cuentas c ON c.id = t.cuenta_id
     LEFT JOIN categorias k ON k.id = t.categoria_id
     LEFT JOIN categorias p ON p.id = COALESCE(k.padre_id, k.id)
     WHERE ${w} AND t.tipo = $${params.length}
     GROUP BY p.id ORDER BY total DESC`,
    params,
  );
  const todas = filas.map((x) => ({ ...x, total: Math.round(x.total) })).filter((x) => x.total > 0);
  const suma = todas.reduce((s, x) => s + x.total, 0);
  return todas.slice(0, limite).map((x) => ({ ...x, porcentaje: suma ? x.total / suma : 0 }));
}

export interface ComercioReporte {
  comercio: string;
  total: number;
  veces: number;
  /** Sobre el total de egresos del período (incluye los que no tienen comercio). */
  porcentaje: number;
}

export async function topComerciosReporte(f: FiltroReporte, trm: number | null, limite = 15): Promise<ComercioReporte[]> {
  const params: unknown[] = [U, trm ?? 0];
  const w = donde(f, params);
  const d = await db();
  const [filas, [tot]] = await Promise.all([
    d.select<Omit<ComercioReporte, "porcentaje">[]>(
      `SELECT MAX(TRIM(t.comercio)) AS comercio, SUM(${PESOS}) AS total, COUNT(*) AS veces
       FROM transacciones t JOIN cuentas c ON c.id = t.cuenta_id
       WHERE ${w} AND t.tipo = 'egreso' AND TRIM(COALESCE(t.comercio, '')) <> ''
       GROUP BY lower(TRIM(t.comercio)) ORDER BY total DESC LIMIT ${Number(limite)}`,
      params,
    ),
    d.select<{ total: number }[]>(
      `SELECT ${SUMA("egreso")} AS total FROM transacciones t JOIN cuentas c ON c.id = t.cuenta_id WHERE ${w}`,
      params,
    ),
  ]);
  const total = Math.round(tot?.total ?? 0);
  return filas
    .map((x) => ({ ...x, total: Math.round(x.total) }))
    .filter((x) => x.total > 0)
    .map((x) => ({ ...x, porcentaje: total ? x.total / total : 0 }));
}

// ---------- Para el Excel ----------

export interface MovimientoReporte {
  fecha: string;
  tipo: "ingreso" | "egreso";
  cuenta: string;
  categoria: string | null;
  comercio: string | null;
  notas: string | null;
  moneda: string;
  monto: number;
  /** En pesos (USD × TRM). */
  montoPesos: number;
}

/** Ingresos y egresos del período, del más antiguo al más reciente. */
export async function movimientosReporte(f: FiltroReporte, trm: number | null): Promise<MovimientoReporte[]> {
  const params: unknown[] = [U, trm ?? 0];
  const filas = await (await db()).select<MovimientoReporte[]>(
    `SELECT t.fecha, t.tipo, c.nombre AS cuenta, k.nombre AS categoria, t.comercio, t.notas,
            c.moneda, t.monto, ${PESOS} AS montoPesos
     FROM transacciones t
     JOIN cuentas c ON c.id = t.cuenta_id
     LEFT JOIN categorias k ON k.id = t.categoria_id
     WHERE ${donde(f, params)}
     ORDER BY t.fecha, t.id`,
    params,
  );
  return filas.map((x) => ({ ...x, montoPesos: Math.round(x.montoPesos) }));
}

/** Años con movimientos (para el selector), del más reciente al más antiguo; incluye el actual. */
export async function anosConMovimientos(): Promise<number[]> {
  const filas = await (await db()).select<{ a: string }[]>(
    "SELECT DISTINCT substr(fecha, 1, 4) AS a FROM transacciones WHERE usuario_id = $1", [U]);
  const set = new Set(filas.map((x) => Number(x.a)).filter(Boolean));
  set.add(new Date().getFullYear());
  return [...set].sort((a, b) => b - a);
}
