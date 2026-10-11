// Consultas del Dashboard. Todo se expresa en pesos: los movimientos y saldos en dólares
// se convierten con la TRM de Ajustes; si no hay TRM, los dólares no se suman (y se avisa).
import { db } from "$lib/db";
import { listarCuentas } from "./cuentas";
import { leerTrm } from "./ajustes";
import { valorCdts } from "./cdts";
import { valorCajitas } from "./cajitas";
import { totalTeDeben } from "./medeben";
import type { NombreIcono } from "$lib/iconos";
import type { ClaveColor } from "./paleta";

const U = 1;

export interface Rango { desde?: string; hasta?: string }

/** Condición de fechas sobre `t.fecha` con parámetros a partir de $inicio. */
function fechas(r: Rango, params: unknown[]) {
  const w: string[] = [];
  if (r.desde) { params.push(r.desde); w.push(`t.fecha >= $${params.length}`); }
  if (r.hasta) { params.push(r.hasta); w.push(`t.fecha <= $${params.length}`); }
  return w.length ? " AND " + w.join(" AND ") : "";
}

/** Expresión SQL del monto en pesos (USD × TRM; sin TRM, los USD valen 0). */
const enPesos = (trmParam: string) => `(CASE WHEN c.moneda = 'USD' THEN t.monto * ${trmParam} ELSE t.monto END)`;

// ---------- Patrimonio (siempre a hoy) ----------

export interface Patrimonio {
  activos: number;
  /** Parte de los activos que está en CDT (neto de hoy) y cajitas (valor de hoy). */
  inversiones: number;
  /** Parte de los activos que te deben personas (pendiente de los préstamos activos). */
  teDeben: number;
  deuda: number;
  neto: number;
  /** Hay cuentas en dólares pero no hay TRM: no se sumaron. */
  usdSinTrm: boolean;
}

export async function patrimonio(): Promise<Patrimonio> {
  const [cuentas, trm, cdts, cajitas, teDeben] = await Promise.all([
    listarCuentas(false), leerTrm(), valorCdts(), valorCajitas(), totalTeDeben(),
  ]);
  const inversiones = cdts + cajitas;
  let activos = 0, deuda = 0, usdSinTrm = false;
  for (const c of cuentas) {
    let v = c.saldo;
    if (c.moneda === "USD") {
      if (!trm) { usdSinTrm = true; continue; }
      v = Math.round(v * trm);
    }
    if (c.tipo === "credito") deuda += Math.max(v, 0);
    else activos += v;
  }
  // CDT: valor neto de hoy. Cajitas: valor de hoy. Préstamos: lo pendiente.
  activos += inversiones + teDeben;
  return { activos, inversiones, teDeben, deuda, neto: activos - deuda, usdSinTrm };
}

export interface PuntoPatrimonio { mes: string; neto: number }

/**
 * Patrimonio al cierre de cada uno de los últimos `meses` meses (el último es hoy).
 * Se reconstruye hacia atrás: neto de hoy − efecto de todo lo que pasó después de cada cierre.
 * Efecto en el patrimonio: ingreso +, egreso −; transferencia − lo que sale + lo que entra
 * (0 entre cuentas de la misma moneda). Solo cuentas activas, como `patrimonio()`.
 */
export async function historialPatrimonio(netoHoy: number, trm: number | null, hoyIso: string, meses = 6): Promise<PuntoPatrimonio[]> {
  const [a, m] = hoyIso.split("-").map(Number);
  const claves: string[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(a, m - 1 - i, 1);
    claves.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const pesosDe = (cta: string, v: string) => `(CASE WHEN ${cta}.moneda = 'USD' THEN ${v} * $2 ELSE ${v} END)`;
  const filas = await (await db()).select<{ mes: string; efecto: number }[]>(
    `SELECT strftime('%Y-%m', t.fecha) AS mes, SUM(
       CASE WHEN co.archivada = 0 THEN (CASE WHEN t.tipo = 'ingreso' THEN 1 ELSE -1 END) * ${pesosDe("co", "t.monto")} ELSE 0 END
     + CASE WHEN t.tipo = 'transferencia' AND de.archivada = 0 THEN ${pesosDe("de", "COALESCE(t.monto_destino, t.monto)")} ELSE 0 END
     ) AS efecto
     FROM transacciones t
     JOIN cuentas co ON co.id = t.cuenta_id
     LEFT JOIN cuentas de ON de.id = t.cuenta_destino_id
     WHERE t.usuario_id = $1 AND t.fecha >= $3
       -- Abrir o retirar un CDT/cajita cambia de bolsillo la plata, no el patrimonio.
       AND t.cdt_destino_id IS NULL AND t.cdt_origen_id IS NULL
       AND t.cajita_destino_id IS NULL AND t.cajita_origen_id IS NULL
       -- Prestar o recibir un abono también: la plata pasa de la cuenta a «Te deben» y vuelve.
       -- (Dar por perdido sí cuenta: es un egreso que baja el patrimonio.)
       AND t.prestamo_destino_id IS NULL AND t.prestamo_origen_id IS NULL
     GROUP BY mes`,
    [U, trm ?? 0, `${claves[1]}-01`],
  );
  const efecto = new Map(filas.map((f) => [f.mes, f.efecto]));
  // Lo que pasó después del cierre del mes k = suma de los meses siguientes (incluye fechas futuras).
  const posteriores = (k: string) => [...efecto].reduce((s, [mes, e]) => (mes > k ? s + e : s), 0);
  return claves.map((k, i) => ({
    mes: k,
    neto: i === claves.length - 1 ? netoHoy : Math.round(netoHoy - posteriores(k)),
  }));
}

// ---------- Totales del período ----------

export interface Totales { ingresos: number; egresos: number; balance: number }

export async function totales(r: Rango, trm: number | null): Promise<Totales> {
  const params: unknown[] = [U, trm ?? 0];
  const [f] = await (await db()).select<{ ingresos: number; egresos: number }[]>(
    `SELECT COALESCE(SUM(CASE WHEN t.tipo='ingreso' THEN ${enPesos("$2")} END), 0) AS ingresos,
            COALESCE(SUM(CASE WHEN t.tipo='egreso' THEN ${enPesos("$2")} END), 0) AS egresos
     FROM transacciones t JOIN cuentas c ON c.id = t.cuenta_id
     WHERE t.usuario_id = $1 AND t.tipo <> 'transferencia'${fechas(r, params)}`,
    params,
  );
  const ingresos = Math.round(f.ingresos), egresos = Math.round(f.egresos);
  return { ingresos, egresos, balance: ingresos - egresos };
}

/** ¿Hay movimientos en dólares en el rango? (para avisar si falta la TRM) */
export async function hayUsdEnRango(r: Rango): Promise<boolean> {
  const params: unknown[] = [U];
  const [f] = await (await db()).select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM transacciones t JOIN cuentas c ON c.id = t.cuenta_id
     WHERE t.usuario_id = $1 AND c.moneda = 'USD' AND t.tipo <> 'transferencia'${fechas(r, params)}`,
    params,
  );
  return f.n > 0;
}

/** Fecha del primer movimiento (para el período «Todo»). */
export async function primeraFecha(): Promise<string | null> {
  const [f] = await (await db()).select<{ f: string | null }[]>(
    "SELECT MIN(fecha) AS f FROM transacciones WHERE usuario_id = $1", [U]);
  return f?.f ?? null;
}

// ---------- Evolución ----------

export interface PuntoEvolucion { clave: string; ingresos: number; egresos: number }

/** Ingresos y egresos por día («AAAA-MM-DD») o por mes («AAAA-MM»). Sin huecos. */
export async function evolucion(r: Required<Rango>, por: "dia" | "mes", trm: number | null): Promise<PuntoEvolucion[]> {
  const params: unknown[] = [U, trm ?? 0];
  const clave = por === "dia" ? "t.fecha" : "substr(t.fecha, 1, 7)";
  const filas = await (await db()).select<PuntoEvolucion[]>(
    `SELECT ${clave} AS clave,
            COALESCE(SUM(CASE WHEN t.tipo='ingreso' THEN ${enPesos("$2")} END), 0) AS ingresos,
            COALESCE(SUM(CASE WHEN t.tipo='egreso' THEN ${enPesos("$2")} END), 0) AS egresos
     FROM transacciones t JOIN cuentas c ON c.id = t.cuenta_id
     WHERE t.usuario_id = $1 AND t.tipo <> 'transferencia'${fechas(r, params)}
     GROUP BY 1 ORDER BY 1`,
    params,
  );
  const mapa = new Map(filas.map((f) => [f.clave, f]));
  const salida: PuntoEvolucion[] = [];
  const [a, m, d] = r.desde.split("-").map(Number);
  const fin = r.hasta;
  const cur = new Date(a, m - 1, por === "dia" ? d : 1);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  while (true) {
    const k = por === "dia" ? iso(cur) : iso(cur).slice(0, 7);
    if (k > (por === "dia" ? fin : fin.slice(0, 7))) break;
    const f = mapa.get(k);
    salida.push({ clave: k, ingresos: Math.round(f?.ingresos ?? 0), egresos: Math.round(f?.egresos ?? 0) });
    if (por === "dia") cur.setDate(cur.getDate() + 1);
    else cur.setMonth(cur.getMonth() + 1);
    if (salida.length > 400) break; // por seguridad
  }
  return salida;
}

// ---------- Tops ----------

export interface TopCategoria {
  id: number | null;
  nombre: string;
  icono: NombreIcono | null;
  color: ClaveColor | null;
  total: number;
}

/** Categorías de gasto (las subcategorías se suman a su padre). id null = sin categoría. */
export async function topCategorias(r: Rango, trm: number | null, limite = 5): Promise<TopCategoria[]> {
  const params: unknown[] = [U, trm ?? 0];
  const filas = await (await db()).select<TopCategoria[]>(
    `SELECT p.id AS id, COALESCE(p.nombre, 'Sin categoría') AS nombre, p.icono, p.color,
            SUM(${enPesos("$2")}) AS total
     FROM transacciones t
     JOIN cuentas c ON c.id = t.cuenta_id
     LEFT JOIN categorias k ON k.id = t.categoria_id
     LEFT JOIN categorias p ON p.id = COALESCE(k.padre_id, k.id)
     WHERE t.usuario_id = $1 AND t.tipo = 'egreso'${fechas(r, params)}
     GROUP BY p.id ORDER BY total DESC LIMIT ${Number(limite)}`,
    params,
  );
  return filas.map((f) => ({ ...f, total: Math.round(f.total) })).filter((f) => f.total > 0);
}

export interface TopComercio { comercio: string; total: number; veces: number }

export async function topComercios(r: Rango, trm: number | null, limite = 5): Promise<TopComercio[]> {
  const params: unknown[] = [U, trm ?? 0];
  const filas = await (await db()).select<TopComercio[]>(
    `SELECT MAX(t.comercio) AS comercio, SUM(${enPesos("$2")}) AS total, COUNT(*) AS veces
     FROM transacciones t JOIN cuentas c ON c.id = t.cuenta_id
     WHERE t.usuario_id = $1 AND t.tipo = 'egreso' AND TRIM(COALESCE(t.comercio, '')) <> ''${fechas(r, params)}
     GROUP BY lower(TRIM(t.comercio)) ORDER BY total DESC LIMIT ${Number(limite)}`,
    params,
  );
  return filas.map((f) => ({ ...f, total: Math.round(f.total) })).filter((f) => f.total > 0);
}

// ---------- Cuotas de tarjetas ----------

export interface ResumenCuotas {
  totalPendiente: number;
  esteMes: number;
  proximoMes: number;
  cuotasPendientes: number;
}

/** Plan teórico de cuotas (no son transacciones). null si no hay cuotas pendientes. */
export async function resumenCuotas(hoy: string, trm: number | null): Promise<ResumenCuotas | null> {
  const [a, m] = hoy.split("-").map(Number);
  const mes = `${a}-${String(m).padStart(2, "0")}`;
  const sig = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  const valor = `(CASE WHEN c.moneda = 'USD' THEN (q.capital + q.interes) * $4 ELSE (q.capital + q.interes) END)`;
  const [f] = await (await db()).select<{ total: number; este: number; prox: number; n: number }[]>(
    `SELECT COALESCE(SUM(${valor}), 0) AS total,
            COALESCE(SUM(CASE WHEN substr(q.fecha, 1, 7) = $2 THEN ${valor} END), 0) AS este,
            COALESCE(SUM(CASE WHEN substr(q.fecha, 1, 7) = $3 THEN ${valor} END), 0) AS prox,
            COUNT(*) AS n
     FROM cuotas q
     JOIN compras_credito cc ON cc.id = q.compra_id
     JOIN cuentas c ON c.id = cc.cuenta_id
     WHERE cc.usuario_id = $1 AND cc.num_cuotas >= 2 AND substr(q.fecha, 1, 7) >= $2`,
    [U, mes, sig, trm ?? 0],
  );
  if (!f || !f.n) return null;
  return { totalPendiente: Math.round(f.total), esteMes: Math.round(f.este), proximoMes: Math.round(f.prox), cuotasPendientes: f.n };
}
