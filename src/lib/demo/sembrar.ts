// Datos de demostración (solo en `npm run demo`): 6 meses inventados, con fechas relativas a hoy,
// pensados para las capturas de la página. Se usan las mismas funciones de la app, así que todo
// (saldos, transferencias, préstamos, cuotas) queda como si se hubiera registrado a mano.
import { db } from "$lib/db";
import { hoy } from "$lib/formato";
import { crearCuenta } from "$lib/datos/cuentas";
import { crearTransaccion } from "$lib/datos/transacciones";
import { calcularPlan, guardarPlan } from "$lib/datos/cuotas";
import { guardarAjuste, guardarTrm } from "$lib/datos/ajustes";
import { guardarPresupuesto } from "$lib/datos/presupuestos";
import { crearCdt } from "$lib/datos/cdts";
import { crearCajita } from "$lib/datos/cajitas";
import { crearPersona, crearPrestamo, abonarPrestamo } from "$lib/datos/medeben";
import { crearGastoGrupal } from "$lib/datos/grupales";
import { crearRecurrente, generarAutomaticas } from "$lib/datos/recurrentes";
import { generarPlanCuotas } from "$lib/medeben/calculo";
import type { TransaccionNueva } from "$lib/datos/tipos";

const $ = (pesos: number) => Math.round(pesos) * 100; // pesos → centavos

/** Azar con semilla: las capturas salen iguales cada vez. */
function azar(semilla: number) {
  let a = semilla >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    r,
    entre: (min: number, max: number) => min + r() * (max - min),
    /** Monto redondeado a centenas de pesos. */
    monto: (min: number, max: number) => Math.round((min + r() * (max - min)) / 100) * 100,
    de: <T>(lista: readonly T[]): T => lista[Math.floor(r() * lista.length)],
    prob: (p: number) => r() < p,
  };
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function desdeHoy(dias: number): string {
  const d = new Date(`${hoy()}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return iso(d);
}
const diasDelMes = (ano: number, mes0: number) => new Date(ano, mes0 + 1, 0).getDate();

/** ¿La base está vacía? (sin cuentas = nunca se sembró). */
export async function demoVacia(): Promise<boolean> {
  const [f] = await (await db()).select<{ n: number }[]>("SELECT COUNT(*) AS n FROM cuentas");
  return Number(f?.n ?? 0) === 0;
}

export async function sembrarSiVacia(): Promise<void> {
  if (await demoVacia()) await sembrarDemo();
}

export async function sembrarDemo(): Promise<void> {
  const z = azar(20261010);
  const con = await db();
  const hoyIso = hoy();
  const [anoHoy, mesHoy, diaHoy] = hoyIso.split("-").map(Number);

  const cats = new Map(
    (await con.select<{ id: number; nombre: string }[]>("SELECT id, nombre FROM categorias")).map((c) => [c.nombre, c.id]),
  );
  const cat = (nombre: string) => {
    const id = cats.get(nombre);
    if (id == null) throw new Error(`Falta la categoría «${nombre}» en la base de demostración.`);
    return id;
  };

  await guardarAjuste("nombre", "Ana");
  await guardarTrm(3950);

  // ---------- Cuentas ----------
  const inicio6 = new Date(anoHoy, mesHoy - 1 - 5, 1);
  const ahorros = await crearCuenta({
    nombre: "Cuenta de ahorros", tipo: "debito", moneda: "COP", banco: "Mi banco", ultimos4: "1234",
    saldo_inicial: $(2_800_000), cupo: null, dia_corte: null, dia_pago: null, tasa_ea: null,
    interes_una_cuota: false, comision_internacional: 0.029, principal: true,
  });
  const tarjeta = await crearCuenta({
    nombre: "Tarjeta de crédito", tipo: "credito", moneda: "COP", banco: "Mi banco", ultimos4: "5678",
    saldo_inicial: 0, cupo: $(9_000_000), dia_corte: 15, dia_pago: 2, tasa_ea: 0.285,
    interes_una_cuota: false, comision_internacional: 0.029, principal: false,
  });
  const billetera = await crearCuenta({
    nombre: "Billetera digital", tipo: "debito", moneda: "COP", banco: "Billetera", ultimos4: "9012",
    saldo_inicial: $(180_000), cupo: null, dia_corte: null, dia_pago: null, tasa_ea: null,
    interes_una_cuota: false, comision_internacional: 0.029, principal: false,
  });
  const efectivo = await crearCuenta({
    nombre: "Efectivo", tipo: "efectivo", moneda: "COP", banco: null, ultimos4: null,
    saldo_inicial: $(220_000), cupo: null, dia_corte: null, dia_pago: null, tasa_ea: null,
    interes_una_cuota: false, comision_internacional: 0.029, principal: false,
  });

  const tx = (t: TransaccionNueva) => crearTransaccion(t);
  const egreso = (fecha: string, pesos: number, cuenta: number, categoria: string, comercio: string, etiquetas?: string[]) =>
    tx({ fecha, monto: $(pesos), tipo: "egreso", cuenta_id: cuenta, categoria_id: cat(categoria), comercio, etiquetas });

  // ---------- Recurrentes (registran solos los meses pasados) ----------
  const inicioIso = iso(inicio6);
  await crearRecurrente({ nombre: "Nómina", tipo: "ingreso", monto: $(4_600_000), cuenta_id: ahorros, categoria_id: cat("Salario"),
    comercio: "Empresa S.A.S.", frecuencia: "mensual", dia: 1, modo: "auto", inicio: inicioIso });
  await crearRecurrente({ nombre: "Arriendo", tipo: "egreso", monto: $(1_450_000), cuenta_id: ahorros, categoria_id: cat("Hogar"),
    comercio: "Arriendo apartamento", frecuencia: "mensual", dia: 5, modo: "auto", inicio: inicioIso });
  await crearRecurrente({ nombre: "Internet hogar", tipo: "egreso", monto: $(89_900), cuenta_id: ahorros, categoria_id: cat("Servicios"),
    comercio: "Internet Fibra", frecuencia: "mensual", dia: 8, modo: "auto", inicio: inicioIso });
  await crearRecurrente({ nombre: "Música", tipo: "egreso", monto: $(16_900), cuenta_id: tarjeta, categoria_id: cat("Suscripciones"),
    comercio: "App de música", frecuencia: "mensual", dia: 3, modo: "auto", inicio: inicioIso });
  // Pide confirmación: empieza este mes para que salga un «por confirmar».
  await crearRecurrente({ nombre: "Series", tipo: "egreso", monto: $(44_900), cuenta_id: tarjeta, categoria_id: cat("Suscripciones"),
    comercio: "Plataforma de series", frecuencia: "mensual", dia: Math.max(1, Math.min(diaHoy, 28)), modo: "confirmar",
    inicio: `${anoHoy}-${String(mesHoy).padStart(2, "0")}-01` });
  await crearRecurrente({ nombre: "Gimnasio", tipo: "egreso", monto: $(95_000), cuenta_id: tarjeta, categoria_id: cat("Salud"),
    comercio: "Gimnasio Activo", frecuencia: "mensual", dia: 20, modo: "confirmar", inicio: desdeHoy(1) });
  await generarAutomaticas();

  // ---------- Gastos del día a día ----------
  const mercado = ["Supermercado La Esquina", "Fruver El Huerto", "Mercado del Barrio"] as const;
  const comida = ["Café Central", "Panadería La Espiga", "Restaurante Sabor Casero", "Domicilios Rápidos", "Arepas Doña Rosa"] as const;
  const transporte = ["App de transporte", "Recarga transporte público", "Taxi", "Estación de servicio"] as const;
  const medios = [tarjeta, tarjeta, ahorros, billetera, efectivo] as const;

  const bolsillo = new Map<number, number>([[billetera, 180_000], [efectivo, 220_000]]); // pesos disponibles
  let pagoPendiente = 0; // lo que se paga de la tarjeta el día 2 del mes siguiente (pesos)
  let cuotaPortatil = 0;
  for (let m = -5; m <= 0; m++) {
    const primero = new Date(anoHoy, mesHoy - 1 + m, 1);
    const ano = primero.getFullYear(), mes0 = primero.getMonth();
    const ultimo = m === 0 ? diaHoy : diasDelMes(ano, mes0);
    const f = (dia: number) => iso(new Date(ano, mes0, Math.min(dia, ultimo)));
    let tarjetaMes = 16_900 + cuotaPortatil; // la suscripción de música y la cuota del portátil
    const gasto = async (dia: number, pesos: number, cuenta: number, categoria: string, comercio: string, etiquetas?: string[]) => {
      if (dia > ultimo) return;
      // Billetera y efectivo no quedan en negativo: si no alcanza, se paga con la tarjeta.
      if (cuenta === billetera || cuenta === efectivo) {
        if ((bolsillo.get(cuenta) ?? 0) < pesos) cuenta = tarjeta;
        else bolsillo.set(cuenta, bolsillo.get(cuenta)! - pesos);
      }
      await egreso(f(dia), pesos, cuenta, categoria, comercio, etiquetas);
      if (cuenta === tarjeta) tarjetaMes += pesos;
    };

    // Pago de la tarjeta (lo del mes anterior) y recarga de la billetera.
    if (m > -5 && 2 <= ultimo)
      await tx({ fecha: f(2), monto: $(pagoPendiente), tipo: "transferencia", cuenta_id: ahorros, cuenta_destino_id: tarjeta, comercio: "Pago tarjeta de crédito" });
    if (3 <= ultimo) {
      await tx({ fecha: f(3), monto: $(350_000), tipo: "transferencia", cuenta_id: ahorros, cuenta_destino_id: billetera, comercio: "Recarga billetera" });
      bolsillo.set(billetera, bolsillo.get(billetera)! + 350_000);
    }
    if (4 <= ultimo) {
      await tx({ fecha: f(4), monto: $(200_000), tipo: "transferencia", cuenta_id: ahorros, cuenta_destino_id: efectivo, comercio: "Retiro cajero" });
      bolsillo.set(efectivo, bolsillo.get(efectivo)! + 200_000);
    }

    // Mercado: una o dos veces por semana.
    for (let d = 2; d <= ultimo; d += Math.round(z.entre(4, 8)))
      await gasto(d, z.monto(65_000, 230_000), z.de([tarjeta, ahorros]), "Mercado", z.de(mercado));
    // Comida fuera: varias veces por semana.
    for (let d = 1; d <= ultimo; d += Math.round(z.entre(1, 3)))
      await gasto(d, z.monto(9_000, 48_000), z.de(medios), "Comida", z.de(comida));
    // Transporte.
    for (let d = 1; d <= ultimo; d += Math.round(z.entre(2, 4)))
      await gasto(d, z.monto(8_000, 32_000), z.de([billetera, efectivo, tarjeta]), "Transporte", z.de(transporte));
    // Servicios.
    await gasto(10, z.monto(95_000, 140_000), ahorros, "Servicios", "Energía");
    await gasto(12, z.monto(55_000, 80_000), ahorros, "Servicios", "Acueducto");
    await gasto(14, z.monto(35_000, 45_000), billetera, "Servicios", "Plan celular");
    // Otros.
    if (z.prob(0.6)) await gasto(Math.round(z.entre(5, 25)), z.monto(18_000, 90_000), tarjeta, "Salud", "Droguería Vida");
    if (z.prob(0.7)) await gasto(Math.round(z.entre(6, 27)), z.monto(28_000, 75_000), tarjeta, "Entretenimiento", z.de(["Cine Plaza", "Teatro Municipal", "Bolos Centro"]));
    if (z.prob(0.4)) await gasto(Math.round(z.entre(8, 26)), z.monto(80_000, 260_000), tarjeta, "Ropa", z.de(["Tienda Moda Urbana", "Calzado Paso Firme"]));

    // Viaje hace dos meses, con etiqueta.
    if (m === -2) {
      const viaje = ["Viaje Cartagena"];
      await gasto(16, 640_000, tarjeta, "Transporte", "Aerolínea Nacional", viaje);
      await gasto(18, 780_000, tarjeta, "Hogar", "Hotel Ciudad Amurallada", viaje);
      await gasto(18, 96_000, tarjeta, "Comida", "Restaurante Frente al Mar", viaje);
      await gasto(19, 58_000, efectivo, "Comida", "Frutas y Arepas de Huevo", viaje);
      await gasto(19, 120_000, tarjeta, "Entretenimiento", "Paseo a las islas", viaje);
      await gasto(20, 45_000, billetera, "Transporte", "Taxi aeropuerto", viaje);
    }
    // Compra a 12 cuotas hace tres meses.
    if (m === -3) {
      const fecha = f(22);
      const plan = calcularPlan($(3_600_000), 12, false,
        { tasa_ea: 0.285, interes_una_cuota: false, comision_internacional: 0.029, dia_corte: 15, dia_pago: 2 }, fecha);
      const id = await tx({ fecha, monto: plan.capital, tipo: "egreso", cuenta_id: tarjeta, categoria_id: cat("Educación"), comercio: "Portátil Tienda Tecno" });
      await guardarPlan(id, tarjeta, "Portátil Tienda Tecno", fecha, plan, false);
      cuotaPortatil = plan.cuota / 100; // desde el mes siguiente se paga la cuota
    }
    // Rendimientos de la cuenta.
    if (ultimo === diasDelMes(ano, mes0))
      await tx({ fecha: f(ultimo), monto: $(z.monto(800, 2_500)), tipo: "ingreso", cuenta_id: ahorros, categoria_id: cat("Rendimientos"), comercio: "Intereses cuenta" });

    pagoPendiente = Math.max(100_000, Math.round(tarjetaMes / 100) * 100);
  }

  // ---------- Presupuestos (este mes: uno pasado, uno cerca del tope, uno bien) ----------
  const metas: [string, number, number][] = [["Comida", 600_000, 1.08], ["Mercado", 900_000, 0.86], ["Transporte", 300_000, 0.58], ["Entretenimiento", 200_000, 0.4]];
  const mesIso = hoyIso.slice(0, 7);
  for (const [nombre, limite, objetivo] of metas) {
    await guardarPresupuesto(cat(nombre), $(limite));
    const [g] = await con.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(monto), 0) AS total FROM transacciones WHERE tipo = 'egreso' AND categoria_id = $1 AND substr(fecha, 1, 7) = $2",
      [cat(nombre), mesIso]);
    const falta = Math.round((limite * objetivo - Number(g.total) / 100) / 100) * 100;
    if (falta > 0) {
      const lugares: Record<string, string> = { Comida: "Restaurante Sabor Casero", Mercado: "Supermercado La Esquina", Transporte: "App de transporte", Entretenimiento: "Cine Plaza" };
      const comercio = lugares[nombre];
      await egreso(hoyIso, falta, nombre === "Comida" || nombre === "Entretenimiento" ? tarjeta : ahorros, nombre, comercio);
    }
  }
  await guardarPresupuesto(cat("Ropa"), $(250_000));

  // ---------- Inversiones ----------
  await crearCdt({ nombre: "CDT 180 días", banco: "Mi banco", monto: $(10_000_000), tasa_ea: 0.112, fecha_inicio: desdeHoy(-175),
    plazo_dias: 180, renovacion_auto: false, retencion: 0.04, cuenta_origen_id: null, notas: null });
  await crearCdt({ nombre: "CDT un año", banco: "Banco Aliado", monto: $(5_000_000), tasa_ea: 0.105, fecha_inicio: desdeHoy(-62),
    plazo_dias: 360, renovacion_auto: true, retencion: 0.04, cuenta_origen_id: null, notas: null });
  await crearCajita({ nombre: "Viaje a Japón", banco: "Banco digital", tasa_ea: 0.09, meta: $(12_000_000), fecha_meta: desdeHoy(420), notas: null },
    $(4_250_000), null, desdeHoy(-95));
  await crearCajita({ nombre: "Fondo de emergencia", banco: "Banco digital", tasa_ea: 0.095, meta: $(10_000_000), fecha_meta: null, notas: null },
    $(6_800_000), null, desdeHoy(-140));

  // ---------- Me deben ----------
  const carlos = await crearPersona("Carlos");
  const laura = await crearPersona("Laura");
  const andres = await crearPersona("Andrés");
  const valentina = await crearPersona("Valentina");

  const pCarlos = await crearPrestamo({ persona_id: carlos, monto: $(500_000), fecha: desdeHoy(-42), fecha_acordada: desdeHoy(-9),
    descripcion: "Para el arreglo de la moto", cuenta_origen_id: ahorros });
  await abonarPrestamo(pCarlos, ahorros, $(150_000), desdeHoy(-20));

  const planLaura = generarPlanCuotas($(1_200_000), 4, desdeHoy(-48));
  const pLaura = await crearPrestamo({ persona_id: laura, monto: $(1_200_000), fecha: desdeHoy(-78), fecha_acordada: null,
    descripcion: "Curso de inglés", cuenta_origen_id: ahorros }, planLaura);
  await abonarPrestamo(pLaura, ahorros, $(300_000), desdeHoy(-47));
  await abonarPrestamo(pLaura, ahorros, $(300_000), desdeHoy(-17));

  await crearGastoGrupal({
    descripcion: "Cena de cumpleaños", fecha: desdeHoy(-12), cuenta_id: tarjeta, categoria_id: cat("Comida"),
    base: $(480_000), propinaPct: 0.1, reparto: "igual",
    participantes: [{ persona_id: null }, { persona_id: laura }, { persona_id: andres }, { persona_id: valentina }],
    fecha_acordada: desdeHoy(6), transaccion_id: null,
  });
}

