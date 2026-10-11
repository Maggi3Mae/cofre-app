// Cierre del mes: lo que pasó en un mes comparado con el anterior (para el correo del día 1).
import { db } from "$lib/db";
import { hoy } from "$lib/formato";
import { leerTrm, leerPatrimonioOculto } from "./ajustes";
import { resumenReporte, topCategoriasReporte, filtroAnterior, rangoReporte, variacion, type ResumenReporte } from "./reportes";
import { listarPresupuestos } from "./presupuestos";
import { patrimonio, historialPatrimonio } from "./resumen";
import { porConfirmar } from "./recurrentes";

const U = 1;
/** Una categoría «creció» si gastaste al menos esto más que el mes anterior ($50.000, en centavos). */
const CRECIO_MIN = 5_000_000;

export interface CierreMes {
  ano: number;
  mes: number;
  actual: ResumenReporte;
  anterior: ResumenReporte;
  varIngresos: number | null;
  varEgresos: number | null;
  top: { nombre: string; total: number; porcentaje: number }[];
  crecieron: { nombre: string; total: number; antes: number }[];
  presupuestos: { total: number; cumplidos: number; excedidos: { nombre: string; limite: number; gastado: number }[] };
  recurrentes: { registrados: number; monto: number; sinConfirmar: number };
  /** null si el ojito del patrimonio está activo (no va en el correo). */
  patrimonio: { cierre: number; cambio: number; teDeben: number } | null;
  usdSinTrm: boolean;
}

const dos = (n: number) => String(n).padStart(2, "0");

/** Mes anterior al de `fecha` (AAAA-MM-DD). */
export function mesAnterior(fecha = hoy()): { ano: number; mes: number } {
  const [a, m] = fecha.split("-").map(Number);
  return m === 1 ? { ano: a - 1, mes: 12 } : { ano: a, mes: m - 1 };
}

/** El cierre de un mes se envía una sola vez (clave en alertas_enviadas, como las alertas). */
export const claveCierre = (ano: number, mes: number) => `cierre|${ano}-${dos(mes)}`;
export async function cierreEnviado(ano: number, mes: number): Promise<boolean> {
  const [f] = await (await db()).select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM alertas_enviadas WHERE usuario_id = $1 AND clave = $2", [U, claveCierre(ano, mes)]);
  return (f?.n ?? 0) > 0;
}
export async function marcarCierre(ano: number, mes: number): Promise<void> {
  await (await db()).execute("INSERT OR IGNORE INTO alertas_enviadas (usuario_id, clave) VALUES ($1, $2)", [U, claveCierre(ano, mes)]);
}

export async function datosCierre(ano: number, mes: number): Promise<CierreMes> {
  const trm = await leerTrm();
  const f = { ano, mes, cuentaId: null };
  const fa = filtroAnterior(f);
  const clave = `${ano}-${dos(mes)}`;
  const r = rangoReporte(f);
  const [actual, anterior, cats, catsAnt, presup, oculto, pat, pend, rec] = await Promise.all([
    resumenReporte(f, trm), resumenReporte(fa, trm),
    topCategoriasReporte(f, "egreso", trm, 100), topCategoriasReporte(fa, "egreso", trm, 100),
    listarPresupuestos(clave, trm), leerPatrimonioOculto(), patrimonio(), porConfirmar(),
    (await db()).select<{ n: number; total: number }[]>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN c.moneda = 'USD' THEN t.monto * $4 ELSE t.monto END), 0) AS total
       FROM transacciones t JOIN cuentas c ON c.id = t.cuenta_id
       WHERE t.usuario_id = $1 AND t.recurrente_id IS NOT NULL AND t.fecha >= $2 AND t.fecha <= $3`,
      [U, r.desde, r.hasta, trm ?? 0]),
  ]);

  const antes = new Map(catsAnt.map((c) => [c.id, c.total]));
  const crecieron = cats
    .map((c) => ({ nombre: c.nombre, total: c.total, antes: antes.get(c.id) ?? 0 }))
    .filter((c) => c.total - c.antes >= CRECIO_MIN)
    .sort((a, b) => (b.total - b.antes) - (a.total - a.antes))
    .slice(0, 3);

  let datosPat: CierreMes["patrimonio"] = null;
  if (!oculto) {
    // Cierres mensuales desde el mes anterior al del correo hasta hoy.
    const [ah, mh] = hoy().split("-").map(Number);
    const meses = (ah - ano) * 12 + (mh - mes) + 2;
    const h = await historialPatrimonio(pat.neto, trm, hoy(), Math.max(2, meses));
    const i = h.findIndex((p) => p.mes === clave);
    if (i > 0) datosPat = { cierre: h[i].neto, cambio: h[i].neto - h[i - 1].neto, teDeben: pat.teDeben };
  }

  return {
    ano, mes, actual, anterior,
    varIngresos: variacion(actual.ingresos, anterior.ingresos),
    varEgresos: variacion(actual.egresos, anterior.egresos),
    top: cats.slice(0, 5).map((c) => ({ nombre: c.nombre, total: c.total, porcentaje: c.porcentaje })),
    crecieron,
    presupuestos: {
      total: presup.length,
      cumplidos: presup.filter((p) => p.gastado <= p.limite).length,
      excedidos: presup.filter((p) => p.gastado > p.limite)
        .sort((a, b) => (b.gastado - b.limite) - (a.gastado - a.limite))
        .map((p) => ({ nombre: p.nombre, limite: p.limite, gastado: p.gastado })),
    },
    recurrentes: {
      registrados: rec[0]?.n ?? 0,
      monto: Math.round(rec[0]?.total ?? 0),
      sinConfirmar: pend.filter((o) => o.fecha >= r.desde && o.fecha <= r.hasta).length,
    },
    patrimonio: datosPat,
    usdSinTrm: !trm && pat.usdSinTrm,
  };
}
