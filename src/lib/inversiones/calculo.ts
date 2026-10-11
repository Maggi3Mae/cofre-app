// Cálculos de CDT (y cajitas): interés compuesto diario sobre 365 días.
//   tasa_diaria = (1 + EA)^(1/365) − 1
//   valor = capital × (1 + tasa_diaria)^días
// Montos en centavos (enteros). Fechas «AAAA-MM-DD» en hora local.

const DIA = 864e5;
const utc = (f: string) => { const [a, m, d] = f.split("-").map(Number); return Date.UTC(a, m - 1, d); };

export const diasEntre = (desde: string, hasta: string) => Math.round((utc(hasta) - utc(desde)) / DIA);

export function sumarDias(fecha: string, n: number): string {
  return new Date(utc(fecha) + n * DIA).toISOString().slice(0, 10);
}

export const tasaDiaria = (ea: number) => Math.pow(1 + ea, 1 / 365) - 1;

export const crecer = (capital: number, ea: number, dias: number) => capital * Math.pow(1 + tasaDiaria(ea), Math.max(0, dias));

export type EstadoCdt = "por_iniciar" | "activo" | "vence_pronto" | "vencido";

export interface CalculoCdt {
  vencimiento: string;
  diasTranscurridos: number;
  diasRestantes: number;
  estado: EstadoCdt;
  /** 0–1 */
  progreso: number;
  brutoHoy: number;
  retencionHoy: number;
  netoHoy: number;
  /** Capital + rendimiento neto a hoy. */
  totalNetoHoy: number;
  /** Interés neto que gana hoy (0 si no está corriendo). */
  interesDia: number;
  brutoVencimiento: number;
  retencionVencimiento: number;
  netoVencimiento: number;
  totalNetoVencimiento: number;
}

export const VENCE_PRONTO = 7;

export function calcularCdt(
  c: { monto: number; tasa_ea: number; fecha_inicio: string; plazo_dias: number; retencion: number },
  hoy: string,
): CalculoCdt {
  const vencimiento = sumarDias(c.fecha_inicio, c.plazo_dias);
  const transcurridos = Math.min(c.plazo_dias, Math.max(0, diasEntre(c.fecha_inicio, hoy)));
  const restantes = Math.max(0, diasEntre(hoy, vencimiento));
  const estado: EstadoCdt =
    diasEntre(c.fecha_inicio, hoy) < 0 ? "por_iniciar"
    : restantes === 0 ? "vencido"
    : restantes <= VENCE_PRONTO ? "vence_pronto" : "activo";

  const valorHoy = crecer(c.monto, c.tasa_ea, transcurridos);
  const brutoHoy = Math.round(valorHoy - c.monto);
  const retencionHoy = Math.round(brutoHoy * c.retencion);
  const brutoVenc = Math.round(crecer(c.monto, c.tasa_ea, c.plazo_dias) - c.monto);
  const retencionVenc = Math.round(brutoVenc * c.retencion);
  const corriendo = estado === "activo" || estado === "vence_pronto";

  return {
    vencimiento,
    diasTranscurridos: transcurridos,
    diasRestantes: restantes,
    estado,
    progreso: c.plazo_dias > 0 ? transcurridos / c.plazo_dias : 1,
    brutoHoy,
    retencionHoy,
    netoHoy: brutoHoy - retencionHoy,
    totalNetoHoy: c.monto + brutoHoy - retencionHoy,
    interesDia: corriendo ? Math.round(valorHoy * tasaDiaria(c.tasa_ea) * (1 - c.retencion)) : 0,
    brutoVencimiento: brutoVenc,
    retencionVencimiento: retencionVenc,
    netoVencimiento: brutoVenc - retencionVenc,
    totalNetoVencimiento: c.monto + brutoVenc - retencionVenc,
  };
}

// ---------- Cajitas (sin retención) ----------

export interface CalculoCajita {
  /** Días desde la fecha del saldo guardado. */
  dias: number;
  valorHoy: number;
  /** Interés ganado desde la última actualización del saldo. */
  acumulado: number;
  interesDia: number;
  /** 0–1, null sin meta. */
  progreso: number | null;
  falta: number | null;
  /** Aporte mensual para llegar a la meta en la fecha meta (sin contar intereses). */
  aporteMensual: number | null;
  mesesRestantes: number | null;
}

export function calcularCajita(
  c: { saldo: number; tasa_ea: number; fecha_saldo: string; meta: number | null; fecha_meta: string | null },
  hoy: string,
): CalculoCajita {
  const dias = Math.max(0, diasEntre(c.fecha_saldo, hoy));
  const valorHoy = Math.round(crecer(c.saldo, c.tasa_ea, dias));
  const conMeta = c.meta != null && c.meta > 0;
  const falta = conMeta ? Math.max(0, c.meta! - valorHoy) : null;
  let meses: number | null = null, aporte: number | null = null;
  if (conMeta && c.fecha_meta && falta! > 0) {
    const d = diasEntre(hoy, c.fecha_meta);
    if (d > 0) {
      meses = Math.max(1, Math.ceil(d / 30.44));
      aporte = Math.ceil(falta! / meses / 100) * 100; // pesos enteros
    }
  }
  return {
    dias, valorHoy, acumulado: valorHoy - c.saldo,
    interesDia: Math.round(valorHoy * tasaDiaria(c.tasa_ea)),
    progreso: conMeta ? Math.min(1, valorHoy / c.meta!) : null,
    falta, aporteMensual: aporte, mesesRestantes: meses,
  };
}
