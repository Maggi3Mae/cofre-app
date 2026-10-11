<script lang="ts">
  // Ajustes en Android (celular y tablet): permiso, tipos de aviso y prueba.
  import { onMount } from "svelte";
  import Icono from "$lib/Icono.svelte";
  import { mostrarAviso } from "./estado-alertas.svelte";
  import { tiposNotif, leerPrefsNotif, guardarPrefNotif, permisoNotif, notificarAndroid, programarAvisos, type TipoNotif } from "./android";

  let permiso = $state<boolean | null>(null);
  let prefs = $state<Record<TipoNotif, boolean>>({ presupuestos: true, inversiones: true, medeben: true });
  let programadas = $state<number | null>(null);

  onMount(async () => {
    permiso = await permisoNotif();
    prefs = await leerPrefsNotif();
    if (permiso) programadas = await programarAvisos();
  });

  async function pedir() {
    permiso = await permisoNotif(true);
    if (permiso) programadas = await programarAvisos();
    else mostrarAviso({ titulo: "Sin permiso", cuerpo: "Actívalo en Ajustes de Android → Apps → Cofre → Notificaciones.", nivel: "w80" });
  }

  async function cambiar(t: TipoNotif) {
    await guardarPrefNotif(t, prefs[t]);
    programadas = await programarAvisos();
  }

  async function probar() {
    const ok = await notificarAndroid("Las notificaciones de Cofre llegarán así", "Presupuestos, CDT por vencer y fechas de «Me deben».");
    if (!ok) mostrarAviso({ titulo: "No se pudo mostrar", cuerpo: "Revisa el permiso de notificaciones de Cofre.", nivel: "w80" });
  }
</script>

<section class="cf-glass cf-card notif" aria-labelledby="t-notif">
  <h2 id="t-notif" class="cf-card-title">Notificaciones</h2>

  {#if permiso === false}
    <div class="permiso">
      <p class="ayuda">Cofre necesita permiso para avisarte aunque esté cerrada.</p>
      <button class="cf-btn cf-btn--primary" onclick={pedir}><Icono nombre="campana" />Permitir notificaciones</button>
    </div>
  {/if}

  {#each tiposNotif as t (t.id)}
    <label class="interruptor">
      <input type="checkbox" bind:checked={prefs[t.id]} onchange={() => cambiar(t.id)} disabled={!permiso} />
      <span>{t.nombre}<small>{t.detalle}</small></span>
    </label>
  {/each}

  <p class="ayuda">
    Cofre no corre en segundo plano: los avisos de presupuestos salen mientras la usas; los de CDT y «Me deben» quedan
    agendados y llegan a las 9 a. m. aunque esté cerrada{programadas != null ? ` (${programadas} agendados)` : ""}. Los correos salen solo del Mac.
  </p>

  <div><button class="cf-btn cf-btn--secondary" onclick={probar} disabled={!permiso}>Enviar notificación de prueba</button></div>
</section>

<style>
  .notif { gap: var(--space-4); }
  .permiso { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); border-radius: var(--r-lg); background: var(--primary-soft); }
  .ayuda { margin: 0; font-size: 12px; line-height: 16px; color: var(--ink-2); }
</style>
