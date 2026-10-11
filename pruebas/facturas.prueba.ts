// Lectura del texto de facturas (OCR): sobre todo el nombre del comercio. Textos inventados con la
// forma de un tiquete POS colombiano. Correr: npm run prueba:facturas
import assert from "node:assert/strict";
import { leerTextoFactura } from "../src/lib/facturas/leer.ts";

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

console.log(`\n${ok} pruebas de facturas OK`);
