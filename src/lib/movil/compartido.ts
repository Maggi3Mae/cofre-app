// «Compartir → Cofre» en Android (MainActivity.kt): la foto llega en base64 y se abre como factura
// en Transacciones (lector → formulario prellenado), en el celular y en la tablet.
import { goto } from "$app/navigation";
import { dejarFactura } from "$lib/facturas/pendiente";
import { pantalla } from "$lib/pantalla.svelte";
import { abrirNuevo } from "./hoja.svelte";

declare global {
  interface Window { CofreCompartido?: { tomar(): string | null; tipo(): string } }
}

function revisar() {
  try {
    const p = window.CofreCompartido;
    const b64 = p?.tomar();
    if (!p || !b64) return;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const tipo = p.tipo() || "image/jpeg";
    dejarFactura(new File([bytes], `compartida.${tipo.split("/")[1] ?? "jpg"}`, { type: tipo }));
    void goto("/transacciones?factura=1");
  } catch { /* sin foto */ }
}

/** Revisa si Cofre se abrió compartiendo una foto y queda atenta a las siguientes. Devuelve la limpieza. */
export function iniciarCompartido(): () => void {
  revisar();
  addEventListener("cofre-compartido", revisar);
  return () => removeEventListener("cofre-compartido", revisar);
}

// ---------- Atajos del ícono (mantener presionado) ----------
// «Nuevo gasto» llega aquí; «Factura» lo resuelve MainActivity (cámara o galería) y la foto entra por «Compartir».

declare global {
  interface Window { CofreAtajo?: { tomar(): string | null; factura(): void } }
}

function revisarAtajo() {
  try {
    const a = window.CofreAtajo?.tomar();
    if (a === "factura") return window.CofreAtajo?.factura();
    if (a !== "nuevo") return;
    // Celular: la hoja «Nuevo movimiento» (arranca en egreso). Tablet: el panel de Transacciones.
    if (pantalla.celular) abrirNuevo();
    else void goto("/transacciones?nuevo=1");
  } catch { /* sin atajo */ }
}

/** Revisa si Cofre se abrió con un atajo y queda atenta a los siguientes. Devuelve la limpieza. */
export function iniciarAtajos(): () => void {
  revisarAtajo();
  addEventListener("cofre-atajo", revisarAtajo);
  return () => removeEventListener("cofre-atajo", revisarAtajo);
}

declare global {
  interface Window { CofreCompartir?: { imagen(base64: string, nombre: string): boolean } }
}
