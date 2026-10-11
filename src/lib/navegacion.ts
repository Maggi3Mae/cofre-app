import type { NombreIcono } from "./iconos";

export const pantallas: { ruta: string; nombre: string; icono: NombreIcono }[] = [
  { ruta: "/", nombre: "Dashboard", icono: "dashboard" },
  { ruta: "/cuentas", nombre: "Cuentas", icono: "cuentas" },
  { ruta: "/transacciones", nombre: "Transacciones", icono: "transacciones" },
  { ruta: "/categorias", nombre: "Categorías", icono: "categorias" },
  { ruta: "/presupuestos", nombre: "Presupuestos", icono: "presupuestos" },
  { ruta: "/inversiones", nombre: "Inversiones", icono: "inversiones" },
  { ruta: "/medeben", nombre: "Me deben", icono: "personas" },
  { ruta: "/simulador", nombre: "Simulador", icono: "simulador" },
  { ruta: "/importar", nombre: "Importar", icono: "importar" },
  { ruta: "/reportes", nombre: "Reportes", icono: "reportes" },
  { ruta: "/ajustes", nombre: "Ajustes", icono: "ajustes" },
];

/** Celular: secciones que se abren desde «Más» (la barra inferior marca «Más» en ellas). */
export const rutasMas: { ruta: string; nombre: string; detalle: string; icono: NombreIcono; tono: "brand" | "saving" | "neutro" }[] = [
  { ruta: "/cuentas", nombre: "Cuentas", detalle: "Saldos, deudas y pagar tarjeta", icono: "cuentas", tono: "brand" },
  { ruta: "/presupuestos", nombre: "Presupuestos", detalle: "Cómo vas en cada categoría", icono: "presupuestos", tono: "brand" },
  { ruta: "/recurrentes", nombre: "Recurrentes", detalle: "Arriendo, servicios… y lo que falta confirmar", icono: "repetir", tono: "brand" },
  { ruta: "/inversiones", nombre: "Inversiones", detalle: "CDT y cajitas · aportar y retirar", icono: "inversiones", tono: "saving" },
  { ruta: "/reportes", nombre: "Resumen del mes", detalle: "Ingresos, egresos y top categorías", icono: "reportes", tono: "brand" },
  { ruta: "/ajustes", nombre: "Ajustes", detalle: "Tema, ojito y tu nombre", icono: "ajustes", tono: "neutro" },
];

/** Celular: secciones que solo están en el Mac y la tablet (si se abren, vuelve a Inicio). */
export const fueraDelCelular = ["/importar", "/categorias", "/simulador"];
