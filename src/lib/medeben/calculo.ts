// Cálculos de «Me deben» (puros, sin base de datos).
// Montos en centavos (enteros). Fechas «AAAA-MM-DD».
// Los abonos se reparten en orden sobre las cuotas del plan (la más antigua primero).
// Vencido = pasó una fecha (la acordada o la de una cuota) y lo abonado no alcanza lo que ya debía estar pago.

import { diasEntre } from "$lib/inversiones/calculo";

export type EstadoPrestamo = "activo" | "pagado" | "perdido";
export type EstadoCuota = "pagada" | "parcial" | "pendiente" | "vencida";

export interface CuotaPlan { numero: number; fecha: string; monto: number }

export interface CuotaCalculada extends CuotaPlan {
  /** Parte de esta cuota que ya cubren los abonos. */
  abonado: number;
  estado: EstadoCuota;
}

export interface CalculoPrestamo {
  abonado: number;
  perdido: number;
  /** Lo que falta: monto − abonado − perdido (nunca negativo). */
  pendiente: number;
  /** 0–1: abonado / monto. */
  progreso: number;
  estado: EstadoPrestamo;
  vencido: boolean;
  /** Días desde la fecha más antigua incumplida (0 si no está vencido). */
  diasVencido: number;
  /** Lo que ya debía estar pago a hoy y no lo está. */
  atrasado: number;
  /** Fecha incumplida más antigua (cuota sin cubrir o fecha acordada), o null. */
  fechaVencida: string | null;
  /** Próxima fecha con algo por pagar (cuota sin cubrir o fecha acordada), o null. */
  proximaFecha: string | null;
  cuotas: CuotaCalculada[];
}

export interface DatosPrestamo {
  monto: number;
  fecha_acordada: string | null;
  perdido_en: string | null;
}

export function calcularPrestamo(
  p: DatosPrestamo, abonado: number, perdido: number, cuotas: CuotaPlan[], dia: string,
): CalculoPrestamo {
  const pendiente = Math.max(0, p.monto - abonado - perdido);
  const estado: EstadoPrestamo = p.perdido_en ? "perdido" : pendiente === 0 ? "pagado" : "activo";
  const progreso = p.monto > 0 ? Math.min(1, abonado / p.monto) : 0;

  // Reparto de los abonos sobre las cuotas, en orden.
  let resto = abonado;
  const ordenadas = [...cuotas].sort((a, b) => a.numero - b.numero);
  const calc: CuotaCalculada[] = ordenadas.map((c) => {
    const cubre = Math.min(resto, c.monto);
    resto -= cubre;
    const est: EstadoCuota = cubre >= c.monto ? "pagada"
      : estado === "activo" && c.fecha < dia ? "vencida"
      : cubre > 0 ? "parcial" : "pendiente";
    return { ...c, abonado: cubre, estado: est };
  });

  let vencido = false, diasVencido = 0, atrasado = 0, proximaFecha: string | null = null, fechaVencida: string | null = null;
  if (estado === "activo") {
    if (calc.length) {
      const vencidas = calc.filter((c) => c.estado === "vencida");
      atrasado = vencidas.reduce((s, c) => s + c.monto - c.abonado, 0);
      if (vencidas.length) { vencido = true; fechaVencida = vencidas[0].fecha; diasVencido = diasEntre(fechaVencida, dia); }
      proximaFecha = calc.find((c) => c.estado !== "pagada" && c.fecha >= dia)?.fecha ?? null;
    }
    if (p.fecha_acordada) {
      if (p.fecha_acordada < dia) {
        vencido = true;
        atrasado = pendiente;
        diasVencido = Math.max(diasVencido, diasEntre(p.fecha_acordada, dia));
        if (!fechaVencida || p.fecha_acordada < fechaVencida) fechaVencida = p.fecha_acordada;
      } else if (!proximaFecha || p.fecha_acordada < proximaFecha) {
        proximaFecha = p.fecha_acordada;
      }
    }
  }
  return { abonado, perdido, pendiente, progreso, estado, vencido, diasVencido, atrasado, fechaVencida, proximaFecha, cuotas: calc };
}

/** Suma `n` meses a una fecha conservando el día (o el último del mes si no existe: 31 ene + 1 = 28/29 feb). */
export function sumarMeses(fecha: string, n: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  const anio = Math.floor(total / 12), mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/**
 * Plan de `n` cuotas mensuales iguales desde `primeraFecha`.
 * Se reparte en pesos enteros; los pesos que sobran van a la última cuota.
 */
export function generarPlanCuotas(monto: number, n: number, primeraFecha: string): CuotaPlan[] {
  if (!Number.isInteger(n) || n < 1) throw new Error("El número de cuotas debe ser 1 o más.");
  const base = Math.floor(monto / n / 100) * 100; // centavos → pesos enteros
  const cuotas: CuotaPlan[] = [];
  for (let i = 0; i < n; i++)
    cuotas.push({ numero: i + 1, fecha: sumarMeses(primeraFecha, i), monto: i === n - 1 ? monto - base * (n - 1) : base });
  if (cuotas.some((c) => c.monto <= 0)) throw new Error("El monto es muy pequeño para tantas cuotas.");
  return cuotas;
}
