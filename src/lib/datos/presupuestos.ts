// Presupuestos mensuales por categoría de egreso y alertas de tope.
// Gasto que cuenta: egresos con categoría, del mes elegido, en pesos (USD × TRM).
// No cuentan ingresos, transferencias, movimientos sin categoría ni de otros meses.
// Las subcategorías suman al presupuesto de su padre.
import { db } from "$lib/db";
import { leerTrm } from "./ajustes";
import { avisarCambio } from "./cambios";
import type { NombreIcono } from "$lib/iconos";
import type { ClaveColor } from "./paleta";

const U = 1;

export type Nivel = "ok" | "w80" | "w90" | "over";

export interface Presupuesto {
  categoria_id: number;
  nombre: string;
  icono: NombreIcono | null;
  color: ClaveColor | null;
  padre_nombre: string | null;
  limite: number;
  gastado: number;
  /** Porcentaje usado (0–∞). */
  pct: number;
  nivel: Nivel;
  /** Solo en el mes en curso, desde el día 10: gasto proyectado al cierre si pasa del límite. */
  proyeccion: number | null;
}

/** «AAAA-MM» del mes actual (hora local). */
export function mesEnCurso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function nivelDe(pct: number): Nivel {
  return pct >= 100 ? "over" : pct >= 90 ? "w90" : pct >= 80 ? "w80" : "ok";
}

/** Clase del sistema de diseño para barra/chip según nivel. */
export const claseNivel: Record<Nivel, string> = { ok: "income", w80: "warn-80", w90: "warn-90", over: "over-100" };

const DIA_PROYECCION = 10;

export async function listarPresupuestos(mes = mesEnCurso(), trm?: number | null): Promise<Presupuesto[]> {
  const conexion = await db();
  const t = trm === undefined ? await leerTrm() : trm;
  const [lista, gastos] = await Promise.all([
    conexion.select<Omit<Presupuesto, "gastado" | "pct" | "nivel" | "proyeccion">[]>(
      `SELECT p.categoria_id, k.nombre, k.icono, k.color, pa.nombre AS padre_nombre, p.monto_mensual AS limite
       FROM presupuestos p
       JOIN categorias k ON k.id = p.categoria_id
       LEFT JOIN categorias pa ON pa.id = k.padre_id
       WHERE p.usuario_id = $1 AND k.tipo = 'egreso'`, [U]),
    conexion.select<{ id: number; padre_id: number | null; total: number }[]>(
      `SELECT k.id, k.padre_id,
              SUM(CASE WHEN c.moneda = 'USD' THEN t.monto * $3 ELSE t.monto END) AS total
       FROM transacciones t
       JOIN cuentas c ON c.id = t.cuenta_id
       JOIN categorias k ON k.id = t.categoria_id
       WHERE t.usuario_id = $1 AND t.tipo = 'egreso' AND k.tipo = 'egreso'
         AND strftime('%Y-%m', t.fecha) = $2
       GROUP BY k.id`, [U, mes, t ?? 0]),
  ]);

  // Proyección lineal al cierre, solo para el mes en curso.
  const ahora = new Date();
  const enCurso = mes === mesEnCurso();
  const dia = ahora.getDate();
  const diasMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();

  return lista
    .map((p) => {
      const gastado = Math.round(
        gastos.filter((g) => g.id === p.categoria_id || g.padre_id === p.categoria_id).reduce((s, g) => s + g.total, 0));
      const pct = p.limite > 0 ? (gastado / p.limite) * 100 : 0;
      const proy = enCurso && dia >= DIA_PROYECCION && dia < diasMes ? Math.round((gastado / dia) * diasMes) : null;
      return {
        ...p, gastado, pct, nivel: nivelDe(pct),
        proyeccion: proy != null && pct < 100 && proy > p.limite ? proy : null,
      };
    })
    .sort((a, b) => b.pct - a.pct || a.nombre.localeCompare(b.nombre, "es"));
}

/** Crea o sobreescribe el presupuesto de la categoría (uno por categoría). */
export async function guardarPresupuesto(categoriaId: number, limite: number): Promise<void> {
  if (!Number.isFinite(limite) || limite <= 0) throw new Error("El límite debe ser mayor que cero.");
  const conexion = await db();
  const [cat] = await conexion.select<{ tipo: string }[]>(
    "SELECT tipo FROM categorias WHERE id = $1 AND usuario_id = $2", [categoriaId, U]);
  if (!cat) throw new Error("La categoría no existe.");
  if (cat.tipo !== "egreso") throw new Error("Solo las categorías de egreso pueden tener presupuesto.");
  await conexion.execute(
    `INSERT INTO presupuestos (usuario_id, categoria_id, monto_mensual) VALUES ($1, $2, $3)
     ON CONFLICT (usuario_id, categoria_id) DO UPDATE SET monto_mensual = excluded.monto_mensual`,
    [U, categoriaId, Math.round(limite)]);
  avisarCambio();
}

export async function eliminarPresupuesto(categoriaId: number): Promise<void> {
  await (await db()).execute("DELETE FROM presupuestos WHERE categoria_id = $1 AND usuario_id = $2", [categoriaId, U]);
  avisarCambio();
}

// ---------- Alertas ----------

export interface AlertaPresupuesto {
  tipo: "presupuesto" | "ritmo";
  nivel: Nivel;
  titulo: string;
  cuerpo: string;
  /** Gastado / límite (1 = 100 %). */
  progreso: number;
}

const UMBRALES = [80, 90, 100] as const;

/**
 * Revisa los presupuestos del mes en curso y devuelve solo las alertas nuevas.
 * Cada umbral (80/90/100 %) y el aviso de ritmo se envían una sola vez por categoría y mes.
 * Si se cruzan varios umbrales de una vez, se avisa solo el más alto.
 */
export async function revisarPresupuestos(
  pesos: (c: number) => string,
): Promise<{ alertas: AlertaPresupuesto[]; enRiesgo: number }> {
  const mes = mesEnCurso();
  const lista = await listarPresupuestos(mes);
  const conexion = await db();
  // Clave de cada aviso en alertas_enviadas: «tipo|categoría|AAAA-MM|umbral».
  const clave = (tipo: string, id: number, umbral: number) => `${tipo}|${id}|${mes}|${umbral}`;
  const enviadas = new Set(
    (await conexion.select<{ clave: string }[]>(
      "SELECT clave FROM alertas_enviadas WHERE usuario_id = $1 AND clave LIKE '%|' || $2 || '|%'", [U, mes]))
      .map((a) => a.clave));
  const marcar = (tipo: string, id: number, umbral: number) =>
    conexion.execute("INSERT OR IGNORE INTO alertas_enviadas (usuario_id, clave) VALUES ($1, $2)", [U, clave(tipo, id, umbral)]);

  const alertas: AlertaPresupuesto[] = [];
  for (const p of lista) {
    const cruzados = UMBRALES.filter((u) => p.pct >= u);
    const nuevos = cruzados.filter((u) => !enviadas.has(clave("presupuesto", p.categoria_id, u)));
    for (const u of nuevos) await marcar("presupuesto", p.categoria_id, u);
    if (nuevos.length) {
      const u = Math.max(...nuevos);
      const pct = Math.round(p.pct);
      alertas.push(u >= 100
        ? {
            tipo: "presupuesto", progreso: p.pct / 100, nivel: "over", titulo: `Presupuesto excedido: ${p.nombre}`,
            cuerpo: `Gastaste ${pesos(p.gastado)} de ${pesos(p.limite)}. Exceso: ${pesos(p.gastado - p.limite)} (${pct} %).`,
          }
        : {
            tipo: "presupuesto", progreso: p.pct / 100, nivel: nivelDe(u), titulo: `${p.nombre}: llevas el ${pct} %`,
            cuerpo: `Gastaste ${pesos(p.gastado)} de ${pesos(p.limite)}. Te quedan ${pesos(p.limite - p.gastado)}.`,
          });
    }
    if (p.proyeccion != null && !enviadas.has(clave("ritmo", p.categoria_id, 0))) {
      await marcar("ritmo", p.categoria_id, 0);
      alertas.push({
        tipo: "ritmo", progreso: p.pct / 100, nivel: "w80", titulo: `A este ritmo te pasarás en ${p.nombre}`,
        cuerpo: `Gastarías ${pesos(p.proyeccion)} de ${pesos(p.limite)} al cierre del mes.`,
      });
    }
  }
  return { alertas, enRiesgo: lista.filter((p) => p.nivel !== "ok").length };
}
