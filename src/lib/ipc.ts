// Bytes por el canal de Tauri: en escritorio van crudos; en Android el canal los pasa a JSON,
// así que se mandan como lista de números (Rust acepta las dos formas: adjuntos::bytes_cuerpo).
import { esAndroid } from "./plataforma";

export const cuerpoBytes = (b: Uint8Array): Uint8Array | number[] => (esAndroid ? Array.from(b) : b);

/** Respuesta binaria: ArrayBuffer en escritorio; en Android puede llegar como lista de números. */
export function aBytes(r: ArrayBuffer | Uint8Array | number[]): Uint8Array<ArrayBuffer> {
  if (Array.isArray(r)) return new Uint8Array(r);
  if (r instanceof Uint8Array) return new Uint8Array(r);
  return new Uint8Array(r);
}
