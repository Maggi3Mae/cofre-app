import Database from "@tauri-apps/plugin-sql";
import { esDemo } from "$lib/demo/modo";

// Archivo SQLite local en la carpeta de datos de la app. Nada sale del equipo.
// En modo demostración se usa otro archivo: la base real no se toca.
let conexion: Promise<Database> | null = null;
export function db(): Promise<Database> {
  return (conexion ??= Database.load(esDemo ? "sqlite:cofre-demo.db" : "sqlite:cofre.db"));
}
