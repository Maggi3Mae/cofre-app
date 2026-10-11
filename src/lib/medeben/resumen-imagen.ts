// Imagen del resumen de deuda (diseño «Morado» aprobado en el lienzo «Cofre — Resumen de deuda para compartir»).
// 1080 × 1920; se dibuja en unidades del diseño (540 × 960) con escala 2. Sin internet ni librerías.
// No sabe nada de la base: recibe los textos ya armados (medeben/resumen.ts).

export interface FilaResumen {
  titulo: string;
  falta: string;
  detalle: string;
  chip?: { texto: string; tono: "normal" | "vencido" | "pagado" };
}

export interface DatosResumen {
  persona: string;
  /** Tu nombre (pie «De …»); vacío = solo «Hecho con Cofre». */
  de: string;
  fecha: string;
  total: string;
  /** 0–1: abonado / prestado (barra). */
  progreso: number;
  abonado: string;
  prestado: string;
  filas: FilaResumen[];
  abonos: { fecha: string; monto: string }[];
  pago: { lineas: string[]; qr: CanvasImageSource | null } | null;
}

const W = 540, H = 960;
const PX = 32;
const DISPLAY = '"Bricolage Grotesque Variable", "Bricolage Grotesque", system-ui, sans-serif';
const SANS = '"Geist Variable", Geist, system-ui, sans-serif';
const C = { tinta: "#F2EEFB", suave: "#CBC4DE", pie: "#A79FC0", jade: "#4ED8C1", linea2: "#E2DDF0", barra: "#EDE6FF" };

type Ctx = CanvasRenderingContext2D;

function fuente(x: Ctx, peso: number, tam: number, familia = SANS, espaciado = 0) {
  x.font = `${peso} ${tam}px ${familia}`;
  if ("letterSpacing" in x) (x as Ctx & { letterSpacing: string }).letterSpacing = `${espaciado}px`;
}

/** Recorta con «…» para que quepa en `ancho`. */
function caber(x: Ctx, t: string, ancho: number): string {
  if (x.measureText(t).width <= ancho) return t;
  let s = t;
  while (s.length > 1 && x.measureText(s + "…").width > ancho) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}

function rect(x: Ctx, X: number, Y: number, w: number, h: number, r: number) {
  x.beginPath();
  x.roundRect(X, Y, w, h, r);
}

function fondo(x: Ctx) {
  // linear-gradient(160deg, #7C4DFF 0%, #4E27B8 38%, #170A3D 100%)
  const a = (160 * Math.PI) / 180, vx = Math.sin(a), vy = -Math.cos(a);
  const largo = Math.abs(W * vx) + Math.abs(H * vy);
  const g = x.createLinearGradient(W / 2 - (vx * largo) / 2, H / 2 - (vy * largo) / 2, W / 2 + (vx * largo) / 2, H / 2 + (vy * largo) / 2);
  g.addColorStop(0, "#7C4DFF"); g.addColorStop(0.38, "#4E27B8"); g.addColorStop(1, "#170A3D");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const mancha = (cx: number, cy: number, rx: number, ry: number, color: string) => {
    x.save();
    x.translate(cx, cy); x.scale(1, ry / rx);
    const r = x.createRadialGradient(0, 0, 0, 0, 0, rx * 0.6);
    r.addColorStop(0, color); r.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = r; x.fillRect(-rx, -rx, rx * 2, rx * 2);
    x.restore();
  };
  mancha(W, 0, 416, 320, "rgba(183,157,255,.45)");
  mancha(0, H, 352, 288, "rgba(176,33,94,.35)");
}

function logo(x: Ctx, X: number, Y: number) {
  x.save();
  x.translate(X, Y); x.scale(20 / 24, 20 / 24);
  x.strokeStyle = "#FFFFFF"; x.lineWidth = 1.8; x.lineCap = "round"; x.lineJoin = "round";
  x.stroke(new Path2D("M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v9H4zM4 12h16M11 12v3h2v-3"));
  x.restore();
}

/** Alto de una tarjeta de préstamo. */
const altoFila = (f: FilaResumen) => 16 + 24 + 4 + 18 + (f.chip ? 8 + 20 : 0) + 16;

function fila(x: Ctx, f: FilaResumen, Y: number) {
  const w = W - PX * 2, h = altoFila(f);
  rect(x, PX, Y, w, h, 20);
  x.fillStyle = "rgba(255,255,255,.08)"; x.fill();
  x.strokeStyle = "rgba(255,255,255,.12)"; x.lineWidth = 1; x.stroke();
  let y = Y + 16;
  fuente(x, 600, 18);
  x.fillStyle = C.tinta; x.textBaseline = "top";
  const falta = f.falta;
  const anchoFalta = x.measureText(falta).width;
  x.textAlign = "right"; x.fillText(falta, PX + w - 18, y + 3);
  fuente(x, 600, 19);
  x.textAlign = "left"; x.fillText(caber(x, f.titulo, w - 36 - anchoFalta - 12), PX + 18, y + 2);
  y += 28;
  fuente(x, 400, 15); x.fillStyle = C.suave;
  x.fillText(caber(x, f.detalle, w - 36), PX + 18, y + 1);
  y += 18;
  if (f.chip) {
    y += 8;
    fuente(x, 600, 12);
    const tw = x.measureText(f.chip.texto).width;
    rect(x, PX + 18, y, Math.min(tw + 20, w - 36), 20, 10);
    x.fillStyle = f.chip.tono === "vencido" ? "rgba(255,116,137,.30)" : f.chip.tono === "pagado" ? "rgba(78,216,193,.22)" : "rgba(183,157,255,.22)";
    x.fill();
    x.fillStyle = f.chip.tono === "vencido" ? "#FFD3DA" : C.tinta;
    x.fillText(caber(x, f.chip.texto, w - 56), PX + 28, y + 3);
  }
}

/** «Nequi · 300 123 4567» → [«Nequi», « · 300 123 4567»]: lo que va tras «·» o «:» va en negrita. */
function partir(l: string): [string, string] {
  const m = l.match(/^(.*?)(\s*[·:]\s*)(.+)$/);
  return m ? [m[1] + m[2], m[3]] : ["", l];
}

function pago(x: Ctx, p: NonNullable<DatosResumen["pago"]>, abajo: number): number {
  const lado = p.qr ? 200 : 0;
  const top = abajo - (p.qr ? lado + 16 : 18 + 10 + p.lineas.length * 26);
  let X = PX;
  if (p.qr) {
    rect(x, PX, top, lado + 16, lado + 16, 14);
    x.fillStyle = "#FFFFFF"; x.fill();
    x.imageSmoothingEnabled = false;
    x.drawImage(p.qr, PX + 8, top + 8, lado, lado);
    x.imageSmoothingEnabled = true;
    X = PX + lado + 16 + 16;
  }
  const ancho = W - PX - X;
  // Texto alineado abajo con el QR.
  let y = abajo - (p.lineas.length * 26 + 28);
  fuente(x, 600, 11, SANS, 0.88); x.fillStyle = C.suave; x.textBaseline = "top";
  x.fillText("PARA PAGARME", X, y);
  y += 28;
  p.lineas.forEach((l, i) => {
    const [a, b] = partir(l);
    x.fillStyle = i === 0 ? C.tinta : C.linea2;
    fuente(x, 400, 16);
    const wa = x.measureText(a).width;
    x.fillText(a, X, y);
    fuente(x, 700, 16);
    x.fillText(caber(x, b, Math.max(40, ancho - wa)), X + wa, y);
    y += 26;
  });
  return top;
}

/** `escala` 2 = imagen final de 1080 × 1920; 1 = vista previa (cuatro veces menos píxeles). */
export function dibujarResumen(d: DatosResumen, escala = 2): HTMLCanvasElement {
  const lienzo = document.createElement("canvas");
  lienzo.width = W * escala; lienzo.height = H * escala;
  const x = lienzo.getContext("2d")!;
  x.scale(escala, escala);
  x.textBaseline = "top";
  fondo(x);

  // Encabezado
  logo(x, PX, 44);
  fuente(x, 700, 17, DISPLAY, -0.34); x.fillStyle = C.tinta;
  x.fillText("Cofre", PX + 28, 45);
  fuente(x, 400, 17); x.fillStyle = C.suave; x.textAlign = "right";
  x.fillText(d.fecha, W - PX, 45);
  x.textAlign = "left";

  let y = 44 + 24 + 22 + 20;
  fuente(x, 650, 30, DISPLAY, -0.6); x.fillStyle = C.tinta;
  x.fillText(caber(x, `Hola, ${d.persona}`, W - PX * 2), PX, y + 2);
  y += 36 + 6;
  fuente(x, 400, 20); x.fillStyle = C.suave;
  x.fillText(caber(x, "Este es el resumen de lo que me debes", W - PX * 2), PX, y + 1);
  y += 24 + 22;

  // Total y barra
  let tam = 72;
  fuente(x, 650, tam, DISPLAY, -tam * 0.04);
  while (x.measureText(d.total).width > W - PX * 2 && tam > 40) { tam -= 4; fuente(x, 650, tam, DISPLAY, -tam * 0.04); }
  x.fillStyle = C.tinta;
  x.fillText(d.total, PX, y + 2);
  y += Math.round(tam * 1.06) + 10;
  rect(x, PX, y, W - PX * 2, 8, 4); x.fillStyle = "rgba(255,255,255,.14)"; x.fill();
  if (d.progreso > 0) { rect(x, PX, y, Math.max(8, (W - PX * 2) * Math.min(1, d.progreso)), 8, 4); x.fillStyle = C.barra; x.fill(); }
  y += 8 + 10;
  fuente(x, 400, 17); x.fillStyle = C.suave;
  const t1 = "Abonado ", t3 = ` de ${d.prestado}`;
  x.fillText(t1, PX, y);
  let xx = PX + x.measureText(t1).width;
  fuente(x, 700, 17); x.fillStyle = C.jade; x.fillText(d.abonado, xx, y);
  xx += x.measureText(d.abonado).width;
  fuente(x, 400, 17); x.fillStyle = C.suave; x.fillText(t3, xx, y);
  y += 20 + 22;

  // Pie y bloque de pago (de abajo hacia arriba)
  fuente(x, 400, 14); x.fillStyle = C.pie; x.textAlign = "center";
  x.fillText(d.de ? `De ${d.de} · hecho con Cofre` : "Hecho con Cofre", W / 2, H - 28 - 16);
  x.textAlign = "left";
  let limite = H - 28 - 18 - 22;
  if (d.pago && (d.pago.lineas.length || d.pago.qr)) limite = pago(x, d.pago, limite) - 22;

  // Abonos (hasta 3) y tarjetas: lo que quepa entre el total y el bloque de pago.
  const abonos = d.abonos.slice(0, 3);
  const altoAbonos = abonos.length ? abonos.length * 28 + (d.abonos.length > 3 ? 22 : 0) + 12 : 0;
  const espacio = limite - y - altoAbonos;
  let usado = 0, n = 0;
  for (const f of d.filas) {
    const h = altoFila(f) + (n ? 10 : 0);
    const resto = d.filas.length - n - 1;
    if (usado + h + (resto ? 28 : 0) > espacio) break;
    usado += h; n++;
  }
  for (const f of d.filas.slice(0, n)) { fila(x, f, y); y += altoFila(f) + 10; }
  if (n < d.filas.length) {
    fuente(x, 600, 16); x.fillStyle = C.suave;
    const m = d.filas.length - n;
    x.fillText(`+ ${m} ${m === 1 ? "préstamo más" : "préstamos más"} en el total`, PX + 4, y);
    y += 28;
  }
  y += 2;
  for (const a of abonos) {
    fuente(x, 400, 18); x.fillStyle = C.suave;
    x.fillText(`Abono del ${a.fecha}`, PX + 4, y);
    fuente(x, 600, 18); x.fillStyle = C.jade; x.textAlign = "right";
    x.fillText(a.monto, W - PX - 4, y);
    x.textAlign = "left";
    y += 28;
  }
  if (d.abonos.length > 3) {
    fuente(x, 400, 15); x.fillStyle = C.pie;
    const m = d.abonos.length - 3;
    x.fillText(`y ${m} ${m === 1 ? "abono más" : "abonos más"}`, PX + 4, y);
  }
  return lienzo;
}

/** Espera las fuentes de la app antes de dibujar (si no, el canvas usa la del sistema). */
export async function cargarFuentes(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`650 72px ${DISPLAY}`), document.fonts.load(`700 17px ${DISPLAY}`),
      document.fonts.load(`400 15px ${SANS}`), document.fonts.load(`600 15px ${SANS}`), document.fonts.load(`700 20px ${SANS}`),
    ]);
  } catch { /* sigue con lo que haya */ }
}

/** PNG (portapapeles y Guardar en el Mac) o JPEG (vista previa y Compartir en Android: mucho más rápido y liviano). */
export const aImagen = (c: HTMLCanvasElement, tipo: "image/png" | "image/jpeg" = "image/png", calidad = 0.92) =>
  new Promise<Blob>((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo crear la imagen."))), tipo, calidad));
