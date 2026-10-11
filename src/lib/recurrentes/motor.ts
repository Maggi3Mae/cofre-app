// Movimientos recurrentes: fechas de cada ocurrencia y su registro.
// Sin dependencias (se prueba con SQLite real en pruebas/recurrentes.prueba.ts).
// · Ocurrencia = fecha programada entre `inicio` y min(hoy, fin).
// · Registrada = movimiento con huella «rec|uid|AAAA-MM-DD» (única: dos equipos no la duplican).
// · Omitida = fila en recurrentes_omitidas (también al borrar el movimiento, por trigger).
// · Por confirmar = vencida, ni registrada ni omitida. No se guarda: se calcula al vuelo.

export interface Conexion {
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
}

export type Frecuencia = "mensual" | "quincenal" | "semanal" | "anual";
export type Modo = "confirmar" | "auto";

/** Lo que define cuándo toca. `dia`: día del mes (1–31; 31 = último) o, en semanal, 1 = lunes … 7 = domingo. */
export interface Regla {
  frecuencia: Frecuencia;
  dia: number;
  dia2?: number | null;
  mes?: number | null;
  inicio: string;
  fin?: string | null;
}

export interface RecurrenteFila extends Regla {
  id: number;
  uid: string;
  nombre: string;
  tipo: "ingreso" | "egreso" | "transferencia";
  monto: number;
  cuenta_id: number;
  cuenta_destino_id: number | null;
  categoria_id: number | null;
  comercio: string | null;
  notas: string | null;
  etiquetas: string | null;
  modo: Modo;
  activa: number;
}

export interface Ocurrencia {
  recurrente_id: number;
  nombre: string;
  tipo: RecurrenteFila["tipo"];
  monto: number;
  fecha: string;
}

const U = 1;

// ---------- Fechas (AAAA-MM-DD, sin zona horaria) ----------

const dos = (n: number) => String(n).padStart(2, "0");
const iso = (a: number, m: number, d: number) => `${a}-${dos(m)}-${dos(d)}`;
const partes = (f: string) => f.split("-").map(Number) as [number, number, number];
const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const enMes = (a: number, m: number, d: number) => iso(a, m, Math.min(d, ultimoDia(a, m)));

export function sumarDias(f: string, n: number): string {
  const [a, m, d] = partes(f);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 1 = lunes … 7 = domingo. */
export function diaSemana(f: string): number {
  const [a, m, d] = partes(f);
  return ((new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/** Fechas programadas entre `desde` y `hasta` (incluidas), sin salir de inicio/fin. */
export function fechasEntre(r: Regla, desde: string, hasta: string): string[] {
  const ini = desde > r.inicio ? desde : r.inicio;
  const fin = r.fin && r.fin < hasta ? r.fin : hasta;
  if (ini > fin) return [];
  const out: string[] = [];
  if (r.frecuencia === "semanal") {
    let f = sumarDias(ini, (r.dia - diaSemana(ini) + 7) % 7);
    for (; f <= fin; f = sumarDias(f, 7)) out.push(f);
    return out;
  }
  let [a, m] = partes(ini);
  const [aF, mF] = partes(fin);
  for (; a < aF || (a === aF && m <= mF); m === 12 ? (a++, m = 1) : m++) {
    let delMes: string[] = [];
    if (r.frecuencia === "mensual") delMes = [enMes(a, m, r.dia)];
    else if (r.frecuencia === "quincenal") delMes = [...new Set([enMes(a, m, r.dia), enMes(a, m, r.dia2 ?? 31)])].sort();
    else if (r.frecuencia === "anual" && m === (r.mes ?? 1)) delMes = [enMes(a, m, r.dia)];
    for (const f of delMes) if (f >= ini && f <= fin) out.push(f);
  }
  return out;
}

/** Las próximas `n` fechas desde `desde` (incluida). */
export function proximas(r: Regla, desde: string, n: number): string[] {
  const out: string[] = [];
  let tramo = desde;
  for (let i = 0; i < 8 && out.length < n; i++) {
    const hasta = sumarDias(tramo, 400);
    out.push(...fechasEntre(r, tramo, hasta));
    tramo = sumarDias(hasta, 1);
    if (r.fin && tramo > r.fin) break;
  }
  return out.slice(0, n);
}

export const huellaRec = (uid: string, fecha: string) => `rec|${uid}|${fecha}`;

// ---------- Base de datos ----------

async function activas(con: Conexion, id?: number): Promise<RecurrenteFila[]> {
  return con.select<RecurrenteFila>(
    `SELECT * FROM recurrentes WHERE usuario_id = $1 AND activa = 1 ${id != null ? "AND id = $2" : ""} ORDER BY id`,
    id != null ? [U, id] : [U]);
}

/** Fechas vencidas sin registrar ni omitir de una recurrente. */
async function faltantes(con: Conexion, r: RecurrenteFila, hoy: string): Promise<string[]> {
  const fechas = fechasEntre(r, r.inicio, hoy);
  if (!fechas.length) return [];
  const hechas = await con.select<{ huella: string }>(
    "SELECT huella FROM transacciones WHERE usuario_id = $1 AND huella LIKE $2", [U, `rec|${r.uid}|%`]);
  const omitidas = await con.select<{ fecha: string }>(
    "SELECT fecha FROM recurrentes_omitidas WHERE recurrente_id = $1", [r.id]);
  const fuera = new Set([...hechas.map((h) => h.huella.slice(-10)), ...omitidas.map((o) => o.fecha)]);
  return fechas.filter((f) => !fuera.has(f));
}

const ocurrencia = (r: RecurrenteFila, fecha: string): Ocurrencia =>
  ({ recurrente_id: r.id, nombre: r.nombre, tipo: r.tipo, monto: r.monto, fecha });

/** Ocurrencias por confirmar (recurrentes en modo «confirmar»), de la más antigua a la más reciente. */
export async function porConfirmar(con: Conexion, hoy: string): Promise<Ocurrencia[]> {
  const out: Ocurrencia[] = [];
  for (const r of await activas(con)) {
    if (r.modo !== "confirmar") continue;
    for (const f of await faltantes(con, r, hoy)) out.push(ocurrencia(r, f));
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
}

async function etiquetaId(con: Conexion, nombre: string): Promise<number> {
  const buscar = () => con.select<{ id: number }>(
    "SELECT id FROM etiquetas WHERE usuario_id = $1 AND nombre = $2 COLLATE NOCASE", [U, nombre]);
  let [e] = await buscar();
  if (!e) { await con.execute("INSERT INTO etiquetas (usuario_id, nombre) VALUES ($1, $2)", [U, nombre]); [e] = await buscar(); }
  return e.id;
}

/**
 * Registra una ocurrencia como movimiento (con `monto` distinto si la factura cambió).
 * Si ya estaba registrada (en este u otro equipo) no hace nada. Devuelve el id del movimiento o null.
 */
export async function registrar(con: Conexion, r: RecurrenteFila, fecha: string, monto = r.monto): Promise<number | null> {
  if (!Number.isInteger(monto) || monto <= 0) throw new Error("El monto debe ser mayor que cero.");
  const huella = huellaRec(r.uid, fecha);
  const [ya] = await con.select("SELECT 1 FROM transacciones WHERE usuario_id = $1 AND huella = $2", [U, huella]);
  if (ya) return null;
  const transf = r.tipo === "transferencia";
  await con.execute(
    `INSERT INTO transacciones (usuario_id, fecha, monto, tipo, cuenta_id, cuenta_destino_id, categoria_id,
       comercio, notas, huella, recurrente_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [U, fecha, monto, r.tipo, r.cuenta_id, transf ? r.cuenta_destino_id : null, transf ? null : r.categoria_id,
     r.comercio?.trim() || r.nombre, r.notas?.trim() || null, huella, r.id]);
  const [tx] = await con.select<{ id: number }>("SELECT id FROM transacciones WHERE usuario_id = $1 AND huella = $2", [U, huella]);
  let nombres: string[] = [];
  try { nombres = JSON.parse(r.etiquetas ?? "[]"); } catch { /* etiquetas dañadas: se ignoran */ }
  for (const n of new Set(nombres.map((x) => String(x).trim()).filter(Boolean)))
    await con.execute("INSERT OR IGNORE INTO transaccion_etiquetas (transaccion_id, etiqueta_id) VALUES ($1, $2)",
      [tx.id, await etiquetaId(con, n)]);
  return tx.id;
}

export async function confirmar(con: Conexion, recurrenteId: number, fecha: string, monto?: number): Promise<number | null> {
  const [r] = await con.select<RecurrenteFila>("SELECT * FROM recurrentes WHERE id = $1 AND usuario_id = $2", [recurrenteId, U]);
  if (!r) throw new Error("La recurrente ya no existe.");
  return registrar(con, r, fecha, monto);
}

export async function omitir(con: Conexion, recurrenteId: number, fecha: string): Promise<void> {
  await con.execute("INSERT OR IGNORE INTO recurrentes_omitidas (recurrente_id, fecha) VALUES ($1, $2)", [recurrenteId, fecha]);
}

/** Registra todo lo vencido de las recurrentes automáticas. Devuelve cuántos movimientos creó. */
export async function generarAutomaticas(con: Conexion, hoy: string): Promise<number> {
  let n = 0;
  for (const r of await activas(con)) {
    if (r.modo !== "auto") continue;
    for (const f of await faltantes(con, r, hoy)) if (await registrar(con, r, f)) n++;
  }
  return n;
}
