// Lectura de fotos de facturas en el equipo: QR con jsQR y texto con tesseract.js (modelo de
// español incluido en static/ocr, sin descargas). Nada sale a la red.
import jsQR from "jsqr";
import { createWorker, type Worker } from "tesseract.js";
import { combinar, leerQrDian, leerTextoFactura, type DatosFactura } from "./leer";

/** Lado mayor con que se trabaja la foto: más que lo que usa cualquier paso (QR ≤ 1.800, OCR 2.200). */
const LADO_MAX = 2400;

/**
 * Carga la foto respetando la orientación de la cámara (EXIF) y ya achicada a LADO_MAX:
 * las cámaras del celular dan fotos enormes y todo lo demás se volvía lento.
 */
export async function cargarImagen(archivo: File): Promise<HTMLCanvasElement> {
  ocr().catch(() => {}); // el lector de texto arranca mientras se abre la foto y se busca el QR
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode().catch(() => { throw new Error("No se pudo abrir la imagen. Prueba con JPG o PNG."); });
    const f = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * f);
    c.height = Math.round(img.naturalHeight * f);
    const x = c.getContext("2d")!;
    x.imageSmoothingQuality = "high";
    x.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function rotar(origen: HTMLCanvasElement, grados: 90 | 180 | 270): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const lado = grados !== 180;
  c.width = lado ? origen.height : origen.width;
  c.height = lado ? origen.width : origen.height;
  const x = c.getContext("2d")!;
  x.translate(c.width / 2, c.height / 2);
  x.rotate((grados * Math.PI) / 180);
  x.drawImage(origen, -origen.width / 2, -origen.height / 2);
  return c;
}

function escalar(origen: HTMLCanvasElement, maxLado: number, recorte?: [number, number, number, number]): HTMLCanvasElement {
  const [sx, sy, sw, sh] = recorte ?? [0, 0, origen.width, origen.height];
  const f = Math.min(maxLado / Math.max(sw, sh), 3);
  const c = document.createElement("canvas");
  c.width = Math.round(sw * f);
  c.height = Math.round(sh * f);
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.imageSmoothingQuality = "high";
  x.drawImage(origen, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/**
 * Busca el QR: primero los tamaños y recortes más probables (en los tiquetes suele ir abajo;
 * en facturas, arriba) y con colores invertidos solo al final, que es lo más lento.
 */
export function buscarQr(foto: HTMLCanvasElement): string | null {
  const { width: w, height: h } = foto;
  const intentos: [number, [number, number, number, number]?, boolean?][] = [
    [1200],
    [1400, [0, Math.round(h * 0.55), w, Math.round(h * 0.45)]],
    [1400, [0, 0, w, Math.round(h * 0.4)]],
    [1800, undefined, true],
  ];
  for (const [lado, recorte, invertir] of intentos) {
    const c = escalar(foto, lado, recorte);
    const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
    const r = jsQR(d.data, d.width, d.height, { inversionAttempts: invertir ? "attemptBoth" : "dontInvert" });
    if (r?.data) return r.data;
  }
  return null;
}

/**
 * Prepara la foto para el OCR: escala de grises, recorte al papel (zona clara) y umbral local,
 * que aguanta las sombras y arrugas del papel térmico.
 */
export function prepararParaOcr(foto: HTMLCanvasElement): HTMLCanvasElement {
  const c = escalar(foto, 2200);
  const x = c.getContext("2d", { willReadFrequently: true })!;
  const { width: w, height: h } = c;
  const px = x.getImageData(0, 0, w, h);
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * px.data[i * 4] + 0.587 * px.data[i * 4 + 1] + 0.114 * px.data[i * 4 + 2];

  // Recorte al papel: columnas y filas con suficientes píxeles claros.
  const col = new Float32Array(w), fil = new Float32Array(h);
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) if (g[y * w + i] > 170) { col[i]++; fil[y]++; }
  const rango = (v: Float32Array, total: number, min: number) => {
    let a = 0, b = v.length - 1;
    while (a < b && v[a] / total < min) a++;
    while (b > a && v[b] / total < min) b--;
    return b - a > v.length * 0.2 ? [a, b] : [0, v.length - 1];
  };
  const [x0, x1] = rango(col, h, 0.35), [y0, y1] = rango(fil, w, 0.25);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;

  // Umbral local con imagen integral: tinta = más oscuro que el promedio de su vecindario.
  const R = 15, integral = new Float64Array((cw + 1) * (ch + 1));
  for (let y = 0; y < ch; y++) {
    let fila = 0;
    for (let i = 0; i < cw; i++) {
      fila += g[(y + y0) * w + i + x0];
      integral[(y + 1) * (cw + 1) + i + 1] = integral[y * (cw + 1) + i + 1] + fila;
    }
  }
  const salida = document.createElement("canvas");
  salida.width = cw;
  salida.height = ch;
  const sx = salida.getContext("2d")!;
  const out = sx.createImageData(cw, ch);
  for (let y = 0; y < ch; y++) {
    const ya = Math.max(0, y - R), yb = Math.min(ch, y + R + 1);
    for (let i = 0; i < cw; i++) {
      const xa = Math.max(0, i - R), xb = Math.min(cw, i + R + 1);
      const suma = integral[yb * (cw + 1) + xb] - integral[ya * (cw + 1) + xb] - integral[yb * (cw + 1) + xa] + integral[ya * (cw + 1) + xa];
      const media = suma / ((yb - ya) * (xb - xa));
      const v = g[(y + y0) * w + i + x0] < media - 12 ? 0 : 255;
      const k = (y * cw + i) * 4;
      out.data[k] = out.data[k + 1] = out.data[k + 2] = v;
      out.data[k + 3] = 255;
    }
  }
  sx.putImageData(out, 0, 0);
  return salida;
}

let trabajador: Promise<Worker> | null = null;
let alProgreso: ((p: number) => void) | null = null;

function ocr(): Promise<Worker> {
  return (trabajador ??= createWorker("spa", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/",
    langPath: "/ocr",
    gzip: true,
    cacheMethod: "none",
    workerBlobURL: false,
    logger: (m) => { if (m.status === "recognizing text") alProgreso?.(m.progress); },
  }).catch((e) => { trabajador = null; throw e; }));
}

export interface Lectura { datos: DatosFactura; qr: string | null; texto: string }

let leyendo = false;
/** Corta la lectura en curso (p. ej. al girar la foto): el lector solo hace una a la vez, así que se
 *  descarta y se vuelve a crear (unos segundos) en vez de esperar a que termine. */
export async function cancelarLectura(): Promise<void> {
  if (!leyendo || !trabajador) return;
  const w = trabajador;
  trabajador = null;
  leyendo = false;
  try { await (await w).terminate(); } catch { /* ya no importa */ }
}

/** QR primero (más confiable) y OCR para completar lo que falte. */
/** `vigente`: si deja de serlo antes del OCR (se giró la foto), no se encola una lectura que ya no sirve. */
export async function leerFactura(foto: HTMLCanvasElement, progreso?: (etapa: string, p?: number) => void, vigente: () => boolean = () => true): Promise<Lectura> {
  progreso?.("Buscando el código QR…");
  await new Promise((r) => setTimeout(r)); // deja pintar el estado
  const qr = buscarQr(foto);
  const deQr = qr ? leerQrDian(qr) : null;

  progreso?.("Preparando la foto…");
  await new Promise((r) => setTimeout(r));
  const lista = prepararParaOcr(foto);

  if (!vigente()) throw new Error("cancelada");
  progreso?.("Leyendo el texto…", 0);
  const w = await ocr();
  if (!vigente()) throw new Error("cancelada");
  alProgreso = (p) => progreso?.("Leyendo el texto…", p);
  leyendo = true;
  try {
    const { data } = await w.recognize(lista);
    return { datos: combinar(deQr, leerTextoFactura(data.text, deQr?.nit ?? null)), qr, texto: data.text };
  } finally {
    leyendo = false;
    alProgreso = null;
  }
}
