// Lectura de extractos a una forma común (Documento). Todo local:
//  · PDF con pdf.js: se conserva la posición de cada texto para rearmar filas y columnas.
//  · Excel/ODS con calamine (Rust), CSV aquí mismo.
import { cuerpoBytes } from "$lib/ipc";
import { leerCsv } from "./csv";
export { leerCsv };
import "./polyfill-streams";
import { invoke } from "@tauri-apps/api/core";
import { getDocument, GlobalWorkerOptions, PasswordResponses } from "pdfjs-dist";

// Un solo worker para toda la app, creado al primer PDF.
function prepararWorker() {
  GlobalWorkerOptions.workerPort ??= new Worker(new URL("./pdf-worker.ts", import.meta.url), { type: "module" });
}

/** Un trozo de texto continuo dentro de una línea, con su posición horizontal. */
export interface Celda { x: number; x2: number; texto: string }
/** Una línea visual del PDF (textos a la misma altura), de izquierda a derecha. */
export interface Linea { y: number; celdas: Celda[]; texto: string }
export interface Pagina { numero: number; lineas: Linea[] }
export interface Hoja { nombre: string; filas: string[][] }

export type Documento =
  | { tipo: "pdf"; paginas: Pagina[]; texto: string }
  | { tipo: "hoja"; hojas: Hoja[]; texto: string };

/** El PDF pide clave (o la que se dio no sirve). */
export class ClaveRequerida extends Error {
  constructor(public incorrecta: boolean) {
    super(incorrecta ? "La clave no es correcta." : "Este extracto tiene clave.");
  }
}

export type TipoArchivo = "pdf" | "hoja" | "csv";

export function tipoArchivo(nombre: string): TipoArchivo | null {
  const ext = nombre.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (["xlsx", "xls", "xlsm", "ods"].includes(ext)) return "hoja";
  if (["csv", "txt"].includes(ext)) return "csv";
  return null;
}

/** Huella SHA-256 del archivo: detecta si ya se importó, aunque se haya renombrado. */
export async function huellaArchivo(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function leerDocumento(bytes: Uint8Array<ArrayBuffer>, tipo: TipoArchivo, clave?: string): Promise<Documento> {
  if (tipo === "pdf") return leerPdf(bytes, clave);
  if (tipo === "hoja") return aDocumentoHoja(await invoke<Hoja[]>("leer_hoja", cuerpoBytes(bytes)));
  return aDocumentoHoja([{ nombre: "CSV", filas: leerCsv(new TextDecoder().decode(bytes)) }]);
}

function aDocumentoHoja(hojas: Hoja[]): Documento {
  return { tipo: "hoja", hojas, texto: hojas.map((h) => h.filas.map((f) => f.join("\t")).join("\n")).join("\n\n") };
}

// ---------- PDF ----------

const TOL_Y = 2.5; // textos a menos de esta distancia vertical van en la misma línea

async function leerPdf(bytes: Uint8Array<ArrayBuffer>, clave?: string): Promise<Documento> {
  prepararWorker();
  // pdf.js se queda con el buffer: se le pasa una copia para poder reintentar con otra clave.
  const tarea = getDocument({ data: bytes.slice(), password: clave });
  let pdf;
  try {
    pdf = await tarea.promise;
  } catch (e: any) {
    await tarea.destroy().catch(() => {});
    if (e?.name === "PasswordException")
      throw new ClaveRequerida(e.code === PasswordResponses.INCORRECT_PASSWORD);
    throw new Error("No se pudo leer el PDF. ¿Está dañado o no es un extracto?");
  }
  const paginas: Pagina[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pag = await pdf.getPage(n);
    const contenido = await pag.getTextContent();
    const items = (contenido.items as any[])
      .filter((i) => typeof i.str === "string" && i.str.trim())
      .map((i) => ({ x: i.transform[4] as number, y: i.transform[5] as number, w: i.width as number, s: i.str as string, alto: Math.abs(i.transform[3] as number) || 8 }));
    paginas.push({ numero: n, lineas: armarLineas(items) });
    pag.cleanup();
  }
  await tarea.destroy();
  const texto = paginas.map((p) => p.lineas.map((l) => l.texto).join("\n")).join("\n\n");
  if (!texto.trim()) throw new Error("El PDF no tiene texto (puede ser una imagen escaneada).");
  return { tipo: "pdf", paginas, texto };
}

function armarLineas(items: { x: number; y: number; w: number; s: string; alto: number }[]): Linea[] {
  // En PDF la y crece hacia arriba: de mayor a menor = de arriba hacia abajo.
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const grupos: (typeof items)[] = [];
  for (const it of items) {
    const g = grupos[grupos.length - 1];
    if (g && Math.abs(g[0].y - it.y) <= TOL_Y) g.push(it);
    else grupos.push([it]);
  }
  return grupos.map((g) => {
    g.sort((a, b) => a.x - b.x);
    const celdas: Celda[] = [];
    for (const it of g) {
      const ult = celdas[celdas.length - 1];
      // Mismo trozo si el hueco es menor que ~un espacio; si no, es otra columna.
      if (ult && it.x - ult.x2 < it.alto * 0.6) {
        ult.texto += (it.x - ult.x2 > it.alto * 0.15 ? " " : "") + it.s;
        ult.x2 = Math.max(ult.x2, it.x + it.w);
      } else celdas.push({ x: it.x, x2: it.x + it.w, texto: it.s });
    }
    for (const c of celdas) c.texto = c.texto.replace(/\s+/g, " ").trim();
    return { y: g[0].y, celdas, texto: celdas.map((c) => c.texto).join("   ") };
  });
}

