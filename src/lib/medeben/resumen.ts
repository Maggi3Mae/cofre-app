// Resumen de deuda de una persona para compartir como imagen: arma los textos desde la base
// y los dibuja con resumen-imagen.ts. Nunca incluye cuentas ni de dónde salió la plata.
import { listarPrestamos, movimientosPrestamo, type Prestamo } from "$lib/datos/medeben";
import { leerNombre, leerDatosPago } from "$lib/datos/ajustes";
import { leerAdjunto } from "$lib/adjuntos/archivos";
import { pesos, hoy } from "$lib/formato";
import { dibujarResumen, cargarFuentes, aImagen, type DatosResumen, type FilaResumen } from "./resumen-imagen";

export interface OpcionesResumen {
  cuotas: boolean;
  abonos: boolean;
  pagados: boolean;
  pago: boolean;
}
export const OPCIONES_INICIALES: OpcionesResumen = { cuotas: true, abonos: true, pagados: false, pago: true };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const corta = (f: string) => { const [, m, d] = f.split("-").map(Number); return `${d} ${MESES[m - 1]}`; };
const larga = (f: string) => { const [a, m, d] = f.split("-").map(Number); return `${d} ${MESES[m - 1]} ${a}`; };

function fila(p: Prestamo, o: OpcionesResumen): FilaResumen {
  const c = p.calculo;
  const titulo = p.descripcion?.trim() || p.gasto_grupal || "Préstamo";
  let detalle = `${corta(p.fecha)} · ${pesos(p.monto)}`;
  if (p.gasto_grupal) detalle = `${corta(p.fecha)} · tu parte de «${p.gasto_grupal}»`;
  if (o.cuotas && c.cuotas.length) {
    const pagadas = c.cuotas.filter((q) => q.estado === "pagada").length;
    detalle += ` en ${c.cuotas.length} cuotas · ${pagadas} ${pagadas === 1 ? "pagada" : "pagadas"}`;
  }
  let chip: FilaResumen["chip"];
  if (c.estado === "pagado") chip = { texto: "Pagado", tono: "pagado" };
  else if (c.vencido && c.fechaVencida) chip = { texto: `Vencido desde el ${corta(c.fechaVencida)} · ${pesos(c.atrasado)}`, tono: "vencido" };
  else if (o.cuotas && c.cuotas.length) {
    const q = c.cuotas.find((x) => x.estado !== "pagada");
    if (q) chip = { texto: `Próxima cuota: ${pesos(q.monto - q.abonado)} · ${corta(q.fecha)}`, tono: "normal" };
  } else if (p.fecha_acordada) chip = { texto: `Quedamos para el ${corta(p.fecha_acordada)}`, tono: "normal" };
  return { titulo, falta: pesos(c.pendiente), detalle, chip };
}

// Lo que no cambia entre interruptores se carga una sola vez.
let fuentes: Promise<void> | null = null;
const qrs = new Map<string, Promise<CanvasImageSource | null>>();
function imagenQr(nombre: string): Promise<CanvasImageSource | null> {
  if (!qrs.has(nombre)) qrs.set(nombre, leerAdjunto(nombre).then((b) => createImageBitmap(b)).catch(() => null));
  return qrs.get(nombre)!;
}

/** Tiempos de cada paso (ms), para ver qué demora. */
export type Tiempos = Record<string, number>;
async function medir<T>(t: Tiempos, paso: string, f: () => Promise<T> | T): Promise<T> {
  const ini = performance.now();
  try { return await f(); } finally { t[paso] = Math.round(performance.now() - ini); }
}

/** Datos del resumen (sin préstamos dados por perdidos). */
export async function datosResumen(personaId: number, persona: string, o: OpcionesResumen, t: Tiempos = {}): Promise<DatosResumen> {
  const [prestamos, movs, de, datosPago] = await medir(t, "datos", () => Promise.all([
    listarPrestamos(personaId), movimientosPrestamo({ personaId }), leerNombre(), leerDatosPago(),
  ]));
  const activos = prestamos.filter((p) => p.calculo.estado === "activo");
  const visibles = prestamos.filter((p) => p.calculo.estado === "activo" || (o.pagados && p.calculo.estado === "pagado"));
  // Primero lo vencido, luego lo que más falta.
  visibles.sort((a, b) => Number(b.calculo.vencido) - Number(a.calculo.vencido) || b.calculo.pendiente - a.calculo.pendiente);
  const deActivos = new Set(visibles.map((p) => p.id));
  const total = activos.reduce((s, p) => s + p.calculo.pendiente, 0);
  const prestado = visibles.reduce((s, p) => s + p.monto, 0);
  const abonado = visibles.reduce((s, p) => s + p.calculo.abonado, 0);
  const pago = o.pago && (datosPago.lineas.length || datosPago.qr)
    ? { lineas: datosPago.lineas, qr: datosPago.qr ? await medir(t, "qr", () => imagenQr(datosPago.qr!)) : null }
    : null;
  return {
    persona: persona.trim().split(/\s+/)[0] || persona,
    de, fecha: larga(hoy()), total: pesos(total),
    progreso: prestado ? abonado / prestado : 0, abonado: pesos(abonado), prestado: pesos(prestado),
    filas: visibles.map((p) => fila(p, o)),
    abonos: o.abonos
      ? movs.filter((m) => m.tipo === "abono" && deActivos.has(m.prestamo_id)).map((m) => ({ fecha: larga(m.fecha), monto: pesos(m.monto, "+") }))
      : [],
    pago,
  };
}

/**
 * Arma la imagen. `vista`: mitad de tamaño en JPEG (rápida, para la vista previa).
 * Si no: 1080 × 1920 en PNG (Mac: copiar y guardar) o JPEG 0,92 (Android: compartir).
 */
export async function imagenResumen(personaId: number, persona: string, o: OpcionesResumen,
  formato: "vista" | "png" | "jpeg" = "png"): Promise<{ blob: Blob; tiempos: Tiempos }> {
  const t: Tiempos = {};
  const [d] = await Promise.all([datosResumen(personaId, persona, o, t), medir(t, "fuentes", () => (fuentes ??= cargarFuentes()))]);
  const lienzo = await medir(t, "dibujo", () => dibujarResumen(d, formato === "vista" ? 1 : 2));
  const blob = await medir(t, "codificar", () => formato === "png" ? aImagen(lienzo) : aImagen(lienzo, "image/jpeg", formato === "vista" ? 0.85 : 0.92));
  return { blob, tiempos: t };
}

export const nombreArchivo = (persona: string, ext: "png" | "jpg" = "png") =>
  `Cofre-${persona.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "resumen"}-${hoy()}.${ext}`;
