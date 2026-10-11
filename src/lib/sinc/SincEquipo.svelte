<script lang="ts">
  // Ajustes del celular / tablet → Sincronizar con el Mac: emparejar, estado y «Sincronizar ahora».
  import { onMount } from "svelte";
  import Icono from "$lib/Icono.svelte";
  import { mostrarAviso } from "$lib/alertas/estado-alertas.svelte";
  import { buscarMac, emparejar, estadoSinc, olvidarMac, primeraBorraDatos, type EstadoSinc, type MacEncontrado } from "./puente";
  import { sinc, sincronizar, refrescarEstado, haceCuanto, centro } from "./estado-sinc.svelte";

  /** Pantalla propia del celular (/sincronizar): pasos 1 y 2 del lienzo; si no, tarjeta de Ajustes. */
  let { pantalla = false }: { pantalla?: boolean } = $props();
  let codigoFoco = $state(false);

  const esTablet = typeof window !== "undefined" && Math.min(window.screen.width, window.screen.height) >= 600;

  let estado = $state<EstadoSinc | null>(null);
  let nombre = $state(esTablet ? "Tablet" : "Celular");
  let modo = $state<"buscar" | "manual">("buscar");
  let buscando = $state(false);
  let encontrados = $state<MacEncontrado[] | null>(null);
  let elegido = $state<MacEncontrado | null>(null);
  let direccion = $state("");
  let puerto = $state("47613");
  let codigo = $state("");
  const digitos = $derived(codigo.replace(/\D/g, "").slice(0, 6).padEnd(6, " ").split(""));
  let confirmarReemplazo = $state(false);
  let trabajando = $state(false);
  let error = $state("");
  let desemparejando = $state(false);
  let ahora = $state(Date.now());

  async function cargar() {
    estado = await estadoSinc().catch(() => null);
    await refrescarEstado();
  }

  onMount(() => {
    cargar().then(() => { if (!estado?.centro) buscar(); });
    const t = setInterval(() => (ahora = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  async function buscar() {
    buscando = true; error = "";
    encontrados = await buscarMac().catch(() => []);
    elegido = encontrados.length === 1 ? encontrados[0] : elegido;
    buscando = false;
  }

  const destino = $derived(
    modo === "buscar" ? elegido : direccion.trim() ? { direccion: direccion.trim(), puerto: Number(puerto) || 47613 } : null,
  );
  const codigoListo = $derived(codigo.replace(/\D/g, "").length === 6);

  async function enviar(ev: SubmitEvent) {
    ev.preventDefault();
    if (!destino || !codigoListo || trabajando) return;
    error = "";
    if (!confirmarReemplazo && (await primeraBorraDatos().catch(() => false))) {
      confirmarReemplazo = true;
      return;
    }
    trabajando = true;
    try {
      const mac = await emparejar(destino.direccion, destino.puerto, codigo, nombre.trim() || "Equipo");
      await cargar();
      codigo = ""; confirmarReemplazo = false;
      await sincronizar(true);
      mostrarAviso({ titulo: `Emparejado con ${mac}`, cuerpo: `Ya tienes aquí los datos del ${centro()}.`, nivel: "ok" });
    } catch (e) {
      error = String(e);
    } finally {
      trabajando = false;
    }
  }

  async function ahoraSi() {
    try {
      const r = await sincronizar(true);
      if (r) mostrarAviso({ titulo: "Sincronizado", cuerpo: r.recibidas ? `${r.recibidas} cambios recibidos.` : "Todo estaba al día.", nivel: "ok" });
    } catch (e) {
      mostrarAviso({ titulo: "No se pudo sincronizar", cuerpo: String(e), nivel: "w90" });
    }
  }

  async function desemparejar() {
    await olvidarMac().catch((e) => (error = String(e)));
    desemparejando = false;
    await cargar();
    buscar();
  }
</script>

{#if pantalla && !estado?.centro}
  <p class="intro">En tu computador (Mac o PC) abre Cofre → Ajustes → Equipos → «Emparejar un equipo». Los dos en la misma red Wi‑Fi.</p>
  <form class="pasos-m" onsubmit={enviar}>
    <section class="cf-glass paso-m">
      <div class="paso-cab"><span class="paso">1</span><b>Elige tu {centro()}</b></div>
      {#if modo === "buscar"}
        {#if buscando}
          <span class="ayuda">Buscando en la red…</span>
        {:else if encontrados?.length}
          {#each encontrados as m (m.id)}
            <button type="button" class="mac-m" aria-pressed={elegido?.id === m.id} onclick={() => (elegido = m)}>
              <span class="cf-tile cofre-t"><Icono nombre="cofre" /></span>
              <span class="mac-txt"><b>{m.nombre}</b><small>{m.direccion}</small></span>
              {#if elegido?.id === m.id}<Icono nombre="check" clase="ok-check" />{/if}
            </button>
          {/each}
        {:else if encontrados}
          <span class="ayuda">No se encontró. Revisa que Cofre esté abierto en el {centro()}, o escribe la dirección que aparece en Ajustes → Equipos.</span>
        {/if}
      {:else}
        <div class="dir">
          <span class="cf-field"><input bind:value={direccion} inputmode="decimal" placeholder="192.168.1.20" aria-label="Dirección del {centro()}" /></span>
          <span class="cf-field puerto"><input bind:value={puerto} inputmode="numeric" maxlength="5" aria-label="Puerto" /></span>
        </div>
      {/if}
      <div class="fila">
        <button type="button" class="cf-btn cf-btn--ghost sin-borde" onclick={() => { modo = "buscar"; buscar(); }} disabled={buscando}>
          {modo === "buscar" ? "Buscar de nuevo" : "Buscar"}
        </button>
        {#if modo === "buscar"}<button type="button" class="cf-btn cf-btn--ghost" onclick={() => (modo = "manual")}>Escribir la dirección</button>{/if}
      </div>
    </section>

    <section class="cf-glass paso-m">
      <div class="paso-cab"><span class="paso">2</span><b>Escribe el código del {centro()}</b></div>
      <label class="digitos">
        <input bind:value={codigo} oninput={() => (codigo = codigo.replace(/\D/g, "").slice(0, 6))}
          onfocus={() => (codigoFoco = true)} onblur={() => (codigoFoco = false)}
          inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Código de 6 números" />
        {#each digitos as d, i}
          <span class="digito" class:vacio={d === " "} class:foco={codigoFoco && i === Math.min(codigo.length, 5)} aria-hidden="true">{d === " " ? "·" : d}</span>
        {/each}
      </label>
      <label class="campo-m">
        <span class="ayuda">Este equipo se llama</span>
        <span class="cf-field"><input bind:value={nombre} maxlength="40" aria-label="Nombre de este equipo" /></span>
      </label>
    </section>

    {#if confirmarReemplazo}
      <div class="confirmar" role="alertdialog" aria-label="Reemplazar datos">
        <span class="etiqueta">Este equipo ya tiene datos</span>
        <p class="ayuda">Al emparejar se reemplazan por los del {centro()} (lo que anotaste solo aquí se borra). ¿Seguir?</p>
        <div class="fila">
          <button type="button" class="cf-btn cf-btn--ghost" onclick={() => (confirmarReemplazo = false)}>Cancelar</button>
          <button type="submit" class="cf-btn cf-btn--primary" disabled={trabajando}>Sí, reemplazar</button>
        </div>
      </div>
    {:else}
      <button class="cf-btn cf-btn--primary emparejar" type="submit" disabled={!destino || !codigoListo || trabajando}>
        {trabajando ? "Emparejando…" : "Emparejar"}
      </button>
    {/if}
    {#if error}<p class="error-form" role="alert">{error}</p>{/if}
    <p class="ayuda">Al emparejar, este equipo toma todos los datos del {centro()}. Todo viaja cifrado y solo entre tus equipos.</p>
  </form>
{:else}
<section id="sinc" class="cf-glass cf-card seccion" aria-labelledby="t-sinc">
  <h2 id="t-sinc" class="cf-card-title">{pantalla ? "Estado" : `Sincronizar con el ${centro()}`}</h2>

  {#if estado?.centro}
    <div class="bloque">
      <div class="bloque-cab">
        <span class="cf-tile cf-tile--brand"><Icono nombre="cofre" /></span>
        <div class="texto">
          <b>Conectado con {estado.centro.nombre}</b>
          <span class="caption" data-ahora={ahora}>
            {sinc.enCurso ? "Sincronizando…" : `Última sincronización: ${haceCuanto(sinc.ultima)}`}
          </span>
        </div>
      </div>
      {#if sinc.error && !sinc.enCurso}<p class="error-form" role="alert">{sinc.error}</p>{/if}
      <p class="ayuda">Se sincroniza sola al abrir Cofre, después de cada cambio y cada 5 minutos mientras la usas. Necesita que Cofre esté abierto en el {centro()} y la misma red Wi‑Fi.</p>
      <div class="fila">
        <button class="cf-btn cf-btn--primary" onclick={ahoraSi} disabled={sinc.enCurso}>Sincronizar ahora</button>
        {#if desemparejando}
          <span class="caption">¿Desemparejar? Los datos se quedan aquí, pero ya no se sincronizan.</span>
          <button class="cf-btn cf-btn--ghost" onclick={() => (desemparejando = false)}>No</button>
          <button class="cf-btn cf-btn--secondary" onclick={desemparejar}>Desemparejar</button>
        {:else}
          <button class="cf-btn cf-btn--ghost" onclick={() => (desemparejando = true)}>Desemparejar</button>
        {/if}
      </div>
    </div>
  {:else}
    <p class="intro">
      En tu computador abre Cofre → Ajustes → Equipos → «Emparejar un equipo» y escribe aquí el código que aparece.
      Los dos deben estar en la misma red Wi‑Fi.
    </p>
    <form class="pasos" onsubmit={enviar}>
      <label class="campo">
        <span class="etiqueta">Nombre de este equipo</span>
        <span class="cf-field"><input bind:value={nombre} maxlength="40" /></span>
      </label>

      <div class="campo">
        <span class="etiqueta">Tu {centro()}</span>
        <div class="cf-seg">
          <button type="button" aria-pressed={modo === "buscar"} onclick={() => (modo = "buscar")}>Buscar</button>
          <button type="button" aria-pressed={modo === "manual"} onclick={() => (modo = "manual")}>Escribir la dirección</button>
        </div>
        {#if modo === "buscar"}
          {#if buscando}
            <span class="ayuda">Buscando en la red…</span>
          {:else if encontrados?.length}
            <div class="macs">
              {#each encontrados as m (m.id)}
                <button type="button" class="mac" class:elegido={elegido?.id === m.id} onclick={() => (elegido = m)}>
                  <Icono nombre="cofre" /><span>{m.nombre}</span><small>{m.direccion}</small>
                </button>
              {/each}
            </div>
          {:else if encontrados}
            <span class="ayuda">No se encontró. Revisa que Cofre esté abierto en el {centro()}, o escribe la dirección que aparece en Ajustes → Equipos.</span>
          {/if}
          {#if !buscando}<div><button type="button" class="cf-btn cf-btn--ghost" onclick={buscar}>Buscar de nuevo</button></div>{/if}
        {:else}
          <div class="dir">
            <span class="cf-field"><input bind:value={direccion} inputmode="decimal" placeholder="192.168.1.20" aria-label="Dirección del {centro()}" /></span>
            <span class="cf-field puerto"><input bind:value={puerto} inputmode="numeric" maxlength="5" aria-label="Puerto" /></span>
          </div>
        {/if}
      </div>

      <label class="campo">
        <span class="etiqueta">Código del {centro()}</span>
        <span class="cf-field"><input class="codigo" bind:value={codigo} inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000 000" /></span>
      </label>

      {#if confirmarReemplazo}
        <div class="confirmar" role="alertdialog" aria-label="Reemplazar datos">
          <span class="etiqueta">Este equipo ya tiene datos</span>
          <p class="ayuda">Al emparejar se reemplazan por los del {centro()} (lo que anotaste solo aquí se borra). ¿Seguir?</p>
          <div class="fila">
            <button type="button" class="cf-btn cf-btn--ghost" onclick={() => (confirmarReemplazo = false)}>Cancelar</button>
            <button type="submit" class="cf-btn cf-btn--primary" disabled={trabajando}>Sí, reemplazar</button>
          </div>
        </div>
      {:else}
        <div><button class="cf-btn cf-btn--primary" type="submit" disabled={!destino || !codigoListo || trabajando}>
          {trabajando ? "Emparejando…" : "Emparejar"}
        </button></div>
      {/if}
      {#if error}<p class="error-form" role="alert">{error}</p>{/if}
    </form>
  {/if}
</section>
{/if}

<style>
  /* Celular: pantalla «Sincronizar con el Mac» (lienzo) */
  .pasos-m { display: flex; flex-direction: column; gap: var(--space-4); }
  .paso-m { border-radius: 24px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .paso-cab { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .paso { width: 24px; height: 24px; flex: none; border-radius: 999px; display: grid; place-items: center; background: var(--primary-soft); color: var(--primary-text); font-size: 12px; font-weight: 700; }
  .mac-m { display: flex; align-items: center; gap: 12px; padding: 12px 14px; min-height: 56px; border-radius: 18px; border: 1.5px solid var(--line); background: var(--glass-1); color: var(--ink); text-align: left; font: inherit; }
  .mac-m[aria-pressed="true"] { border-color: var(--primary); background: var(--primary-soft); }
  .cofre-t { background: var(--grad-brand); color: #fff; }
  .mac-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .mac-txt b { font-size: 15px; }
  .mac-txt small { font: 400 12px/16px var(--font-mono); color: var(--ink-2); }
  .mac-m :global(.ok-check) { color: var(--primary); stroke-width: 2.2; }
  .sin-borde { padding-left: 0; }
  .digitos { position: relative; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
  .digitos input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; border: 0; font-size: 16px; }
  .digito { height: 56px; border-radius: 14px; display: grid; place-items: center; background: var(--input); border: 1px solid var(--line); font: 600 24px/1 var(--font-mono); color: var(--ink); }
  .digito.vacio { color: var(--ink-3); }
  .digito.foco { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
  .campo-m { display: flex; flex-direction: column; gap: 6px; }
  .campo-m .cf-field { height: 48px; }
  .emparejar { height: 52px; }
  .seccion { gap: var(--space-4); max-width: 820px; }
  .intro { font-size: 14px; line-height: 20px; color: var(--ink-2); max-width: 640px; }
  .ayuda { font-size: 12px; line-height: 16px; color: var(--ink-2); }
  .fila { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .bloque { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-radius: var(--r-lg); border: 1px solid var(--line); background: var(--glass-1); }
  .bloque-cab { display: flex; align-items: center; gap: var(--space-3); }
  .bloque-cab .texto { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .bloque-cab b { font-size: 15px; }
  .pasos { display: flex; flex-direction: column; gap: var(--space-4); max-width: 480px; }
  .macs { display: flex; flex-direction: column; gap: var(--space-2); }
  .mac { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-radius: var(--r-lg); border: 1px solid var(--line); background: var(--glass-1); color: var(--ink); font: 600 15px/20px var(--font-sans); text-align: left; cursor: pointer; min-height: 48px; }
  .mac span { flex: 1; }
  .mac small { font: 400 12px/16px var(--font-mono); color: var(--ink-2); }
  .mac.elegido { border-color: var(--primary); background: var(--primary-soft); }
  .dir { display: grid; grid-template-columns: 1fr 96px; gap: var(--space-2); }
  .codigo { font-family: var(--font-mono); font-size: 20px; letter-spacing: .12em; }
  .confirmar { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); border-radius: var(--r-lg); background: var(--primary-soft); }
  .confirmar .etiqueta { font-size: 13px; font-weight: 600; color: var(--primary-text); }
</style>
