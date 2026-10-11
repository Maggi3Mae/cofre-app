// Orden, ancho y visibilidad de las tarjetas del Dashboard (se guarda en Ajustes).
import { guardarAjuste, leerAjuste } from "$lib/datos/ajustes";

export type IdTarjeta =
  | "patrimonio" | "ultimos" | "ingresos" | "egresos" | "balance"
  | "evolucion" | "categorias" | "comercios" | "cuotas" | "presupuestos" | "teDeben" | "proximos";

/** tercio = 1/3, media = 1/2, completa = todo el ancho. */
export type Ancho = "tercio" | "media" | "completa";

export interface ConfigTarjeta { id: IdTarjeta; ancho: Ancho; oculta: boolean }

export const nombresTarjeta: Record<IdTarjeta, string> = {
  patrimonio: "Patrimonio neto", ultimos: "Últimos movimientos", ingresos: "Ingresos", egresos: "Egresos",
  balance: "Balance", evolucion: "Evolución", categorias: "Top categorías", comercios: "Top comercios",
  cuotas: "Cuotas de tarjetas por pagar", presupuestos: "Presupuestos del mes", teDeben: "Te deben", proximos: "Próximos pagos",
};

/** Anchos que permite cada tarjeta (las de un solo número aceptan tercio). */
export const anchosPermitidos: Record<IdTarjeta, Ancho[]> = {
  patrimonio: ["media", "completa"], ultimos: ["media", "completa"],
  ingresos: ["tercio", "media", "completa"], egresos: ["tercio", "media", "completa"], balance: ["tercio", "media", "completa"],
  evolucion: ["media", "completa"], categorias: ["media", "completa"], comercios: ["media", "completa"], cuotas: ["media", "completa"],
  presupuestos: ["media", "completa"], teDeben: ["media", "completa"], proximos: ["media", "completa"],
};

export const PREDETERMINADO: ConfigTarjeta[] = [
  { id: "patrimonio", ancho: "completa", oculta: false },
  { id: "ingresos", ancho: "tercio", oculta: false },
  { id: "egresos", ancho: "tercio", oculta: false },
  { id: "balance", ancho: "tercio", oculta: false },
  { id: "evolucion", ancho: "completa", oculta: false },
  { id: "categorias", ancho: "media", oculta: false },
  { id: "comercios", ancho: "media", oculta: false },
  { id: "presupuestos", ancho: "media", oculta: false },
  { id: "teDeben", ancho: "media", oculta: false },
  { id: "proximos", ancho: "media", oculta: false },
  { id: "ultimos", ancho: "completa", oculta: false },
  { id: "cuotas", ancho: "completa", oculta: false },
];

/** Lee la configuración guardada; agrega tarjetas nuevas al final y descarta las que ya no existen. */
export async function leerTarjetas(): Promise<ConfigTarjeta[]> {
  let guardado: ConfigTarjeta[] = [];
  try {
    guardado = JSON.parse((await leerAjuste("orden_dashboard")) ?? "[]");
  } catch { /* configuración dañada: se usa la predeterminada */ }
  const validos = guardado.filter((t) => t && t.id in nombresTarjeta && anchosPermitidos[t.id].includes(t.ancho));
  const faltan = PREDETERMINADO.filter((p) => !validos.some((t) => t.id === p.id));
  return validos.length ? [...validos, ...faltan] : PREDETERMINADO.map((t) => ({ ...t }));
}

export async function guardarTarjetas(t: ConfigTarjeta[]): Promise<void> {
  await guardarAjuste("orden_dashboard", JSON.stringify(t.map(({ id, ancho, oculta }) => ({ id, ancho, oculta }))));
}
