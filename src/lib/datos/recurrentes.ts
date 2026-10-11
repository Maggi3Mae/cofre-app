// Movimientos recurrentes (Fase 6): plantillas que se registran solas o piden confirmación en su fecha.
// La lógica de fechas y registro vive en $lib/recurrentes/motor (sin dependencias, probada con SQLite real).
import { db } from "$lib/db";
import { hoy } from "$lib/formato";
import { avisarCambio } from "./cambios";
import { leerAjuste, guardarAjuste, leerTrm } from "./ajustes";
import { detectar, normalizar, alMes, type SugerenciaSuscripcion } from "$lib/recurrentes/suscripciones";
import * as motor from "$lib/recurrentes/motor";
import type { Conexion, Frecuencia, Modo, Ocurrencia, RecurrenteFila } from "$lib/recurrentes/motor";

export type { Frecuencia, Modo, Ocurrencia } from "$lib/recurrentes/motor";
export { fechasEntre, proximas, sumarDias } from "$lib/recurrentes/motor";

const U = 1;
const con = async () => (await db()) as unknown as Conexion;

export interface RecurrenteNueva {
  nombre: string;
  tipo: "ingreso" | "egreso" | "transferencia";
  monto: number;
  cuenta_id: number;
  cuenta_destino_id?: number | null;
  categoria_id?: number | null;
  comercio?: string | null;
  notas?: string | null;
  etiquetas?: string[];
  frecuencia: Frecuencia;
  dia: number;
  dia2?: number | null;
  mes?: number | null;
  modo?: Modo;
  inicio: string;
  fin?: string | null;
}

export interface Recurrente extends Omit<RecurrenteFila, "etiquetas"> {
  etiquetas: string[];
  cuenta_nombre: string;
  cuenta_destino_nombre: string | null;
  categoria_nombre: string | null;
  /** Próxima fecha programada desde hoy (null si ya terminó). */
  proxima: string | null;
}

const fecha = /^\d{4}-\d{2}-\d{2}$/;

async function validar(r: RecurrenteNueva) {
  if (!r.nombre.trim()) throw new Error("Ponle un nombre (por ejemplo, «Arriendo»).");
  if (!Number.isInteger(r.monto) || r.monto <= 0) throw new Error("El monto debe ser mayor que cero.");
  if (!fecha.test(r.inicio)) throw new Error("La fecha de inicio no es válida.");
  if (r.fin && (!fecha.test(r.fin) || r.fin < r.inicio)) throw new Error("La fecha final debe ser después del inicio.");
  const maxDia = r.frecuencia === "semanal" ? 7 : 31;
  if (!Number.isInteger(r.dia) || r.dia < 1 || r.dia > maxDia) throw new Error("El día no es válido.");
  if (r.frecuencia === "quincenal" && (r.dia2 == null || r.dia2 === r.dia)) throw new Error("Elige dos días distintos para la quincena.");
  if (r.frecuencia === "anual" && !(r.mes && r.mes >= 1 && r.mes <= 12)) throw new Error("Elige el mes.");
  if (r.tipo !== "transferencia") return;
  if (r.cuenta_destino_id == null) throw new Error("Elige la cuenta destino de la transferencia.");
  if (r.cuenta_destino_id === r.cuenta_id) throw new Error("La cuenta destino debe ser distinta a la de origen.");
  const [m] = await (await db()).select<{ a: string; b: string }[]>(
    "SELECT (SELECT moneda FROM cuentas WHERE id=$1) AS a, (SELECT moneda FROM cuentas WHERE id=$2) AS b",
    [r.cuenta_id, r.cuenta_destino_id]);
  if (m && m.a !== m.b) throw new Error("Las transferencias recurrentes deben ser entre cuentas de la misma moneda.");
}

function valores(r: RecurrenteNueva) {
  const transf = r.tipo === "transferencia";
  const etiquetas = [...new Set((r.etiquetas ?? []).map((e) => e.trim()).filter(Boolean))];
  return [
    r.nombre.trim(), r.tipo, r.monto, r.cuenta_id, transf ? r.cuenta_destino_id : null, transf ? null : r.categoria_id ?? null,
    r.comercio?.trim() || null, r.notas?.trim() || null, etiquetas.length ? JSON.stringify(etiquetas) : null,
    r.frecuencia, r.dia, r.frecuencia === "quincenal" ? r.dia2 : null, r.frecuencia === "anual" ? r.mes : null,
    r.modo ?? "confirmar", r.inicio, r.fin || null,
  ];
}

export async function listarRecurrentes(): Promise<Recurrente[]> {
  const filas = await (await db()).select<(RecurrenteFila & { cuenta_nombre: string; cuenta_destino_nombre: string | null; categoria_nombre: string | null })[]>(
    `SELECT r.*, c.nombre AS cuenta_nombre, d.nombre AS cuenta_destino_nombre, k.nombre AS categoria_nombre
     FROM recurrentes r
     JOIN cuentas c ON c.id = r.cuenta_id
     LEFT JOIN cuentas d ON d.id = r.cuenta_destino_id
     LEFT JOIN categorias k ON k.id = r.categoria_id
     WHERE r.usuario_id = $1
     ORDER BY r.activa DESC, r.nombre COLLATE NOCASE`, [U]);
  const dia = hoy();
  return filas.map((f) => {
    let etiquetas: string[] = [];
    try { etiquetas = JSON.parse(f.etiquetas ?? "[]"); } catch { /* se ignoran */ }
    return { ...f, etiquetas, proxima: f.activa ? motor.proximas(f, dia, 1)[0] ?? null : null };
  });
}

export async function crearRecurrente(r: RecurrenteNueva): Promise<number> {
  await validar(r);
  await (await db()).execute(
    `INSERT INTO recurrentes (nombre, tipo, monto, cuenta_id, cuenta_destino_id, categoria_id, comercio, notas, etiquetas,
       frecuencia, dia, dia2, mes, modo, inicio, fin, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [...valores(r), U]);
  const [n] = await (await db()).select<{ id: number }[]>("SELECT max(id) AS id FROM recurrentes WHERE usuario_id = $1", [U]);
  await alCambiar();
  return n.id;
}

/** Editar no toca lo ya registrado: solo cambia lo que viene (y lo que esté por confirmar). */
export async function editarRecurrente(id: number, r: RecurrenteNueva): Promise<void> {
  await validar(r);
  await (await db()).execute(
    `UPDATE recurrentes SET nombre=$1, tipo=$2, monto=$3, cuenta_id=$4, cuenta_destino_id=$5, categoria_id=$6, comercio=$7,
       notas=$8, etiquetas=$9, frecuencia=$10, dia=$11, dia2=$12, mes=$13, modo=$14, inicio=$15, fin=$16
     WHERE id=$17 AND usuario_id=$18`, [...valores(r), id, U]);
  await alCambiar();
}

export async function activarRecurrente(id: number, activa: boolean): Promise<void> {
  await (await db()).execute("UPDATE recurrentes SET activa=$1 WHERE id=$2 AND usuario_id=$3", [activa ? 1 : 0, id, U]);
  await alCambiar();
}

/** Los movimientos ya registrados se quedan (pierden el enlace a la recurrente). */
export async function eliminarRecurrente(id: number): Promise<void> {
  await (await db()).execute("DELETE FROM recurrentes WHERE id=$1 AND usuario_id=$2", [id, U]);
  avisarCambio();
}

export async function porConfirmar(): Promise<Ocurrencia[]> {
  return motor.porConfirmar(await con(), hoy());
}

export async function confirmarOcurrencia(recurrenteId: number, fecha: string, monto?: number): Promise<void> {
  await motor.confirmar(await con(), recurrenteId, fecha, monto);
  avisarCambio();
}

export async function omitirOcurrencia(recurrenteId: number, fecha: string): Promise<void> {
  await motor.omitir(await con(), recurrenteId, fecha);
  avisarCambio();
}

export async function confirmarTodas(): Promise<number> {
  const c = await con();
  let n = 0;
  for (const o of await motor.porConfirmar(c, hoy())) if (await motor.confirmar(c, o.recurrente_id, o.fecha)) n++;
  if (n) avisarCambio();
  return n;
}

/** Registra lo vencido de las automáticas. Avisa del cambio solo si creó algo (así la revisión no se repite sin fin). */
export async function generarAutomaticas(): Promise<number> {
  const n = await motor.generarAutomaticas(await con(), hoy());
  if (n) avisarCambio();
  return n;
}

async function alCambiar() {
  await generarAutomaticas(); // una automática nueva o editada puede tener fechas ya vencidas
  avisarCambio();
}

// ---------- Para las pantallas ----------

export interface ProximoPago {
  recurrente_id: number;
  nombre: string;
  tipo: RecurrenteNueva["tipo"];
  monto: number;
  fecha: string;
  /** Ya pasó la fecha y espera confirmación. */
  porConfirmar: boolean;
  modo: Modo;
  icono: string | null;
  color: string | null;
}

/** Lo que espera confirmación + lo programado en los próximos `dias` días, por fecha. */
export async function proximosPagos(dias = 30): Promise<{ lista: ProximoPago[]; salen: number; entran: number }> {
  const dia = hoy();
  const hasta = motor.sumarDias(dia, dias);
  const filas = await (await db()).select<(RecurrenteFila & { icono: string | null; color: string | null })[]>(
    `SELECT r.*, k.icono, k.color FROM recurrentes r LEFT JOIN categorias k ON k.id = r.categoria_id
     WHERE r.usuario_id = $1 AND r.activa = 1`, [U]);
  const pend = await porConfirmar();
  const lista: ProximoPago[] = [];
  for (const r of filas) {
    const base = { recurrente_id: r.id, nombre: r.nombre, tipo: r.tipo, monto: r.monto, modo: r.modo, icono: r.icono, color: r.color };
    for (const o of pend) if (o.recurrente_id === r.id) lista.push({ ...base, fecha: o.fecha, porConfirmar: true });
    // Desde mañana: lo de hoy ya quedó registrado (auto) o por confirmar.
    for (const f of motor.fechasEntre(r, motor.sumarDias(dia, 1), hasta)) lista.push({ ...base, fecha: f, porConfirmar: false });
  }
  lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
  const suma = (t: string) => lista.filter((p) => p.tipo === t).reduce((s, p) => s + p.monto, 0);
  return { lista, salen: suma("egreso"), entran: suma("ingreso") };
}

/** Datos para «Hacer recurrente» desde un movimiento: mensual, mismo día, desde el día siguiente. */
export async function plantillaDesdeTransaccion(id: number): Promise<RecurrenteNueva | null> {
  const [t] = await (await db()).select<{ fecha: string; monto: number; tipo: RecurrenteNueva["tipo"]; cuenta_id: number;
    cuenta_destino_id: number | null; categoria_id: number | null; comercio: string | null; notas: string | null; etiquetas: string | null }[]>(
    `SELECT t.fecha, t.monto, t.tipo, t.cuenta_id, t.cuenta_destino_id, t.categoria_id, t.comercio, t.notas,
       (SELECT json_group_array(e.nombre) FROM transaccion_etiquetas te JOIN etiquetas e ON e.id = te.etiqueta_id
        WHERE te.transaccion_id = t.id) AS etiquetas
     FROM transacciones t WHERE t.id = $1 AND t.usuario_id = $2`, [id, U]);
  if (!t) return null;
  let etiquetas: string[] = [];
  try { etiquetas = JSON.parse(t.etiquetas ?? "[]"); } catch { /* sin etiquetas */ }
  return {
    nombre: t.comercio ?? "", tipo: t.tipo, monto: t.monto, cuenta_id: t.cuenta_id, cuenta_destino_id: t.cuenta_destino_id,
    categoria_id: t.categoria_id, comercio: t.comercio, notas: t.notas, etiquetas,
    frecuencia: "mensual", dia: Number(t.fecha.slice(8, 10)), modo: "confirmar", inicio: motor.sumarDias(t.fecha, 1),
  };
}

const DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const textoDia = (d: number) => (d >= 31 ? "el último día" : `el ${d}`);

/** «El 1 de cada mes», «Los viernes», «El 15 y el último día de cada mes», «El 3 de marzo de cada año». */
export function textoFrecuencia(r: Pick<RecurrenteNueva, "frecuencia" | "dia" | "dia2" | "mes">): string {
  const t =
    r.frecuencia === "semanal" ? `los ${DIAS_SEMANA[r.dia - 1]}${r.dia >= 6 ? "s" : ""}`
    : r.frecuencia === "quincenal" ? `${textoDia(Math.min(r.dia, r.dia2 ?? 31))} y ${textoDia(Math.max(r.dia, r.dia2 ?? 31))} de cada mes`
    : r.frecuencia === "anual" ? `${textoDia(r.dia)} de ${MESES[(r.mes ?? 1) - 1]} de cada año`
    : `${textoDia(r.dia)} de cada mes`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------- Suscripciones (se detectan solas) ----------

export type { SugerenciaSuscripcion } from "$lib/recurrentes/suscripciones";

async function descartadas(): Promise<string[]> {
  try { return JSON.parse((await leerAjuste("suscripciones_descartadas")) ?? "[]"); } catch { return []; }
}

/** Egresos que se repiten cada mes y aún no son recurrentes (últimos 7 meses). */
export async function sugerenciasSuscripcion(): Promise<SugerenciaSuscripcion[]> {
  const conexion = await db();
  const dia = hoy();
  const [egresos, recs, desc] = await Promise.all([
    conexion.select<{ fecha: string; monto: number; comercio: string; cuenta_id: number; categoria_id: number | null; recurrente_id: number | null }[]>(
      `SELECT t.fecha, t.monto, t.comercio, t.cuenta_id, t.categoria_id, t.recurrente_id
       FROM transacciones t
       WHERE t.usuario_id = $1 AND t.tipo = 'egreso' AND t.fecha >= $2 AND t.comercio IS NOT NULL AND trim(t.comercio) <> ''
         AND t.gasto_grupal_id IS NULL AND t.prestamo_perdido_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM compras_credito cc WHERE cc.transaccion_id = t.id AND cc.num_cuotas > 1)`,
      [U, motor.sumarDias(dia, -215)]),
    conexion.select<{ nombre: string; comercio: string | null }[]>("SELECT nombre, comercio FROM recurrentes WHERE usuario_id = $1", [U]),
    descartadas(),
  ]);
  const excluir = new Set([...desc, ...recs.flatMap((r) => [r.nombre, r.comercio ?? ""]).map(normalizar).filter(Boolean)]);
  return detectar(egresos, dia, excluir);
}

/** «No es recurrente»: no vuelve a sugerirse (también en los otros equipos). */
export async function descartarSugerencia(clave: string): Promise<void> {
  const lista = await descartadas();
  if (!lista.includes(clave)) await guardarAjuste("suscripciones_descartadas", JSON.stringify([...lista, clave]));
  avisarCambio();
}

/** Datos para «Hacer recurrente» desde una sugerencia: mensual, día y monto típicos, desde el día siguiente al último. */
export function plantillaDesdeSugerencia(s: SugerenciaSuscripcion): RecurrenteNueva {
  return {
    nombre: s.comercio, tipo: "egreso", monto: s.monto, cuenta_id: s.cuenta_id, categoria_id: s.categoria_id,
    comercio: s.comercio, frecuencia: "mensual", dia: s.dia, modo: "confirmar", inicio: motor.sumarDias(s.ultima, 1),
  };
}

/** Lo programado (activo) en su equivalente mensual, en pesos (USD × TRM; sin TRM no se suman). */
export async function totalMensual(): Promise<{ salen: number; entran: number; sinTrm: boolean }> {
  const [filas, trm] = await Promise.all([
    (await db()).select<{ tipo: string; monto: number; frecuencia: Frecuencia; moneda: string }[]>(
      `SELECT r.tipo, r.monto, r.frecuencia, c.moneda FROM recurrentes r JOIN cuentas c ON c.id = r.cuenta_id
       WHERE r.usuario_id = $1 AND r.activa = 1 AND (r.fin IS NULL OR r.fin >= $2)`, [U, hoy()]),
    leerTrm(),
  ]);
  let salen = 0, entran = 0, sinTrm = false;
  for (const f of filas) {
    if (f.tipo === "transferencia") continue;
    if (f.moneda === "USD" && !trm) { sinTrm = true; continue; }
    const v = alMes(f.frecuencia, f.moneda === "USD" ? Math.round(f.monto * trm!) : f.monto);
    if (f.tipo === "egreso") salen += v; else entran += v;
  }
  return { salen, entran, sinTrm };
}
