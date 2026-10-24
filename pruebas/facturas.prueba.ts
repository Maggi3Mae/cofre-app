// Lectura del texto de facturas (OCR): sobre todo el nombre del comercio. Textos inventados con la
// forma de un tiquete POS colombiano. Correr: npm run prueba:facturas
import assert from "node:assert/strict";
import { leerTextoFactura, leerQrDian } from "../src/lib/facturas/leer.ts";

let ok = 0;
const prueba = (nombre: string, f: () => void) => { f(); ok++; console.log("✓", nombre); };

const tiquete = (nit = "NIT 900.123.456-7") => `
DROGUERIA EJEMPLO
DONDE NADIE TE CUIDA MAS
DOMICILIOS 24 HORAS (601) 5550000
DROGUERIA EJEMPLO COLOMBIA S.A
${nit}
SUCURSAL CENTRO CRA 1 # 2-3
Factura Electronica de Venta
Fecha: 7/10/26 Hora: 2:51 PM
Cliente: consumidor final
Articulo Cantidad Precio Importe
Protector solar 1 44,950 44,950
TOTAL 44,950
FORMAS DE PAGO
TARJETA CREDITO 44,950
Autorizacion de Facturacion
RESOLUCION DIAN 18764000000000
PREFIJO 0T1 RANGO AUTORIZADO 1 AL 1000000
VIGENCIA 18 MESES DEL 2025-09-29 AL 2027-03-29
Proveedor Tecnologico Software Ejemplo S.A.S NIT 890.000.001-1
`;

prueba("toma la razón social que va pegada al NIT (no la letra pequeña del pie)", () => {
  const d = leerTextoFactura(tiquete());
  assert.equal(d.nit, "900123456");
  assert.equal(d.comercio, "Drogueria Ejemplo Colombia");
  assert.equal(d.total, 4495000);
  assert.equal(d.medio, "credito");
});

prueba("con el NIT del QR ubica el encabezado aunque el OCR lea mal «NIT»", () => {
  const d = leerTextoFactura(tiquete("N1T 900.123.456-7"), "900123456");
  assert.equal(d.nit, "900123456");
  assert.equal(d.comercio, "Drogueria Ejemplo Colombia");
});

prueba("razón social en la misma línea del NIT", () => {
  const d = leerTextoFactura("PANADERIA LA ESPIGA S.A.S NIT 901.555.222-3\nTOTAL 8,900\nEFECTIVO 8,900\n");
  assert.equal(d.comercio, "Panaderia la Espiga");
});

prueba("sin razón social, sigue tomando la línea más larga encima del NIT", () => {
  const d = leerTextoFactura("CAFE CENTRAL\nCALLE 10 # 5-20\nNIT 1.020.304.050\nTOTAL 14,500\n");
  assert.equal(d.comercio, "Cafe Central");
});

prueba("ignora la razón social del proveedor tecnológico en el pie", () => {
  const d = leerTextoFactura("ARTESANIAS DEL BARRIO\nNIT 800.111.222-1\nTOTAL 20,000\nProveedor Tecnologico Facturas Ya S.A.S\n");
  assert.equal(d.comercio, "Artesanias del Barrio");
});

prueba("una palabra que termina en «sa» no es razón social", () => {
  const d = leerTextoFactura("LA CASA DE LA MESA\nNIT 800.333.444-5\nTOTAL 30,000\n");
  assert.equal(d.comercio, "La Casa de la Mesa");
});

prueba("OCR real: «S.A» leída como «$.A», sin la línea del NIT y con otro NIT en el pie", () => {
  const t = `DOMICILIOS 24 HUNAS ele
DROGUERIA EJEMPLO COLOMBIA $.A
DSALES 316-000-0000
DIAGONAL 1 NO 2-3 BOROTA OC Colombia
Factura Esectrónica de Venta
Totel 44,950
TARJETA CREDITO 44,950
VIG 18 MESES DEL 2026-09-29 AL 2028-03-29
Software Ejemplo Colombia NIT 8001000000
Proveedor Tecnológico: Facturas Ya S.A.S
- Nombre del SW: Ejemplo - Nit: 890.000.001-1`;
  for (const nit of [null, "900123456"]) {
    const d = leerTextoFactura(t, nit);
    assert.equal(d.comercio, "Drogueria Ejemplo Colombia");
    assert.equal(d.nit, nit);
  }
});

// ---------- QR (contenidos reales leídos de fotos) ----------
const CUFE_D1 = "dfa9bf697b08f0919a48e1ad2f74658b540c6aeb6e5c4ccaef4b9f5cd739dc7aba774a74730a342debc4eba23534affd";

prueba("QR DIAN separado por «;» (D1): NIT, total ValTotalFac, fecha y CUFE", () => {
  const d = leerQrDian(`NumFac=G4O685404;FecFac=2026-10-13;HorFac=15:50:41-05:00;NitFac=900276962;DocAdq=2222222222;ValFac=11932.77;ValIva=2267.22;ValOtroIm=0.00;ValTotalFac=14199.99;CUFE=${CUFE_D1};QRCode=https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${CUFE_D1}`)!;
  assert.equal(d.cufe, CUFE_D1);
  assert.equal(d.nit, "900276962");
  assert.equal(d.numero, "G4O685404");
  assert.equal(d.fecha, "2026-10-13");
  assert.equal(d.total, 1419999);
});

prueba("QR DIAN por líneas con «:» (formato anterior)", () => {
  const d = leerQrDian(`NumFac: 171P-178427\nFecFac: 2026-09-27\nNitFac: 890904478\nValTolFac: 17900.00\nCUFE: ${CUFE_D1}`)!;
  assert.equal(d.cufe, CUFE_D1);
  assert.equal(d.nit, "890904478");
  assert.equal(d.total, 1790000);
  assert.equal(d.fecha, "2026-09-27");
});

prueba("QR solo enlace DIAN: CUFE", () => {
  assert.equal(leerQrDian(`https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${CUFE_D1}`)!.cufe, CUFE_D1);
});

prueba("QR enlace del comercio (Dollarcity): fecha, número y total, sin CUFE", () => {
  const d = leerQrDian("https://facturaelectronicacol.dollarcity.com/fel-pos?storenum=3227&trackid=32271-20261015-3666&transdate=2026-10-15&prefix=F6G1&correlative=2048594&txnnum=3666&total=6000.00")!;
  assert.equal(d.cufe, null);
  assert.equal(d.fecha, "2026-10-15");
  assert.equal(d.numero, "F6G1-2048594");
  assert.equal(d.total, 600000);
});

prueba("QR que no es de factura → null", () => {
  assert.equal(leerQrDian("https://www.dollarcity.com"), null);
});

console.log(`\n${ok} pruebas de facturas OK`);
