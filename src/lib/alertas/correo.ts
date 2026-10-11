// Correo de alertas: HTML con el estilo de Cofre (tablas y estilos en línea, sin imágenes ni nada
// externo) y su versión en texto plano. Colores fijos del tema claro de design/tokens.json.
import type { Alerta } from "$lib/datos/alertas";

export type AlertaCorreo = Pick<Alerta, "nivel" | "titulo" | "cuerpo" | "progreso"> & { tipo: Alerta["tipo"] | "prueba" };

export const C = {
  bg: "#EEEAF8", superficie: "#F8F6FD", tinta: "#1C1530", tinta2: "#625A78", linea: "rgba(28,21,48,.08)", pista: "#EDE9F5",
  marca: "#6236E0", marcaTexto: "#4E27B8", marcaSuave: "#EDE6FF",
  ingreso: "#08776A", ingresoSuave: "#DCF3EE",
  w80: "#A14A00", w80Suave: "#FDEAD7", w90: "#B42F12", w90Suave: "#FDE2DA", over: "#9E0F2C", overSuave: "#FADDE2",
};
export const FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Color de la barra, fondo y texto de la etiqueta, y el texto de la etiqueta. */
function estilo(a: AlertaCorreo): { color: string; suave: string; texto: string; etiqueta: string } {
  if (a.tipo === "cdt") return { color: C.marca, suave: C.marcaSuave, texto: C.marcaTexto, etiqueta: "CDT" };
  if (a.tipo === "prestamo") return { color: C.marca, suave: C.marcaSuave, texto: C.marcaTexto, etiqueta: "Me deben · vencido" };
  if (a.tipo === "meta") return { color: C.ingreso, suave: C.ingresoSuave, texto: C.ingreso, etiqueta: "Cajita · meta" };
  if (a.tipo === "prueba") return { color: C.marca, suave: C.marcaSuave, texto: C.marcaTexto, etiqueta: "Prueba" };
  const [color, suave] = a.nivel === "over" ? [C.over, C.overSuave] : a.nivel === "w90" ? [C.w90, C.w90Suave] : [C.w80, C.w80Suave];
  const etiqueta = a.tipo === "ritmo"
    ? "Ritmo de gasto"
    : `Presupuesto${a.progreso != null ? ` · ${Math.round(a.progreso * 100)} %` : ""}`;
  return { color, suave, texto: color, etiqueta };
}

function tarjeta(a: AlertaCorreo): string {
  const e = estilo(a);
  const barra = a.progreso != null && a.tipo !== "ritmo"
    ? `<div style="margin-top:12px;height:6px;border-radius:999px;background:${C.pista};overflow:hidden;"><div style="width:${Math.max(0, Math.min(100, a.progreso * 100)).toFixed(1)}%;height:6px;background:${e.color};"></div></div>`
    : "";
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;background:#FFFFFF;border-radius:14px;border:1px solid ${C.linea};">
  <tr>
    <td width="6" style="width:6px;background:${e.color};border-radius:14px 0 0 14px;"></td>
    <td style="padding:16px 18px;">
      <span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${e.suave};color:${e.texto};font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${esc(e.etiqueta)}</span>
      <div style="margin-top:8px;font-size:16px;line-height:22px;font-weight:700;">${esc(a.titulo)}</div>
      <div style="margin-top:4px;font-size:14px;line-height:20px;color:${C.tinta2};">${esc(a.cuerpo)}</div>${barra}
    </td>
  </tr>
</table>`;
}

const fechaHoy = () => new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

/** Encabezado por defecto: «Tienes N alertas nuevas». */
export const tituloAlertas = (n: number) => `Tienes ${n} ${n === 1 ? "alerta nueva" : "alertas nuevas"}`;

export function correoHtml(alertas: AlertaCorreo[], encabezado = tituloAlertas(alertas.length)): string {
  return marcoCorreo(encabezado, alertas.map(tarjeta).join(""), "Abre Cofre en tu Mac para ver el detalle.");
}

/** Marco común de los correos de Cofre: encabezado violeta con la fecha, contenido y pie. */
export function marcoCorreo(encabezado: string, contenido: string, pie: string, subtitulo = ""): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(encabezado)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:${FUENTE};color:${C.tinta};">
  <tr><td style="border-radius:20px 20px 0 0;background:${C.marca};background-image:linear-gradient(135deg,#8A5CFF 0%,#6236E0 55%,#3B1D8C 100%);padding:28px 28px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);text-align:center;vertical-align:middle;">
            <div style="display:inline-block;width:16px;border:2px solid #FFFFFF;border-radius:6px 6px 2px 2px;margin-top:3px;"><div style="height:4px;border-bottom:2px solid #FFFFFF;"></div><div style="height:6px;"><div style="width:4px;height:4px;margin:0 auto;background:#FFFFFF;border-radius:0 0 1px 1px;"></div></div></div>
          </td>
          <td style="padding-left:12px;font-size:20px;font-weight:700;letter-spacing:-.02em;color:#FFFFFF;">Cofre</td>
        </tr></table>
      </td>
      <td align="right" style="vertical-align:middle;font-size:13px;color:rgba(255,255,255,.82);">${esc(fechaHoy())}</td>
    </tr></table>
    <div style="margin-top:20px;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-.02em;color:#FFFFFF;">${esc(encabezado)}</div>${subtitulo
      ? `\n    <div style="margin-top:4px;font-size:14px;line-height:20px;color:rgba(255,255,255,.86);">${esc(subtitulo)}</div>` : ""}
  </td></tr>
  <tr><td style="background:${C.superficie};padding:20px 20px 8px;border-radius:0 0 20px 20px;">
${contenido}
    <div style="padding:12px 4px 16px;font-size:12px;line-height:18px;color:${C.tinta2};text-align:center;">
      ${esc(pie)}<br>Enviado por Cofre desde tu Mac · tus datos no salen de tu computador.
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export function correoTexto(alertas: AlertaCorreo[], encabezado = tituloAlertas(alertas.length)): string {
  return `${encabezado}\n\n${alertas.map((a) => `${a.titulo}\n${a.cuerpo}`).join("\n\n")}\n\n— Cofre`;
}
