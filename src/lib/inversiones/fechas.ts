import { aFecha } from "$lib/periodo";

const fmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
/** «2 oct 2026» */
export const fechaLarga = (f: string) => fmt.format(aFecha(f)).replace(/\./g, "").replace(/ de /g, " ");
