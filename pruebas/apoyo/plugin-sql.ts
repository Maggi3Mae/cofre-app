// Sustituto de @tauri-apps/plugin-sql para las pruebas: una base en memoria con todas las migraciones.
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

const DIR = new URL("../../src-tauri/migrations/", import.meta.url).pathname;
let base: DatabaseSync | null = null;

export function baseDePrueba(): DatabaseSync {
  if (!base) {
    base = new DatabaseSync(":memory:");
    base.exec("PRAGMA foreign_keys = ON");
    for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) base.exec(readFileSync(DIR + f, "utf8"));
  }
  return base;
}

export default class Database {
  static async load(_ruta: string): Promise<Database> { return new Database(); }
  private prep(sql: string) { return baseDePrueba().prepare(sql.replace(/\$(\d+)/g, "?$1")); }
  async select<T>(sql: string, p: unknown[] = []): Promise<T> { return this.prep(sql).all(...(p as never[])) as T; }
  async execute(sql: string, p: unknown[] = []) {
    const r = this.prep(sql).run(...(p as never[]));
    return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
  }
}
