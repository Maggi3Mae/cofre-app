// Datos de demostración: se siembran con las funciones de la app sobre SQLite real y se revisa
// que cuenten la historia de las capturas. Correr: npm run prueba:demo
import assert from "node:assert/strict";
import { sembrarDemo, demoVacia } from "../src/lib/demo/sembrar.ts";
import { listarCuentas } from "../src/lib/datos/cuentas.ts";
import { listarPresupuestos } from "../src/lib/datos/presupuestos.ts";
import { listarCdts } from "../src/lib/datos/cdts.ts";
import { listarCajitas } from "../src/lib/datos/cajitas.ts";
import { listarPersonas } from "../src/lib/datos/medeben.ts";
import { porConfirmar, proximosPagos } from "../src/lib/datos/recurrentes.ts";
import { listarTransacciones } from "../src/lib/datos/transacciones.ts";
import { listarEtiquetas } from "../src/lib/datos/etiquetas.ts";
import { leerAjuste } from "../src/lib/datos/ajustes.ts";
import { extractoDemo } from "../src/lib/demo/extracto.ts";
import { leerCsv } from "../src/lib/importar/csv.ts";
import type { Documento } from "../src/lib/importar/documento.ts";
import { detectar } from "../src/lib/importar/bancos.ts";
import { hoy } from "../src/lib/formato.ts";

let ok = 0;
const prueba = async (nombre: string, f: () => Promise<void>) => { await f(); ok++; console.log("✓", nombre); };
const pesos = (c: number) => Math.round(c / 100);

assert.equal(await demoVacia(), true);
await sembrarDemo();

await prueba("ya no está vacía y saluda a Ana", async () => {
  assert.equal(await demoVacia(), false);
  assert.equal(await leerAjuste("nombre"), "Ana");
});

await prueba("cuentas con saldos razonables", async () => {
  const cuentas = await listarCuentas();
  assert.equal(cuentas.length, 4);
  for (const c of cuentas) console.log(`   ${c.nombre}: $${pesos(c.saldo).toLocaleString("es-CO")}`);
  const deb = cuentas.filter((c) => c.tipo !== "credito");
  assert.ok(deb.every((c) => c.saldo >= 0), "ninguna cuenta de débito o efectivo en negativo");
  const tarjeta = cuentas.find((c) => c.tipo === "credito")!;
  assert.ok(tarjeta.saldo > 0 && tarjeta.saldo < tarjeta.cupo!, "la tarjeta tiene deuda dentro del cupo");
});

await prueba("6 meses de movimientos y la etiqueta del viaje", async () => {
  const txs = await listarTransacciones({ limite: 5000 });
  console.log(`   ${txs.length} movimientos`);
  assert.ok(txs.length > 150);
  assert.ok((await listarEtiquetas()).some((e) => e.nombre === "Viaje Cartagena" && e.num_movimientos >= 5));
});

await prueba("presupuestos: uno pasado, uno cerca del tope y uno bien", async () => {
  const p = await listarPresupuestos();
  for (const x of p) console.log(`   ${x.nombre ?? x.categoria}: ${Math.round((x.gastado / x.limite) * 100)} %`);
  const pct = (n: string) => { const x = p.find((y) => (y.nombre ?? y.categoria) === n)!; return x.gastado / x.limite; };
  assert.ok(pct("Comida") > 1);
  assert.ok(pct("Mercado") >= 0.8 && pct("Mercado") <= 1);
  assert.ok(pct("Transporte") < 0.8);
});

await prueba("CDT por vencer y cajitas con meta", async () => {
  const cdts = await listarCdts();
  assert.equal(cdts.length, 2);
  assert.ok(cdts.some((c) => c.calculo.diasRestantes > 0 && c.calculo.diasRestantes <= 7));
  const cajitas = await listarCajitas();
  assert.equal(cajitas.length, 2);
  assert.ok(cajitas.every((c) => c.calculo.valorHoy > c.saldo), "las cajitas ganaron intereses");
});

await prueba("Me deben: uno vencido y un gasto dividido", async () => {
  const personas = await listarPersonas();
  for (const x of personas) console.log(`   ${x.nombre}: $${pesos(x.pendiente).toLocaleString("es-CO")}${x.vencidos ? " (vencido)" : ""}`);
  assert.equal(personas.length, 4);
  assert.ok(personas.some((x) => x.nombre === "Carlos" && x.vencidos > 0));
  assert.ok(personas.every((x) => x.pendiente > 0));
});

await prueba("recurrentes: uno por confirmar y próximos pagos", async () => {
  assert.equal((await porConfirmar()).length, 1);
  assert.ok((await proximosPagos(30)).lista.length >= 3);
});

await prueba("extracto de ejemplo: Nequi, billetera, saldos que cuadran y la recarga ya registrada", async () => {
  const filas = leerCsv(extractoDemo(hoy()));
  const doc: Documento = { tipo: "hoja", hojas: [{ nombre: "CSV", filas }], texto: filas.map((f) => f.join("\t")).join("\n") };
  const cuentas = await listarCuentas();
  const d = detectar(doc, cuentas);
  assert.equal(d.formato?.id, "nequi");
  assert.equal(d.ultimos4, "9012");
  assert.equal(cuentas.find((c) => c.id === d.cuentaId)?.nombre, "Billetera digital");
  const l = d.formato!.leer(doc);
  console.log(`   ${l.movimientos.length} movimientos · ${l.validacion.mensajes.join(" ")}`);
  assert.equal(l.movimientos.length, 10);
  assert.ok(l.validacion.ok);
  const recarga = l.movimientos.find((m) => m.sentido === "abono")!;
  const ya = (await listarTransacciones({ cuentaId: d.cuentaId!, tipo: "transferencia", limite: 500 }))
    .some((t) => t.monto === recarga.monto && Math.abs(Date.parse(t.fecha) - Date.parse(recarga.fecha)) <= 3 * 864e5);
  assert.ok(ya, "la recarga del extracto coincide con una transferencia de la demo");
});

console.log(`\n${ok} pruebas de la demostración OK`);
