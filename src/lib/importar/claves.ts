// Claves de extractos en el llavero del sistema (Llavero de macOS), en una sola entrada:
// macOS pide permiso una vez por sesión y no una por banco. Nunca van a la base de datos.
import { invoke } from "@tauri-apps/api/core";
import { esEscritorio } from "$lib/plataforma";

export const guardarClave = (banco: string, clave: string) => invoke<void>("clave_guardar", { banco, clave });
export const borrarClave = (banco: string) => invoke<void>("clave_borrar", { banco });

/** Claves guardadas: antes de abrir el PDF no se sabe de qué banco es, así que se prueban todas. */
export async function clavesGuardadas(): Promise<{ banco: string; clave: string }[]> {
  if (!esEscritorio) return []; // en Android no hay Llavero
  const todas = await invoke<Record<string, string>>("claves_todas");
  return Object.entries(todas).map(([banco, clave]) => ({ banco, clave }));
}
