// «Me deben»: personas a las que les prestas plata, sus préstamos, abonos y plan de cuotas.
//  · Préstamo con cuenta: transferencia cuenta → persona (prestamo_destino_id). Sin cuenta = solo registro.
//  · Abono: transferencia persona → cuenta (prestamo_origen_id); suma a la cuenta, no es ingreso.
//  · Dar por perdido: egreso por lo pendiente (prestamo_perdido_id); es gasto, pero no toca el saldo
//    de la cuenta (la plata ya había salido con el préstamo).
// Patrimonio suma «Te deben» = lo pendiente de los préstamos activos.
import { db } from "$lib/db";
import { hoy } from "$lib/formato";
import { calcularPrestamo, type CalculoPrestamo, type CuotaPlan } from "$lib/medeben/calculo";
import { avisarCambio } from "./cambios";

const U = 1;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Tipos ----------

export interface Persona {
  id: number;
  uid: string;
  nombre: string;
  notas: string | null;
  archivada: boolean;
  /** Préstamos sin terminar (ni pagados ni perdidos). */
  activos: number;
  prestado: number;
  abonado: number;
  pendiente: number;
  /** 0–1: abonado / prestado (de los préstamos no perdidos). */
  progreso: number;
  vencidos: number;
  proximaFecha: string | null;
  num_prestamos: number;
}

export interface Prestamo {
  id: number;
  uid: string;
  persona_id: number;
  persona: string;
  monto: number;
  fecha: string;
  fecha_acordada: string | null;
  descripcion: string | null;
  cuenta_origen_id: number | null;
  perdido_en: string | null;
  /** Gasto grupal del que sale este préstamo (y su nombre). */
  gasto_grupal_id: number | null;
  gasto_grupal: string | null;
  calculo: CalculoPrestamo;
}

export interface PrestamoNuevo {
  persona_id: number;
  monto: number;
  fecha: string;
  fecha_acordada: string | null;
  descripcion: string | null;
  cuenta_origen_id: number | null;
}

export type TipoMovPrestamo = "prestamo" | "abono" | "perdido";

export interface MovimientoPrestamo {
  id: number;
  prestamo_id: number;
  tipo: TipoMovPrestamo;
  fecha: string;
  monto: number;
  cuenta_id: number;
  cuenta: string;
}

// ---------- Personas ----------

function validarNombre(nombre: string) {
  if (!nombre.trim()) throw new Error("La persona necesita un nombre.");
}

async function nombreLibre(nombre: string, excepto: number | null) {
  const [f] = await (await db()).select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM personas WHERE usuario_id = $1 AND nombre = $2 COLLATE NOCASE AND id <> $3",
    [U, nombre.trim(), excepto ?? 0]);
  if (f.n > 0) throw new Error(`Ya existe una persona llamada «${nombre.trim()}».`);
}

export async function crearPersona(nombre: string, notas: string | null = null): Promise<number> {
  validarNombre(nombre);
  await nombreLibre(nombre, null);
  const r = await (await db()).execute(
    "INSERT INTO personas (usuario_id, nombre, notas) VALUES ($1, $2, $3)", [U, nombre.trim(), notas?.trim() || null]);
  avisarCambio();
  return r.lastInsertId as number;
}

export async function editarPersona(id: number, nombre: string, notas: string | null): Promise<void> {
  validarNombre(nombre);
  await nombreLibre(nombre, id);
  await (await db()).execute(
    "UPDATE personas SET nombre = $1, notas = $2 WHERE id = $3 AND usuario_id = $4",
    [nombre.trim(), notas?.trim() || null, id, U]);
  avisarCambio();
}

export async function archivarPersona(id: number, archivada: boolean): Promise<void> {
  await (await db()).execute(
    "UPDATE personas SET archivada = $1 WHERE id = $2 AND usuario_id = $3", [archivada ? 1 : 0, id, U]);
  avisarCambio();
}

/** Solo se borra si no tiene préstamos; si los tiene, se archiva. */
export async function eliminarPersona(id: number): Promise<void> {
  const [f] = await (await db()).select<{ n: number }[]>("SELECT COUNT(*) AS n FROM prestamos WHERE persona_id = $1", [id]);
  if (f.n > 0) throw new Error("Esta persona tiene préstamos: archívala o borra primero sus préstamos.");
  await (await db()).execute("DELETE FROM personas WHERE id = $1 AND usuario_id = $2", [id, U]);
  avisarCambio();
}

/** Personas con el resumen de sus préstamos, de mayor a menor pendiente. */
export async function listarPersonas(incluirArchivadas = false, dia = hoy()): Promise<Persona[]> {
  const conexion = await db();
  const filas = await conexion.select<{ id: number; uid: string; nombre: string; notas: string | null; archivada: number }[]>(
    `SELECT id, uid, nombre, notas, archivada FROM personas
     WHERE usuario_id = $1${incluirArchivadas ? "" : " AND archivada = 0"}`, [U]);
  const prestamos = await listarPrestamos(null, dia);
  const personas = filas.map((f): Persona => {
    const suyos = prestamos.filter((p) => p.persona_id === f.id);
    const vivos = suyos.filter((p) => p.calculo.estado !== "perdido");
    const prestado = vivos.reduce((s, p) => s + p.monto, 0);
    const abonado = vivos.reduce((s, p) => s + p.calculo.abonado, 0);
    const proximas = suyos.map((p) => p.calculo.proximaFecha).filter((x): x is string => !!x).sort();
    return {
      ...f,
      archivada: !!f.archivada,
      activos: suyos.filter((p) => p.calculo.estado === "activo").length,
      prestado, abonado,
      pendiente: suyos.reduce((s, p) => s + p.calculo.pendiente, 0),
      progreso: prestado > 0 ? Math.min(1, abonado / prestado) : 0,
      vencidos: suyos.filter((p) => p.calculo.vencido).length,
      proximaFecha: proximas[0] ?? null,
      num_prestamos: suyos.length,
    };
  });
  return personas.sort((a, b) => b.pendiente - a.pendiente || a.nombre.localeCompare(b.nombre, "es"));
}

// ---------- Préstamos ----------

interface FilaPrestamo extends Omit<Prestamo, "calculo"> { abonado: number; perdido: number }

const SQL_PRESTAMOS = `
SELECT p.id, p.uid, p.persona_id, pe.nombre AS persona, p.monto, p.fecha, p.fecha_acordada, p.descripcion,
       p.cuenta_origen_id, p.perdido_en, p.gasto_grupal_id,
       (SELECT g.descripcion FROM gastos_grupales g WHERE g.id = p.gasto_grupal_id) AS gasto_grupal,
       COALESCE((SELECT SUM(t.monto) FROM transacciones t WHERE t.prestamo_origen_id = p.id), 0) AS abonado,
       COALESCE((SELECT SUM(t.monto) FROM transacciones t WHERE t.prestamo_perdido_id = p.id), 0) AS perdido
FROM prestamos p JOIN personas pe ON pe.id = p.persona_id
WHERE p.usuario_id = $1`;

async function cuotasDe(ids: number[]): Promise<Map<number, CuotaPlan[]>> {
  const mapa = new Map<number, CuotaPlan[]>();
  if (!ids.length) return mapa;
  const filas = await (await db()).select<(CuotaPlan & { prestamo_id: number })[]>(
    `SELECT prestamo_id, numero, fecha, monto FROM prestamo_cuotas
     WHERE prestamo_id IN (SELECT value FROM json_each($1)) ORDER BY prestamo_id, numero`, [JSON.stringify(ids)]);
  for (const { prestamo_id, ...c } of filas) {
    if (!mapa.has(prestamo_id)) mapa.set(prestamo_id, []);
    mapa.get(prestamo_id)!.push(c);
  }
  return mapa;
}

async function armar(filas: FilaPrestamo[], dia: string): Promise<Prestamo[]> {
  const cuotas = await cuotasDe(filas.map((f) => f.id));
  return filas.map(({ abonado, perdido, ...f }) => ({
    ...f,
    calculo: calcularPrestamo(f, abonado, perdido, cuotas.get(f.id) ?? [], dia),
  }));
}

/** Préstamos (de una persona o de todas): activos primero, luego por fecha más reciente. */
export async function listarPrestamos(personaId: number | null = null, dia = hoy()): Promise<Prestamo[]> {
  const filas = await (await db()).select<FilaPrestamo[]>(
    `${SQL_PRESTAMOS}${personaId != null ? " AND p.persona_id = $2" : ""} ORDER BY p.fecha DESC, p.id DESC`,
    personaId != null ? [U, personaId] : [U]);
  const orden = { activo: 0, pagado: 1, perdido: 2 };
  return (await armar(filas, dia)).sort((a, b) => orden[a.calculo.estado] - orden[b.calculo.estado]);
}

export async function obtenerPrestamo(id: number, dia = hoy()): Promise<Prestamo> {
  const filas = await (await db()).select<FilaPrestamo[]>(`${SQL_PRESTAMOS} AND p.id = $2`, [U, id]);
  if (!filas.length) throw new Error("El préstamo no existe.");
  return (await armar(filas, dia))[0];
}

/** Total que te deben hoy (pendiente de los préstamos activos). Para el Patrimonio y el Dashboard. */
export async function totalTeDeben(): Promise<number> {
  const [f] = await (await db()).select<{ total: number }[]>(
    `SELECT COALESCE(SUM(MAX(0, p.monto
       - COALESCE((SELECT SUM(t.monto) FROM transacciones t WHERE t.prestamo_origen_id = p.id), 0)
       - COALESCE((SELECT SUM(t.monto) FROM transacciones t WHERE t.prestamo_perdido_id = p.id), 0))), 0) AS total
     FROM prestamos p WHERE p.usuario_id = $1 AND p.perdido_en IS NULL`, [U]);
  return f.total;
}

/** Historial de un préstamo (o de todos los de una persona): préstamo, abonos y lo dado por perdido. */
export async function movimientosPrestamo(filtro: { prestamoId?: number; personaId?: number }): Promise<MovimientoPrestamo[]> {
  const params: unknown[] = [U];
  let donde = "";
  if (filtro.prestamoId != null) { params.push(filtro.prestamoId); donde = " AND p.id = $2"; }
  else if (filtro.personaId != null) { params.push(filtro.personaId); donde = " AND p.persona_id = $2"; }
  return (await db()).select<MovimientoPrestamo[]>(
    `SELECT t.id, p.id AS prestamo_id,
            CASE WHEN t.prestamo_destino_id IS NOT NULL THEN 'prestamo'
                 WHEN t.prestamo_origen_id IS NOT NULL THEN 'abono' ELSE 'perdido' END AS tipo,
            t.fecha, t.monto, t.cuenta_id, c.nombre AS cuenta
     FROM transacciones t
     JOIN prestamos p ON p.id = COALESCE(t.prestamo_destino_id, t.prestamo_origen_id, t.prestamo_perdido_id)
     JOIN cuentas c ON c.id = t.cuenta_id
     WHERE p.usuario_id = $1${donde}
     ORDER BY t.fecha DESC, t.id DESC`, params);
}

// ---------- Validaciones ----------

function validarMonto(m: number) {
  if (!Number.isInteger(m) || m <= 0) throw new Error("El monto debe ser mayor que cero.");
}

function validarFecha(f: string | null, nombre: string) {
  if (f != null && !FECHA.test(f)) throw new Error(`La ${nombre} no es válida.`);
}

/** Cuenta en pesos y activa. El préstamo puede salir de una tarjeta; el abono entra a débito o efectivo. */
async function validarCuenta(cuentaId: number, permitirCredito: boolean) {
  const [c] = await (await db()).select<{ tipo: string; moneda: string; archivada: number }[]>(
    "SELECT tipo, moneda, archivada FROM cuentas WHERE id = $1 AND usuario_id = $2", [cuentaId, U]);
  if (!c || c.archivada || c.moneda !== "COP" || (!permitirCredito && c.tipo === "credito"))
    throw new Error(permitirCredito
      ? "Elige una cuenta en pesos (débito, efectivo o tarjeta)."
      : "Elige una cuenta de débito o efectivo en pesos.");
}

function validarCuotas(cuotas: CuotaPlan[], monto: number, fecha: string) {
  if (!cuotas.length) return;
  for (const c of cuotas) {
    validarMonto(c.monto);
    validarFecha(c.fecha, "fecha de la cuota");
    if (c.fecha < fecha) throw new Error("Las cuotas no pueden ser antes de la fecha del préstamo.");
  }
  if (cuotas.reduce((s, c) => s + c.monto, 0) !== monto) throw new Error("Las cuotas deben sumar el monto del préstamo.");
}

async function validarPrestamo(p: PrestamoNuevo, cuotas: CuotaPlan[]) {
  validarMonto(p.monto);
  validarFecha(p.fecha, "fecha");
  if (!p.fecha) throw new Error("El préstamo necesita una fecha.");
  validarFecha(p.fecha_acordada, "fecha acordada");
  if (p.fecha_acordada && p.fecha_acordada < p.fecha) throw new Error("La fecha acordada no puede ser antes del préstamo.");
  const [pe] = await (await db()).select<{ id: number }[]>(
    "SELECT id FROM personas WHERE id = $1 AND usuario_id = $2", [p.persona_id, U]);
  if (!pe) throw new Error("Elige a quién le prestas.");
  if (p.cuenta_origen_id != null) await validarCuenta(p.cuenta_origen_id, true);
  validarCuotas(cuotas, p.monto, p.fecha);
}

// ---------- Escritura ----------

async function nombrePersona(id: number): Promise<string> {
  const [f] = await (await db()).select<{ nombre: string }[]>("SELECT nombre FROM personas WHERE id = $1", [id]);
  return f?.nombre ?? "";
}

async function guardarCuotas(prestamoId: number, cuotas: CuotaPlan[]) {
  const conexion = await db();
  await conexion.execute("DELETE FROM prestamo_cuotas WHERE prestamo_id = $1", [prestamoId]);
  const orden = [...cuotas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const [i, c] of orden.entries())
    await conexion.execute(
      "INSERT INTO prestamo_cuotas (prestamo_id, numero, fecha, monto) VALUES ($1, $2, $3, $4)",
      [prestamoId, i + 1, c.fecha, c.monto]);
}

/** La transferencia de salida del préstamo (se rehace al editar). */
async function rehacerSalida(id: number, p: PrestamoNuevo) {
  const conexion = await db();
  await conexion.execute("DELETE FROM transacciones WHERE prestamo_destino_id = $1 AND usuario_id = $2", [id, U]);
  if (p.cuenta_origen_id != null)
    await conexion.execute(
      `INSERT INTO transacciones (usuario_id, fecha, monto, tipo, cuenta_id, prestamo_destino_id, comercio, notas)
       VALUES ($1, $2, $3, 'transferencia', $4, $5, $6, $7)`,
      [U, p.fecha, p.monto, p.cuenta_origen_id, id, `Préstamo a ${await nombrePersona(p.persona_id)}`, p.descripcion?.trim() || null]);
}

/** Con plan de cuotas, la fecha acordada es la de la última cuota. */
const conFechaPlan = (p: PrestamoNuevo, cuotas: CuotaPlan[]): PrestamoNuevo =>
  cuotas.length ? { ...p, fecha_acordada: cuotas.map((c) => c.fecha).sort().at(-1)! } : p;

/** Crea el préstamo. Con cuenta origen, la plata sale de esa cuenta (transferencia, no gasto). */
export async function crearPrestamo(p: PrestamoNuevo, cuotas: CuotaPlan[] = []): Promise<number> {
  await validarPrestamo(p, cuotas);
  p = conFechaPlan(p, cuotas);
  const r = await (await db()).execute(
    `INSERT INTO prestamos (usuario_id, persona_id, monto, fecha, fecha_acordada, descripcion, cuenta_origen_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [U, p.persona_id, p.monto, p.fecha, p.fecha_acordada || null, p.descripcion?.trim() || null, p.cuenta_origen_id]);
  const id = r.lastInsertId as number;
  await guardarCuotas(id, cuotas);
  await rehacerSalida(id, p);
  avisarCambio();
  return id;
}

/** Edita el préstamo y rehace su transferencia de salida. El monto no puede quedar por debajo de lo abonado. */
export async function editarPrestamo(id: number, p: PrestamoNuevo, cuotas: CuotaPlan[] = []): Promise<void> {
  const actual = await obtenerPrestamo(id);
  if (actual.perdido_en) throw new Error("Este préstamo está dado por perdido: deshazlo antes de editarlo.");
  await validarPrestamo(p, cuotas);
  if (p.monto < actual.calculo.abonado) throw new Error("El monto no puede ser menor que lo que ya te abonaron.");
  p = conFechaPlan(p, cuotas);
  await (await db()).execute(
    `UPDATE prestamos SET persona_id = $1, monto = $2, fecha = $3, fecha_acordada = $4, descripcion = $5, cuenta_origen_id = $6
     WHERE id = $7 AND usuario_id = $8`,
    [p.persona_id, p.monto, p.fecha, p.fecha_acordada || null, p.descripcion?.trim() || null, p.cuenta_origen_id, id, U]);
  await guardarCuotas(id, cuotas);
  await rehacerSalida(id, p);
  avisarCambio();
}

/** Borra el préstamo con todos sus movimientos (salida, abonos y perdido) y su plan. */
export async function eliminarPrestamo(id: number): Promise<void> {
  const conexion = await db();
  await conexion.execute(
    `DELETE FROM transacciones WHERE usuario_id = $2
       AND (prestamo_destino_id = $1 OR prestamo_origen_id = $1 OR prestamo_perdido_id = $1)`, [id, U]);
  await conexion.execute("DELETE FROM prestamo_cuotas WHERE prestamo_id = $1", [id]);
  await conexion.execute("DELETE FROM prestamos WHERE id = $1 AND usuario_id = $2", [id, U]);
  avisarCambio();
}

/** Abono: la persona te devuelve plata a una cuenta. Máximo lo pendiente. */
export async function abonarPrestamo(id: number, cuentaId: number, monto: number, fecha = hoy()): Promise<void> {
  validarMonto(monto);
  validarFecha(fecha, "fecha");
  await validarCuenta(cuentaId, false);
  const p = await obtenerPrestamo(id);
  if (p.perdido_en) throw new Error("Este préstamo está dado por perdido: deshazlo antes de registrar abonos.");
  if (monto > p.calculo.pendiente) throw new Error("El abono no puede ser mayor que lo pendiente.");
  if (fecha < p.fecha) throw new Error("El abono no puede ser antes del préstamo.");
  await (await db()).execute(
    `INSERT INTO transacciones (usuario_id, fecha, monto, tipo, cuenta_id, prestamo_origen_id, comercio)
     VALUES ($1, $2, $3, 'transferencia', $4, $5, $6)`,
    [U, fecha, monto, cuentaId, id, `Abono de ${p.persona}`]);
  avisarCambio();
}

/** Cuenta para anotar el egreso de «perdido»: la del préstamo; si no tiene, la principal (no toca su saldo). */
async function cuentaParaPerdido(p: Prestamo): Promise<number> {
  if (p.cuenta_origen_id != null) return p.cuenta_origen_id;
  const [c] = await (await db()).select<{ id: number }[]>(
    `SELECT id FROM cuentas WHERE usuario_id = $1 AND archivada = 0 AND moneda = 'COP'
     ORDER BY principal DESC, id LIMIT 1`, [U]);
  if (!c) throw new Error("Crea primero una cuenta en pesos.");
  return c.id;
}

/** Lo pendiente pasa a ser un gasto (egreso sin categoría) y deja de sumar en «Te deben». */
export async function darPorPerdido(id: number, fecha = hoy()): Promise<void> {
  validarFecha(fecha, "fecha");
  const p = await obtenerPrestamo(id);
  if (p.perdido_en) throw new Error("Este préstamo ya está dado por perdido.");
  if (p.calculo.pendiente <= 0) throw new Error("Este préstamo ya está pagado.");
  const conexion = await db();
  await conexion.execute(
    `INSERT INTO transacciones (usuario_id, fecha, monto, tipo, cuenta_id, prestamo_perdido_id, comercio)
     VALUES ($1, $2, $3, 'egreso', $4, $5, $6)`,
    [U, fecha, p.calculo.pendiente, await cuentaParaPerdido(p), id, `Préstamo perdido · ${p.persona}`]);
  await conexion.execute("UPDATE prestamos SET perdido_en = $1 WHERE id = $2 AND usuario_id = $3", [fecha, id, U]);
  avisarCambio();
}

/** Vuelve a activo: borra el egreso de «perdido». */
export async function deshacerPerdido(id: number): Promise<void> {
  const conexion = await db();
  await conexion.execute("DELETE FROM transacciones WHERE prestamo_perdido_id = $1 AND usuario_id = $2", [id, U]);
  await conexion.execute("UPDATE prestamos SET perdido_en = NULL WHERE id = $1 AND usuario_id = $2", [id, U]);
  avisarCambio();
}
