// Plataforma donde corre Cofre. En Android no existen los comandos solo-escritorio
// (Llavero, revisión diaria, correo, Excel y TRM desde internet), así que la página los esconde.
export const esAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
export const esEscritorio = !esAndroid;

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
export const esWindows = esEscritorio && /Windows/i.test(ua);
export const esMac = esEscritorio && /Macintosh|Mac OS X/i.test(ua);
/** Cómo se llama este computador en los textos: «Mac», «PC» o «computador». */
export const compu = esMac ? "Mac" : esWindows ? "PC" : "computador";
/** Dónde guarda el sistema las contraseñas. */
export const llavero = esMac ? "Llavero" : esWindows ? "Administrador de credenciales de Windows" : "llavero del sistema";
/** Desde Android: tipo del computador emparejado según el nombre con que se anuncia («Mac de …» / «PC de …»). */
export function tipoCentro(nombre: string | null | undefined): string {
  if (!nombre) return "computador";
  return /^PC\b/.test(nombre) ? "PC" : /^Mac\b/.test(nombre) ? "Mac" : "computador";
}
