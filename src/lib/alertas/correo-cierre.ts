// Correo «Cierre del mes»: mismo marco y colores que el de alertas (tablas y estilos en línea, sin imágenes).
import { C, esc, marcoCorreo } from "./correo";
import type { CierreMes } from "$lib/datos/cierre";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const nombreMes = (mes: number) => MESES[mes - 1];
export const asuntoCierre = (c: Pick<CierreMes, "ano" | "mes">) => `Cofre: tu cierre de ${nombreMes(c.mes)} ${c.ano}`;

type Pesos = (centavos: number) => string;

const pct = (v: number) => `${(v * 100).toLocaleString("es-CO", { maximumFractionDigits: 0 })} %`;
/** «+12 %» / «−5 %». */
const cambio = (v: number | null) => (v == null ? "" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${pct(Math.abs(v))}`);

function chip(texto: string, color: string, suave: string) {
  return `<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:${suave};color:${color};font-size:11px;font-weight:700;">${esc(texto)}</span>`;
}

function tarjeta(titulo: string, cuerpo: string) {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;background:#FFFFFF;border-radius:14px;border:1px solid ${C.linea};">
  <tr><td style="padding:16px 18px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.tinta2};">${esc(titulo)}</div>
    ${cuerpo}
  </td></tr>
</table>`;
}

const fila = (izq: string, der: string, extra = "") =>
  `<tr><td style="padding:6px 0;font-size:14px;line-height:20px;border-top:1px solid ${C.linea};">${izq}${extra}</td>` +
  `<td align="right" style="padding:6px 0;font-size:14px;line-height:20px;font-weight:700;white-space:nowrap;border-top:1px solid ${C.linea};">${der}</td></tr>`;
const tabla = (filas: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">${filas}</table>`;
const barra = (v: number, color: string) =>
  `<div style="margin-top:4px;height:5px;border-radius:999px;background:${C.pista};overflow:hidden;"><div style="width:${Math.max(0, Math.min(100, v * 100)).toFixed(1)}%;height:5px;background:${color};"></div></div>`;

export function cierreHtml(c: CierreMes, pesos: Pesos): string {
  const a = c.actual;
  // Egresos que suben = malo (rojo); ingresos que suben = bueno (jade).
  const chipVar = (v: number | null, subirEsBueno: boolean) => {
    if (v == null || v === 0) return "";
    const bueno = (v > 0) === subirEsBueno;
    return " " + chip(cambio(v), bueno ? C.ingreso : C.over, bueno ? C.ingresoSuave : C.overSuave);
  };
  const kpi = (et: string, valor: string, color: string, extra: string) =>
    `<td width="33%" style="padding:4px 6px 4px 0;vertical-align:top;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.tinta2};">${et}</div>
      <div style="margin-top:4px;font-size:18px;line-height:24px;font-weight:700;color:${color};white-space:nowrap;">${valor}</div>
      <div style="margin-top:2px;">${extra}</div></td>`;

  const partes: string[] = [];
  partes.push(tarjeta(`Resumen vs ${nombreMes(c.mes === 1 ? 12 : c.mes - 1)}`, `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><tr>
      ${kpi("Entró", pesos(a.ingresos), C.ingreso, chipVar(c.varIngresos, true))}
      ${kpi("Salió", pesos(a.egresos), C.tinta, chipVar(c.varEgresos, false))}
      ${kpi("Balance", `${a.balance < 0 ? "−" : ""}${pesos(Math.abs(a.balance))}`, a.balance < 0 ? C.over : C.marcaTexto,
        a.tasaAhorro != null ? `<span style="font-size:12px;color:${C.tinta2};">Ahorraste ${pct(Math.max(0, a.tasaAhorro))}</span>` : "")}
    </tr></table>`));

  if (c.top.length) {
    partes.push(tarjeta("Dónde se fue la plata", tabla(c.top.map((t) =>
      fila(esc(t.nombre), pesos(t.total), barra(t.porcentaje, C.marca))).join(""))));
  }
  if (c.crecieron.length) {
    partes.push(tarjeta("Lo que más creció", tabla(c.crecieron.map((t) =>
      fila(esc(t.nombre), `+${pesos(t.total - t.antes)}`, `<div style="font-size:12px;color:${C.tinta2};">${pesos(t.antes)} → ${pesos(t.total)}</div>`)).join(""))));
  }
  if (c.presupuestos.total) {
    const p = c.presupuestos;
    const titulo = `<div style="margin-top:8px;font-size:16px;line-height:22px;font-weight:700;">Cumpliste ${p.cumplidos} de ${p.total}</div>`;
    const exc = p.excedidos.length
      ? tabla(p.excedidos.map((e) => fila(esc(e.nombre), `<span style="color:${C.over};">+${pesos(e.gastado - e.limite)}</span>`,
          `<div style="font-size:12px;color:${C.tinta2};">${pesos(e.gastado)} de ${pesos(e.limite)}</div>`)).join(""))
      : `<div style="margin-top:4px;font-size:14px;color:${C.ingreso};">Ninguno se pasó del tope.</div>`;
    partes.push(tarjeta("Presupuestos", titulo + exc));
  }
  const extras: string[] = [];
  if (c.recurrentes.registrados) extras.push(fila("Recurrentes registrados", `${c.recurrentes.registrados} · ${pesos(c.recurrentes.monto)}`));
  if (c.recurrentes.sinConfirmar) extras.push(fila(`<span style="color:${C.w80};">Recurrentes sin confirmar</span>`, String(c.recurrentes.sinConfirmar)));
  if (c.patrimonio) {
    const v = c.patrimonio.cambio;
    extras.push(fila(`Patrimonio al cierre`, pesos(c.patrimonio.cierre),
      v ? ` ${chip(`${v > 0 ? "+" : "−"}${pesos(Math.abs(v))}`, v > 0 ? C.ingreso : C.over, v > 0 ? C.ingresoSuave : C.overSuave)}` : ""));
    if (c.patrimonio.teDeben) extras.push(fila("Te deben", pesos(c.patrimonio.teDeben)));
  }
  if (extras.length) partes.push(tarjeta("Además", tabla(extras.join(""))));
  if (c.usdSinTrm) partes.push(`<div style="padding:0 4px 8px;font-size:12px;color:${C.w80};">Hay cuentas en dólares sin TRM: no se sumaron.</div>`);

  const sub = a.movimientos ? `${a.movimientos} movimientos` : "Sin movimientos este mes";
  return marcoCorreo(`Tu cierre de ${nombreMes(c.mes)}`, partes.join(""), "Abre Cofre → Reportes para ver el detalle.", `${sub} · ${c.ano}`);
}

export function cierreTexto(c: CierreMes, pesos: Pesos): string {
  const a = c.actual;
  const l: string[] = [`Tu cierre de ${nombreMes(c.mes)} ${c.ano}`, ""];
  l.push(`Entró: ${pesos(a.ingresos)} ${cambio(c.varIngresos)}`.trim());
  l.push(`Salió: ${pesos(a.egresos)} ${cambio(c.varEgresos)}`.trim());
  l.push(`Balance: ${a.balance < 0 ? "−" : ""}${pesos(Math.abs(a.balance))}${a.tasaAhorro != null ? ` (ahorraste ${pct(Math.max(0, a.tasaAhorro))})` : ""}`);
  if (c.top.length) l.push("", "Dónde se fue la plata:", ...c.top.map((t) => `· ${t.nombre}: ${pesos(t.total)} (${pct(t.porcentaje)})`));
  if (c.crecieron.length) l.push("", "Lo que más creció:", ...c.crecieron.map((t) => `· ${t.nombre}: ${pesos(t.antes)} → ${pesos(t.total)}`));
  if (c.presupuestos.total) {
    l.push("", `Presupuestos: cumpliste ${c.presupuestos.cumplidos} de ${c.presupuestos.total}`);
    l.push(...c.presupuestos.excedidos.map((e) => `· ${e.nombre}: se pasó ${pesos(e.gastado - e.limite)}`));
  }
  if (c.recurrentes.registrados) l.push("", `Recurrentes registrados: ${c.recurrentes.registrados} (${pesos(c.recurrentes.monto)})`);
  if (c.recurrentes.sinConfirmar) l.push(`Recurrentes sin confirmar: ${c.recurrentes.sinConfirmar}`);
  if (c.patrimonio) {
    l.push(`Patrimonio al cierre: ${pesos(c.patrimonio.cierre)} (${c.patrimonio.cambio >= 0 ? "+" : "−"}${pesos(Math.abs(c.patrimonio.cambio))})`);
    if (c.patrimonio.teDeben) l.push(`Te deben: ${pesos(c.patrimonio.teDeben)}`);
  }
  l.push("", "— Cofre");
  return l.join("\n");
}
