<script lang="ts">
  // Ajustes del Mac → Equipos: emparejar celular y tablet, ver cuándo sincronizaron y quitarlos.
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import Icono from "$lib/Icono.svelte";
  import { leerNombre } from "$lib/datos/ajustes";
  import { estadoSinc, type EstadoSinc } from "./puente";
  import { haceCuanto } from "./estado-sinc.svelte";

  let estado = $state<EstadoSinc | null>(null);
  let codigo = $state<string | null>(null);
  let vence = $state(0);
  let ahora = $state(Date.now());
  let aviso = $state("");
  let error = $state("");
  let quitando = $state<string | null>(null);

  const restante = $derived(Math.max(0, Math.ceil((vence - ahora) / 1000)));
  const reloj = $derived(`${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, "0")}`);

  async function cargar() {
    estado = await estadoSinc().catch(() => null);
  }

  onMount(() => {
    cargar();
    const t = setInterval(() => {
      ahora = Date.now();
      if (codigo && restante === 0) codigo = null;
    }, 1000);
    const refresco = setInterval(cargar, 30_000);
    const quitar = listen("sinc-equipos", async () => {
      const antes = estado?.equipos.length ?? 0;
      await cargar();
      if (codigo && (estado?.equipos.length ?? 0) >= antes) {
        codigo = null;
        aviso = "Equipo emparejado. Ya puede sincronizar.";
      }
    });
    return () => { clearInterval(t); clearInterval(refresco); quitar.then((f) => f()); };
  });

  async function nuevoCodigo() {
    aviso = ""; error = "";
    try {
      const nombre = await leerNombre().catch(() => "");
      codigo = await invoke<string>("sinc_codigo_nuevo", { nombre: nombre ? `Mac de ${nombre}` : "Mac" });
      vence = Date.now() + 5 * 60_000;
      ahora = Date.now();
    } catch (e) { error = String(e); }
  }

  async function cancelar() {
    await invoke("sinc_codigo_cancelar").catch(() => {});
    codigo = null;
  }

  async function quitar(id: string) {
    await invoke("sinc_quitar_equipo", { id }).catch((e) => (error = String(e)));
    quitando = null;
    await cargar();
  }
</script>

<section class="cf-glass cf-card seccion" aria-labelledby="t-equipos">
  <h2 id="t-equipos" class="cf-card-title">Equipos</h2>
  <p class="intro">
    Tu celular y tu tablet se sincronizan con este Mac por la red Wi‑Fi de la casa, mientras Cofre está abierto aquí.
    Todo viaja cifrado y solo entre tus equipos.
  </p>

  {#if codigo}
    <div class="codigo-caja" role="status" aria-live="polite">
      <span class="etiqueta">Escribe este código en el otro equipo</span>
      <span class="codigo" aria-label="Código {codigo.split('').join(' ')}">{codigo.slice(0, 3)} {codigo.slice(3)}</span>
      <span class="ayuda">Vale por {reloj} · sirve para un solo equipo</span>
      <div><button class="cf-btn cf-btn--ghost" onclick={cancelar}>Cancelar</button></div>
    </div>
  {:else}
    <div class="fila">
      <button class="cf-btn cf-btn--primary" onclick={nuevoCodigo}><Icono nombre="candado" />Emparejar un equipo</button>
    </div>
  {/if}
  {#if aviso}<p class="ok" role="status">{aviso}</p>{/if}
  {#if error}<p class="error-form" role="alert">{error}</p>{/if}

  {#if estado?.servidor}
    <p class="ayuda">
      Si el otro equipo no encuentra este Mac, escribe a mano:
      {#each estado.servidor.ips as ip, i}{i ? " o " : ""}<b class="dir">{ip} : {estado.servidor.puerto}</b>{/each}
    </p>
  {:else if estado}
    <p class="error-form">No se pudo abrir la conexión en la red. Cierra y vuelve a abrir Cofre.</p>
  {/if}

  {#if estado?.equipos.length}
    <ul class="lista">
      {#each estado.equipos as e (e.id)}
        <li class="equipo">
          <span class="cf-tile cf-tile--brand"><Icono nombre="cofre" /></span>
          <div class="texto">
            <b>{e.nombre}</b>
            <span class="caption">{e.visto_en ? `Sincronizó ${haceCuanto(e.visto_en)}` : "Aún no ha sincronizado"}</span>
          </div>
          {#if quitando === e.id}
            <span class="caption">¿Quitarlo? Tendrá que emparejarse de nuevo.</span>
            <button class="cf-btn cf-btn--ghost" onclick={() => (quitando = null)}>No</button>
            <button class="cf-btn cf-btn--secondary" onclick={() => quitar(e.id)}>Quitar</button>
          {:else}
            <button class="cf-btn cf-btn--ghost" onclick={() => (quitando = e.id)}>Quitar</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .seccion { gap: var(--space-4); max-width: 820px; }
  .intro { font-size: 14px; line-height: 20px; color: var(--ink-2); max-width: 640px; }
  .fila { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .ayuda { font-size: 12px; line-height: 16px; color: var(--ink-2); }
  .dir { font-family: var(--font-mono); font-weight: 600; color: var(--ink); white-space: nowrap; }
  .ok { font-size: 13px; font-weight: 500; color: var(--primary-text); }
  .codigo-caja { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); padding: var(--space-5); border-radius: var(--r-lg); background: var(--primary-soft); }
  .codigo-caja .etiqueta { font-size: 13px; font-weight: 600; color: var(--primary-text); }
  .codigo { font: 650 44px/1 var(--font-mono); letter-spacing: .08em; color: var(--ink); font-variant-numeric: tabular-nums; }
  .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .equipo { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; padding: var(--space-3) var(--space-4); border-radius: var(--r-lg); border: 1px solid var(--line); background: var(--glass-1); }
  .equipo .texto { flex: 1; min-width: 140px; display: flex; flex-direction: column; gap: 2px; }
  .equipo b { font-size: 15px; }
</style>
