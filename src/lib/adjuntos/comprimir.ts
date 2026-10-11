// Foto de factura → WebP liviano: recorte al papel, lado mayor ≤ 1600 px y calidad 80.
// El codificador es libwebp (Google) en WebAssembly (@jsquash/webp): WebKit no codifica WebP por sí solo.
// Todo ocurre en el equipo.
import encode from "@jsquash/webp/encode";

const LADO_MAX = 1600;
const CALIDAD = 80;

/** Recorte al papel (zona clara), calculado sobre una copia pequeña. [x, y, ancho, alto] en la foto original. */
function recorteAlPapel(foto: HTMLCanvasElement): [number, number, number, number] {
  const f = Math.min(1, 600 / Math.max(foto.width, foto.height));
  const w = Math.max(1, Math.round(foto.width * f)), h = Math.max(1, Math.round(foto.height * f));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(foto, 0, 0, w, h);
  const px = x.getImageData(0, 0, w, h).data;
  const col = new Float32Array(w), fil = new Float32Array(h);
  for (let y = 0; y < h; y++)
    for (let i = 0; i < w; i++) {
      const k = (y * w + i) * 4;
      if (0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2] > 170) { col[i]++; fil[y]++; }
    }
  const rango = (v: Float32Array, total: number, min: number) => {
    let a = 0, b = v.length - 1;
    while (a < b && v[a] / total < min) a++;
    while (b > a && v[b] / total < min) b--;
    return b - a > v.length * 0.2 ? [a, b] : [0, v.length - 1];
  };
  // Un margen pequeño para no cortar el borde del texto.
  const [x0, x1] = rango(col, h, 0.35), [y0, y1] = rango(fil, w, 0.25);
  const m = 6;
  const a = Math.max(0, x0 - m), b = Math.min(w - 1, x1 + m), c0 = Math.max(0, y0 - m), d = Math.min(h - 1, y1 + m);
  return [a / f, c0 / f, (b - a + 1) / f, (d - c0 + 1) / f];
}

/** Devuelve los bytes WebP listos para guardar. */
export async function comprimirFoto(foto: HTMLCanvasElement): Promise<Uint8Array<ArrayBuffer>> {
  const [sx, sy, sw, sh] = recorteAlPapel(foto);
  const f = Math.min(1, LADO_MAX / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * f));
  c.height = Math.max(1, Math.round(sh * f));
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.imageSmoothingQuality = "high";
  x.drawImage(foto, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const datos = x.getImageData(0, 0, c.width, c.height);
  return new Uint8Array(await encode(datos, { quality: CALIDAD, method: 4 }));
}

/** Carga un archivo de imagen en un canvas (respeta la orientación EXIF). */
export async function canvasDeArchivo(archivo: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}

/** QR de pago → WebP sin pérdida (que siga leyéndose), lado mayor ≤ 800 px y sin recortar. */
export async function comprimirQr(foto: HTMLCanvasElement): Promise<Uint8Array<ArrayBuffer>> {
  const f = Math.min(1, 800 / Math.max(foto.width, foto.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(foto.width * f));
  c.height = Math.max(1, Math.round(foto.height * f));
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.imageSmoothingEnabled = f < 1;
  x.drawImage(foto, 0, 0, c.width, c.height);
  return new Uint8Array(await encode(x.getImageData(0, 0, c.width, c.height), { lossless: 1 }));
}
