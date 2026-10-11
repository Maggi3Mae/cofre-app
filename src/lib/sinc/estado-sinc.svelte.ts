// Sincronización automática del celular / tablet con el Mac (nada en segundo plano):
// al abrir, 5 s después de cada cambio, cada 5 minutos con la app a la vista y al volver a ella.
// En automático los errores no molestan: quedan en `sinc.error` para Ajustes.
import { alCambiarDatos } from "$lib/datos/cambios";
import { esEscritorio } from "$lib/plataforma";
import { estadoSinc, sincronizarAhora, ultimaSincronizacion } from "./puente";

export const sinc = $state<{ emparejado: boolean; mac: string | null; enCurso: boolean; ultima: string | null; error: string | null }>({
  emparejado: false, mac: null, enCurso: false, ultima: null, error: null,
});

const CADA = 5 * 60_000;
const TRAS_CAMBIO = 5_000;
const PAUSA_SIN_MAC = 2 * 60_000; // si el Mac no está, los cambios no reintentan durante 2 min

let pausaHasta = 0;

/** Sincroniza ahora. `manual`: lanza el error para mostrarlo; si no, solo lo guarda. */
export async function sincronizar(manual = false): Promise<{ recibidas: number; fotos: number } | null> {
  if (sinc.enCurso) return null;
  sinc.enCurso = true;
  try {
    const r = await sincronizarAhora();
    sinc.error = null;
    sinc.ultima = await ultimaSincronizacion();
    pausaHasta = 0;
    return r;
  } catch (e) {
    sinc.error = String(e);
    pausaHasta = Date.now() + PAUSA_SIN_MAC;
    if (manual) throw e;
    return null;
  } finally {
    sinc.enCurso = false;
  }
}

export async function refrescarEstado(): Promise<void> {
  const centro = (await estadoSinc().catch(() => null))?.centro ?? null;
  sinc.emparejado = !!centro;
  sinc.mac = centro?.nombre ?? null;
  sinc.ultima = await ultimaSincronizacion();
}

/** Arranca la sincronización automática (solo celular y tablet). Devuelve la limpieza. */
export function iniciarSincAutomatica(): () => void {
  if (esEscritorio) return () => {};
  let espera: ReturnType<typeof setTimeout> | undefined;
  const visible = () => document.visibilityState === "visible";
  const intentar = () => { if (sinc.emparejado && visible()) void sincronizar(); };

  refrescarEstado().then(intentar);
  const reloj = setInterval(intentar, CADA);
  const alVolver = () => { if (visible()) intentar(); };
  document.addEventListener("visibilitychange", alVolver);
  const quitar = alCambiarDatos(() => {
    if (sinc.enCurso || Date.now() < pausaHasta) return; // lo que trae la propia sincronización no cuenta
    clearTimeout(espera);
    espera = setTimeout(intentar, TRAS_CAMBIO);
  });
  return () => {
    clearInterval(reloj);
    clearTimeout(espera);
    document.removeEventListener("visibilitychange", alVolver);
    quitar();
  };
}

/** «hace 2 min», «hace 3 h», «ayer»… */
export function haceCuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 172_800) return "ayer";
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
