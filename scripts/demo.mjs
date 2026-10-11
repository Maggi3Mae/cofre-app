// Cofre con datos de demostración, en una base aparte (la tuya no se toca).
//   npm run demo                       ventana normal
//   npm run demo -- --celular          ventana del tamaño de un celular, con el diseño de celular
//   npm run demo -- --reiniciar        borra la base de demostración y la vuelve a llenar
// La primera vez (o tras --reiniciar) la app llena la base sola al abrir.
// Cada vez deja extracto-ejemplo.csv en la carpeta del proyecto, para probar Importar.
import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const celular = args.has("--celular");

/** Carpeta donde tauri-plugin-sql guarda las bases (app_config_dir del identificador co.cofre.app). */
function carpetaDatos() {
  const id = "co.cofre.app";
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", id);
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), id);
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), id);
}

if (args.has("--reiniciar")) {
  const base = join(carpetaDatos(), "cofre-demo.db");
  for (const f of [base, `${base}-wal`, `${base}-shm`, `${base}-journal`]) rmSync(f, { force: true });
  console.log("Base de demostración borrada: se vuelve a llenar al abrir.");
}

// Extracto de ejemplo con fechas de los últimos días (formato Nequi, cuenta «Billetera digital»).
const { extractoDemo } = await import("../src/lib/demo/extracto.ts");
const d = new Date();
const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const rutaExtracto = join(process.cwd(), "extracto-ejemplo.csv");
writeFileSync(rutaExtracto, extractoDemo(hoy));
console.log(`Extracto de ejemplo para Importar: ${rutaExtracto}`);

const env = {
  ...process.env,
  VITE_COFRE_DEMO: "1",
  COFRE_DEMO: "1",
  ...(celular ? { VITE_COFRE_CELULAR: "1", COFRE_DEMO_CELULAR: "1" } : {}),
};
console.log(`Abriendo Cofre en modo demostración${celular ? " (celular)" : ""}…`);
const hijo = spawn("npm", ["run", "tauri", "dev"], { stdio: "inherit", env, shell: process.platform === "win32" });
hijo.on("exit", (codigo) => process.exit(codigo ?? 0));
