// Extracto de ejemplo para la demostración de Importar: un CSV con el formato de Nequi y datos
// inventados, con fechas de los últimos días. La cuenta «Billetera digital» de la demo termina en 9012,
// así que Cofre reconoce banco y cuenta solos, sugiere categorías y enlaza la recarga que ya existe.

interface Fila { dias: number; descripcion: string; pesos: number }

const iso = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const plata = (pesos: number) => {
  const s = Math.abs(pesos).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${pesos < 0 ? "-" : ""}${s}`;
};

/** CSV (separado por «;») con los movimientos de los últimos ~18 días, del más reciente al más antiguo. */
export function extractoDemo(hoyIso: string): string {
  const hoy = new Date(`${hoyIso}T12:00:00`);
  const dia = hoy.getDate();
  // La recarga de la demo es el día 3 de cada mes: si ya pasó este mes, esa; si no, la del mes anterior.
  const recarga = dia >= 3 ? dia - 3 : dia + (new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate() - 3);
  const filas: Fila[] = [
    { dias: 1, descripcion: "COMPRA EN CAFE CENTRAL", pesos: -14_500 },
    { dias: 2, descripcion: "PAGO EN QR BRE-B: PANADERIA LA ESPIGA", pesos: -8_900 },
    { dias: 3, descripcion: "COMPRA EN SUPERMERCADO LA ESQUINA", pesos: -86_300 },
    { dias: 5, descripcion: "COMPRA EN DROGUERIA VIDA", pesos: -23_400 },
    { dias: 6, descripcion: "PAGO EN QR BRE-B: TAXI EXPRESS", pesos: -18_000 },
    { dias: 8, descripcion: "COMPRA EN DOMICILIOS RAPIDOS", pesos: -32_900 },
    { dias: 10, descripcion: "COMPRA EN CINE PLAZA", pesos: -24_000 },
    { dias: 12, descripcion: "COMPRA EN ESTACION DE SERVICIO", pesos: -45_000 },
    { dias: 15, descripcion: "PAGO EN QR BRE-B: AREPAS DONA ROSA", pesos: -12_000 },
    { dias: recarga, descripcion: "RECARGA DESDE CUENTA DE AHORROS", pesos: 350_000 },
  ].sort((a, b) => a.dias - b.dias);

  const masAntigua = Math.max(...filas.map((f) => f.dias));
  const saldoAnterior = 160_000;
  // Saldos de antiguo a reciente; luego se escriben de reciente a antiguo, como en el extracto real.
  const conSaldo: (Fila & { saldo: number })[] = [];
  let saldo = saldoAnterior;
  for (const f of [...filas].reverse()) { saldo += f.pesos; conSaldo.push({ ...f, saldo }); }
  conSaldo.reverse();

  const fecha = (dias: number) => { const d = new Date(hoy); d.setDate(d.getDate() - dias); return iso(d); };
  const lineas = [
    "Extracto de ejemplo;Nequi;Datos inventados para la demostración de Cofre",
    "Número de depósito de bajo monto:;*** *** 9012",
    `Periodo:;${fecha(masAntigua)} - ${fecha(0)}`,
    `Saldo anterior;${plata(saldoAnterior)}`,
    `Saldo actual;${plata(saldo)}`,
    "",
    "Fecha;Descripción;Valor;Saldo",
    ...conSaldo.map((f) => `${fecha(f.dias)};${f.descripcion};${plata(f.pesos)};${plata(f.saldo)}`),
  ];
  return lineas.join("\n") + "\n";
}
