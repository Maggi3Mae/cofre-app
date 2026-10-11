// Pruebas del motor de sincronización con bases SQLite reales (todas las migraciones).
// Correr: npm run prueba:sinc
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { responder, sincronizar, type Conexion, type EstadoEquipo, TABLAS } from "../src/lib/sinc/motor.ts";

const DIR = new URL("../src-tauri/migrations/", import.meta.url).pathname;

function nueva(): { db: DatabaseSync; con: Conexion } {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(DIR + f, "utf8"));
  // Igual que el plugin de Tauri: parámetros $1, $2…
  const prep = (sql: string) => db.prepare(sql.replace(/\$(\d+)/g, "?$1"));
  const con: Conexion = {
    async select(sql, p = []) { return prep(sql).all(...(p as never[])) as never; },
    async execute(sql, p = []) { return prep(sql).run(...(p as never[])); },
  };
  return { db, con };
}

const espera = (ms = 3) => { const t = Date.now(); while (Date.now() - t < ms); };

/** Foto de los datos sincronizables, por uid y con las llaves como uid (comparable entre equipos). */
function foto(db: DatabaseSync) {
  const uidDe = (tabla: string, id: unknown) =>
    id == null ? null : (db.prepare(`SELECT uid FROM ${tabla} WHERE id = ?`).get(id as number) as { uid: string } | undefined)?.uid ?? `?${id}`;
  const out: Record<string, unknown[]> = {};
  for (const t of TABLAS) {
    let filas = db.prepare(`SELECT * FROM ${t.nombre}`).all() as Record<string, unknown>[];
    if (t.solo) filas = filas.filter((f) => t.solo!.includes(String(f.clave)));
    out[t.nombre] = filas.map((f) => {
      const d = { ...f };
      delete d.id; delete d.modificado_en; delete d.creado_en;
      for (const [c, ref] of Object.entries(t.fk ?? {})) d[c] = uidDe(ref, f[c]);
      return d;
    }).sort((a, b) => String(a.uid ?? a.clave ?? a.nit).localeCompare(String(b.uid ?? b.clave ?? b.nit)));
  }
  return out;
}
const iguales = (a: DatabaseSync, b: DatabaseSync, msj: string) => assert.deepEqual(foto(a), foto(b), msj);

// ---- Equipos ----
const mac = nueva(), cel = nueva(), tab = nueva();
const enviarMac = (s: Parameters<typeof responder>[1]) => responder(mac.con, s);
let eCel: EstadoEquipo = { cursor: null, enviado: null };
let eTab: EstadoEquipo = { cursor: null, enviado: null };
const sincCel = async () => { const r = await sincronizar(cel.con, eCel, enviarMac); eCel = r.estado; espera(); return r; };
const sincTab = async () => { const r = await sincronizar(tab.con, eTab, enviarMac); eTab = r.estado; espera(); return r; };
const uno = (db: DatabaseSync, sql: string, ...p: unknown[]) => db.prepare(sql).get(...(p as never[])) as Record<string, unknown> | undefined;
let ok = 0;
const prueba = async (nombre: string, f: () => Promise<void> | void) => { await f(); ok++; console.log("✓", nombre); };

// Datos del Mac
mac.db.exec(`
  INSERT INTO cuentas (nombre, tipo, moneda, saldo_inicial, principal) VALUES ('Ahorros BBVA','debito','COP',500000,1);
  INSERT INTO cuentas (nombre, tipo, moneda, saldo_inicial, cupo) VALUES ('Crédito BBVA','credito','COP',0,3000000);
  INSERT INTO etiquetas (nombre) VALUES ('viaje');
  INSERT INTO transacciones (fecha, monto, tipo, cuenta_id, categoria_id, comercio, huella)
    VALUES ('2026-10-01', 45000, 'egreso', 1, (SELECT id FROM categorias WHERE tipo='egreso' LIMIT 1), 'D1', 'imp|1|a');
  INSERT INTO transaccion_etiquetas (transaccion_id, etiqueta_id) VALUES (1, 1);
  INSERT INTO compras_credito (cuenta_id, comercio, fecha, monto_base, capital, num_cuotas, tasa_ea, cuota, total)
    VALUES (2, 'Falabella', '2026-09-10', 1200000, 1200000, 3, 0.3, 420000, 1260000);
  INSERT INTO cuotas (compra_id, numero, fecha, capital, interes, saldo) VALUES (1,1,'2026-10-15',400000,20000,800000),(1,2,'2026-11-15',400000,20000,400000);
  INSERT INTO personas (nombre) VALUES ('Natalia');
  INSERT INTO prestamos (persona_id, monto, fecha, cuenta_origen_id) VALUES (1, 198900, '2026-10-01', 1);
  INSERT INTO ajustes (clave, valor) VALUES ('nombre','Ana'), ('trm','4000'), ('ultima_cuenta','2'), ('patrimonio_oculto','1');
  INSERT INTO comercios_nit (nit, nombre) VALUES ('900123','Comercio Ejemplo');
  INSERT INTO categorias (nombre, tipo, padre_id) VALUES ('Domicilios','egreso',(SELECT id FROM categorias WHERE tipo='egreso' LIMIT 1));
`);
cel.db.exec("INSERT INTO cuentas (nombre, tipo, moneda) VALUES ('Prueba celular','efectivo','COP'); INSERT INTO ajustes (clave, valor) VALUES ('patrimonio_oculto','0')");
espera();

await prueba("primera vez: el celular toma todo del Mac (sin duplicar categorías de fábrica)", async () => {
  await sincCel();
  iguales(mac.db, cel.db, "celular = Mac");
  assert.equal(uno(cel.db, "SELECT count(*) n FROM cuentas WHERE nombre='Prueba celular'")!.n, 0);
  assert.equal(uno(cel.db, "SELECT valor FROM ajustes WHERE clave='patrimonio_oculto'")!.valor, "0", "ajuste propio se queda (no llega el del Mac)");
  assert.equal(uno(cel.db, "SELECT valor FROM ajustes WHERE clave='nombre'")!.valor, "Ana", "ajuste compartido llega");
  assert.equal(uno(cel.db, "SELECT count(*) n FROM borrados")!.n, 0);
});

await prueba("sin cambios no viaja nada (no hay ping-pong)", async () => {
  await sincCel();
  const r = await sincCel();
  assert.equal(r.recibidas, 0);
  const s = await responder(mac.con, { desde: eCel.cursor, reloj: Date.now(), paquete: { filas: [], borrados: [] } });
  assert.equal(s.paquete.filas.length + s.paquete.borrados.length, 0);
});

await prueba("cambios en los dos lados se cruzan", async () => {
  cel.db.exec(`INSERT INTO transacciones (fecha, monto, tipo, cuenta_id, categoria_id, comercio)
               VALUES ('2026-10-08', 12000, 'egreso', (SELECT id FROM cuentas WHERE principal=1), (SELECT id FROM categorias WHERE nombre='Domicilios'), 'Rappi');
               INSERT INTO transaccion_etiquetas (transaccion_id, etiqueta_id) VALUES (last_insert_rowid(), (SELECT id FROM etiquetas));`);
  mac.db.exec("UPDATE cuentas SET nombre='Ahorros BBVA ★' WHERE principal=1; UPDATE ajustes SET valor='4100' WHERE clave='trm';");
  await sincCel();
  iguales(mac.db, cel.db, "iguales tras cruzar");
  assert.equal(uno(mac.db, "SELECT t.comercio, c.nombre cat FROM transacciones t JOIN categorias c ON c.id=t.categoria_id WHERE comercio='Rappi'")!.cat, "Domicilios");
});

await prueba("la tablet recibe lo que mandó el celular (pasa por el Mac)", async () => {
  await sincTab();
  iguales(mac.db, tab.db, "tablet = Mac");
  cel.db.exec("UPDATE personas SET notas='Compañera' WHERE nombre='Natalia'");
  await sincCel();
  await sincTab();
  assert.equal(uno(tab.db, "SELECT notas FROM personas")!.notas, "Compañera");
  iguales(cel.db, tab.db, "celular = tablet");
});

await prueba("conflicto: gana la edición más reciente", async () => {
  cel.db.exec("UPDATE transacciones SET monto = 13000 WHERE comercio='Rappi'");
  espera(5);
  tab.db.exec("UPDATE transacciones SET monto = 14000 WHERE comercio='Rappi'");
  await sincTab();
  await sincCel(); // el celular llega después con una edición más vieja: pierde
  await sincTab();
  for (const e of [mac, cel, tab]) assert.equal(uno(e.db, "SELECT monto FROM transacciones WHERE comercio='Rappi'")!.monto, 14000);
});

await prueba("borrar en el celular borra en todos (y sus etiquetas en cascada)", async () => {
  cel.db.exec("DELETE FROM transacciones WHERE comercio='Rappi'");
  await sincCel();
  await sincTab();
  for (const e of [mac, tab]) assert.equal(uno(e.db, "SELECT count(*) n FROM transacciones WHERE comercio='Rappi'")!.n, 0);
  iguales(mac.db, cel.db, "Mac = celular");
  iguales(mac.db, tab.db, "Mac = tablet");
});

await prueba("editar después de que otro borró: la fila vuelve", async () => {
  const uid = uno(mac.db, "SELECT uid FROM transacciones WHERE comercio='D1'")!.uid;
  cel.db.exec("DELETE FROM transacciones WHERE comercio='D1'");
  espera(5);
  mac.db.exec("UPDATE transacciones SET notas='arroz' WHERE comercio='D1'");
  await sincCel();
  assert.equal(uno(cel.db, "SELECT notas FROM transacciones WHERE uid=?", uid)!.notas, "arroz");
  iguales(mac.db, cel.db, "iguales");
});

await prueba("el mismo presupuesto creado en dos equipos queda uno solo", async () => {
  const cat = "(SELECT id FROM categorias WHERE nombre='Domicilios')";
  cel.db.exec(`INSERT INTO presupuestos (categoria_id, monto_mensual) VALUES (${cat}, 100000)`);
  espera(5);
  mac.db.exec(`INSERT INTO presupuestos (categoria_id, monto_mensual) VALUES (${cat}, 150000)`);
  await sincCel();
  await sincTab();
  await sincCel();
  for (const e of [mac, cel, tab]) {
    const ps = e.db.prepare("SELECT uid, monto_mensual FROM presupuestos").all();
    assert.equal(ps.length, 1); assert.equal(ps[0].monto_mensual, 150000);
  }
  iguales(mac.db, cel.db, "Mac = celular"); iguales(mac.db, tab.db, "Mac = tablet");
});

await prueba("relojes distintos: la hora del equipo se corrige", async () => {
  // Celular con el reloj 1 hora atrasado: su edición reciente no debe perder contra una vieja del Mac.
  const atrasado = () => Date.now() - 3_600_000;
  mac.db.exec("UPDATE cuentas SET cupo = 3100000 WHERE tipo='credito'");
  espera(5);
  const hora = new Date(atrasado()).toISOString();
  cel.db.prepare("UPDATE cuentas SET cupo = 3200000, modificado_en = ? WHERE tipo='credito'").run(hora);
  // Un reloj atrasado lo está siempre: también su marca de último envío.
  const enviado = new Date(Date.parse(eCel.enviado!) - 3_600_000).toISOString();
  const r = await sincronizar(cel.con, { ...eCel, enviado }, (s) => responder(mac.con, s), atrasado);
  eCel = r.estado; espera();
  for (const e of [mac, cel]) assert.equal(uno(e.db, "SELECT cupo FROM cuentas WHERE tipo='credito'")!.cupo, 3200000);
});

await prueba("el mismo extracto importado en dos equipos no duplica movimientos", async () => {
  const ins = (db: DatabaseSync, cat: string) => db.exec(`INSERT INTO transacciones (fecha, monto, tipo, cuenta_id, comercio, huella, notas)
    VALUES ('2026-10-05', 99000, 'egreso', (SELECT id FROM cuentas WHERE principal=1), 'EXITO', 'imp|x|2026-10-05|99000', '${cat}')`);
  ins(mac.db, "mac"); espera(5); ins(tab.db, "tablet");
  await sincTab(); await sincCel();
  for (const e of [mac, cel, tab]) {
    const fs = e.db.prepare("SELECT notas FROM transacciones WHERE huella LIKE 'imp|x|%'").all();
    assert.equal(fs.length, 1); assert.equal(fs[0].notas, "tablet");
  }
});

await prueba("subcategoría creada antes que su categoría madre en el paquete", async () => {
  cel.db.exec(`INSERT INTO categorias (nombre, tipo) VALUES ('Mascotas','egreso');
               INSERT INTO categorias (nombre, tipo, padre_id) VALUES ('Veterinaria','egreso',last_insert_rowid());`);
  // La madre se edita después: en el paquete puede salir en cualquier orden; la llave se completa igual.
  espera(5); cel.db.exec("UPDATE categorias SET icono='pata' WHERE nombre='Mascotas'");
  await sincCel(); await sincTab();
  assert.equal(uno(tab.db, "SELECT m.nombre FROM categorias h JOIN categorias m ON m.id=h.padre_id WHERE h.nombre='Veterinaria'")!.nombre, "Mascotas");
});

await prueba("al final, los tres equipos tienen lo mismo", async () => {
  await sincCel(); await sincTab(); await sincCel();
  iguales(mac.db, cel.db, "Mac = celular"); iguales(mac.db, tab.db, "Mac = tablet");
});

console.log(`\n${ok} pruebas de sincronización OK`);
