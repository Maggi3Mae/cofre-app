// Períodos de consulta (mismo selector del inicio) y agrupación de la lista.
import { hoy } from "./formato";

export type Periodo = "hoy" | "semana" | "mes" | "3meses" | "ano" | "todo" | "personalizado";

export const periodos: { id: Periodo; nombre: string }[] = [
  { id: "hoy", nombre: "Hoy" },
  { id: "semana", nombre: "Semana" },
  { id: "mes", nombre: "Mes" },
  { id: "3meses", nombre: "3 meses" },
  { id: "ano", nombre: "Año" },
  { id: "todo", nombre: "Todo" },
  { id: "personalizado", nombre: "Personalizado" },
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Fecha «AAAA-MM-DD» → Date local (sin desfase de zona horaria). */
export const aFecha = (s: string) => {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d);
};

/** Lunes de la semana de una fecha. */
export function lunes(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

/** Rango de fechas del período. Semana = lunes a hoy; Mes y Año = calendario actual. */
export function rango(p: Periodo, desde = "", hasta = ""): { desde?: string; hasta?: string } {
  const h = new Date();
  switch (p) {
    case "hoy": return { desde: hoy(), hasta: hoy() };
    case "semana": return { desde: iso(lunes(h)), hasta: hoy() };
    case "mes": return { desde: iso(new Date(h.getFullYear(), h.getMonth(), 1)), hasta: hoy() };
    case "3meses": return { desde: iso(new Date(h.getFullYear(), h.getMonth() - 2, 1)), hasta: hoy() };
    case "ano": return { desde: iso(new Date(h.getFullYear(), 0, 1)), hasta: hoy() };
    case "todo": return {};
    case "personalizado": return { desde: desde || undefined, hasta: hasta || undefined };
  }
}

/** Hoy, Semana y Mes se agrupan por día; los períodos largos, por semana. */
export function agruparPorSemana(p: Periodo, desde = "", hasta = ""): boolean {
  if (p === "personalizado") {
    if (!desde || !hasta) return true;
    return (aFecha(hasta).getTime() - aFecha(desde).getTime()) / 864e5 > 45;
  }
  return p === "3meses" || p === "ano" || p === "todo";
}

const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" });
const fmtCorto = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
const fmtCortoAno = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Hoy», «Ayer», «Viernes, 2 de octubre». */
export function nombreDia(fecha: string): string {
  const d = aFecha(fecha);
  const h = aFecha(hoy());
  const dias = Math.round((h.getTime() - d.getTime()) / 864e5);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Ayer";
  const t = fmtDia.format(d).replace(/^(\p{L}+)\s/u, "$1, ");
  return mayus(d.getFullYear() === h.getFullYear() ? t : `${t} de ${d.getFullYear()}`);
}

/** Clave de la semana (lunes) de una fecha. */
export const claveSemana = (fecha: string) => iso(lunes(aFecha(fecha)));

/** «Esta semana», «Semana del 28 sep al 4 oct». */
export function nombreSemana(lunesIso: string): string {
  const l = aFecha(lunesIso);
  if (lunesIso === iso(lunes(new Date()))) return "Esta semana";
  const d = new Date(l);
  d.setDate(d.getDate() + 6);
  const f = l.getFullYear() === new Date().getFullYear() ? fmtCorto : fmtCortoAno;
  return `Semana del ${fmtCorto.format(l)} al ${f.format(d)}`.replace(/\./g, "");
}

/** Fecha corta para filas: «2 oct». */
export const fechaCorta = (fecha: string) => fmtCorto.format(aFecha(fecha)).replace(/\./g, "");

/** Suma meses a una fecha sin desbordar (31 ene + 1 mes = 28/29 feb). */
function sumarMeses(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const ultimo = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), ultimo));
  return r;
}

/**
 * Período anterior de igual duración, para comparar.
 * Mes (1–4 oct) → 1–4 sep; Semana (lun–hoy) → mismos días de la semana pasada.
 */
export function rangoAnterior(p: Periodo, desde = "", hasta = ""): { desde: string; hasta: string; nombre: string } | null {
  const r = rango(p, desde, hasta);
  if (!r.desde || !r.hasta) return null;
  const d = aFecha(r.desde), h = aFecha(r.hasta);
  const atrasDias = (n: number) => {
    const a = new Date(d), b = new Date(h);
    a.setDate(a.getDate() - n); b.setDate(b.getDate() - n);
    return [a, b];
  };
  const atrasMeses = (n: number) => [sumarMeses(d, -n), sumarMeses(h, -n)];
  let par: Date[], nombre: string;
  switch (p) {
    case "hoy": par = atrasDias(1); nombre = "vs ayer"; break;
    case "semana": par = atrasDias(7); nombre = "vs semana pasada"; break;
    case "mes": par = atrasMeses(1); nombre = "vs mes pasado"; break;
    case "3meses": par = atrasMeses(3); nombre = "vs 3 meses anteriores"; break;
    case "ano": par = atrasMeses(12); nombre = "vs año pasado"; break;
    default: {
      const dias = Math.round((h.getTime() - d.getTime()) / 864e5) + 1;
      par = atrasDias(dias); nombre = "vs período anterior";
    }
  }
  return { desde: iso(par[0]), hasta: iso(par[1]), nombre };
}

/** Texto del período para el saludo: «este mes», «esta semana»… */
export function textoPeriodo(p: Periodo): string {
  return { hoy: "hoy", semana: "esta semana", mes: "este mes", "3meses": "en los últimos 3 meses",
    ano: "este año", todo: "desde el principio", personalizado: "en el período elegido" }[p];
}

const fmtMes = new Intl.DateTimeFormat("es-CO", { month: "short" });
const fmtMesAno = new Intl.DateTimeFormat("es-CO", { month: "short", year: "2-digit" });
const fmtMesLargo = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" });

/** Etiqueta corta de un mes «AAAA-MM»: «oct» o «oct 25» si no es de este año. */
export function nombreMesCorto(clave: string, conAno = false): string {
  const [a, m] = clave.split("-").map(Number);
  const d = new Date(a, m - 1, 1);
  return (conAno ? fmtMesAno : fmtMes).format(d).replace(/\./g, "");
}

/** «Octubre de 2026». */
export function nombreMesLargo(clave: string): string {
  const [a, m] = clave.split("-").map(Number);
  return mayus(fmtMesLargo.format(new Date(a, m - 1, 1)));
}
