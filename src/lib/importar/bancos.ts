// Reconocimiento del banco y de la cuenta de un extracto.
// Cada formato conocido es una «plantilla» incluida; en el Bloque 4 se suman las que cree la usuaria.
import type { Cuenta, TipoCuenta, Plantilla } from "$lib/datos";
import type { Documento } from "./documento";
import { leerBbvaCredito, leerBbvaAhorros, leerNequi, type Lectura } from "./lectores";
import { leerConPlantilla, normalizarFrase } from "./plantilla";

export interface FormatoBanco {
  id: string;
  nombre: string;
  /** Debe coincidir (sin importar mayúsculas) con `cuentas.banco` para sugerir la cuenta. */
  banco: string;
  tipoCuenta: TipoCuenta;
  reconoce: (texto: string) => boolean;
  /** Últimos 4 dígitos de la tarjeta o cuenta, leídos del encabezado. */
  ultimos4: (texto: string) => string | null;
  leer: (doc: Documento) => Lectura;
  /** Solo en formatos enseñados por la usuaria. */
  plantilla?: Plantilla;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const ultimos = (m: RegExpMatchArray | null) => (m ? m[1].slice(-4) : null);

export const FORMATOS: FormatoBanco[] = [
  {
    id: "bbva_credito", nombre: "BBVA · Tarjeta de crédito", banco: "BBVA", tipoCuenta: "credito",
    // En los PDF de BBVA el logo, los títulos y las etiquetas son imágenes: se reconoce por la tabla.
    reconoce: (t) => /MOVIMIENTOS DE ESTE MES/.test(t) && /TARJETA\s+\d{4,6}\*+\d{4}/.test(t),
    ultimos4: (t) => ultimos(t.match(/TARJETA\s+\d{4,6}\*+(\d{4})/i) ?? t.match(/Tarjeta No\.?:?\s*([\d* ]*\d{4})/i)),
    leer: leerBbvaCredito,
  },
  {
    id: "bbva_ahorros", nombre: "BBVA · Cuenta de ahorros", banco: "BBVA", tipoCuenta: "debito",
    reconoce: (t) => /SALDO CIERRE MES ANTERIOR/.test(t) && /PER[IÍ]ODO DESDE/i.test(t),
    // El número de cuenta va en la misma línea que la dirección de la oficina.
    ultimos4: (t) => ultimos(sinTildes(t).match(/Numero de cuenta[^\d\n]*([\d*\- ]*\d{4})/i) ?? sinTildes(t).match(/DIRECCION:[^\n]*\s{3,}([\d*\-]{8,})\s*$/m)),
    leer: leerBbvaAhorros,
  },
  {
    id: "nequi", nombre: "Nequi · Depósito", banco: "Nequi", tipoCuenta: "debito",
    reconoce: (t) => /nequi/i.test(t) && /bajo monto/i.test(t),
    ultimos4: (t) => ultimos(sinTildes(t).match(/Numero de deposito de bajo monto:?[^\d\n]*([\d*\- ]*\d{4})/i)),
    leer: leerNequi,
  },
];

/** Un formato enseñado se comporta igual que los incluidos. */
export function formatoDePlantilla(p: Plantilla): FormatoBanco {
  const frase = normalizarFrase(p.frase);
  return {
    id: `plantilla:${p.id}`, nombre: p.nombre, banco: p.banco, tipoCuenta: p.tipo_cuenta,
    reconoce: (t) => normalizarFrase(t).includes(frase),
    ultimos4: () => null,
    leer: (doc) => leerConPlantilla(doc, p.config),
    plantilla: p,
  };
}

/** Incluidos + enseñados (los enseñados primero: son más específicos para quien los creó). */
export const todosLosFormatos = (plantillas: Plantilla[] = []) => [...plantillas.map(formatoDePlantilla), ...FORMATOS];

export const formatoPorId = (id: string | null, plantillas: Plantilla[] = []) =>
  todosLosFormatos(plantillas).find((f) => f.id === id) ?? null;

export interface Deteccion {
  formato: FormatoBanco | null;
  ultimos4: string | null;
  cuentaId: number | null;
}

export function detectar(doc: Documento, cuentas: Cuenta[], plantillas: Plantilla[] = []): Deteccion {
  const formato = todosLosFormatos(plantillas).find((f) => f.reconoce(doc.texto)) ?? null;
  const u4 = formato?.ultimos4(doc.texto) ?? null;
  return { formato, ultimos4: u4, cuentaId: elegirCuenta(cuentas, formato, u4, doc.texto) };
}

/** Prioridad: últimos 4 exactos → mismo banco y tipo (si es la única) → últimos 4 que aparezcan en el texto. */
function elegirCuenta(cuentas: Cuenta[], f: FormatoBanco | null, u4: string | null, texto: string): number | null {
  const activas = cuentas.filter((c) => !c.archivada);
  const fija = f?.plantilla?.cuenta_id;
  if (fija && activas.some((c) => c.id === fija)) return fija;
  const mismoTipo = (c: Cuenta) => !f || c.tipo === f.tipoCuenta;
  if (u4) {
    const c = activas.find((c) => c.ultimos4 === u4 && mismoTipo(c));
    if (c) return c.id;
  }
  if (f) {
    const delBanco = activas.filter((c) => mismoTipo(c) && c.banco?.trim().toLowerCase() === f.banco.toLowerCase());
    if (delBanco.length === 1) return delBanco[0].id;
  }
  const enTexto = activas.filter((c) => c.ultimos4 && mismoTipo(c) && new RegExp(`[*\\d]${c.ultimos4}\\b`).test(texto));
  return enTexto.length === 1 ? enTexto[0].id : null;
}
