// Colores de categoría: los 4 roles de tesela del sistema Cofre (cf-tile--*).
// Se guarda la clave del rol, no un hex, para que se adapte al tema claro/oscuro.
export const paleta = {
  marca: { clase: "cf-tile--brand", nombre: "Violeta" },
  ingreso: { clase: "cf-tile--income", nombre: "Jade" },
  egreso: { clase: "cf-tile--expense", nombre: "Frambuesa" },
  ahorro: { clase: "cf-tile--saving", nombre: "Oro" },
} as const;

export type ClaveColor = keyof typeof paleta;
export const clavesColor = Object.keys(paleta) as ClaveColor[];

/** Clase de tesela para una clave guardada (marca si no hay o no es válida). */
export function claseTesela(clave: string | null | undefined): string {
  return (paleta[clave as ClaveColor] ?? paleta.marca).clase;
}
