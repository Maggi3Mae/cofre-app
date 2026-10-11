// Notificaciones en Android (celular y tablet). Cofre no corre en segundo plano, así que hay dos clases:
// - al momento: presupuestos que pasan del 80/90/100 % mientras usas la app (además del toast);
// - programadas: fechas que ya se conocen (CDT y «Me deben") quedan agendadas en Android y llegan
//   aunque Cofre esté cerrado. Se reprograman cada vez que cambian los datos (también al sincronizar).
// Las preferencias son de cada equipo (no se sincronizan).
import {
  Schedule, sendNotification, cancel, isPermissionGranted, requestPermission, createChannel, Importance,
} from "@tauri-apps/plugin-notification";
import { esAndroid } from "$lib/plataforma";
import { hoy, pesos } from "$lib/formato";
import { leerAjuste, guardarAjuste } from "$lib/datos/ajustes";
import { listarCdts } from "$lib/datos/cdts";
import { listarPrestamos } from "$lib/datos/medeben";
import type { TipoAlerta } from "$lib/datos/alertas";
import { sumarDias } from "$lib/inversiones/calculo";

export type TipoNotif = "presupuestos" | "inversiones" | "medeben";
export const tiposNotif: { id: TipoNotif; nombre: string; detalle: string }[] = [
  { id: "presupuestos", nombre: "Presupuestos", detalle: "Al 80, 90 y 100 % cuando registras un gasto" },
  { id: "inversiones", nombre: "CDT y cajitas", detalle: "Una semana antes y el día que vence un CDT" },
  { id: "medeben", nombre: "Me deben", detalle: "El día que alguien debía pagarte" },
];

const CANAL = "cofre";
// Ícono pequeño (res/drawable/ic_notificacion.xml) y color, en cada notificación: el complemento no acepta
// configuración en tauri.conf.json (en Android la app no arranca si se pone ahí).
const ICONO = { icon: "ic_notificacion", iconColor: "#6236E0" };
const HORA = 9; // las programadas llegan a las 9 a. m.
const MAX_PROGRAMADAS = 60;
const GUARDADAS = "cofre-notif-programadas";

export const tipoDeAlerta = (t: TipoAlerta): TipoNotif =>
  t === "presupuesto" || t === "ritmo" ? "presupuestos" : t === "prestamo" ? "medeben" : "inversiones";

export async function leerPrefsNotif(): Promise<Record<TipoNotif, boolean>> {
  const r = {} as Record<TipoNotif, boolean>;
  for (const t of tiposNotif) r[t.id] = (await leerAjuste(`notif_${t.id}` as const).catch(() => null)) !== "0";
  return r;
}

export async function guardarPrefNotif(t: TipoNotif, activo: boolean): Promise<void> {
  await guardarAjuste(`notif_${t}` as const, activo ? "1" : "0");
  await programarAvisos();
}

let canalListo = false;
async function canal() {
  if (canalListo) return;
  await createChannel({ id: CANAL, name: "Avisos de Cofre", description: "Presupuestos, CDT y Me deben", importance: Importance.High, vibration: true });
  canalListo = true;
}

/** ¿Hay permiso? Con `pedir`, lo solicita (Android 13+ muestra el diálogo del sistema). */
export async function permisoNotif(pedir = false): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    return pedir ? (await requestPermission()) === "granted" : false;
  } catch {
    return false;
  }
}

/** Notificación al momento (solo si su tipo está activo y hay permiso). */
export async function notificarAndroid(titulo: string, cuerpo: string, tipo?: TipoNotif): Promise<boolean> {
  if (!esAndroid) return false;
  if (tipo && !(await leerPrefsNotif())[tipo]) return false;
  if (!(await permisoNotif())) return false;
  try {
    await canal();
    sendNotification({ title: titulo, body: cuerpo, channelId: CANAL, ...ICONO });
    return true;
  } catch {
    return false;
  }
}

/** Id de 31 bits estable a partir de una clave (para poder cancelar y reprogramar). */
function idDe(clave: string): number {
  let h = 2166136261;
  for (let i = 0; i < clave.length; i++) h = Math.imul(h ^ clave.charCodeAt(i), 16777619);
  return (h >>> 1) || 1;
}

const aLas = (fecha: string) => new Date(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10), HORA, 0, 0);

interface Programada { clave: string; cuando: Date; titulo: string; cuerpo: string }

async function calcular(prefs: Record<TipoNotif, boolean>): Promise<Programada[]> {
  const dia = hoy();
  const lista: Programada[] = [];
  if (prefs.inversiones) {
    for (const c of await listarCdts(dia)) {
      if (c.retirado_en || c.renovado) continue;
      const v = c.calculo.vencimiento;
      lista.push({ clave: `cdt|${c.id}|${v}|7`, cuando: aLas(sumarDias(v, -7)), titulo: `${c.nombre} vence en 7 días`,
        cuerpo: `Recibirás ${pesos(c.calculo.totalNetoVencimiento)}. Piensa si lo retiras o lo renuevas.` });
      lista.push({ clave: `cdt|${c.id}|${v}|0`, cuando: aLas(v), titulo: `${c.nombre} vence hoy`,
        cuerpo: c.renovacion_auto ? "Se renueva solo." : `Retira ${pesos(c.calculo.totalNetoVencimiento)} o renuévalo.` });
    }
  }
  if (prefs.medeben) {
    for (const p of await listarPrestamos(null, dia)) {
      if (p.calculo.estado !== "activo") continue;
      const fechas = p.calculo.cuotas.length
        ? p.calculo.cuotas.filter((q) => q.estado !== "pagada").map((q) => ({ fecha: q.fecha, monto: q.monto - q.abonado, n: q.numero }))
        : p.fecha_acordada ? [{ fecha: p.fecha_acordada, monto: p.calculo.pendiente, n: 0 }] : [];
      for (const f of fechas) {
        lista.push({ clave: `prestamo|${p.id}|${f.n}|${f.fecha}`, cuando: aLas(f.fecha), titulo: `Hoy ${p.persona} debía pagarte`,
          cuerpo: `${pesos(f.monto)}${p.descripcion ? ` · ${p.descripcion}` : ""}${f.n ? ` (cuota ${f.n})` : ""}` });
      }
    }
  }
  const ya = Date.now() + 60_000;
  return lista.filter((x) => x.cuando.getTime() > ya).sort((a, b) => +a.cuando - +b.cuando).slice(0, MAX_PROGRAMADAS);
}

let programando: Promise<number> | null = null;

/** Rehace las notificaciones programadas (Android). Devuelve cuántas quedaron. */
export function programarAvisos(): Promise<number> {
  if (!esAndroid) return Promise.resolve(0);
  return (programando ??= (async () => {
    try {
      let previas: number[] = [];
      try { previas = JSON.parse(localStorage.getItem(GUARDADAS) ?? "[]"); } catch { /* sin lista */ }
      if (previas.length) await cancel(previas).catch(() => {});
      if (!(await permisoNotif())) { localStorage.setItem(GUARDADAS, "[]"); return 0; }
      await canal();
      const lista = await calcular(await leerPrefsNotif());
      for (const x of lista) {
        sendNotification({ id: idDe(x.clave), title: x.titulo, body: x.cuerpo, channelId: CANAL, ...ICONO, schedule: Schedule.at(x.cuando, false, true) });
      }
      try { localStorage.setItem(GUARDADAS, JSON.stringify(lista.map((x) => idDe(x.clave)))); } catch { /* sin almacenamiento */ }
      return lista.length;
    } catch {
      return 0;
    } finally {
      programando = null;
    }
  })());
}
