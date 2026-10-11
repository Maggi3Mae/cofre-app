// Cruce de lo importado con lo que ya existe, para no contar dos veces la misma plata:
//  · «enlazar»: el movimiento ya está en esta cuenta (registrado a mano, o una transferencia que entró
//    desde el extracto de la otra cuenta). No se importa; se anota su huella.
//  · «convertir»: en otra cuenta hay un egreso/ingreso importado con el mismo monto en sentido contrario
//    y cara de transferencia (Bre-B, pago de tarjeta…). Se unen en una sola transferencia.
import type { Candidato, Cuenta } from "$lib/datos";
import { fechaCorta } from "$lib/periodo";
import type { FilaImport } from "./propuesta";

const VENTANA_DIAS = 3;
const TRANSFERENCIA_RE = /BRE-?B|TRANSF|ENV[IÍ]O|RECIBI|PAGO (DE )?TARJ|PAGO EN QR/i;
/** Cara de transferencia: Bre-B, envíos, pagos de tarjeta, o «De NOMBRE» de Nequi. */
const pareceTransferencia = (s: string) => TRANSFERENCIA_RE.test(s) || /^De [A-ZÑ]/.test(s);

const dias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

export function cruzar(filas: FilaImport[], cuenta: Cuenta, candidatos: Candidato[], cuentas: Cuenta[]): void {
  const usados = new Set<number>();
  const nombre = (id: number | null) => cuentas.find((c) => c.id === id)?.nombre ?? "otra cuenta";
  const X = cuenta.id;
  const masCercano = (f: FilaImport, ok: (t: Candidato) => boolean) =>
    candidatos
      .filter((t) => !usados.has(t.id) && t.monto === f.monto && dias(t.fecha, f.fecha) <= VENTANA_DIAS && ok(t))
      .sort((a, b) => dias(a.fecha, f.fecha) - dias(b.fecha, f.fecha))[0];

  for (const f of filas) {
    if (f.existe) continue;
    const cargo = f.sentido === "cargo";

    // 1. Ya está en esta cuenta y su lado de esta cuenta no viene de ningún extracto.
    const ya = masCercano(f, (t) => {
      if (t.cuenta_import === X) return false;
      if (t.tipo === "transferencia") return cargo ? t.cuenta_id === X : t.cuenta_destino_id === X;
      return t.huella == null && t.cuenta_id === X && t.tipo === (cargo ? "egreso" : "ingreso");
    });
    if (ya) {
      usados.add(ya.id);
      const como = ya.tipo === "transferencia"
        ? `como transferencia ${cargo ? `hacia ${nombre(ya.cuenta_destino_id)}` : `desde ${nombre(ya.cuenta_id)}`}`
        : "a mano";
      f.cruce = { accion: "enlazar", txId: ya.id, cuentaId: null };
      f.incluir = false;
      f.nota = `Ya registrado ${como} (${fechaCorta(ya.fecha)})`;
      continue;
    }

    // 2. Su otro lado está en otra cuenta, importado como egreso/ingreso.
    const par = masCercano(f, (t) =>
      t.cuenta_id !== X && t.cuenta_import === t.cuenta_id && t.tipo === (cargo ? "ingreso" : "egreso") &&
      !(t.tipo === "egreso" && t.tipo_cuenta === "credito") && // una compra con tarjeta no es transferencia
      (pareceTransferencia(f.descripcion) || pareceTransferencia(t.notas ?? t.comercio ?? "")));
    if (par) {
      usados.add(par.id);
      f.cruce = { accion: "convertir", txId: par.id, cuentaId: par.cuenta_id };
      f.tipo = "transferencia";
      f.contraparteId = par.cuenta_id;
      f.categoriaId = null;
      f.sugerida = null;
      f.incluir = true;
      f.nota = `Transferencia ${cargo ? "hacia" : "desde"} ${nombre(par.cuenta_id)}: se une con «${par.comercio ?? par.notas ?? "movimiento"}» del ${fechaCorta(par.fecha)}`;
    }
  }
}
