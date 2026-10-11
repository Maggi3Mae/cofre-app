// Gesto «atrás» de Android (MainActivity.kt llama a window.cofreAtras):
// 1) cierra lo último que se abrió (hoja, panel, menú de la tablet); 2) vuelve a la pantalla anterior
// (o a Inicio); 3) solo desde Inicio sale de la app (devuelve false y Android sigue con lo suyo).
import { goto } from "$app/navigation";

const abiertos: (() => void)[] = [];

/** Registra algo que «atrás» debe cerrar mientras esté abierto. Devuelve la función para quitarlo. */
export function alAtras(cerrar: () => void): () => void {
  abiertos.push(cerrar);
  return () => {
    const i = abiertos.lastIndexOf(cerrar);
    if (i >= 0) abiertos.splice(i, 1);
  };
}

declare global {
  interface Window { cofreAtras?: () => boolean }
}

if (typeof window !== "undefined") {
  window.cofreAtras = () => {
    const cerrar = abiertos.at(-1);
    if (cerrar) { cerrar(); return true; }
    if (location.pathname !== "/") {
      if (history.length > 1) history.back();
      else void goto("/", { replaceState: true });
      return true;
    }
    return false;
  };
}
