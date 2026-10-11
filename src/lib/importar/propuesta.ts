// De lo leído en el extracto a filas listas para importar: tipo sugerido, comercio legible,
// casos especiales (cuotas, pagos de tarjeta, puntos) y huella para no duplicar.
import type { Cuenta, TipoTx } from "$lib/datos";
import { comercioLegible, type Lectura, type Sentido } from "./lectores";
import type { Sugerencia } from "./categorizar";

export interface FilaImport {
  huella: string;
  incluir: boolean;
  fecha: string;
  descripcion: string;
  comercio: string;
  monto: number;
  sentido: Sentido;
  tipo: TipoTx;
  /** En transferencias: la otra cuenta (el sentido dice si sale hacia ella o entra desde ella). */
  contraparteId: number | null;
  categoriaId: number | null;
  nota: string | null;
  existe: boolean;
  /** Categoría sugerida por reglas, historial o palabra clave (para mostrar de dónde salió). */
  sugerida: Sugerencia | null;
  /** Unión con un movimiento que ya existe (ver cruce.ts). */
  cruce: { accion: "enlazar" | "convertir"; txId: number; cuentaId: number | null } | null;
  cuadra: boolean | null;
}

const normal = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();

/**
 * Huella estable del movimiento: cuenta, fecha, sentido, monto, descripción y n.º de repetición
 * (dos compras iguales el mismo día son dos movimientos). Igual al reimportar el mismo extracto.
 */
function huellas(cuentaId: number, l: Lectura): string[] {
  const vistos = new Map<string, number>();
  return l.movimientos.map((m) => {
    const base = `imp|${cuentaId}|${m.fecha}|${m.sentido}|${m.monto}|${normal(m.descripcion)}`;
    const k = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, k);
    return `${base}|${k}`;
  });
}

export type Sugeridor = (descripcion: string, comercio: string, tipo: "ingreso" | "egreso") => Sugerencia | null;

export function proponerFilas(
  l: Lectura, cuenta: Cuenta, cuentas: Cuenta[], existentes: Set<string>, hs = huellas(cuenta.id, l),
  sugerir: Sugeridor = () => null,
): FilaImport[] {
  const credito = cuenta.tipo === "credito";
  return l.movimientos.map((m, i) => {
    const f: FilaImport = {
      huella: hs[i], incluir: true, fecha: m.fecha, descripcion: m.descripcion,
      comercio: comercioLegible(m.descripcion), monto: m.monto, sentido: m.sentido,
      tipo: m.sentido === "cargo" ? "egreso" : "ingreso",
      contraparteId: null, categoriaId: null, nota: null, existe: existentes.has(hs[i]), cuadra: m.cuadra,
      sugerida: null, cruce: null,
    };
    const d = normal(m.descripcion);

    // Pago de tarjeta desde una cuenta de ahorros: «PAGO DE TARJETA DE CREDITO *1234».
    const pagoTarjeta = d.match(/PAGO (?:DE )?TARJ(?:ETA)?\.? (?:DE )?CRED(?:ITO)?\.?\s*\*?(\d{4})?/);
    if (!credito && pagoTarjeta && m.sentido === "cargo") {
      const tarjeta = cuentas.find((c) => c.tipo === "credito" && !c.archivada && pagoTarjeta[1] && c.ultimos4 === pagoTarjeta[1]);
      if (tarjeta) { f.tipo = "transferencia"; f.contraparteId = tarjeta.id; f.comercio = `Pago ${tarjeta.nombre}`; }
      else f.nota = pagoTarjeta[1] ? `Pago a una tarjeta *${pagoTarjeta[1]} que no está en Cuentas` : "Pago de tarjeta";
    }

    if (credito) {
      if (m.cuota && m.cuota.n > 1) {
        f.incluir = false;
        f.nota = `Cuota ${m.cuota.n} de ${m.cuota.de} de una compra anterior`;
      } else if (m.cuota && m.cuota.de > 1) {
        f.nota = `Compra a ${m.cuota.de} cuotas`;
      }
      if (m.sentido === "abono" && pagoTarjeta) {
        f.incluir = false;
        f.tipo = "transferencia";
        f.nota = "Pago a la tarjeta: entra desde el extracto de la cuenta que pagó";
      } else if (m.sentido === "abono" && /PUNTOS/.test(d)) {
        f.comercio = "Pago con puntos";
      }
    }

    if (f.tipo !== "transferencia") {
      f.sugerida = sugerir(f.descripcion, f.comercio, f.tipo);
      f.categoriaId = f.sugerida?.categoriaId ?? null;
    }
    if (f.existe) { f.incluir = false; f.nota = "Ya existe"; }
    return f;
  });
}

export { huellas };
