// Copias de seguridad cifradas (solo Mac): base + fotos en un archivo .cofre en la carpeta elegida.
// El cifrado y los archivos los maneja Rust (src-tauri/src/copias.rs); aquí la configuración y el ritmo.
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { db } from "$lib/db";
import { leerAjuste, guardarAjuste } from "$lib/datos/ajustes";
import { esEscritorio } from "$lib/plataforma";

export interface ConfigCopias {
  activa: boolean;
  carpeta: string | null;
  /** ISO (UTC) de la última copia hecha. */
  ultima: string | null;
}
export interface CopiaHecha { archivo: string; bytes: number; fotos: number; borradas: number }
export interface CopiaEnCarpeta { nombre: string; ruta: string; bytes: number }

const NOMBRE_CLAVE = "copias";
/** La copia automática se hace si la última tiene más de esto. */
const CADA_MS = 20 * 3600 * 1000;

export async function leerConfigCopias(): Promise<ConfigCopias> {
  try {
    return { activa: false, carpeta: null, ultima: null, ...JSON.parse((await leerAjuste("copias")) ?? "{}") };
  } catch {
    return { activa: false, carpeta: null, ultima: null };
  }
}
export async function guardarConfigCopias(c: ConfigCopias): Promise<void> {
  await guardarAjuste("copias", JSON.stringify(c));
}

export const tieneContrasena = () => invoke<boolean>("clave_existe", { nombre: NOMBRE_CLAVE });
export const guardarContrasena = (clave: string) => invoke<void>("copia_clave_guardar", { clave });

export async function elegirCarpeta(actual: string | null): Promise<string | null> {
  const r = await open({ directory: true, multiple: false, defaultPath: actual ?? undefined, title: "Carpeta para las copias de Cofre" });
  return typeof r === "string" ? r : null;
}

export async function elegirArchivoCopia(carpeta: string | null): Promise<string | null> {
  const r = await open({
    multiple: false, directory: false, defaultPath: carpeta ?? undefined, title: "Copia de Cofre para restaurar",
    filters: [{ name: "Copia de Cofre", extensions: ["cofre"] }],
  });
  return typeof r === "string" ? r : null;
}

const dos = (n: number) => String(n).padStart(2, "0");
function sello(d = new Date()): string {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}`;
}

let enCurso: Promise<CopiaHecha> | null = null;

/** Copia ahora: VACUUM INTO (copia consistente aunque la app esté en uso) → Rust la cifra con las fotos. */
export function hacerCopia(): Promise<CopiaHecha> {
  return (enCurso ??= (async () => {
    try {
      const c = await leerConfigCopias();
      if (!c.carpeta) throw new Error("Elige la carpeta de las copias.");
      const base = await invoke<string>("copia_ruta_base");
      // La ruta la arma Rust (carpeta privada de la app); se escapan las comillas por si acaso.
      await (await db()).execute(`VACUUM INTO '${base.replace(/'/g, "''")}'`);
      const r = await invoke<CopiaHecha>("copia_hacer", { carpeta: c.carpeta, base, ahora: sello() });
      await guardarConfigCopias({ ...(await leerConfigCopias()), ultima: new Date().toISOString() });
      return r;
    } finally {
      enCurso = null;
    }
  })());
}

/** Copia automática (al abrir y en la revisión diaria) si está activa y ya pasaron 20 h. null = no tocaba. */
export async function copiaSiToca(): Promise<CopiaHecha | null> {
  if (!esEscritorio) return null;
  const c = await leerConfigCopias();
  if (!c.activa || !c.carpeta) return null;
  if (c.ultima && Date.now() - Date.parse(c.ultima) < CADA_MS) return null;
  return hacerCopia();
}

export const listarCopias = (carpeta: string) => invoke<CopiaEnCarpeta[]>("copia_listar", { carpeta });

/** Descifra y deja lista la copia; luego `reiniciarParaRestaurar` cambia los datos al volver a abrir. */
export const prepararRestauracion = (archivo: string, clave: string) =>
  invoke<{ fotos: number }>("copia_preparar_restauracion", { archivo, clave });
export const reiniciarParaRestaurar = () => invoke<void>("copia_reiniciar");

/** «Cofre-2026-10-09-0815.cofre» → Date local. */
export function fechaDeCopia(nombre: string): Date | null {
  const m = nombre.match(/^Cofre-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.cofre$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

export function tamano(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
}
