// Ganchos de módulos para correr código de la app en Node (pruebas): «$lib/…» → src/lib, importaciones
// sin extensión → .ts, y los complementos de Tauri → sustitutos con node:sqlite.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = new URL("../../", import.meta.url);
const SUSTITUTOS = {
  "@tauri-apps/plugin-sql": new URL("./plugin-sql.ts", import.meta.url).href,
  "@tauri-apps/api/core": new URL("./tauri-core.ts", import.meta.url).href,
};

function conExtension(url) {
  const ruta = fileURLToPath(url);
  for (const ext of ["", ".ts", ".svelte.ts", "/index.ts"]) {
    if (existsSync(ruta + ext) && (ext || /\.[cm]?[jt]s$/.test(ruta))) return pathToFileURL(ruta + ext).href;
  }
  return null;
}

export async function resolve(especificador, contexto, siguiente) {
  if (SUSTITUTOS[especificador]) return { url: SUSTITUTOS[especificador], shortCircuit: true };
  if (especificador.startsWith("$lib/")) {
    const url = conExtension(new URL("src/lib/" + especificador.slice(5), RAIZ));
    if (url) return { url, shortCircuit: true };
  }
  if (especificador.startsWith(".") && contexto.parentURL?.startsWith("file:")) {
    const url = conExtension(new URL(especificador, contexto.parentURL));
    if (url) return { url, shortCircuit: true };
  }
  return siguiente(especificador, contexto);
}
