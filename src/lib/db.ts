import Database from "@tauri-apps/plugin-sql";

// Archivo SQLite local en la carpeta de datos de la app. Nada sale del equipo.
let conexion: Promise<Database> | null = null;
export function db(): Promise<Database> {
  return (conexion ??= Database.load("sqlite:cofre.db"));
}
