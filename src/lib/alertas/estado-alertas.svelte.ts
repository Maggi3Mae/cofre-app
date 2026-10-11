// Toasts de la app y revisión de alertas (presupuestos, CDT, metas de cajitas, préstamos vencidos):
// al abrir, cada vez que cambian los datos y en la revisión diaria en segundo plano.
// Cada alerta nueva: toast + notificación de macOS (si la ventana no está a la vista) + correo (si está activo).
import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { correoHtml, correoTexto } from "./correo";
import { esEscritorio, esAndroid } from "$lib/plataforma";
import { notificarAndroid, programarAvisos, tipoDeAlerta } from "./android";
import { revisarTodo, generarAutomaticas, porConfirmar, alCambiarDatos, leerCorreo, actualizarTrmSiToca, type Alerta, type Nivel } from "$lib/datos";
import { pesos, hoy } from "$lib/formato";
import { copiaSiToca } from "$lib/copias/copias";
import { datosCierre, mesAnterior, cierreEnviado, marcarCierre } from "$lib/datos/cierre";
import { cierreHtml, cierreTexto, asuntoCierre } from "./correo-cierre";

/** Envía el cierre de un mes (también lo usa el botón de Ajustes). */
export async function enviarCierre(ano: number, mes: number): Promise<void> {
  const c = await leerCorreo();
  if (!c.usuario || !c.destino) throw new Error("Primero configura el correo.");
  const d = await datosCierre(ano, mes);
  await invoke("correo_enviar", { config: c, asunto: asuntoCierre(d), cuerpo: cierreTexto(d, pesos), html: cierreHtml(d, pesos) });
  await marcarCierre(ano, mes);
}

/** Días del mes en los que se intenta el cierre (si el Mac estuvo apagado el 1, llega después). */
const DIAS_CIERRE = 5;

/** Solo Mac: en los primeros días del mes, si está activo y no se ha enviado, manda el cierre del mes anterior. */
async function cierreAutomatico(segundoPlano: boolean) {
  if (!esEscritorio) return;
  try {
    const c = await leerCorreo();
    if (!c.activo || !c.cierre || Number(hoy().slice(8, 10)) > DIAS_CIERRE) return;
    const { ano, mes } = mesAnterior();
    if (await cierreEnviado(ano, mes)) return;
    await enviarCierre(ano, mes);
  } catch (e) {
    const cuerpo = e instanceof Error ? e.message : String(e);
    if (segundoPlano) await notificarSistema("No se pudo enviar el cierre del mes", cuerpo, true);
    else mostrarAviso({ titulo: "No se pudo enviar el cierre del mes", cuerpo, nivel: "w90", enlace: "/ajustes" });
  }
}

/** Copia de seguridad automática (solo Mac). Un error se avisa, pero nunca bloquea la app. */
async function copiaAutomatica(segundoPlano: boolean) {
  try {
    await copiaSiToca();
  } catch (e) {
    const cuerpo = e instanceof Error ? e.message : String(e);
    if (segundoPlano) await notificarSistema("No se pudo hacer la copia de Cofre", cuerpo, true);
    else mostrarAviso({ titulo: "No se pudo hacer la copia de seguridad", cuerpo, nivel: "w90", enlace: "/ajustes#copias" });
  }
}

export interface Aviso { id: number; titulo: string; cuerpo: string; nivel: Nivel; enlace?: string }

export const avisos = $state<{ lista: Aviso[]; enRiesgo: number; prestamosVencidos: number; porConfirmar: number }>(
  { lista: [], enRiesgo: 0, prestamosVencidos: 0, porConfirmar: 0 });

let siguiente = 1;
const DURACION = 9000;

export function mostrarAviso(a: Omit<Aviso, "id">): void {
  const id = siguiente++;
  avisos.lista.push({ ...a, id });
  setTimeout(() => cerrarAviso(id), DURACION);
}

export function cerrarAviso(id: number): void {
  const i = avisos.lista.findIndex((a) => a.id === id);
  if (i >= 0) avisos.lista.splice(i, 1);
}

/** Notificación del sistema. Sin `siempre`, solo si la ventana no está a la vista (si está, basta el toast). */
export async function notificarSistema(titulo: string, cuerpo: string, siempre = false): Promise<boolean> {
  if (!siempre && document.visibilityState === "visible" && document.hasFocus()) return false;
  try {
    let ok = await isPermissionGranted();
    if (!ok) ok = (await requestPermission()) === "granted";
    if (ok) sendNotification({ title: titulo, body: cuerpo, sound: "Sosumi" }); // sonido del sistema de macOS
    return ok;
  } catch {
    return false; // sin permiso o fuera de Tauri: queda el toast
  }
}

/** Un solo correo con todas las alertas nuevas (si el correo está activo). */
async function enviarCorreo(alertas: Alerta[]) {
  const c = await leerCorreo();
  if (!esEscritorio) return; // el correo sale solo del Mac
  if (!c.activo || !c.usuario || !c.destino || !alertas.length) return;
  const asunto = alertas.length === 1 ? alertas[0].titulo : `Cofre: ${alertas.length} alertas`;
  try {
    await invoke("correo_enviar", { config: c, asunto, cuerpo: correoTexto(alertas), html: correoHtml(alertas) });
  } catch (e) {
    mostrarAviso({ titulo: "No se pudo enviar el correo de alertas", cuerpo: String(e), nivel: "w90", enlace: "/ajustes" });
  }
}

let enCurso: Promise<void> | null = null;
let pendiente = false;

/** `segundoPlano`: revisión diaria con la ventana oculta (notifica siempre). */
export async function revisarAlertas(segundoPlano = false): Promise<void> {
  if (enCurso) { pendiente = true; return enCurso; }
  enCurso = (async () => {
    // Recurrentes: registrar las automáticas vencidas y contar las que piden confirmación.
    try {
      await generarAutomaticas(); // antes de revisar: lo nuevo puede cruzar un presupuesto
      avisos.porConfirmar = (await porConfirmar()).length;
    } catch { /* nunca bloquea la revisión */ }
    try {
      const { alertas, enRiesgo, prestamosVencidos } = await revisarTodo(pesos);
      avisos.enRiesgo = enRiesgo;
      avisos.prestamosVencidos = prestamosVencidos;
      for (const a of alertas) {
        if (!segundoPlano) mostrarAviso(a);
        if (!esAndroid) await notificarSistema(a.titulo, a.cuerpo, segundoPlano);
        // Android: al momento solo presupuestos; CDT y Me deben llegan como programadas (no se repiten).
        else if (tipoDeAlerta(a.tipo) === "presupuestos") await notificarAndroid(a.titulo, a.cuerpo, "presupuestos");
      }
      await enviarCorreo(alertas);
      if (esAndroid) await programarAvisos();
    } catch { /* la revisión nunca bloquea la app */ }
  })();
  await enCurso;
  enCurso = null;
  if (pendiente) { pendiente = false; await revisarAlertas(segundoPlano); }
}

let espera: ReturnType<typeof setTimeout> | undefined;

/**
 * Al abrir: si la app se abrió para la revisión diaria (ventana oculta), revisa y se cierra.
 * Si no, revisa y queda atenta a los cambios de datos. Devuelve la limpieza.
 */
export function iniciarAlertas(): () => void {
  invoke<boolean>("es_revision").catch(() => false).then(async (revision) => {
    // TRM oficial antes de revisar (solo si está activada en Ajustes; tope de 20 s).
    await Promise.race([actualizarTrmSiToca(), new Promise((r) => setTimeout(r, 20_000))]);
    if (!revision) { void copiaAutomatica(false); void cierreAutomatico(false); return void revisarAlertas(); }
    const cerrar = () => invoke("salir").catch(() => {});
    setTimeout(cerrar, 60_000); // pase lo que pase, no se queda abierta
    await Promise.all([revisarAlertas(true), copiaAutomatica(true), cierreAutomatico(true)]);
    setTimeout(cerrar, 3000); // margen para que salgan la notificación y el correo
  });
  const quitar = alCambiarDatos(() => {
    clearTimeout(espera);
    espera = setTimeout(() => revisarAlertas(), 400);
  });
  return () => { quitar(); clearTimeout(espera); };
}
