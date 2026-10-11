// Motor de sincronización (Fase 5B · bloque 6). El Mac es el centro; celular y tablet son equipos.
// Sin dependencias de Tauri: recibe una conexión (la del plugin SQL o node:sqlite en las pruebas).
//
// · Cada fila viaja con su uid y su modificado_en; las llaves foráneas viajan como uid y cada
//   equipo las traduce a sus propios id. ajustes y comercios_nit usan su clave natural.
// · Gana el cambio más reciente (modificado_en). El centro corrige la diferencia de reloj del equipo
//   y guarda lo que recibe con su propia hora, para que llegue a los demás equipos.
// · Borrados: tabla `borrados`. Un borrado gana si es más reciente que la última edición de la fila.
// · Filas repetidas creadas en dos equipos (misma clave única: presupuesto de una categoría, regla,
//   movimiento importado con la misma huella…) se emparejan y adoptan un solo uid.

export interface Conexion {
  select<T = Fila>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
}

type Fila = Record<string, unknown>;

interface Tabla {
  nombre: string;
  /** Clave natural que hace de uid (ajustes, comercios_nit). Si no, la columna `uid`. */
  clave?: string;
  /** Llaves foráneas: columna → tabla. */
  fk?: Record<string, string>;
  /** Claves únicas naturales para emparejar filas repetidas («col nocase» compara sin mayúsculas). */
  naturales?: string[][];
  /** Solo estas filas (por clave) se sincronizan. */
  solo?: string[];
}

/** Ajustes que comparten todos los equipos; el resto es de cada equipo. */
export const AJUSTES_COMPARTIDOS = ["nombre", "trm", "trm_info", "suscripciones_descartadas", "pago_lineas", "pago_qr"];

/** En orden: primero las tablas a las que otras apuntan. */
export const TABLAS: Tabla[] = [
  { nombre: "categorias", fk: { padre_id: "categorias" } },
  { nombre: "etiquetas", naturales: [["usuario_id", "nombre"]] },
  { nombre: "cuentas" },
  { nombre: "importaciones", fk: { cuenta_id: "cuentas" }, naturales: [["usuario_id", "huella_archivo"]] },
  { nombre: "plantillas_banco", fk: { cuenta_id: "cuentas" } },
  { nombre: "cdts", fk: { cuenta_origen_id: "cuentas", cdt_anterior_id: "cdts" } },
  { nombre: "cajitas" },
  { nombre: "personas", naturales: [["usuario_id", "nombre nocase"]] },
  { nombre: "gastos_grupales", fk: { cuenta_id: "cuentas", categoria_id: "categorias" } },
  { nombre: "prestamos", fk: { persona_id: "personas", cuenta_origen_id: "cuentas", gasto_grupal_id: "gastos_grupales" } },
  { nombre: "recurrentes", fk: { cuenta_id: "cuentas", cuenta_destino_id: "cuentas", categoria_id: "categorias" } },
  { nombre: "recurrentes_omitidas", fk: { recurrente_id: "recurrentes" }, naturales: [["recurrente_id", "fecha"]] },
  { nombre: "prestamo_cuotas", fk: { prestamo_id: "prestamos" }, naturales: [["prestamo_id", "numero"]] },
  {
    nombre: "transacciones",
    fk: {
      cuenta_id: "cuentas", cuenta_destino_id: "cuentas", categoria_id: "categorias",
      cajita_destino_id: "cajitas", cajita_origen_id: "cajitas", cdt_destino_id: "cdts", cdt_origen_id: "cdts",
      importacion_id: "importaciones", importacion_par_id: "importaciones",
      prestamo_destino_id: "prestamos", prestamo_origen_id: "prestamos", prestamo_perdido_id: "prestamos",
      gasto_grupal_id: "gastos_grupales", recurrente_id: "recurrentes",
    },
    naturales: [["usuario_id", "huella"], ["usuario_id", "huella_par"], ["usuario_id", "cufe"]],
  },
  { nombre: "transaccion_etiquetas", fk: { transaccion_id: "transacciones", etiqueta_id: "etiquetas" }, naturales: [["transaccion_id", "etiqueta_id"]] },
  { nombre: "compras_credito", fk: { cuenta_id: "cuentas", transaccion_id: "transacciones" } },
  { nombre: "cuotas", fk: { compra_id: "compras_credito" }, naturales: [["compra_id", "numero"]] },
  { nombre: "reglas", fk: { categoria_id: "categorias" }, naturales: [["usuario_id", "tipo", "patron"]] },
  { nombre: "presupuestos", fk: { categoria_id: "categorias" }, naturales: [["usuario_id", "categoria_id"]] },
  { nombre: "ajustes", clave: "clave", solo: AJUSTES_COMPARTIDOS },
  { nombre: "comercios_nit", clave: "nit" },
];

const POR_NOMBRE = new Map(TABLAS.map((t) => [t.nombre, t]));

/** Fila que viaja: tabla, id global, fecha de cambio y datos (llaves foráneas como uid). */
export interface FilaSinc { t: string; uid: string; m: string; d: Fila }
export interface BorradoSinc { t: string; uid: string; m: string }
export interface Paquete { filas: FilaSinc[]; borrados: BorradoSinc[] }

/** Lo que el equipo le manda al centro. */
export interface Solicitud {
  /** Cursor del centro (su hora) de la última sincronización; null = traer todo. */
  desde: string | null;
  /** Reloj del equipo (ms) al enviar: con él el centro calcula la diferencia de hora. */
  reloj: number;
  paquete: Paquete;
}
export interface Respuesta { paquete: Paquete; cursor: string }

export const iso = (ms: number) => new Date(ms).toISOString();
const correr = (m: string, ms: number) => (ms ? iso(Date.parse(m) + ms) : m);
const ident = (t: Tabla) => t.clave ?? "uid";

// ---------- Ayudas de lectura ----------

class Contexto {
  private columnas = new Map<string, Set<string>>();
  private ids = new Map<string, Map<string, number>>(); // tabla → uid → id
  private uids = new Map<string, Map<number, string>>(); // tabla → id → uid
  readonly con: Conexion;
  constructor(con: Conexion) { this.con = con; }

  async cols(tabla: string): Promise<Set<string>> {
    let c = this.columnas.get(tabla);
    if (!c) {
      c = new Set((await this.con.select<{ name: string }>(`PRAGMA table_info(${tabla})`)).map((r) => r.name));
      this.columnas.set(tabla, c);
    }
    return c;
  }

  private async cargar(tabla: string) {
    if (this.ids.has(tabla)) return;
    const filas = await this.con.select<{ id: number; uid: string }>(`SELECT id, uid FROM ${tabla}`);
    this.ids.set(tabla, new Map(filas.map((f) => [f.uid, f.id])));
    this.uids.set(tabla, new Map(filas.map((f) => [f.id, f.uid])));
  }
  async idDe(tabla: string, uid: string): Promise<number | undefined> {
    await this.cargar(tabla);
    return this.ids.get(tabla)!.get(uid);
  }
  async uidDe(tabla: string, id: number): Promise<string | undefined> {
    await this.cargar(tabla);
    return this.uids.get(tabla)!.get(id);
  }
  recordar(tabla: string, uid: string, id: number, uidViejo?: string) {
    const ids = this.ids.get(tabla), uids = this.uids.get(tabla);
    if (uidViejo) ids?.delete(uidViejo);
    ids?.set(uid, id);
    uids?.set(id, uid);
  }
  olvidar(tabla: string, uid: string) {
    const id = this.ids.get(tabla)?.get(uid);
    this.ids.get(tabla)?.delete(uid);
    if (id != null) this.uids.get(tabla)?.delete(id);
  }
}

// ---------- Exportar ----------

/**
 * Cambios desde `desde` (hora de este equipo; null = todo).
 * `correrMs` se suma a las fechas que salen (el centro las pasa a la hora del equipo).
 * `excluir`: «tabla|uid» que no se devuelven (lo que el mismo equipo acaba de mandar).
 */
export async function exportar(con: Conexion, op: { desde: string | null; correrMs?: number; excluir?: Set<string> }): Promise<Paquete> {
  const cx = new Contexto(con);
  const ms = op.correrMs ?? 0;
  const fuera = (t: string, uid: string) => op.excluir?.has(`${t}|${uid}`) ?? false;
  const filas: FilaSinc[] = [];
  for (const t of TABLAS) {
    const filtro = op.desde ? "WHERE modificado_en > $1" : "";
    const rs = await con.select(`SELECT * FROM ${t.nombre} ${filtro}`, op.desde ? [op.desde] : []);
    for (const r of rs) {
      const uid = String(r[ident(t)]);
      if (t.solo && !t.solo.includes(uid)) continue;
      if (fuera(t.nombre, uid) || r.modificado_en == null) continue;
      const d: Fila = { ...r };
      delete d.id; delete d.uid; delete d.modificado_en;
      for (const [col, ref] of Object.entries(t.fk ?? {})) {
        d[col] = r[col] == null ? null : (await cx.uidDe(ref, Number(r[col]))) ?? null;
      }
      filas.push({ t: t.nombre, uid, m: correr(String(r.modificado_en), ms), d });
    }
  }
  const bs = await con.select<{ tabla: string; uid: string; borrado_en: string }>(
    `SELECT tabla, uid, borrado_en FROM borrados ${op.desde ? "WHERE borrado_en > $1" : ""}`, op.desde ? [op.desde] : []);
  const borrados = bs
    .filter((b) => {
      const t = POR_NOMBRE.get(b.tabla);
      return t && (!t.solo || t.solo.includes(b.uid)) && !fuera(b.tabla, b.uid);
    })
    .map((b) => ({ t: b.tabla, uid: b.uid, m: correr(b.borrado_en, ms) }));
  return { filas, borrados };
}

// ---------- Aplicar ----------

export interface Resultado {
  aplicadas: number;
  omitidas: number;
  /** «tabla|uid» de lo recibido que se aplicó (no se le devuelve al mismo equipo; lo que perdió, sí). */
  recibidos: Set<string>;
}

/**
 * Aplica un paquete. `correrMs` se suma a las fechas que llegan (el centro las pasa a su hora).
 * `centro`: hora del centro; si se da, lo que se guarda queda con esa fecha (así llega a los demás).
 */
export async function aplicar(con: Conexion, p: Paquete, op: { correrMs?: number; centro?: string } = {}): Promise<Resultado> {
  const cx = new Contexto(con);
  const ms = op.correrMs ?? 0;
  const res: Resultado = { aplicadas: 0, omitidas: 0, recibidos: new Set() };
  const porTabla = new Map<string, FilaSinc[]>();
  for (const f of p.filas) {
    porTabla.set(f.t, [...(porTabla.get(f.t) ?? []), f]);
  }

  for (const t of TABLAS) {
    const pendientes: { f: FilaSinc; m: string }[] = []; // llaves a la misma tabla aún sin crear
    for (const f of porTabla.get(t.nombre) ?? []) {
      if (t.solo && !t.solo.includes(f.uid)) { res.omitidas++; continue; }
      const m = correr(f.m, ms);
      const r = await aplicarFila(cx, t, f, m, op.centro);
      if (r === "pendiente") pendientes.push({ f, m });
      if (r === "omitida") res.omitidas++;
      else {
        res.aplicadas++;
        if (r !== "adoptada") res.recibidos.add(`${f.t}|${f.uid}`);
      }
    }
    // Segunda pasada: llaves a filas de la misma tabla que llegaron después (subcategorías, CDT renovados).
    for (const { f, m } of pendientes) await completarLlaves(cx, t, f, op.centro ?? m);
  }

  // Borrados: de hijas a madres.
  for (const t of [...TABLAS].reverse()) {
    for (const b of p.borrados.filter((x) => x.t === t.nombre)) {
      if (t.solo && !t.solo.includes(b.uid)) { res.omitidas++; continue; }
      if (await aplicarBorrado(cx, t, b.uid, correr(b.m, ms), op.centro)) {
        res.aplicadas++; res.recibidos.add(`${b.t}|${b.uid}`);
      } else res.omitidas++;
    }
  }
  return res;
}

/** «adoptada»: ganó la fila local pero tomó el uid que llegó (hay que devolverle al equipo la versión local). */
type Salida = "aplicada" | "omitida" | "pendiente" | "adoptada";

async function traducir(cx: Contexto, t: Tabla, f: FilaSinc, cols: Set<string>) {
  const datos: Fila = {};
  let falta = false, pendiente = false;
  for (const [col, v] of Object.entries(f.d)) {
    if (!cols.has(col) || col === "id" || col === "uid" || col === "modificado_en") continue;
    const ref = t.fk?.[col];
    if (ref && v != null) {
      const id = await cx.idDe(ref, String(v));
      if (id == null) {
        if (ref === t.nombre) pendiente = true; // misma tabla: se completa después
        else if (await obligatoria(cx, t.nombre, col)) falta = true;
        datos[col] = null;
      } else datos[col] = id;
    } else datos[col] = v;
  }
  return { datos, falta, pendiente };
}

const notNull = new Map<string, boolean>();
async function obligatoria(cx: Contexto, tabla: string, col: string): Promise<boolean> {
  const k = `${tabla}.${col}`;
  if (!notNull.has(k)) {
    const info = await cx.con.select<{ name: string; notnull: number }>(`PRAGMA table_info(${tabla})`);
    for (const c of info) notNull.set(`${tabla}.${c.name}`, !!c.notnull);
  }
  return notNull.get(k) ?? false;
}

async function buscar(cx: Contexto, t: Tabla, uid: string, datos: Fila): Promise<{ fila: Fila | null; natural: boolean }> {
  const porUid = await cx.con.select(`SELECT rowid AS _fila, * FROM ${t.nombre} WHERE ${ident(t)} = $1`, [uid]);
  if (porUid[0]) return { fila: porUid[0], natural: false };
  for (const clave of t.naturales ?? []) {
    const partes = clave.map((c) => c.split(" "));
    if (partes.some(([c]) => datos[c] == null)) continue;
    const donde = partes.map(([c, mod], i) => `${c} = $${i + 1}${mod === "nocase" ? " COLLATE NOCASE" : ""}`).join(" AND ");
    const [fila] = await cx.con.select(`SELECT rowid AS _fila, * FROM ${t.nombre} WHERE ${donde}`, partes.map(([c]) => datos[c]));
    if (fila) return { fila, natural: true };
  }
  return { fila: null, natural: false };
}

async function aplicarFila(cx: Contexto, t: Tabla, f: FilaSinc, m: string, centro?: string): Promise<Salida> {
  const cols = await cx.cols(t.nombre);
  const { datos, falta, pendiente } = await traducir(cx, t, f, cols);
  if (falta) return "omitida"; // su fila madre ya no existe aquí
  const { fila: local, natural } = await buscar(cx, t, f.uid, datos);
  const guardar = centro ?? m;

  if (!local) {
    const [b] = await cx.con.select<{ borrado_en: string }>("SELECT borrado_en FROM borrados WHERE tabla = $1 AND uid = $2", [t.nombre, f.uid]);
    if (b && b.borrado_en >= m) return "omitida"; // se borró después de esa edición
    const nombres = Object.keys(datos);
    const valores = nombres.map((n) => datos[n]);
    if (!t.clave) { nombres.push("uid"); valores.push(f.uid); }
    nombres.push("modificado_en"); valores.push(guardar);
    try {
      await cx.con.execute(
        `INSERT INTO ${t.nombre} (${nombres.join(", ")}) VALUES (${nombres.map((_, i) => `$${i + 1}`).join(", ")})`, valores);
    } catch { return "omitida"; }
    if (b) await cx.con.execute("DELETE FROM borrados WHERE tabla = $1 AND uid = $2", [t.nombre, f.uid]);
    if (cols.has("id")) {
      const [n] = await cx.con.select<{ id: number }>(`SELECT id FROM ${t.nombre} WHERE uid = $1`, [f.uid]);
      if (n) cx.recordar(t.nombre, f.uid, n.id);
    }
    return pendiente ? "pendiente" : "aplicada";
  }

  const gana = String(local.modificado_en ?? "") < m;
  const otroUid = natural && !t.clave && local.uid !== f.uid;
  if (!gana && !otroUid) return "omitida";

  const sets: string[] = [];
  const valores: unknown[] = [];
  if (gana) for (const [k, v] of Object.entries(datos)) { valores.push(v); sets.push(`${k} = $${valores.length}`); }
  if (otroUid) { valores.push(f.uid); sets.push(`uid = $${valores.length}`); }
  // Si perdió pero se adoptó el uid: en el centro cuenta como cambio (para que llegue a los demás).
  valores.push(gana ? guardar : centro ?? local.modificado_en);
  sets.push(`modificado_en = $${valores.length}`);
  valores.push(local._fila);
  const donde = `rowid = $${valores.length}`;
  try {
    await cx.con.execute(`UPDATE ${t.nombre} SET ${sets.join(", ")} WHERE ${donde}`, valores);
  } catch { return "omitida"; }
  if (otroUid && cols.has("id")) cx.recordar(t.nombre, f.uid, Number(local.id), String(local.uid));
  if (!gana) return "adoptada";
  return pendiente ? "pendiente" : "aplicada";
}

async function completarLlaves(cx: Contexto, t: Tabla, f: FilaSinc, m: string) {
  for (const [col, ref] of Object.entries(t.fk ?? {})) {
    if (ref !== t.nombre || f.d[col] == null) continue;
    const id = await cx.idDe(ref, String(f.d[col]));
    if (id != null) {
      await cx.con.execute(`UPDATE ${t.nombre} SET ${col} = $1, modificado_en = $2 WHERE uid = $3`, [id, m, f.uid]);
    }
  }
}

async function aplicarBorrado(cx: Contexto, t: Tabla, uid: string, m: string, centro?: string): Promise<boolean> {
  const [local] = await cx.con.select(`SELECT * FROM ${t.nombre} WHERE ${ident(t)} = $1`, [uid]);
  if (local && String(local.modificado_en ?? "") > m) return false; // se editó después del borrado: se queda
  if (local) {
    try {
      await cx.con.execute(`DELETE FROM ${t.nombre} WHERE ${ident(t)} = $1`, [uid]);
    } catch { return false; } // otra fila aún la usa
    if (!t.clave) cx.olvidar(t.nombre, uid);
  }
  // Fecha del borrado: en el centro, su hora (para que llegue a los demás); en el equipo, la que trae.
  const fecha = centro ?? m;
  await cx.con.execute(
    `INSERT INTO borrados (tabla, uid, borrado_en) VALUES ($1, $2, $3)
     ON CONFLICT (tabla, uid) DO UPDATE SET borrado_en = excluded.borrado_en`, [t.nombre, uid, fecha]);
  return true;
}

// ---------- Primera vez ----------

/** Borra los datos sincronizables de este equipo (antes de traer todo del centro por primera vez). */
export async function vaciar(con: Conexion): Promise<void> {
  for (const t of [...TABLAS].reverse()) {
    const donde = t.solo ? `WHERE ${t.clave} IN (${t.solo.map((_, i) => `$${i + 1}`).join(", ")})` : "";
    await con.execute(`DELETE FROM ${t.nombre} ${donde}`, t.solo ?? []);
  }
  await con.execute("DELETE FROM borrados");
}

/** ¿Este equipo tiene datos propios (más allá de las categorías de fábrica)? */
export async function tieneDatos(con: Conexion): Promise<boolean> {
  const [r] = await con.select<{ n: number }>(
    "SELECT (SELECT count(*) FROM cuentas) + (SELECT count(*) FROM transacciones) + (SELECT count(*) FROM personas) AS n");
  return Number(r?.n ?? 0) > 0;
}

// ---------- Las dos puntas ----------

/** Centro (Mac): aplica lo que manda el equipo y le responde con lo que le falta. */
export async function responder(con: Conexion, s: Solicitud, ahora = Date.now()): Promise<Respuesta> {
  const desfase = ahora - s.reloj; // cuánto va adelantado el centro frente al equipo
  const centro = iso(ahora);
  const { recibidos } = await aplicar(con, s.paquete, { correrMs: desfase, centro });
  const paquete = await exportar(con, { desde: s.desde, correrMs: -desfase, excluir: recibidos });
  return { paquete, cursor: centro };
}

/** Estado que guarda cada equipo entre sincronizaciones. */
export interface EstadoEquipo {
  /** Cursor del centro (su hora); null = nunca ha sincronizado. */
  cursor: string | null;
  /** Hora de este equipo al empezar la última sincronización buena. */
  enviado: string | null;
}

/**
 * Equipo (celular/tablet): manda sus cambios, aplica los del centro y devuelve el estado nuevo.
 * La primera vez (cursor null) vacía sus datos y trae todo del centro.
 */
export async function sincronizar(
  con: Conexion, estado: EstadoEquipo, enviar: (s: Solicitud) => Promise<Respuesta>, ahora = () => Date.now(),
): Promise<{ estado: EstadoEquipo; recibidas: number }> {
  const inicio = iso(ahora());
  const primera = estado.cursor == null;
  if (primera) await vaciar(con);
  const paquete = primera ? { filas: [], borrados: [] } : await exportar(con, { desde: estado.enviado });
  const r = await enviar({ desde: estado.cursor, reloj: ahora(), paquete });
  const { aplicadas } = await aplicar(con, r.paquete);
  return { estado: { cursor: r.cursor, enviado: inicio }, recibidas: aplicadas };
}
