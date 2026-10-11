// Pruebas de movimientos recurrentes con SQLite real (todas las migraciones) y sincronización entre dos equipos.
// Correr: npm run prueba:recurrentes
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import * as rec from "../src/lib/recurrentes/motor.ts";
import { detectar, normalizar, alMes, type EgresoVisto } from "../src/lib/recurrentes/suscripciones.ts";
import { responder, sincronizar, type EstadoEquipo } from "../src/lib/sinc/motor.ts";

const DIR = new URL("../src-tauri/migrations/", import.meta.url).pathname;

function nueva() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(DIR + f, "utf8"));
  const prep = (sql: string) => db.prepare(sql.replace(/\$(\d+)/g, "?$1"));
  const con = {
    async select(sql: string, p: unknown[] = []) { return prep(sql).all(...(p as never[])) as never; },
    async execute(sql: string, p: unknown[] = []) { return prep(sql).run(...(p as never[])); },
  };
  return { db, con };
}
const uno = (db: DatabaseSync, sql: string, ...p: unknown[]) => db.prepare(sql).get(...(p as never[])) as Record<string, any>;
const espera = (ms = 3) => { const t = Date.now(); while (Date.now() - t < ms); };
let ok = 0;
const prueba = async (nombre: string, f: () => Promise<void> | void) => { await f(); ok++; console.log("✓", nombre); };

// ---------- Fechas ----------
const R = (r: Partial<rec.Regla>): rec.Regla => ({ frecuencia: "mensual", dia: 1, inicio: "2026-01-01", ...r });

await prueba("mensual día 31 cae en el último día (febrero, abril)", () => {
  assert.deepEqual(rec.fechasEntre(R({ dia: 31 }), "2026-01-01", "2026-04-30"),
    ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  assert.deepEqual(rec.fechasEntre(R({ dia: 29, frecuencia: "anual", mes: 2 }), "2027-01-01", "2028-12-31"),
    ["2027-02-28", "2028-02-29"]);
});
await prueba("respeta inicio y fin", () => {
  assert.deepEqual(rec.fechasEntre(R({ dia: 5, inicio: "2026-03-10", fin: "2026-06-05" }), "2026-01-01", "2026-12-31"),
    ["2026-04-05", "2026-05-05", "2026-06-05"]);
});
await prueba("quincenal 15 y último", () => {
  assert.deepEqual(rec.fechasEntre(R({ frecuencia: "quincenal", dia: 15, dia2: 31 }), "2026-02-01", "2026-03-20"),
    ["2026-02-15", "2026-02-28", "2026-03-15"]);
});
await prueba("semanal los viernes", () => {
  assert.equal(rec.diaSemana("2026-10-09"), 5); // viernes
  assert.deepEqual(rec.fechasEntre(R({ frecuencia: "semanal", dia: 5, inicio: "2026-10-01" }), "2026-10-01", "2026-10-31"),
    ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"]);
});
await prueba("próximas fechas", () => {
  assert.deepEqual(rec.proximas(R({ dia: 1 }), "2026-10-09", 3), ["2026-11-01", "2026-12-01", "2027-01-01"]);
  assert.deepEqual(rec.proximas(R({ dia: 1, fin: "2026-11-15" }), "2026-10-09", 3), ["2026-11-01"]);
});

// ---------- Base de datos ----------
const mac = nueva();
mac.db.exec(`
  INSERT INTO cuentas (nombre, tipo, moneda, saldo_inicial, principal) VALUES ('Ahorros BBVA','debito','COP',5000000,1);
  INSERT INTO cuentas (nombre, tipo, moneda, saldo_inicial) VALUES ('Nequi','debito','COP',0);
`);
const cat = uno(mac.db, "SELECT id FROM categorias WHERE tipo = 'egreso' LIMIT 1").id;
mac.db.prepare(`INSERT INTO recurrentes (nombre, tipo, monto, cuenta_id, categoria_id, etiquetas, frecuencia, dia, inicio)
  VALUES ('Arriendo','egreso',1800000,1,?, '["casa"]','mensual',1,'2026-08-01')`).run(cat);
mac.db.exec(`INSERT INTO recurrentes (nombre, tipo, monto, cuenta_id, cuenta_destino_id, frecuencia, dia, modo, inicio)
  VALUES ('A Nequi','transferencia',200000,1,2,'mensual',5,'auto','2026-09-01')`);
const arriendo = uno(mac.db, "SELECT * FROM recurrentes WHERE nombre='Arriendo'");
const nequi = uno(mac.db, "SELECT * FROM recurrentes WHERE nombre='A Nequi'");
const HOY = "2026-10-09";
const nTx = (db: DatabaseSync) => uno(db, "SELECT count(*) AS n FROM transacciones").n;

await prueba("modo por defecto: confirmar; uid y fecha de modificación", () => {
  assert.equal(arriendo.modo, "confirmar");
  assert.match(arriendo.uid, /^[0-9a-f-]{36}$/);
  assert.ok(arriendo.modificado_en);
});
await prueba("por confirmar se calcula sin tocar la base", async () => {
  const p = await rec.porConfirmar(mac.con, HOY);
  assert.deepEqual(p.map((o) => o.fecha), ["2026-08-01", "2026-09-01", "2026-10-01"]);
  assert.equal(nTx(mac.db), 0);
});
await prueba("automáticas: registra lo vencido una sola vez", async () => {
  assert.equal(await rec.generarAutomaticas(mac.con, HOY), 2); // 5 sep y 5 oct
  assert.equal(await rec.generarAutomaticas(mac.con, HOY), 0);
  const t = uno(mac.db, "SELECT * FROM transacciones WHERE huella = ?", rec.huellaRec(nequi.uid, "2026-10-05"));
  assert.equal(t.tipo, "transferencia"); assert.equal(t.cuenta_destino_id, 2); assert.equal(t.categoria_id, null);
  assert.equal(t.recurrente_id, nequi.id); assert.equal(t.comercio, "A Nequi");
});
await prueba("confirmar con otro monto, categoría y etiquetas", async () => {
  await rec.confirmar(mac.con, arriendo.id, "2026-08-01", 1850000);
  const t = uno(mac.db, "SELECT * FROM transacciones WHERE huella = ?", rec.huellaRec(arriendo.uid, "2026-08-01"));
  assert.equal(t.monto, 1850000); assert.equal(t.categoria_id, cat);
  assert.equal(uno(mac.db, `SELECT e.nombre FROM transaccion_etiquetas te JOIN etiquetas e ON e.id = te.etiqueta_id
    WHERE te.transaccion_id = ?`, t.id).nombre, "casa");
  assert.equal(await rec.confirmar(mac.con, arriendo.id, "2026-08-01"), null, "no duplica");
});
await prueba("omitir la saca de por confirmar", async () => {
  await rec.omitir(mac.con, arriendo.id, "2026-09-01");
  assert.deepEqual((await rec.porConfirmar(mac.con, HOY)).map((o) => o.fecha), ["2026-10-01"]);
});
await prueba("borrar una automática la omite: no reaparece", async () => {
  const h = rec.huellaRec(nequi.uid, "2026-09-05");
  mac.db.prepare("DELETE FROM transacciones WHERE huella = ?").run(h);
  assert.ok(uno(mac.db, "SELECT 1 AS x FROM recurrentes_omitidas WHERE recurrente_id = ? AND fecha = '2026-09-05'", nequi.id));
  assert.equal(await rec.generarAutomaticas(mac.con, HOY), 0);
});
await prueba("inactiva no genera ni pide confirmación", async () => {
  mac.db.prepare("UPDATE recurrentes SET activa = 0 WHERE id = ?").run(arriendo.id);
  assert.equal((await rec.porConfirmar(mac.con, HOY)).length, 0);
  mac.db.prepare("UPDATE recurrentes SET activa = 1 WHERE id = ?").run(arriendo.id);
});
await prueba("eliminar la recurrente deja los movimientos (sin enlace)", async () => {
  const otra = nueva();
  otra.db.exec(`INSERT INTO cuentas (nombre, tipo, moneda, saldo_inicial) VALUES ('C','debito','COP',0);
    INSERT INTO recurrentes (nombre, tipo, monto, cuenta_id, frecuencia, dia, modo, inicio) VALUES ('X','egreso',100,1,'mensual',1,'auto','2026-09-01');`);
  await rec.generarAutomaticas(otra.con, HOY);
  otra.db.exec("DELETE FROM recurrentes");
  assert.equal(nTx(otra.db), 2);
  assert.equal(uno(otra.db, "SELECT count(*) AS n FROM transacciones WHERE recurrente_id IS NOT NULL").n, 0);
});

// ---------- Sincronización ----------
const cel = nueva();
let eCel: EstadoEquipo = { cursor: null, enviado: null };
const sincCel = async () => { const r = await sincronizar(cel.con, eCel, (s) => responder(mac.con, s)); eCel = r.estado; espera(); };

await prueba("la recurrente, sus omitidas y movimientos llegan al celular", async () => {
  await sincCel();
  assert.equal(uno(cel.db, "SELECT count(*) AS n FROM recurrentes").n, 2);
  assert.equal(uno(cel.db, "SELECT count(*) AS n FROM recurrentes_omitidas").n, 2);
  assert.equal(nTx(cel.db), nTx(mac.db));
  const t = uno(cel.db, "SELECT r.nombre FROM transacciones t JOIN recurrentes r ON r.id = t.recurrente_id WHERE t.huella = ?",
    rec.huellaRec(arriendo.uid, "2026-08-01"));
  assert.equal(t.nombre, "Arriendo");
});
await prueba("Mac y celular registran la misma ocurrencia sin duplicarla", async () => {
  const mañana = "2026-11-06"; // vencen 1 nov (arriendo) y 5 nov (automática)
  assert.equal(await rec.generarAutomaticas(mac.con, mañana), 1);
  assert.equal(await rec.generarAutomaticas(cel.con, mañana), 1);
  const idCel = uno(cel.db, "SELECT id FROM recurrentes WHERE uid = ?", arriendo.uid).id;
  await rec.confirmar(mac.con, arriendo.id, "2026-11-01");
  await rec.confirmar(cel.con, idCel, "2026-11-01");
  espera(); await sincCel(); await sincCel();
  for (const db of [mac.db, cel.db]) {
    assert.equal(uno(db, "SELECT count(*) AS n FROM transacciones WHERE huella = ?", rec.huellaRec(nequi.uid, "2026-11-05")).n, 1);
    assert.equal(uno(db, "SELECT count(*) AS n FROM transacciones WHERE huella = ?", rec.huellaRec(arriendo.uid, "2026-11-01")).n, 1);
  }
  assert.equal(nTx(cel.db), nTx(mac.db));
});
await prueba("borrar en el celular: el Mac no la vuelve a crear", async () => {
  cel.db.prepare("DELETE FROM transacciones WHERE huella = ?").run(rec.huellaRec(nequi.uid, "2026-11-05"));
  espera(); await sincCel();
  assert.equal(uno(mac.db, "SELECT count(*) AS n FROM transacciones WHERE huella = ?", rec.huellaRec(nequi.uid, "2026-11-05")).n, 0);
  assert.equal(await rec.generarAutomaticas(mac.con, "2026-11-06"), 0);
  assert.equal(uno(mac.db, "SELECT count(*) AS n FROM recurrentes_omitidas WHERE fecha = '2026-11-05'").n, 1);
});
await prueba("editar el monto en el Mac llega al celular", async () => {
  mac.db.prepare("UPDATE recurrentes SET monto = 1900000 WHERE id = ?").run(arriendo.id);
  espera(); await sincCel();
  assert.equal(uno(cel.db, "SELECT monto FROM recurrentes WHERE uid = ?", arriendo.uid).monto, 1900000);
});

// ---------- Suscripciones ----------
const eg = (fecha: string, monto: number, comercio: string, extra: Partial<EgresoVisto> = {}): EgresoVisto =>
  ({ fecha, monto, comercio, cuenta_id: 1, categoria_id: 7, recurrente_id: null, ...extra });
const HOY_S = "2026-10-09";

await prueba("normaliza comercios", () => {
  assert.equal(normalizar("NETFLIX.COM 4521"), "netflix com");
  assert.equal(normalizar("  Café  Ñandú-12 "), "cafe nandu");
});
await prueba("detecta Netflix: 3 meses seguidos, día y monto parecidos", () => {
  const s = detectar([
    eg("2026-07-14", 3890000, "NETFLIX.COM 111"), eg("2026-08-15", 3890000, "NETFLIX.COM 222"),
    eg("2026-09-13", 4190000, "Netflix.com"), eg("2026-10-02", 1200000, "Rappi"),
  ], HOY_S, new Set());
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].clave, s[0].comercio, s[0].monto, s[0].dia, s[0].meses, s[0].ultima], ["netflix com", "Netflix.com", 3890000, 14, 3, "2026-09-13"]);
});
await prueba("meses seguidos obligatorios; día ≥ 29 = último día", () => {
  const s = detectar([eg("2026-07-30", 100000, "Gym"), eg("2026-09-02", 100000, "Gym"), eg("2026-09-30", 100000, "Gym")], HOY_S, new Set());
  assert.equal(s.length, 0, "falta agosto: no son 3 meses seguidos");
  const t = detectar([eg("2026-07-30", 100000, "Gym"), eg("2026-08-31", 100000, "Gym"), eg("2026-09-29", 100000, "Gym")], HOY_S, new Set());
  assert.equal(t.length, 1); assert.equal(t[0].dia, 31);
});
await prueba("no sugiere: montos muy distintos, días dispersos, compras frecuentes, viejo, ya recurrente o descartado", () => {
  assert.equal(detectar([eg("2026-07-10", 100000, "Luz"), eg("2026-08-10", 150000, "Luz"), eg("2026-09-10", 100000, "Luz")], HOY_S, new Set()).length, 0);
  assert.equal(detectar([eg("2026-07-02", 100000, "X"), eg("2026-08-15", 100000, "X"), eg("2026-09-25", 100000, "X")], HOY_S, new Set()).length, 0);
  const d1 = ["2026-07-03", "2026-07-10", "2026-07-20", "2026-08-05", "2026-09-05"].map((f) => eg(f, 50000, "D1"));
  assert.equal(detectar(d1, HOY_S, new Set()).length, 0);
  assert.equal(detectar([eg("2026-04-10", 1, "Y"), eg("2026-05-10", 1, "Y"), eg("2026-06-10", 1, "Y")], HOY_S, new Set()).length, 0);
  const hbo = [eg("2026-07-05", 2000000, "HBO"), eg("2026-08-05", 2000000, "HBO"), eg("2026-09-05", 2000000, "HBO", { recurrente_id: 3 })];
  assert.equal(detectar(hbo, HOY_S, new Set()).length, 0);
  const spot = [eg("2026-07-05", 1690000, "Spotify"), eg("2026-08-05", 1690000, "Spotify"), eg("2026-09-05", 1690000, "Spotify")];
  assert.equal(detectar(spot, HOY_S, new Set(["spotify"])).length, 0);
  assert.equal(detectar(spot, HOY_S, new Set()).length, 1);
});
await prueba("equivalente mensual", () => {
  assert.equal(alMes("semanal", 120000), 520000);
  assert.equal(alMes("quincenal", 100), 200);
  assert.equal(alMes("anual", 1200000), 100000);
});

console.log(`\n${ok} OK`);
