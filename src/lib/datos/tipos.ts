// Tipos de dominio. Montos siempre en centavos; fechas «AAAA-MM-DD».
import type { ClaveColor } from "./paleta";
import type { NombreIcono } from "$lib/iconos";

export type TipoCuenta = "debito" | "credito" | "efectivo" | "inversion";
export type Moneda = "COP" | "USD";
export type TipoCategoria = "ingreso" | "egreso";
export type TipoTx = "ingreso" | "egreso" | "transferencia";

export interface Cuenta {
  id: number;
  nombre: string;
  tipo: TipoCuenta;
  moneda: Moneda;
  banco: string | null;
  ultimos4: string | null;
  /** En débito/efectivo/inversión: saldo inicial. En crédito: deuda inicial, en positivo. */
  saldo_inicial: number;
  cupo: number | null;
  dia_corte: number | null;
  dia_pago: number | null;
  tasa_ea: number | null;
  /** Crédito: si cobra interés en compras a 1 cuota. */
  interes_una_cuota: boolean;
  /** Crédito: comisión por compra internacional (0,029 = 2,9 %). */
  comision_internacional: number;
  principal: boolean;
  archivada: boolean;
  /** Calculado. En crédito es la deuda actual (positiva = debes). */
  saldo: number;
  num_movimientos: number;
}
export type CuentaNueva = Omit<Cuenta, "id" | "saldo" | "num_movimientos" | "archivada">;

export interface Categoria {
  id: number;
  nombre: string;
  tipo: TipoCategoria;
  icono: NombreIcono | null;
  color: ClaveColor | null;
  padre_id: number | null;
  num_movimientos: number;
  /** Total de este mes; en una categoría padre incluye a sus hijas. */
  total_mes: number;
  num_hijas: number;
}
export type CategoriaNueva = Omit<Categoria, "id" | "num_movimientos" | "total_mes" | "num_hijas">;

export interface Etiqueta {
  id: number;
  nombre: string;
  num_movimientos: number;
  /** Total histórico de egresos con esta etiqueta. */
  gastado: number;
  /** Total histórico de ingresos (p. ej. reembolsos). */
  recibido: number;
}

export interface Transaccion {
  id: number;
  fecha: string;
  monto: number;
  tipo: TipoTx;
  cuenta_id: number;
  cuenta_destino_id: number | null;
  categoria_id: number | null;
  comercio: string | null;
  notas: string | null;
  /** Transferencia entre monedas: lo que entra al destino. null = igual a monto. */
  monto_destino: number | null;
  // Datos unidos para mostrar
  cuenta_nombre: string;
  cuenta_tipo: TipoCuenta;
  cuenta_moneda: Moneda;
  cuenta_destino_nombre: string | null;
  cuenta_destino_moneda: Moneda | null;
  categoria_nombre: string | null;
  categoria_icono: NombreIcono | null;
  categoria_color: ClaveColor | null;
  etiquetas: { id: number; nombre: string }[];
  /** Apertura o retiro de un CDT/cajita: se gestiona desde Inversiones. */
  es_inversion: boolean;
  /** Préstamo, abono o préstamo perdido de «Me deben»: la persona (se abre «Me deben», no se edita aquí). */
  prestamo_persona_id: number | null;
  /** Tu parte de un gasto grupal (no se vuelve a dividir). */
  gasto_grupal_id: number | null;
  /** Nombre del archivo de la foto adjunta (WebP en la carpeta de la app). */
  adjunto: string | null;
  /** Compra a cuotas con tarjeta: número de cuotas (null si no tiene plan). */
  num_cuotas: number | null;
  /** Ocurrencia de un movimiento recurrente. */
  recurrente_id: number | null;
}

export interface TransaccionNueva {
  fecha: string;
  monto: number;
  tipo: TipoTx;
  cuenta_id: number;
  cuenta_destino_id?: number | null;
  categoria_id?: number | null;
  comercio?: string | null;
  notas?: string | null;
  /** Solo en transferencias entre cuentas de distinta moneda. */
  monto_destino?: number | null;
  /** Nombres; las que no existan se crean. */
  etiquetas?: string[];
}

export interface FiltroTx {
  texto?: string;
  tipo?: TipoTx;
  cuentaId?: number;
  categoriaId?: number;
  /** Solo ingresos/egresos sin categoría. */
  sinCategoria?: boolean;
  etiquetaId?: number;
  desde?: string;
  hasta?: string;
  limite?: number;
  desplazamiento?: number;
}

export interface Sugerencia {
  comercio: string;
  monto: number;
  tipo: TipoTx;
  cuenta_id: number;
  cuenta_destino_id: number | null;
  categoria_id: number | null;
  categoria_icono: NombreIcono | null;
  veces: number;
  ultima: string;
}

/** Totales de un filtro, separados por moneda (no se mezclan pesos y dólares). */
export interface TotalesTx {
  cantidad: number;
  porMoneda: { moneda: Moneda; ingresos: number; egresos: number; balance: number }[];
}
