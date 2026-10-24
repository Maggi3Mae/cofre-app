// Lectura de fotos de facturas en el equipo: QR con ZXing (zxing-wasm, en static/zxing) y texto con
// tesseract.js (modelo de español incluido en static/ocr, sin descargas). Nada sale a la red.
import { prepareZXingModule, readBarcodes, type ReaderOptions } from "zxing-wasm/reader";
import { createWorker, type Worker } from "tesseract.js";
import { combinar, leerQrDian, leerTextoFactura, type DatosFactura } from "./leer";

/** Lado mayor con que se trabaja la foto (OCR 2.200, vista previa). */
const LADO_MAX = 2400;
/** Lado mayor de la foto original que se guarda para buscar el QR: el de la DIAN es denso (~80 módulos)
 *  y en un tiquete largo achicado a 2.400 quedaba con < 2 px por módulo, ilegible. */
const LADO_QR = 5000;
type Fuente = HTMLCanvasElement | ImageBitmap;
/** Foto original (sin girar, hasta LADO_QR) de cada foto de trabajo; el QR no depende del giro. */
const originales = new WeakMap<HTMLCanvasElement, Fuente>();

// El .wasm va empacado en la app (scripts/copiar-ocr.mjs); por defecto la librería lo bajaría de un CDN.
prepareZXingModule({
  overrides: { locateFile: (ruta: string, prefijo: string) => (ruta.endsWith(".wasm") ? `/zxing/${ruta}` : prefijo + ruta) },
});

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
    const { naturalWidth: nw, naturalHeight: nh } = img;
    const f = Math.min(1, LADO_MAX / Math.max(nw, nh));
    const c = document.createElement("canvas");
    c.width = Math.round(nw * f);
    c.height = Math.round(nh * f);
    const x = c.getContext("2d", { willReadFrequently: true })!;
    x.imageSmoothingQuality = "high";
    x.drawImage(img, 0, 0, c.width, c.height);
    if (f < 1) {
      const g = Math.min(1, LADO_QR / Math.max(nw, nh));
      const original = await createImageBitmap(img, { resizeWidth: Math.round(nw * g), resizeHeight: Math.round(nh * g), resizeQuality: "high" })
        .catch(() => null);
      if (original) originales.set(c, original);
    }
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function rotar(origen: HTMLCanvasElement, grados: 90 | 180 | 270): HTMLCanvasElement {
  const c = girar(origen, grados);
  const original = originales.get(origen);
  if (original) originales.set(c, original);
  return c;
}

function girar(origen: HTMLCanvasElement, grados: 90 | 180 | 270): HTMLCanvasElement {
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

/** Un trozo de la imagen (en sus coordenadas) escalado por `escala`, como píxeles. */
function trozo(src: Fuente, [sx, sy, sw, sh]: number[], escala = 1): ImageData {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * escala));
  c.height = Math.max(1, Math.round(sh * escala));
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.imageSmoothingQuality = "high";
  x.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return x.getImageData(0, 0, c.width, c.height);
}

const BASE: ReaderOptions = {
  formats: ["QRCode"], tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 4,
};

/** El primer QR que sea de la DIAN; si ninguno lo es, el primero que se leyó. */
async function leerQr(img: ImageData, extra: ReaderOptions = {}): Promise<string | null> {
  const r = (await readBarcodes(img, { ...BASE, ...extra })).filter((x) => x.isValid && x.text);
  return (r.find((x) => leerQrDian(x.text)) ?? r[0])?.text ?? null;
}

/** Rectángulo del papel (la zona clara) en coordenadas de `src`, con un poco de margen. */
function papel(src: Fuente): [number, number, number, number] {
  const W = src.width, H = src.height, f0 = Math.min(1, 800 / Math.max(W, H));
  const d = trozo(src, [0, 0, W, H], f0), { width: w, height: h } = d, p = d.data;
  const luz = new Float32Array(w * h);
  let max = 0;
  for (let i = 0; i < w * h; i++) { luz[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]; if (luz[i] > max) max = luz[i]; }
  const umbral = Math.max(110, max * 0.72);
  const col = new Float32Array(w), fil = new Float32Array(h);
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) if (luz[y * w + i] > umbral) { col[i]++; fil[y]++; }
  const rango = (v: Float32Array, total: number) => {
    let a = 0, b = v.length - 1;
    while (a < b && v[a] / total < 0.15) a++;
    while (b > a && v[b] / total < 0.15) b--;
    return b - a > v.length * 0.1 ? [a, b] : [0, v.length - 1];
  };
  const [x0, x1] = rango(col, h), [y0, y1] = rango(fil, w);
  const k = W / w, margen = 0.03 * Math.max(x1 - x0, y1 - y0) * k;
  const X0 = Math.max(0, x0 * k - margen), Y0 = Math.max(0, y0 * k - margen);
  const X1 = Math.min(W, (x1 + 1) * k + margen), Y1 = Math.min(H, (y1 + 1) * k + margen);
  return [X0, Y0, X1 - X0, Y1 - Y0].map(Math.round) as [number, number, number, number];
}

/**
 * Busca el QR (probado con tiquetes largos sintéticos: ver ESTADO.md):
 *  1. la foto de trabajo entera (ZXing prueba varias escalas, giros e invertido): casi siempre basta;
 *  2. la foto ORIGINAL: se ubica el papel y se recorre a lo largo con ventanas casi cuadradas, empezando
 *     por las puntas (el QR suele ir al final del tiquete, que puede quedar arriba o abajo según la foto),
 *     con el ancho del papel llevado a ~1.600 px: el QR queda con 4 px o más por módulo;
 *  3. las dos puntas con otro binarizador y limpieza de ruido (papel térmico desteñido).
 */
export async function buscarQr(foto: HTMLCanvasElement): Promise<string | null> {
  let r = await leerQr(trozo(foto, [0, 0, foto.width, foto.height]));
  if (r) return r;

  const src = originales.get(foto) ?? foto;
  const [px, py, pw, ph] = papel(src);
  const vertical = ph >= pw, corto = Math.min(pw, ph), largo = Math.max(pw, ph);
  const escala = Math.min(2, 1600 / corto);
  const v = Math.min(largo, Math.round(corto * 1.3)), paso = Math.max(1, Math.round(corto * 0.55));
  const inicios: number[] = [];
  for (let a = 0; a <= largo - v; a += paso) inicios.push(a);
  if (!inicios.length || inicios[inicios.length - 1] < largo - v) inicios.push(largo - v);
  const orden: number[] = []; // puntas primero: final, inicio, penúltima, segunda…
  while (inicios.length) { orden.push(inicios.pop()!); if (inicios.length) orden.push(inicios.shift()!); }
  const ventana = (a: number) => (vertical ? [px, py + a, pw, v] : [px + a, py, v, ph]);

  for (const a of orden) {
    r = await leerQr(trozo(src, ventana(a), escala));
    if (r) return r;
  }
  for (const binarizer of ["GlobalHistogram", "FixedThreshold"] as const)
    for (const a of orden.slice(0, 2)) {
      r = await leerQr(trozo(src, ventana(a), escala), { binarizer, tryDenoise: true });
      if (r) return r;
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
  const qr = await buscarQr(foto).catch((e) => { console.warn("QR:", e); return null; });
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
