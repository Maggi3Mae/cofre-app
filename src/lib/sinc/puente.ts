// Puente entre el motor de sincronización (motor.ts) y la red (Rust, src-tauri/src/sinc.rs).
// · Mac (centro): Rust recibe la solicitud cifrada y la pasa con el evento «sinc-solicitud»; aquí se
//   responde con el motor y se devuelve con `sinc_respuesta`.
// · Celular / tablet: `sincronizarAhora` manda sus cambios, aplica los del Mac y luego mueve las fotos.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { db } from "$lib/db";
import { avisarCambio } from "$lib/datos/cambios";
import { leerAjuste, guardarAjuste } from "$lib/datos/ajustes";
import { esEscritorio } from "$lib/plataforma";
import { responder, sincronizar, tieneDatos, type Conexion, type EstadoEquipo, type Respuesta, type Solicitud } from "./motor";

async function conexion(): Promise<Conexion> {
  const d = await db();
  return {
    select: (sql, p) => d.select(sql, p) as never,
    execute: (sql, p) => d.execute(sql, p),
  };
}

// ---------- Centro (Mac) ----------

let cola: Promise<unknown> = Promise.resolve(); // una solicitud a la vez

/** Atiende las solicitudes de los equipos. Devuelve la limpieza. */
export async function iniciarCentro(): Promise<() => void> {
  if (!esEscritorio) return () => {};
  return listen<{ req: number; equipo: string; solicitud: Solicitud }>("sinc-solicitud", (e) => {
    cola = cola.then(async () => {
      try {
        const respuesta = await responder(await conexion(), e.payload.solicitud);
        await invoke("sinc_respuesta", { req: e.payload.req, respuesta, error: null });
        if (e.payload.solicitud.paquete.filas.length || e.payload.solicitud.paquete.borrados.length) avisarCambio();
      } catch (err) {
        await invoke("sinc_respuesta", { req: e.payload.req, respuesta: null, error: String(err) }).catch(() => {});
      }
    });
  });
}

// ---------- Equipo (celular / tablet) ----------

export interface EstadoSinc {
  id: string;
  centro: { nombre: string; direccion: string; puerto: number } | null;
  equipos: { id: string; nombre: string; emparejado_en: string; visto_en: string | null }[];
  servidor: { puerto: number; ips: string[] } | null;
  codigo: string | null;
}
export const estadoSinc = () => invoke<EstadoSinc>("sinc_estado");

export interface MacEncontrado { id: string; nombre: string; direccion: string; puerto: number }
export const buscarMac = () => invoke<MacEncontrado[]>("sinc_buscar");

/** Empareja con el Mac. La próxima sincronización trae todo del Mac (reemplaza los datos de aquí). */
export async function emparejar(direccion: string, puerto: number, codigo: string, nombre: string): Promise<string> {
  const mac = await invoke<string>("sinc_emparejar", { direccion, puerto, codigo, nombre });
  await guardarEstado({ cursor: null, enviado: null });
  return mac;
}

export async function olvidarMac(): Promise<void> {
  await invoke("sinc_olvidar_centro");
  await guardarEstado({ cursor: null, enviado: null });
}

/** ¿La primera sincronización borraría datos propios de este equipo? */
export async function primeraBorraDatos(): Promise<boolean> {
  const e = await leerEstado();
  return e.cursor == null && (await tieneDatos(await conexion()));
}

async function leerEstado(): Promise<EstadoEquipo> {
  try {
    const e = JSON.parse((await leerAjuste("sinc_estado")) ?? "{}");
    return { cursor: e.cursor ?? null, enviado: e.enviado ?? null };
  } catch {
    return { cursor: null, enviado: null };
  }
}
const guardarEstado = (e: EstadoEquipo & { ultima?: string }) => guardarAjuste("sinc_estado", JSON.stringify(e));

export async function ultimaSincronizacion(): Promise<string | null> {
  try { return JSON.parse((await leerAjuste("sinc_estado")) ?? "{}").ultima ?? null; } catch { return null; }
}

let enCurso: Promise<{ recibidas: number; fotos: number }> | null = null;

/** Sincroniza con el Mac (una a la vez). Lanza error con un mensaje para mostrar si no se pudo. */
export function sincronizarAhora(): Promise<{ recibidas: number; fotos: number }> {
  return (enCurso ??= (async () => {
    try {
      const con = await conexion();
      const r = await sincronizar(con, await leerEstado(), (s) => invoke<Respuesta>("sinc_enviar", { solicitud: s }));
      await guardarEstado({ ...r.estado, ultima: new Date().toISOString() });
      const nombres = (await con.select<{ adjunto: string }>(
        `SELECT DISTINCT adjunto FROM transacciones WHERE adjunto IS NOT NULL
         UNION SELECT valor FROM ajustes WHERE clave = 'pago_qr' AND valor <> ''`)).map((f) => f.adjunto);
      const f = nombres.length ? await invoke<{ bajadas: number; subidas: number }>("sinc_fotos", { nombres }) : { bajadas: 0, subidas: 0 };
      if (r.recibidas || f.bajadas) avisarCambio();
      return { recibidas: r.recibidas, fotos: f.bajadas + f.subidas };
    } finally {
      enCurso = null;
    }
  })());
}
