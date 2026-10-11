import { invoke } from "@tauri-apps/api/core";
import { esEscritorio } from "$lib/plataforma";
import { db } from "$lib/db";
import { hoy } from "$lib/formato";

const U = 1;

/** Claves conocidas de ajustes. */
export type ClaveAjuste = "trm" | "trm_info" | "trm_auto" | "orden_dashboard" | "nombre" | "correo" | "ultima_cuenta" | "sin_categoria_descartado" | "patrimonio_oculto" | "sinc_estado"
  | "notif_presupuestos" | "notif_inversiones" | "notif_medeben" | "suscripciones_descartadas" | "copias" | "pago_lineas" | "pago_qr" | "resumen_opciones";

export async function leerAjuste(clave: ClaveAjuste): Promise<string | null> {
  const [f] = await (await db()).select<{ valor: string }[]>(
    "SELECT valor FROM ajustes WHERE usuario_id=$1 AND clave=$2", [U, clave]);
  return f?.valor ?? null;
}

export async function guardarAjuste(clave: ClaveAjuste, valor: string): Promise<void> {
  await (await db()).execute(
    `INSERT INTO ajustes (usuario_id, clave, valor) VALUES ($1,$2,$3)
     ON CONFLICT (usuario_id, clave) DO UPDATE SET valor = excluded.valor`,
    [U, clave, valor],
  );
}

/** TRM en pesos por dólar (null si aún no se ha configurado). */
export async function leerTrm(): Promise<number | null> {
  const v = await leerAjuste("trm");
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function guardarTrm(pesosPorDolar: number): Promise<void> {
  if (!Number.isFinite(pesosPorDolar) || pesosPorDolar <= 0) throw new Error("La TRM debe ser mayor que cero.");
  await guardarAjuste("trm", String(pesosPorDolar));
}

// ---------- TRM oficial (datos.gov.co) ----------

/** De dónde salió la TRM guardada. Sin info = escrita a mano. */
export interface TrmInfo { desde: string; hasta: string; actualizada: string }

export async function leerTrmInfo(): Promise<TrmInfo | null> {
  try { return JSON.parse((await leerAjuste("trm_info")) ?? "null"); } catch { return null; }
}

/** TRM escrita a mano: deja de mostrarse como oficial. */
export async function guardarTrmManual(pesosPorDolar: number): Promise<void> {
  const antes = await leerTrm();
  await guardarTrm(pesosPorDolar);
  if (antes !== pesosPorDolar) await guardarAjuste("trm_info", "null");
}

/** Consulta la TRM vigente hoy y la guarda. Lanza un error legible si no hay internet. */
export async function actualizarTrm(): Promise<{ valor: number } & TrmInfo> {
  const r = await invoke<{ valor: number; desde: string; hasta: string }>("trm_consultar", { hoy: hoy() });
  await guardarTrm(r.valor);
  const info: TrmInfo = { desde: r.desde, hasta: r.hasta, actualizada: hoy() };
  await guardarAjuste("trm_info", JSON.stringify(info));
  return { valor: r.valor, ...info };
}

export async function leerTrmAuto(): Promise<boolean> {
  return (await leerAjuste("trm_auto")) === "1";
}

export async function guardarTrmAuto(activa: boolean): Promise<void> {
  await guardarAjuste("trm_auto", activa ? "1" : "0");
}

/** Al abrir y en la revisión diaria: si está activa y la guardada no cubre hoy, la actualiza (sin errores). */
export async function actualizarTrmSiToca(): Promise<void> {
  try {
    if (!esEscritorio || !(await leerTrmAuto())) return; // en Android la TRM llega del Mac
    const info = await leerTrmInfo();
    const h = hoy();
    if (info && info.desde <= h && h <= info.hasta) return;
    await actualizarTrm();
  } catch { /* sin internet: se queda la TRM guardada */ }
}

/** Correo de alertas (la clave va en el Llavero, nunca aquí). */
/** `cierre`: además, el resumen del mes anterior en los primeros días de cada mes. */
export interface AjustesCorreo { activo: boolean; servidor: string; puerto: number; usuario: string; destino: string; cierre?: boolean }

export const CORREO_VACIO: AjustesCorreo = { activo: false, servidor: "smtp.gmail.com", puerto: 587, usuario: "", destino: "" };

export async function leerCorreo(): Promise<AjustesCorreo> {
  try {
    return { ...CORREO_VACIO, ...JSON.parse((await leerAjuste("correo")) ?? "{}") };
  } catch {
    return { ...CORREO_VACIO };
  }
}

export async function guardarCorreo(c: AjustesCorreo): Promise<void> {
  await guardarAjuste("correo", JSON.stringify(c));
}

export async function leerNombre(): Promise<string> {
  return (await leerAjuste("nombre"))?.trim() ?? "";
}

// ---------- Última cuenta usada (formulario de movimiento) ----------

let ultimaCuenta: number | null = null;
leerAjuste("ultima_cuenta")
  .then((v) => { ultimaCuenta = v ? Number(v) || null : null; })
  .catch(() => {});

/** Última cuenta con la que se registró un movimiento (null si aún no hay). */
export function ultimaCuentaUsada(): number | null {
  return ultimaCuenta;
}

export async function recordarUltimaCuenta(id: number): Promise<void> {
  ultimaCuenta = id;
  await guardarAjuste("ultima_cuenta", String(id)).catch(() => {});
}

// ---------- Ojito del patrimonio (Dashboard) ----------

/** true si la usuaria ocultó los montos de la tarjeta Patrimonio. */
export async function leerPatrimonioOculto(): Promise<boolean> {
  return (await leerAjuste("patrimonio_oculto")) === "1";
}

export async function guardarPatrimonioOculto(oculto: boolean): Promise<void> {
  await guardarAjuste("patrimonio_oculto", oculto ? "1" : "0");
}

// ---------- Datos para pagarte (resumen de «Me deben»; se comparten con los otros equipos) ----------

export interface DatosPago {
  /** Hasta 2 líneas, p. ej. «Nequi · 300 123 4567», «Llave Bre-B: @tu-llave». */
  lineas: string[];
  /** Foto del QR de pago (WebP en la carpeta de fotos de la app) o null. */
  qr: string | null;
}

export async function leerDatosPago(): Promise<DatosPago> {
  let lineas: string[] = [];
  try { lineas = JSON.parse((await leerAjuste("pago_lineas")) ?? "[]"); } catch { /* vacío */ }
  const qr = (await leerAjuste("pago_qr")) || null;
  return { lineas: lineas.filter((l) => typeof l === "string" && l.trim()).slice(0, 2), qr };
}

export async function guardarDatosPago(d: DatosPago): Promise<void> {
  await guardarAjuste("pago_lineas", JSON.stringify(d.lineas.map((l) => l.trim()).filter(Boolean).slice(0, 2)));
  await guardarAjuste("pago_qr", d.qr ?? "");
}
