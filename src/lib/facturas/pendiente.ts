// Foto elegida en Importar que debe abrirse en Transacciones (no se puede pasar un archivo por la URL).
let archivo: File | null = null;
export const dejarFactura = (f: File) => { archivo = f; };
export function tomarFactura(): File | null {
  const f = archivo;
  archivo = null;
  return f;
}
