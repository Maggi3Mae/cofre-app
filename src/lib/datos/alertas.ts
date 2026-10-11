// Todas las alertas: presupuestos (80/90/100 % y ritmo), CDT por vencer o vencido, meta de cajita, préstamo vencido.
// Cada evento se avisa una sola vez: su clave queda en alertas_enviadas.
import { db } from "$lib/db";
import { hoy } from "$lib/formato";
import { fechaLarga } from "$lib/inversiones/fechas";
import { revisarPresupuestos, type Nivel } from "./presupuestos";
import { listarCdts } from "./cdts";
import { listarCajitas } from "./cajitas";
import { listarPrestamos } from "./medeben";

const U = 1;

export type TipoAlerta = "presupuesto" | "ritmo" | "cdt" | "meta" | "prestamo";

export interface Alerta {
  tipo: TipoAlerta;
  nivel: Nivel;
  titulo: string;
  cuerpo: string;
  enlace: string;
  /** Para la barra del correo (presupuestos y metas); 1 = 100 %. */
  progreso?: number;
}

async function nuevas(claves: string[]): Promise<Set<string>> {
  if (!claves.length) return new Set();
  const ya = await (await db()).select<{ clave: string }[]>(
    "SELECT clave FROM alertas_enviadas WHERE usuario_id = $1 AND clave IN (SELECT value FROM json_each($2))",
    [U, JSON.stringify(claves)]);
  const enviadas = new Set(ya.map((f) => f.clave));
  return new Set(claves.filter((c) => !enviadas.has(c)));
}

async function marcar(clave: string) {
  await (await db()).execute("INSERT OR IGNORE INTO alertas_enviadas (usuario_id, clave) VALUES ($1, $2)", [U, clave]);
}

const tasa = (v: number) => `${(v * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })} % E.A.`;

async function revisarInversiones(pesos: (c: number) => string, dia: string): Promise<Alerta[]> {
  const [cdts, cajitas, prestamos] = await Promise.all([listarCdts(dia), listarCajitas(dia), listarPrestamos(null, dia)]);
  const candidatas: { clave: string; alerta: Alerta }[] = [];

  for (const c of cdts) {
    if (c.retirado_en) continue;
    const k = c.calculo;
    const detalle = `Invertido: ${pesos(c.monto)} · Al vencimiento: ${pesos(k.totalNetoVencimiento)} neto · Tasa: ${tasa(c.tasa_ea)} · Vence: ${fechaLarga(k.vencimiento)}.`;
    if (k.estado === "vence_pronto")
      candidatas.push({
        clave: `cdt|${c.id}|${k.vencimiento}|7`,
        alerta: {
          tipo: "cdt", nivel: "w80", enlace: "/inversiones", titulo: `CDT por vencer: ${c.nombre}`,
          cuerpo: `Tu CDT vencerá en ${k.diasRestantes} ${k.diasRestantes === 1 ? "día" : "días"}${c.renovacion_auto ? " y se renovará solo" : ""}. ${detalle}`,
        },
      });
    // Los de renovación automática no llegan aquí: al listarlos ya se renovaron.
    if (k.estado === "vencido")
      candidatas.push({
        clave: `cdt|${c.id}|${k.vencimiento}|0`,
        alerta: {
          tipo: "cdt", nivel: "w90", enlace: "/inversiones", titulo: `CDT vencido: ${c.nombre}`,
          cuerpo: `Ya puedes retirar ${pesos(k.totalNetoVencimiento)} o renovarlo. ${detalle}`,
        },
      });
  }

  for (const j of cajitas)
    if (j.meta && j.calculo.progreso === 1)
      candidatas.push({
        clave: `meta|${j.id}|${j.meta}`,
        alerta: {
          tipo: "meta", progreso: 1, nivel: "ok", enlace: "/inversiones?vista=cajitas", titulo: `Meta alcanzada: ${j.nombre}`,
          cuerpo: `Tu cajita llegó a ${pesos(j.calculo.valorHoy)} de ${pesos(j.meta)}.`,
        },
      });

  // Préstamo vencido: un aviso por cada fecha incumplida (cuota o fecha acordada).
  for (const p of prestamos) {
    const k = p.calculo;
    if (!k.vencido || !k.fechaVencida) continue;
    candidatas.push({
      clave: `prestamo|${p.id}|${k.fechaVencida}`,
      alerta: {
        tipo: "prestamo", nivel: "w90", enlace: `/medeben?persona=${p.persona_id}`,
        titulo: `${p.persona} tiene un pago vencido`,
        cuerpo: `Debía pagarte ${pesos(k.atrasado)} desde el ${fechaLarga(k.fechaVencida)}${p.descripcion ? ` (${p.descripcion})` : ""}. Pendiente en total: ${pesos(k.pendiente)}.`,
      },
    });
  }

  const pendientes = await nuevas(candidatas.map((c) => c.clave));
  const salida: Alerta[] = [];
  for (const c of candidatas)
    if (pendientes.has(c.clave)) {
      await marcar(c.clave);
      salida.push(c.alerta);
    }
  return salida;
}

/** Revisa todo y devuelve las alertas nuevas, cuántos presupuestos van en ≥ 80 % y cuántos préstamos están vencidos. */
export async function revisarTodo(pesos: (c: number) => string): Promise<{ alertas: Alerta[]; enRiesgo: number; prestamosVencidos: number }> {
  const dia = hoy();
  const [p, inv, prest] = await Promise.all([revisarPresupuestos(pesos), revisarInversiones(pesos, dia), listarPrestamos(null, dia)]);
  return {
    alertas: [...p.alertas.map((a): Alerta => ({ ...a, enlace: "/presupuestos" })), ...inv],
    enRiesgo: p.enRiesgo,
    prestamosVencidos: prest.filter((x) => x.calculo.vencido).length,
  };
}
