// Fotos adjuntas a movimientos: viven en la carpeta de datos de la app (adjuntos/), nunca en el repo.
// La base solo guarda el nombre del archivo.
import { invoke } from "@tauri-apps/api/core";
import { cuerpoBytes, aBytes } from "$lib/ipc";

/** Guarda los bytes WebP y devuelve el nombre del archivo. */
export const guardarAdjunto = (bytes: Uint8Array) => invoke<string>("adjunto_guardar", cuerpoBytes(bytes));

export async function leerAdjunto(nombre: string): Promise<Blob> {
  const datos = await invoke<ArrayBuffer | number[]>("adjunto_leer", { nombre });
  return new Blob([aBytes(datos)], { type: "image/webp" });
}

export const borrarAdjunto = (nombre: string) => invoke<void>("adjunto_borrar", { nombre }).catch(() => {});
