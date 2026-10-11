// Diseño del celular: Android con pantalla angosta (la tablet sigue con el de escritorio).
// En el Mac (tauri dev o navegador) se fuerza con «?movil» para revisarlo; «?movil=0» lo quita.
import { esAndroid } from "./plataforma";

const ANGOSTA = "(max-width: 599px)";
const CLAVE = "cofre-movil";

function forzado(): boolean {
  try {
    const q = new URLSearchParams(location.search);
    if (q.has("movil")) {
      if (q.get("movil") === "0") sessionStorage.removeItem(CLAVE);
      else sessionStorage.setItem(CLAVE, "1");
    }
    return sessionStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

/** celular: Android angosto (barra inferior). tablet: Android ancho (diseño de escritorio táctil). */
export const pantalla = $state({ celular: false, tablet: false, vertical: false });

/** Vertical según la pantalla física: abrir el teclado achica la ventana pero no gira la pantalla. */
function esVertical(): boolean {
  const t = screen.orientation?.type;
  return t ? t.startsWith("portrait") : screen.height >= screen.width;
}

declare global {
  // Puente de MainActivity.kt: barras del sistema en dp.
  interface Window { CofreAreaSegura?: { arriba(): number; abajo(): number } }
}

/** Área segura (barra de estado y gesto inferior). Android con «edge to edge» no siempre
 *  llena env(safe-area-inset-*) en el WebView: se toma de la actividad y, si no, un mínimo. */
function areaSegura() {
  const raiz = document.documentElement.style;
  let arriba = 0, abajo = 0;
  try {
    const a = window.CofreAreaSegura;
    if (a) { arriba = a.arriba(); abajo = a.abajo(); }
  } catch {}
  if (esAndroid && !arriba) arriba = 28;
  if (esAndroid && !abajo) abajo = 16;
  raiz.setProperty("--area-arriba", `${arriba}px`);
  raiz.setProperty("--area-abajo", `${abajo}px`);
}

if (typeof window !== "undefined") {
  const angosta = matchMedia(ANGOSTA);
  const movil = esAndroid || forzado();
  const actualizar = () => {
    pantalla.celular = movil && angosta.matches;
    pantalla.tablet = esAndroid && !angosta.matches;
    pantalla.vertical = esVertical();
    document.documentElement.classList.toggle("vertical", pantalla.vertical);
    document.documentElement.classList.toggle("celular", pantalla.celular);
    document.documentElement.classList.toggle("tablet", pantalla.tablet);
  };
  actualizar();
  angosta.addEventListener("change", actualizar);
  screen.orientation?.addEventListener("change", actualizar);
  areaSegura();
  addEventListener("resize", areaSegura); // gira la pantalla o cambia la barra de navegación
  addEventListener("cofre-area", areaSegura); // la actividad recibió las barras del sistema
}
