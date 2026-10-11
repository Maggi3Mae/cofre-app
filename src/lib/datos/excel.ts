// Descarga el reporte del filtro actual a Excel: arma los datos aquí y Rust escribe el .xlsx.
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { leerTrm } from "./ajustes";
import { listarCuentas } from "./cuentas";
import {
  resumenReporte, mensualReporte, topCategoriasReporte, topComerciosReporte, movimientosReporte, filtroAnterior,
  type FiltroReporte,
} from "./reportes";
import { nombreMesCorto, nombreMesLargo } from "$lib/periodo";

const p = (centavos: number) => centavos / 100;
const dos = (n: number) => String(n).padStart(2, "0");
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const nombrePeriodo = (f: FiltroReporte) => (f.mes ? nombreMesLargo(`${f.ano}-${dos(f.mes)}`) : `Año ${f.ano}`);

/** Pide dónde guardar y crea el archivo. Devuelve la ruta, o null si se canceló. */
export async function descargarExcel(f: FiltroReporte): Promise<string | null> {
  const sugerido = `Cofre-reporte-${f.ano}${f.mes ? `-${dos(f.mes)}` : ""}.xlsx`;
  const ruta = await save({ defaultPath: sugerido, filters: [{ name: "Excel", extensions: ["xlsx"] }] });
  if (!ruta) return null;
  const destino = ruta.toLowerCase().endsWith(".xlsx") ? ruta : `${ruta}.xlsx`;

  const trm = await leerTrm();
  const ant = filtroAnterior(f);
  const [r, ra, mensual, ce, ci, coms, movs, cuentas] = await Promise.all([
    resumenReporte(f, trm), resumenReporte(ant, trm), mensualReporte(f, trm),
    topCategoriasReporte(f, "egreso", trm, 1000), topCategoriasReporte(f, "ingreso", trm, 1000),
    topComerciosReporte(f, trm), movimientosReporte(f, trm), listarCuentas(true),
  ]);
  const cuenta = f.cuentaId != null ? cuentas.find((c) => c.id === f.cuentaId)?.nombre ?? "—" : "Todas";

  const reporte = {
    titulo: `Reporte Cofre · ${nombrePeriodo(f)}`,
    filtro: [["Período", nombrePeriodo(f)], ["Cuenta", cuenta], ["Generado", new Date().toLocaleDateString("es-CO")]],
    nombreAnterior: mayus(nombrePeriodo(ant)),
    kpis: [
      { nombre: "Ingresos", valor: p(r.ingresos), anterior: p(ra.ingresos) },
      { nombre: "Egresos", valor: p(r.egresos), anterior: p(ra.egresos) },
      { nombre: "Balance", valor: p(r.balance), anterior: p(ra.balance) },
    ],
    tasaAhorro: r.tasaAhorro,
    ano: f.ano,
    mensual: mensual.map((m) => ({ mes: nombreMesCorto(`${f.ano}-${dos(m.mes)}`), ingresos: p(m.ingresos), egresos: p(m.egresos) })),
    categorias: [
      ...ce.map((c) => ({ tipo: "Egreso", nombre: c.nombre, total: p(c.total), porcentaje: c.porcentaje })),
      ...ci.map((c) => ({ tipo: "Ingreso", nombre: c.nombre, total: p(c.total), porcentaje: c.porcentaje })),
    ],
    comercios: coms.map((c) => ({ comercio: c.comercio, veces: c.veces, total: p(c.total), porcentaje: c.porcentaje })),
    movimientos: movs.map((m) => ({
      fecha: m.fecha, tipo: m.tipo === "egreso" ? "Egreso" : "Ingreso", cuenta: m.cuenta, categoria: m.categoria,
      comercio: m.comercio, notas: m.notas, moneda: m.moneda, monto: p(m.monto), pesos: p(m.montoPesos),
    })),
    trm,
  };
  await invoke("reporte_excel", { ruta: destino, reporte });
  return destino;
}
