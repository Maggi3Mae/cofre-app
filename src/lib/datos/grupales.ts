// Gastos grupales: pagaste tú y se reparte entre varias personas.
//  · Tu parte = egreso con categoría (gasto_grupal_id). Si tu parte es 0, no hay egreso.
//  · La parte de cada persona = préstamo desde la misma cuenta (prestamos.gasto_grupal_id).
//  · Desde un egreso existente: ese egreso se reduce a tu parte; los préstamos salen de su cuenta,
//    así que el saldo de la cuenta queda igual.
// Eliminar el gasto grupal borra su egreso y sus préstamos (con sus abonos).
import { db } from "$lib/db";
import { repartir, type ModoReparto, type Reparto } from "$lib/medeben/reparto";
import { avisarCambio } from "./cambios";
import { crearPrestamo, eliminarPrestamo, listarPrestamos, type Prestamo } from "./medeben";
import { eliminarTransacciones } from "./transacciones";

const U = 1;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface ParticipanteGrupal {
  /** null = tú */
  persona_id: number | null;
  /** montos: centavos sin propina; porcentaje: fracción 0–1. */
  valor?: number;
}

export interface GastoGrupalNuevo {
  descripcion: string;
  fecha: string;
  cuenta_id: number;
  categoria_id: number | null;
  /** Total sin propina (centavos). Al dividir un egreso existente se usa su monto. */
  base: number;
  /** Fracción: 0,1 = 10 %. */
  propinaPct: number;
  reparto: ModoReparto;
  participantes: ParticipanteGrupal[];
  /** Cuándo quedaron en pagarte (opcional, para todos). */
  fecha_acordada: string | null;
  /** Egreso existente que se divide (null = gasto nuevo). */
  transaccion_id: number | null;
}

export interface ParteGrupal { persona_id: number; persona: string; monto: number; prestamo: Prestamo }

export interface GastoGrupal {
  id: number;
  descripcion: string;
  fecha: string;
  total: number;
  propina: number;
  reparto: ModoReparto;
  cuenta: string | null;
  categoria: string | null;
  /** Tu parte (egreso). */
  miParte: number;
  partes: ParteGrupal[];
  /** Lo que aún te deben de este gasto. */
  pendiente: number;
}

/** Egreso que se puede dividir. */
export interface EgresoDivisible { id: number; fecha: string; monto: number; cuenta_id: number; categoria_id: number | null; comercio: string | null }

/** Calcula el reparto con los datos del formulario (para mostrarlo en vivo). */
export const calcularReparto = (g: Pick<GastoGrupalNuevo, "base" | "propinaPct" | "reparto" | "participantes">): Reparto =>
  repartir(g.base, g.propinaPct, g.reparto, g.participantes.map((p) => ({
    clave: p.persona_id == null ? "yo" : String(p.persona_id), yo: p.persona_id == null, valor: p.valor,
  })));

/** Revisa que el egreso se pueda dividir y lo devuelve. */
export async function egresoParaDividir(id: number): Promise<EgresoDivisible> {
  const [t] = await (await db()).select<(EgresoDivisible & {
    tipo: string; moneda: string; grupal: number | null; prestamo: number | null; cuotas: number | null;
  })[]>(
    `SELECT t.id, t.fecha, t.monto, t.cuenta_id, t.categoria_id, t.comercio, t.tipo, c.moneda,
            t.gasto_grupal_id AS grupal, t.prestamo_perdido_id AS prestamo,
            (SELECT cc.num_cuotas FROM compras_credito cc WHERE cc.transaccion_id = t.id) AS cuotas
     FROM transacciones t JOIN cuentas c ON c.id = t.cuenta_id
     WHERE t.id = $1 AND t.usuario_id = $2`, [id, U]);
  if (!t) throw new Error("El movimiento ya no existe.");
  if (t.tipo !== "egreso") throw new Error("Solo se pueden dividir egresos.");
  if (t.grupal != null) throw new Error("Este gasto ya está dividido.");
  if (t.prestamo != null) throw new Error("Este egreso es un préstamo perdido; no se puede dividir.");
  if (t.moneda !== "COP") throw new Error("Por ahora solo se dividen gastos en pesos.");
  if ((t.cuotas ?? 1) > 1) throw new Error("Las compras a cuotas no se pueden dividir.");
  return { id: t.id, fecha: t.fecha, monto: t.monto, cuenta_id: t.cuenta_id, categoria_id: t.categoria_id, comercio: t.comercio };
}

async function validar(g: GastoGrupalNuevo) {
  if (!g.descripcion.trim()) throw new Error("Ponle un nombre al gasto (por ejemplo, «Cena de cumpleaños»).");
  if (!FECHA.test(g.fecha)) throw new Error("La fecha no es válida.");
  if (g.fecha_acordada && (!FECHA.test(g.fecha_acordada) || g.fecha_acordada < g.fecha))
    throw new Error("La fecha para pagarte no puede ser antes del gasto.");
  if (!Number.isInteger(g.base) || g.base <= 0) throw new Error("Escribe el total del gasto.");
  if (!(g.propinaPct >= 0 && g.propinaPct <= 1)) throw new Error("La propina debe estar entre 0 % y 100 %.");
  const otros = g.participantes.filter((p) => p.persona_id != null);
  if (!otros.length) throw new Error("Elige al menos a una persona con quien dividir.");
  if (new Set(otros.map((p) => p.persona_id)).size !== otros.length) throw new Error("Hay una persona repetida.");
  const conexion = await db();
  const [c] = await conexion.select<{ moneda: string; archivada: number }[]>(
    "SELECT moneda, archivada FROM cuentas WHERE id = $1 AND usuario_id = $2", [g.cuenta_id, U]);
  if (!c || c.archivada || c.moneda !== "COP") throw new Error("Elige con qué cuenta o tarjeta en pesos pagaste.");
  if (g.categoria_id != null) {
    const [k] = await conexion.select<{ tipo: string }[]>("SELECT tipo FROM categorias WHERE id = $1", [g.categoria_id]);
    if (!k || k.tipo !== "egreso") throw new Error("Elige una categoría de egreso.");
  }
  const [n] = await conexion.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM personas WHERE usuario_id = $1 AND id IN (SELECT value FROM json_each($2))",
    [U, JSON.stringify(otros.map((p) => p.persona_id))]);
  if (n.n !== otros.length) throw new Error("Alguna de las personas ya no existe.");
}

/** Crea el gasto grupal: tu egreso y un préstamo por persona. Devuelve su id. */
export async function crearGastoGrupal(entrada: GastoGrupalNuevo): Promise<number> {
  let g = { ...entrada };
  let egreso: EgresoDivisible | null = null;
  if (g.transaccion_id != null) {
    egreso = await egresoParaDividir(g.transaccion_id);
    // El egreso manda: su monto ya incluye la propina y su cuenta es la que pagó.
    g = { ...g, base: egreso.monto, propinaPct: 0, cuenta_id: egreso.cuenta_id };
  }
  await validar(g);
  const r = calcularReparto(g);
  if (!r.cuadra) throw new Error(g.reparto === "porcentaje" ? "Los porcentajes deben sumar 100 %." : "Las partes deben sumar el total.");
  const partesOtros = r.partes.filter((p) => !p.yo);
  if (partesOtros.some((p) => p.monto <= 0)) throw new Error("A cada persona le debe tocar más de $ 0.");
  const miParte = r.partes.find((p) => p.yo)?.monto ?? 0;
  if (miParte < 0) throw new Error("Las partes de los demás superan el total.");

  const conexion = await db();
  const ins = await conexion.execute(
    `INSERT INTO gastos_grupales (usuario_id, descripcion, fecha, total, propina, reparto, cuenta_id, categoria_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [U, g.descripcion.trim(), g.fecha, r.total, r.propina, g.reparto, g.cuenta_id, g.categoria_id]);
  const id = ins.lastInsertId as number;

  // Tu parte
  if (egreso) {
    if (miParte > 0)
      await conexion.execute(
        `UPDATE transacciones SET monto = $1, gasto_grupal_id = $2, categoria_id = COALESCE($3, categoria_id)
         WHERE id = $4 AND usuario_id = $5`,
        [miParte, id, g.categoria_id, egreso.id, U]);
    else await eliminarTransacciones([egreso.id]); // no te tocó nada: todo el gasto pasa a préstamos
  } else if (miParte > 0) {
    await conexion.execute(
      `INSERT INTO transacciones (usuario_id, fecha, monto, tipo, cuenta_id, categoria_id, comercio, gasto_grupal_id)
       VALUES ($1, $2, $3, 'egreso', $4, $5, $6, $7)`,
      [U, g.fecha, miParte, g.cuenta_id, g.categoria_id, g.descripcion.trim(), id]);
  }

  // La parte de cada persona
  for (const p of partesOtros) {
    const prestamoId = await crearPrestamo({
      persona_id: Number(p.clave), monto: p.monto, fecha: g.fecha, fecha_acordada: g.fecha_acordada || null,
      descripcion: g.descripcion.trim(), cuenta_origen_id: g.cuenta_id,
    });
    await conexion.execute("UPDATE prestamos SET gasto_grupal_id = $1 WHERE id = $2", [id, prestamoId]);
  }
  avisarCambio();
  return id;
}

/** Gastos grupales, del más reciente al más antiguo, con la parte de cada uno. */
export async function listarGastosGrupales(): Promise<GastoGrupal[]> {
  const conexion = await db();
  const filas = await conexion.select<Omit<GastoGrupal, "partes" | "pendiente">[]>(
    `SELECT g.id, g.descripcion, g.fecha, g.total, g.propina, g.reparto, c.nombre AS cuenta, k.nombre AS categoria,
            COALESCE((SELECT SUM(t.monto) FROM transacciones t WHERE t.gasto_grupal_id = g.id AND t.tipo = 'egreso'), 0) AS miParte
     FROM gastos_grupales g
     LEFT JOIN cuentas c ON c.id = g.cuenta_id
     LEFT JOIN categorias k ON k.id = g.categoria_id
     WHERE g.usuario_id = $1
     ORDER BY g.fecha DESC, g.id DESC`, [U]);
  if (!filas.length) return [];
  const prestamos = (await listarPrestamos()).filter((p) => p.gasto_grupal_id != null);
  return filas.map((f) => {
    const partes = prestamos.filter((p) => p.gasto_grupal_id === f.id)
      .map((p) => ({ persona_id: p.persona_id, persona: p.persona, monto: p.monto, prestamo: p }))
      .sort((a, b) => a.persona.localeCompare(b.persona, "es"));
    return { ...f, partes, pendiente: partes.reduce((s, p) => s + p.prestamo.calculo.pendiente, 0) };
  });
}

/** Borra el gasto grupal con tu egreso y todos sus préstamos (y sus abonos). */
export async function eliminarGastoGrupal(id: number): Promise<void> {
  const conexion = await db();
  const prest = await conexion.select<{ id: number }[]>("SELECT id FROM prestamos WHERE gasto_grupal_id = $1", [id]);
  for (const p of prest) await eliminarPrestamo(p.id);
  const txs = await conexion.select<{ id: number }[]>(
    "SELECT id FROM transacciones WHERE gasto_grupal_id = $1 AND usuario_id = $2", [id, U]);
  if (txs.length) await eliminarTransacciones(txs.map((t) => t.id));
  await conexion.execute("DELETE FROM gastos_grupales WHERE id = $1 AND usuario_id = $2", [id, U]);
  avisarCambio();
}
