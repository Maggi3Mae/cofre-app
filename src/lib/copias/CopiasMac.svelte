<script lang="ts">
  // Ajustes del Mac → Copias de seguridad: carpeta, contraseña, copia diaria, «Copiar ahora» y «Restaurar».
  import { onMount } from "svelte";
  import Icono from "$lib/Icono.svelte";
  import { compu, llavero } from "$lib/plataforma";
  import {
    leerConfigCopias, guardarConfigCopias, tieneContrasena, guardarContrasena, elegirCarpeta, elegirArchivoCopia,
    hacerCopia, listarCopias, prepararRestauracion, reiniciarParaRestaurar, fechaDeCopia, tamano,
    type ConfigCopias, type CopiaEnCarpeta,
  } from "./copias";

  let config = $state<ConfigCopias>({ activa: false, carpeta: null, ultima: null });
  let conClave = $state(false);
  let copias = $state<CopiaEnCarpeta[]>([]);
  let aviso = $state("");
  let error = $state("");
  let ocupado = $state(false);

  // Contraseña
  let editandoClave = $state(false);
  let clave1 = $state("");
  let clave2 = $state("");

  // Restaurar
  let restaurar = $state<{ archivo: string; clave: string; paso: "clave" | "lista"; fotos: number } | null>(null);

  const fmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const cuando = (d: Date | null) => (d ? fmt.format(d).replace(/\./g, "") : "—");
  const nombreCarpeta = (r: string) => r.split("/").filter(Boolean).pop() ?? r;

  async function cargar() {
    config = await leerConfigCopias();
    conClave = await tieneContrasena().catch(() => false);
    copias = config.carpeta ? await listarCopias(config.carpeta).catch(() => []) : [];
  }
  onMount(() => { cargar(); });

  async function hacer(f: () => Promise<void>) {
    if (ocupado) return;
    ocupado = true; aviso = ""; error = "";
    try { await f(); } catch (e) { error = e instanceof Error ? e.message : String(e); }
    finally { ocupado = false; }
  }

  const cambiarCarpeta = () => hacer(async () => {
    const c = await elegirCarpeta(config.carpeta);
    if (!c) return;
    config = { ...config, carpeta: c };
    await guardarConfigCopias(config);
    copias = await listarCopias(c).catch(() => []);
    aviso = `Las copias irán a «${nombreCarpeta(c)}».`;
  });

  const guardarClave = (e: SubmitEvent) => { e.preventDefault(); return hacer(async () => {
    if (clave1 !== clave2) throw new Error("Las dos contraseñas no coinciden.");
    await guardarContrasena(clave1);
    const habia = conClave;
    conClave = true; editandoClave = false; clave1 = ""; clave2 = "";
    aviso = habia ? "Contraseña cambiada. Las copias anteriores siguen abriéndose con la contraseña anterior." : `Contraseña guardada en el ${llavero}.`;
  }); };

  const alternar = () => hacer(async () => {
    config = { ...config, activa: !config.activa };
    await guardarConfigCopias(config);
    aviso = config.activa ? "Copia diaria activa: se hace al abrir Cofre y en la revisión diaria." : "Copia diaria apagada.";
  });

  const copiarAhora = () => hacer(async () => {
    const r = await hacerCopia();
    await cargar();
    aviso = `Copia lista (${tamano(r.bytes)}, ${r.fotos} ${r.fotos === 1 ? "foto" : "fotos"})${r.borradas ? `; se borraron ${r.borradas} viejas` : ""}.`;
  });

  const elegirRestaurar = (archivo?: string) => hacer(async () => {
    const a = archivo ?? (await elegirArchivoCopia(config.carpeta));
    if (a) restaurar = { archivo: a, clave: "", paso: "clave", fotos: 0 };
  });

  const prepararR = (e: SubmitEvent) => { e.preventDefault(); return hacer(async () => {
    if (!restaurar) return;
    const r = await prepararRestauracion(restaurar.archivo, restaurar.clave);
    restaurar = { ...restaurar, clave: "", paso: "lista", fotos: r.fotos };
  }); };

  const listo = $derived(!!config.carpeta && conClave);
</script>

<section class="cf-glass cf-card seccion" id="copias" aria-labelledby="t-copias">
  <h2 id="t-copias" class="cf-card-title">Copias de seguridad</h2>
  <p class="intro">
    Una copia cifrada de tus datos y fotos de facturas en la carpeta que elijas (iCloud Drive, un disco externo…).
    Se guardan las últimas 30. Solo se abre con tu contraseña.
  </p>

  <div class="bloque">
    <div class="bloque-cab">
      <span class="cf-tile cf-tile--brand"><Icono nombre="importar" /></span>
      <div class="texto">
        <b>Carpeta</b>
        <span class="caption ruta" title={config.carpeta ?? ""}>{config.carpeta ?? "Aún no has elegido dónde guardarlas."}</span>
      </div>
      <button class="cf-btn cf-btn--secondary" onclick={cambiarCarpeta} disabled={ocupado}>{config.carpeta ? "Cambiar" : "Elegir carpeta"}</button>
    </div>
  </div>

  <div class="bloque">
    <div class="bloque-cab">
      <span class="cf-tile cf-tile--brand"><Icono nombre="candado" /></span>
      <div class="texto">
        <b>Contraseña</b>
        <span class="caption">{conClave ? `Guardada en el ${llavero} de este ${compu}.` : "Sin ella no se puede abrir ni restaurar una copia: guárdala en un lugar seguro."}</span>
      </div>
      {#if !editandoClave}
        <button class="cf-btn cf-btn--secondary" onclick={() => { editandoClave = true; error = ""; }}>{conClave ? "Cambiar" : "Crear contraseña"}</button>
      {/if}
    </div>
    {#if editandoClave}
      <form class="fila" onsubmit={guardarClave}>
        <span class="cf-field clave"><input type="password" bind:value={clave1} minlength="8" required placeholder="Mínimo 8 caracteres" autocomplete="new-password" aria-label="Contraseña nueva" /></span>
        <span class="cf-field clave"><input type="password" bind:value={clave2} minlength="8" required placeholder="Repítela" autocomplete="new-password" aria-label="Repetir contraseña" /></span>
        <button class="cf-btn cf-btn--ghost" type="button" onclick={() => { editandoClave = false; clave1 = clave2 = ""; }}>Cancelar</button>
        <button class="cf-btn cf-btn--primary" type="submit" disabled={ocupado}>Guardar</button>
      </form>
      {#if conClave}<span class="ayuda">Las copias que ya existen siguen abriéndose con la contraseña anterior.</span>{/if}
    {/if}
  </div>

  <div class="bloque">
    <div class="bloque-cab">
      <span class="cf-tile cf-tile--brand"><Icono nombre="sincronizar" /></span>
      <div class="texto">
        <b>Copia diaria</b>
        <span class="caption">
          {config.ultima ? `Última: ${cuando(new Date(config.ultima))}` : "Aún no hay copias."}{copias.length ? ` · ${copias.length} en la carpeta` : ""}
        </span>
      </div>
      <label class="interruptor solo"><input type="checkbox" checked={config.activa} onchange={alternar} disabled={!listo || ocupado} aria-label="Copia diaria" /></label>
    </div>
    {#if !listo}<span class="ayuda">Elige la carpeta y crea la contraseña para activarla.</span>
    {:else}<span class="ayuda">Se hace al abrir Cofre y en la revisión diaria (si la última tiene más de 20 horas).</span>{/if}
    <div class="fila">
      <button class="cf-btn cf-btn--primary" onclick={copiarAhora} disabled={!listo || ocupado}>{ocupado ? "Copiando…" : "Copiar ahora"}</button>
      <button class="cf-btn cf-btn--ghost" onclick={() => elegirRestaurar()} disabled={ocupado}>Restaurar…</button>
    </div>
    {#if copias.length}
      <details class="lista-copias">
        <summary class="caption">Ver las copias</summary>
        <ul>
          {#each copias as c (c.ruta)}
            <li>
              <span>{cuando(fechaDeCopia(c.nombre))}</span><span class="caption">{tamano(c.bytes)}</span>
              <button class="cf-btn cf-btn--ghost corto" onclick={() => elegirRestaurar(c.ruta)} disabled={ocupado}>Restaurar</button>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  </div>

  {#if restaurar}
    <div class="bloque peligro-caja" role="region" aria-label="Restaurar una copia">
      <b>Restaurar «{nombreCarpeta(restaurar.archivo)}»</b>
      {#if restaurar.paso === "clave"}
        <p class="ayuda">
          Tus datos actuales se reemplazan por los de la copia (quedan guardados aparte como «antes-restaurar»).
          El celular y la tablet se desemparejan: al volver a emparejarlos reciben los datos restaurados.
        </p>
        <form class="fila" onsubmit={prepararR}>
          <span class="cf-field clave"><input type="password" bind:value={restaurar.clave} required placeholder="Contraseña de esa copia" autocomplete="current-password" aria-label="Contraseña de la copia" /></span>
          <button class="cf-btn cf-btn--ghost" type="button" onclick={() => (restaurar = null)}>Cancelar</button>
          <button class="cf-btn cf-btn--primary" type="submit" disabled={ocupado}>{ocupado ? "Abriendo…" : "Abrir copia"}</button>
        </form>
      {:else}
        <p class="ayuda">La copia está bien ({restaurar.fotos} {restaurar.fotos === 1 ? "foto" : "fotos"}). Cofre se reiniciará para cambiar los datos.</p>
        <div class="fila">
          <button class="cf-btn cf-btn--ghost" onclick={() => (restaurar = null)}>Cancelar</button>
          <button class="cf-btn cf-btn--primary" onclick={() => hacer(reiniciarParaRestaurar)}>Restaurar y reiniciar</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if aviso}<p class="ok" role="status">{aviso}</p>{/if}
  {#if error}<p class="error-form" role="alert">{error}</p>{/if}
</section>

<style>
  .seccion { gap: var(--space-4); max-width: 820px; }
  .intro { font-size: 14px; line-height: 20px; color: var(--ink-2); max-width: 640px; }
  .bloque { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-radius: var(--r-lg); border: 1px solid var(--line); background: var(--glass-1); }
  .bloque-cab { display: flex; align-items: center; gap: var(--space-3); }
  .bloque-cab .texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .bloque-cab b { font-size: 15px; }
  .ruta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fila { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .clave { width: 220px; }
  .ayuda { font-size: 12px; line-height: 16px; color: var(--ink-2); }
  .ok { font-size: 13px; font-weight: 500; color: var(--primary-text); }
  .interruptor.solo { gap: 0; }
  .peligro-caja { border-color: color-mix(in srgb, var(--warn-90) 50%, var(--line)); }
  .lista-copias summary { cursor: pointer; font-weight: 600; }
  .lista-copias ul { list-style: none; margin: var(--space-2) 0 0; padding: 0; display: flex; flex-direction: column; max-height: 240px; overflow: auto; }
  .lista-copias li { display: flex; align-items: center; gap: var(--space-3); padding: 4px 0; border-top: 1px solid var(--line); font-size: 13px; }
  .lista-copias li:first-child { border-top: 0; }
  .lista-copias li > span:first-child { flex: 1; }
  .corto { height: 32px; padding: 0 10px; }
</style>
