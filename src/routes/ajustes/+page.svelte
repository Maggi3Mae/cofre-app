<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import Icono from "$lib/Icono.svelte";
  import {
    leerNombre, guardarAjuste, leerTrm, guardarTrmManual, leerTrmInfo, actualizarTrm, leerTrmAuto, guardarTrmAuto, type TrmInfo, leerCorreo, guardarCorreo, CORREO_VACIO, type AjustesCorreo,
  } from "$lib/datos";
  import { guardarClave, borrarClave } from "$lib/importar/claves";
  import { esEscritorio } from "$lib/plataforma";
  import EquiposMac from "$lib/sinc/EquiposMac.svelte";
  import CopiasMac from "$lib/copias/CopiasMac.svelte";
  import DatosPago from "$lib/medeben/DatosPago.svelte";
  import SincEquipo from "$lib/sinc/SincEquipo.svelte";
  import NotificacionesAndroid from "$lib/alertas/NotificacionesAndroid.svelte";
  import { pantalla } from "$lib/pantalla.svelte";
  import { tema, cambiarTema } from "$lib/tema.svelte";
  import { leerPatrimonioOculto, guardarPatrimonioOculto } from "$lib/datos";
  import { sinc, haceCuanto } from "$lib/sinc/estado-sinc.svelte";

  // Celular: ojito del patrimonio (se guarda al tocarlo).
  let oculto = $state(false);
  leerPatrimonioOculto().then((v) => (oculto = v)).catch(() => {});
  function cambiarOculto() { guardarPatrimonioOculto(oculto).catch(() => {}); }
  import { notificarSistema } from "$lib/alertas/estado-alertas.svelte";
  import { correoHtml, correoTexto, type AlertaCorreo } from "$lib/alertas/correo";
  import { nombreMes } from "$lib/alertas/correo-cierre";
  import { enviarCierre } from "$lib/alertas/estado-alertas.svelte";
  import { mesAnterior } from "$lib/datos/cierre";

  const CLAVE_CORREO = "correo_smtp";
  const PRUEBA: AlertaCorreo[] = [{
    tipo: "prueba", nivel: "ok", titulo: "Las alertas de Cofre llegarán aquí",
    cuerpo: "Te escribiremos solo cuando haya algo nuevo: presupuestos al 80, 90 y 100 %, CDT por vencer o vencidos y metas de cajitas.",
  }];

  // ---------- General ----------
  let nombre = $state("");
  let trm = $state("");
  let trmInfo = $state<TrmInfo | null>(null);
  let trmAuto = $state(false);
  let consultandoTrm = $state(false);
  let avisoTrm = $state("");
  const fmtTrm = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
  const fmtVigencia = (i: TrmInfo) => {
    const f = (x: string) => new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" })
      .format(new Date(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10))).replace(/\./g, "");
    return i.desde === i.hasta ? f(i.desde) : `${f(i.desde)} – ${f(i.hasta)}`;
  };
  let avisoGeneral = $state("");

  // ---------- Revisión diaria ----------
  let agenteHora = $state<string | null>(null); // "HH:MM" si está activo
  let hora = $state("08:00");
  let avisoAgente = $state("");
  let errorAgente = $state("");

  // ---------- Correo ----------
  let correo = $state<AjustesCorreo>({ ...CORREO_VACIO });
  let clave = $state("");
  let hayClave = $state(false);
  let avisoCorreo = $state("");
  let errorCorreo = $state("");
  let enviando = $state(false);
  const mesCierre = mesAnterior();
  async function probarCierre() {
    avisoCorreo = ""; errorCorreo = "";
    enviando = true;
    try {
      await guardarCorreo({ ...correo, puerto: Number(correo.puerto) || 587 });
      await enviarCierre(mesCierre.ano, mesCierre.mes);
      avisoCorreo = `Cierre de ${nombreMes(mesCierre.mes)} enviado a ${correo.destino}.`;
    } catch (err) {
      errorCorreo = err instanceof Error ? err.message : String(err);
    } finally {
      enviando = false;
    }
  }

  let avisoNotif = $state("");

  async function cargar() {
    nombre = await leerNombre().catch(() => "");
    const t = await leerTrm().catch(() => null);
    trm = t ? fmtTrm(t) : "";
    trmInfo = await leerTrmInfo().catch(() => null);
    trmAuto = await leerTrmAuto().catch(() => false);
    correo = await leerCorreo();
    if (esEscritorio) {
      hayClave = await invoke<boolean>("clave_existe", { nombre: CLAVE_CORREO }).catch(() => false);
      agenteHora = await invoke<string | null>("agente_estado").catch(() => null);
      if (agenteHora) hora = agenteHora;
    }
  }
  cargar();

  async function guardarGeneral(e: SubmitEvent) {
    e.preventDefault();
    avisoGeneral = "";
    try {
      await guardarAjuste("nombre", nombre.trim());
      if (trm.trim()) {
        const n = Number(trm.replace(/\./g, "").replace(",", "."));
        await guardarTrmManual(n);
        trmInfo = await leerTrmInfo().catch(() => null);
      }
      avisoGeneral = "Guardado.";
    } catch (err) {
      avisoGeneral = err instanceof Error ? err.message : String(err);
    }
  }

  async function traerTrm() {
    consultandoTrm = true; avisoTrm = "";
    try {
      const r = await actualizarTrm();
      trm = fmtTrm(r.valor);
      trmInfo = r;
    } catch (err) {
      avisoTrm = err instanceof Error ? err.message : String(err);
    } finally {
      consultandoTrm = false;
    }
  }

  async function cambiarTrmAuto() {
    await guardarTrmAuto(trmAuto).catch(() => {});
  }

  async function activarAgente(activar: boolean) {
    avisoAgente = ""; errorAgente = "";
    try {
      if (activar) {
        const [h, m] = hora.split(":").map(Number);
        await invoke("agente_activar", { hora: h, minuto: m });
        agenteHora = hora;
        avisoAgente = `Listo: Cofre revisará todos los días a las ${hora}, aunque esté cerrada.`;
      } else {
        await invoke("agente_desactivar");
        agenteHora = null;
        avisoAgente = "Revisión diaria desactivada.";
      }
    } catch (err) {
      errorAgente = String(err);
    }
  }

  async function guardarCorreoForm(e: SubmitEvent) {
    e.preventDefault();
    avisoCorreo = ""; errorCorreo = "";
    try {
      if (correo.activo && (!correo.usuario.includes("@") || !correo.destino.includes("@")))
        throw new Error("Escribe el correo que envía (usuario) y el que recibe.");
      if (clave) {
        await guardarClave(CLAVE_CORREO, clave);
        clave = "";
        hayClave = true;
      }
      if (correo.activo && !hayClave) throw new Error("Falta la clave del correo.");
      await guardarCorreo({ ...correo, puerto: Number(correo.puerto) || 587 });
      avisoCorreo = correo.activo ? "Correo de alertas activado." : "Guardado. El correo de alertas está apagado.";
    } catch (err) {
      errorCorreo = err instanceof Error ? err.message : String(err);
    }
  }

  async function quitarClave() {
    await borrarClave(CLAVE_CORREO).catch(() => {});
    hayClave = false;
    correo.activo = false;
    await guardarCorreo(correo);
    avisoCorreo = "Clave borrada del Llavero y correo apagado.";
  }

  async function probarCorreo() {
    avisoCorreo = ""; errorCorreo = "";
    enviando = true;
    try {
      await invoke("correo_enviar", {
        config: { ...correo, puerto: Number(correo.puerto) || 587 },
        asunto: "Prueba de Cofre",
        cuerpo: correoTexto(PRUEBA, "Correo de alertas listo"),
        html: correoHtml(PRUEBA, "Correo de alertas listo"),
      });
      avisoCorreo = `Correo de prueba enviado a ${correo.destino}.`;
    } catch (err) {
      errorCorreo = String(err);
    } finally {
      enviando = false;
    }
  }

  function probarNotificacion() {
    avisoNotif = "En 5 segundos llega una notificación: cambia a otra app para verla.";
    setTimeout(async () => {
      const ok = await notificarSistema("Prueba de Cofre", "Así se ven las alertas.", true);
      avisoNotif = ok ? "Notificación enviada. Si no la viste, revisa Ajustes del Sistema → Notificaciones → Cofre."
        : "macOS no dio permiso para notificaciones. Actívalo en Ajustes del Sistema → Notificaciones → Cofre.";
    }, 5000);
  }
</script>

{#if pantalla.celular}
<h1 class="titulo-pantalla">Ajustes</h1>

<section class="cf-glass cf-card seccion" aria-labelledby="t-apariencia">
  <h2 id="t-apariencia" class="cf-card-title">Apariencia</h2>
  <div class="cf-seg tema-m" role="group" aria-label="Tema">
    <button aria-pressed={tema.preferencia === "auto"} onclick={() => cambiarTema("auto")}><Icono nombre="ajustes" />Sistema</button>
    <button aria-pressed={tema.preferencia === "light"} onclick={() => cambiarTema("light")}><Icono nombre="sol" />Claro</button>
    <button aria-pressed={tema.preferencia === "dark"} onclick={() => cambiarTema("dark")}><Icono nombre="luna" />Oscuro</button>
  </div>
  <p class="ayuda">«Sistema» sigue el modo claro u oscuro del celular.</p>
  <label class="interruptor">
    <input type="checkbox" bind:checked={oculto} onchange={cambiarOculto} />
    <span>Ocultar los montos del patrimonio<small>Lo mismo que el ojito de Inicio.</small></span>
  </label>
</section>

<form class="cf-glass cf-card seccion" onsubmit={guardarGeneral}>
  <label class="campo">
    <span class="etiqueta">Tu nombre</span>
    <span class="cf-field"><input bind:value={nombre} placeholder="Para el saludo de Inicio" /></span>
    <span class="ayuda">Se comparte con el Mac al sincronizar.</span>
  </label>
  <div class="acciones">
    {#if avisoGeneral}<span class="caption" role="status">{avisoGeneral}</span>{/if}
    <button class="cf-btn cf-btn--primary" type="submit">Guardar</button>
  </div>
</form>

<NotificacionesAndroid />

<a href="/sincronizar" class="cf-glass sinc-m">
  <span class="cf-tile cf-tile--brand"><Icono nombre="sincronizar" /></span>
  <span class="sinc-txt"><b>Sincronizar con el Mac</b>
    <small>{sinc.emparejado ? `Con ${sinc.mac ?? "el Mac"} · ${haceCuanto(sinc.ultima)}` : "Sin emparejar"}</small></span>
  <Icono nombre="siguiente" clase="chev-m" />
</a>
{:else}
<header class="encabezado">
  <div>
    <h1 class="titulo-pantalla">Ajustes</h1>
    <p class="caption">Todo se guarda en este computador</p>
  </div>
</header>

<form class="cf-glass cf-card seccion" onsubmit={guardarGeneral}>
  <h2 class="cf-card-title">General</h2>
  <div class="rejilla">
    <label class="campo">
      <span class="etiqueta">Tu nombre</span>
      <span class="cf-field"><input bind:value={nombre} placeholder="Para el saludo del Dashboard" /></span>
    </label>
    <div class="campo">
      <label class="etiqueta" for="trm">TRM (pesos por dólar)</label>
      <span class="cf-field"><span class="sufijo">$</span><input id="trm" bind:value={trm} inputmode="decimal" placeholder="4.000" /></span>
      <span class="ayuda">
        {#if trmInfo}TRM oficial vigente {fmtVigencia(trmInfo)}.{:else}Convierte a pesos lo que tienes en dólares.{/if}
      </span>
      {#if esEscritorio}
      <span class="trm-acciones">
        <button class="cf-btn" type="button" onclick={traerTrm} disabled={consultandoTrm}>
          {consultandoTrm ? "Consultando…" : "Actualizar TRM"}
        </button>
        {#if avisoTrm}<span class="ayuda" role="alert">{avisoTrm}</span>{/if}
      </span>
      {/if}
    </div>
  </div>
  {#if esEscritorio}
  <label class="interruptor">
    <input type="checkbox" bind:checked={trmAuto} onchange={cambiarTrmAuto} />
    <span>Actualizar la TRM sola
      <small>Al abrir Cofre y en la revisión diaria. Consulta solo el dato abierto de la Superfinanciera en datos.gov.co; no envía nada tuyo.</small></span>
  </label>
  {/if}
  <div class="acciones">
    {#if avisoGeneral}<span class="caption" role="status">{avisoGeneral}</span>{/if}
    <button class="cf-btn cf-btn--primary" type="submit">Guardar</button>
  </div>
</form>

{#if esEscritorio}<EquiposMac />{:else}<SincEquipo />{/if}

{#if !pantalla.celular}<DatosPago />{/if}

{#if esEscritorio}<CopiasMac />{/if}

{#if esEscritorio}
<section class="cf-glass cf-card seccion" aria-labelledby="t-alertas">
  <h2 id="t-alertas" class="cf-card-title">Alertas</h2>
  <p class="intro">
    Cofre avisa cuando un presupuesto llega al 80, 90 y 100 %, cuando un CDT está por vencer o venció
    y cuando una cajita alcanza su meta. Cada aviso llega una sola vez.
  </p>

  {#if esEscritorio}
  <div class="bloque">
    <div class="bloque-cab">
      <span class="cf-tile cf-tile--brand"><Icono nombre="campana" /></span>
      <div class="texto">
        <b>Revisión diaria</b>
        <span class="caption">
          {agenteHora ? `Activa: todos los días a las ${agenteHora} y al iniciar sesión.` : "Apagada: solo se revisa cuando abres la app."}
        </span>
      </div>
    </div>
    <div class="fila">
      <span class="cf-field hora"><input type="time" bind:value={hora} aria-label="Hora de la revisión" /></span>
      {#if agenteHora}
        <button class="cf-btn cf-btn--secondary" onclick={() => activarAgente(true)}>Cambiar hora</button>
        <button class="cf-btn cf-btn--ghost" onclick={() => activarAgente(false)}>Desactivar</button>
      {:else}
        <button class="cf-btn cf-btn--primary" onclick={() => activarAgente(true)}>Activar</button>
      {/if}
    </div>
    <span class="ayuda">Funciona con la app empaquetada. Si mueves Cofre de carpeta, vuelve a activarla.</span>
    {#if avisoAgente}<p class="ok" role="status">{avisoAgente}</p>{/if}
    {#if errorAgente}<p class="error-form" role="alert">{errorAgente}</p>{/if}
  </div>
  {/if}

  {#if esEscritorio}
  <div class="bloque">
    <div class="bloque-cab">
      <span class="cf-tile cf-tile--brand"><Icono nombre="campana" /></span>
      <div class="texto">
        <b>Notificaciones de macOS</b>
        <span class="caption">Salen cuando Cofre no está a la vista.</span>
      </div>
    </div>
    <div class="fila"><button class="cf-btn cf-btn--secondary" onclick={probarNotificacion}>Enviar notificación de prueba</button></div>
    {#if avisoNotif}<p class="ok" role="status">{avisoNotif}</p>{/if}
  </div>
  {/if}

  {#if esEscritorio}
  <form class="bloque" onsubmit={guardarCorreoForm}>
    <div class="bloque-cab">
      <span class="cf-tile cf-tile--brand"><Icono nombre="documento" /></span>
      <div class="texto">
        <b>Correo</b>
        <span class="caption">Opcional. Es lo único que sale de tu computador, directo a tu correo.</span>
      </div>
      <label class="interruptor solo"><input type="checkbox" bind:checked={correo.activo} aria-label="Enviar alertas por correo" /></label>
    </div>
    <div class="rejilla">
      <label class="campo">
        <span class="etiqueta">Enviar desde (usuario)</span>
        <span class="cf-field"><input bind:value={correo.usuario} type="email" placeholder="tucorreo@gmail.com" autocomplete="off" /></span>
      </label>
      <label class="campo">
        <span class="etiqueta">Enviar a</span>
        <span class="cf-field"><input bind:value={correo.destino} type="email" placeholder="tucorreo@gmail.com" /></span>
      </label>
      <label class="campo">
        <span class="etiqueta">Servidor SMTP</span>
        <span class="cf-field"><input bind:value={correo.servidor} placeholder="smtp.gmail.com" /></span>
      </label>
      <label class="campo">
        <span class="etiqueta">Puerto</span>
        <span class="cf-field"><input bind:value={correo.puerto} inputmode="numeric" maxlength="5" placeholder="587" /></span>
      </label>
    </div>
    <label class="campo">
      <span class="etiqueta">Clave</span>
      <span class="cf-field"><input bind:value={clave} type="password" autocomplete="new-password"
        placeholder={hayClave ? "•••••••• (guardada en el Llavero)" : "Contraseña de aplicación"} /></span>
      <span class="ayuda">
        Con Gmail usa una «contraseña de aplicación» (Cuenta de Google → Seguridad → Contraseñas de aplicaciones), no tu clave normal.
        Se guarda en el Llavero de macOS, nunca en la base de datos.
        {#if hayClave}<button type="button" class="enlace" onclick={quitarClave}>Borrar clave</button>{/if}
      </span>
    </label>
    <div class="sub-bloque">
      <label class="interruptor">
        <input type="checkbox" bind:checked={correo.cierre} disabled={!correo.activo} />
        <span><b>Cierre del mes</b><br /><span class="ayuda">El día 1 (o en los primeros 5 días si el Mac estuvo apagado), un resumen del mes anterior:
          entradas y salidas comparadas, categorías, presupuestos cumplidos y recurrentes. Si ocultas el patrimonio, no va en el correo.</span></span>
      </label>
      <button type="button" class="cf-btn cf-btn--ghost" onclick={probarCierre}
        disabled={enviando || !hayClave || !correo.usuario || !correo.destino}>Enviar el de {nombreMes(mesCierre.mes)} ahora</button>
    </div>
    {#if avisoCorreo}<p class="ok" role="status">{avisoCorreo}</p>{/if}
    {#if errorCorreo}<p class="error-form" role="alert">{errorCorreo}</p>{/if}
    <div class="acciones">
      <button type="button" class="cf-btn cf-btn--ghost" onclick={probarCorreo}
        disabled={enviando || !hayClave || !correo.usuario || !correo.destino}>{enviando ? "Enviando…" : "Enviar correo de prueba"}</button>
      <button class="cf-btn cf-btn--primary" type="submit">Guardar correo</button>
    </div>
  </form>
  {/if}
</section>
{:else}
<NotificacionesAndroid />
{/if}
{/if}

<style>
  .tema-m { display: flex; }
  .tema-m button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .tema-m :global(.cf-icon) { width: 16px; height: 16px; }
  .sinc-m { border-radius: 20px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--ink); }
  .sinc-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .sinc-txt b { font-size: 15px; }
  .sinc-txt small { font-size: 12px; color: var(--ink-2); }
  .sinc-m :global(.chev-m) { color: var(--ink-3); }
  .seccion { gap: var(--space-4); max-width: 820px; }
  .intro { font-size: 14px; line-height: 20px; color: var(--ink-2); max-width: 640px; }
  .rejilla { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
  .acciones { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-3); }
  .bloque { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-radius: var(--r-lg); border: 1px solid var(--line); background: var(--glass-1); }
  .bloque-cab { display: flex; align-items: center; gap: var(--space-3); }
  .bloque-cab .texto { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .bloque-cab b { font-size: 15px; }
  .fila { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .hora { width: 140px; }
  .trm-acciones { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-2); }
  .ayuda { font-size: 12px; line-height: 16px; color: var(--ink-2); }
  .ok { font-size: 13px; font-weight: 500; color: var(--primary-text); }
  .enlace { border: 0; background: none; padding: 0; color: var(--expense); font: inherit; font-weight: 600; cursor: pointer; margin-left: 4px; }
  .interruptor.solo { gap: 0; }
  .sub-bloque { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; padding-top: var(--space-3); border-top: 1px solid var(--line); }
  .sub-bloque .interruptor { flex: 1; min-width: 260px; }
  @media (max-width: 760px) { .rejilla { grid-template-columns: 1fr; } }
</style>
