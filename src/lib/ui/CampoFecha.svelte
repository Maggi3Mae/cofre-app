<script lang="ts">
  // Campo de fecha de Cofre (reemplaza el <input type="date"> del sistema; diseño aprobado en el lienzo
  // «Cofre — Campo de fecha y calendario»). Valor «AAAA-MM-DD» o "" (sin fecha).
  // Mac/tablet: calendario en un panel de vidrio bajo el campo (días → meses → años) y se puede escribir
  // a mano (dd/mm/aaaa). Celular: hoja desde abajo, sin teclado.
  import { onDestroy, tick } from "svelte";
  import { pantalla } from "$lib/pantalla.svelte";
  import { alAtras } from "$lib/atras";
  import { hoy } from "$lib/formato";

  let {
    valor = $bindable(""), min = "", max = "", opcional = false, requerido = false, vacio = "Sin fecha",
    etiqueta = "", titulo = "", prefijo = "", id, alCambiar,
  }: {
    valor?: string;
    min?: string;
    max?: string;
    /** Muestra la × y «Sin fecha» para dejarla vacía. */
    opcional?: boolean;
    requerido?: boolean;
    /** Texto en gris cuando no hay fecha. */
    vacio?: string;
    /** Nombre accesible (si el campo no está dentro de un <label>). */
    etiqueta?: string;
    /** Título de la hoja en el celular (por defecto la etiqueta). */
    titulo?: string;
    /** Texto pequeño a la izquierda dentro del campo (filtros: «Desde», «Hasta»). */
    prefijo?: string;
    id?: string;
    alCambiar?: (v: string) => void;
  } = $props();

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
  const dos = (n: number) => String(n).padStart(2, "0");
  const iso = (a: number, m: number, d: number) => `${a}-${dos(m)}-${dos(d)}`;
  const partes = (f: string) => f.split("-").map(Number) as [number, number, number];
  const valida = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(Date.parse(f + "T00:00:00Z"));
  const ultimo = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
  const enRango = (f: string) => (!min || f >= min) && (!max || f <= max);
  function mover(f: string, dias: number) {
    const [a, m, d] = partes(f);
    const t = new Date(Date.UTC(a, m - 1, d + dias));
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  /** «15 oct 2026» */
  const enPalabras = (f: string) => { const [a, m, d] = partes(f); return `${d} ${CORTOS[m - 1]} ${a}`; };
  const aEscribir = (f: string) => { const [a, m, d] = partes(f); return `${dos(d)}/${dos(m)}/${a}`; };
  /** dd/mm/aaaa, d-m-aa, d/m (este año) o AAAA-MM-DD → ISO o null. */
  function leer(t: string): string | null {
    const s = t.trim();
    if (valida(s)) return s;
    const p = s.match(/^(\d{1,2})[/.\- ](\d{1,2})(?:[/.\- ](\d{2}|\d{4}))?$/);
    if (!p) return null;
    const d = +p[1], m = +p[2];
    let a = p[3] ? +p[3] : partes(hoy())[0];
    if (a < 100) a += 2000;
    if (m < 1 || m > 12 || d < 1 || d > ultimo(a, m)) return null;
    return iso(a, m, d);
  }

  // ---------- Estado ----------
  let abierto = $state(false);
  let vista = $state<"dias" | "meses" | "anos">("dias");
  let ano = $state(2026);
  let mes = $state(1);
  /** Día resaltado con el teclado. */
  let foco = $state("");
  let editando = $state(false);
  let texto = $state("");
  let campo = $state<HTMLDivElement>();
  let entrada = $state<HTMLInputElement>();
  let pos = $state({ top: 0, left: 0, arriba: false });
  const idPanel = `cal-${Math.random().toString(36).slice(2, 8)}`;
  const celular = $derived(pantalla.celular);

  function fijarCursor(f: string) {
    const [a, m] = partes(f);
    ano = a; mes = m;
  }

  let quitarAtras: (() => void) | null = null;
  async function abrir() {
    if (abierto) return;
    const base = valor && valida(valor) ? valor : min && hoy() < min ? min : hoy();
    fijarCursor(base);
    foco = base;
    vista = "dias";
    abierto = true;
    quitarAtras = alAtras(cerrar);
    await tick();
    ubicar();
  }
  function cerrar() {
    if (!abierto) return;
    abierto = false;
    quitarAtras?.(); quitarAtras = null;
  }
  onDestroy(() => quitarAtras?.());

  function poner(f: string) {
    if (f && !enRango(f)) return;
    valor = f;
    alCambiar?.(f);
    editando = false;
    cerrar();
  }

  // ---------- Panel bajo el campo (Mac/tablet) ----------
  const ANCHO = 320, ALTO = 380;
  function ubicar() {
    if (!campo || celular) return;
    const r = campo.getBoundingClientRect();
    const abajo = window.innerHeight - r.bottom;
    const arriba = abajo < ALTO + 12 && r.top > abajo;
    pos = {
      top: arriba ? r.top - 8 : r.bottom + 8,
      left: Math.max(12, Math.min(r.left, window.innerWidth - ANCHO - 12)),
      arriba,
    };
  }
  $effect(() => {
    if (!abierto || celular) return;
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (campo?.contains(t) || panel?.contains(t)) return;
      confirmarTexto();
      cerrar();
    };
    addEventListener("pointerdown", fuera, true);
    addEventListener("resize", ubicar);
    addEventListener("scroll", ubicar, true);
    return () => {
      removeEventListener("pointerdown", fuera, true);
      removeEventListener("resize", ubicar);
      removeEventListener("scroll", ubicar, true);
    };
  });
  let panel = $state<HTMLDivElement>();

  /** Lleva el nodo al <body>: el panel no queda recortado por paneles con scroll. */
  function aCuerpo(n: HTMLElement) {
    document.body.appendChild(n);
    return { destroy: () => n.remove() };
  }

  // ---------- Escribir a mano (Mac/tablet) ----------
  function alEnfocar() {
    if (celular) return;
    editando = true;
    texto = valor ? aEscribir(valor) : "";
    abrir();
    queueMicrotask(() => entrada?.select());
  }
  function alEscribir() {
    const f = leer(texto);
    if (f) { fijarCursor(f); foco = f; vista = "dias"; }
  }
  function confirmarTexto() {
    if (!editando) return;
    editando = false;
    if (!texto.trim()) { if (opcional) poner(""); return; }
    const f = leer(texto);
    if (f && enRango(f) && f !== valor) { valor = f; alCambiar?.(f); }
  }
  function alSalir() {
    // Si el clic fue dentro del panel, el foco vuelve al campo; si no, se confirma lo escrito.
    setTimeout(() => {
      if (panel?.contains(document.activeElement) || document.activeElement === entrada) return;
      confirmarTexto();
    }, 0);
  }
  function teclas(e: KeyboardEvent) {
    if (e.key === "Escape" && abierto) { e.preventDefault(); e.stopPropagation(); editando = false; cerrar(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const f = leer(texto);
      if (f && f !== (valor ? valor : "")) { if (enRango(f)) poner(f); return; }
      if (abierto && foco && enRango(foco)) poner(foco);
      else if (!abierto) abrir();
      return;
    }
    const salto = e.key === "ArrowDown" ? 7 : e.key === "ArrowUp" ? -7 : 0;
    const meses = e.key === "PageDown" ? 1 : e.key === "PageUp" ? -1 : 0;
    if (!salto && !meses) return;
    e.preventDefault();
    if (!abierto) { abrir(); return; }
    let f = foco || hoy();
    if (salto) f = mover(f, salto);
    else { const [a, m, d] = partes(f); const nm = m + meses; const na = a + Math.floor((nm - 1) / 12); const mm = ((nm - 1) % 12 + 12) % 12 + 1; f = iso(na, mm, Math.min(d, ultimo(na, mm))); }
    foco = f; fijarCursor(f); vista = "dias";
  }

  // ---------- Calendario ----------
  const dia = hoy();
  const semanas = $derived.by(() => {
    const primero = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay(); // 0 = domingo
    const antes = (primero + 6) % 7;
    const inicio = mover(iso(ano, mes, 1), -antes);
    const total = Math.ceil((antes + ultimo(ano, mes)) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const f = mover(inicio, i);
      return { f, n: partes(f)[2], fuera: partes(f)[1] !== mes, inactivo: !enRango(f) };
    });
  });
  function pasoMes(d: number) {
    const n = mes + d;
    ano += Math.floor((n - 1) / 12);
    mes = ((n - 1) % 12 + 12) % 12 + 1;
  }
  const anoBase = $derived(ano - ((ano - 2021) % 12 + 12) % 12);
  const elegirMes = (m: number) => { mes = m; vista = "dias"; };
  const elegirAno = (a: number) => { ano = a; vista = "meses"; };
  const [aHoy, mHoy] = partes(dia);
  const mantenerFoco = (e: MouseEvent) => { if (!celular) e.preventDefault(); };

  const mostrado = $derived(editando ? texto : valor && valida(valor) ? enPalabras(valor) : "");
</script>

{#snippet calendario()}
  <div class="cab">
    {#if vista === "dias"}
      <button type="button" class="titulo" onclick={() => (vista = "meses")} aria-label="Elegir mes y año">
        {MESES[mes - 1].replace(/^./, (c) => c.toUpperCase())} {ano}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <button type="button" class="flecha" onclick={() => pasoMes(-1)} aria-label="Mes anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
      <button type="button" class="flecha" onclick={() => pasoMes(1)} aria-label="Mes siguiente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
    {:else if vista === "meses"}
      <button type="button" class="titulo" onclick={() => (vista = "anos")} aria-label="Elegir año">
        {ano}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <button type="button" class="flecha" onclick={() => ano--} aria-label="Año anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
      <button type="button" class="flecha" onclick={() => ano++} aria-label="Año siguiente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
    {:else}
      <span class="titulo fijo">{anoBase} – {anoBase + 11}</span>
      <button type="button" class="flecha" onclick={() => (ano -= 12)} aria-label="Años anteriores"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
      <button type="button" class="flecha" onclick={() => (ano += 12)} aria-label="Años siguientes"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
    {/if}
  </div>

  {#if vista === "dias"}
    <div class="semana" aria-hidden="true"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
    <div class="dias" role="grid" aria-label="{MESES[mes - 1]} {ano}">
      {#each semanas as d (d.f)}
        <button type="button" class="dia" class:fuera={d.fuera} class:hoy={d.f === dia} class:elegido={d.f === valor}
          class:inicio={!!min && d.f === min && d.f !== valor} class:foco={!celular && d.f === foco && d.f !== valor}
          disabled={d.inactivo} aria-pressed={d.f === valor} aria-label={enPalabras(d.f)} onclick={() => poner(d.f)}>{d.n}</button>
      {/each}
    </div>
  {:else if vista === "meses"}
    <div class="rejilla">
      {#each CORTOS as m, i (m)}
        <button type="button" class="celda" class:actual={ano === aHoy && i + 1 === mHoy}
          class:elegido={!!valor && partes(valor)[0] === ano && partes(valor)[1] === i + 1} onclick={() => elegirMes(i + 1)}>{m}</button>
      {/each}
    </div>
  {:else}
    <div class="rejilla">
      {#each Array.from({ length: 12 }, (_, i) => anoBase + i) as a (a)}
        <button type="button" class="celda" class:actual={a === aHoy} class:elegido={!!valor && partes(valor)[0] === a}
          onclick={() => elegirAno(a)}>{a}</button>
      {/each}
    </div>
  {/if}
{/snippet}

<div class="cf-field campo-fecha" class:abierto bind:this={campo}>
  {#if prefijo}<span class="sufijo">{prefijo}</span>{/if}
  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v4M16 3v4M4 10h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /></svg>
  <input bind:this={entrada} {id} type="text" value={mostrado} placeholder={vacio} required={requerido}
    readonly={celular} inputmode={celular ? "none" : "numeric"} autocomplete="off" spellcheck="false"
    role="combobox" aria-controls={idPanel} aria-label={etiqueta || undefined} aria-haspopup="dialog" aria-expanded={abierto}
    oninput={(e) => { texto = e.currentTarget.value; alEscribir(); }}
    onfocus={alEnfocar} onblur={alSalir} onkeydown={teclas}
    onclick={() => (celular ? abrir() : !abierto && abrir())} />
  {#if opcional && valor}
    <button type="button" class="quitar" onclick={() => poner("")} aria-label="Quitar fecha" title="Quitar fecha">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
    </button>
  {/if}
</div>

{#if abierto}
  {#if celular}
    <div class="velo" use:aCuerpo onclick={cerrar} role="presentation"></div>
    <div class="hoja cf cf-glass-3" id={idPanel} use:aCuerpo role="dialog" aria-modal="true" aria-label={titulo || etiqueta || "Elegir fecha"}>
      <div class="asa" aria-hidden="true"></div>
      <div class="hoja-cab">
        <h3>{titulo || etiqueta || "Fecha"}</h3>
        {#if opcional}<span>Opcional</span>{/if}
      </div>
      <div class="cal grande">{@render calendario()}</div>
      <div class="hoja-pie">
        <button type="button" class="cf-btn cf-btn--ghost" onclick={() => { fijarCursor(dia); vista = "dias"; if (enRango(dia)) poner(dia); }}>Hoy</button>
        {#if opcional}<button type="button" class="cf-btn cf-btn--secondary" onclick={() => poner("")}>{vacio}</button>{/if}
      </div>
    </div>
  {:else}
    <div class="pop cf cf-glass-3" id={idPanel} class:arriba={pos.arriba} bind:this={panel} use:aCuerpo role="dialog" tabindex="-1" aria-label={etiqueta || "Elegir fecha"}
      style:top="{pos.top}px" style:left="{pos.left}px" onmousedown={mantenerFoco}>
      <div class="cal">{@render calendario()}</div>
      <div class="pie">
        <button type="button" class="btn" onclick={() => { if (enRango(dia)) poner(dia); else { fijarCursor(dia); vista = "dias"; } }}>Hoy</button>
        {#if opcional}<button type="button" class="btn suave" onclick={() => poner("")}>Sin fecha</button>
        {:else}<span class="ayuda">Esc para cerrar</span>{/if}
      </div>
    </div>
  {/if}
{/if}

<style>
  .campo-fecha { cursor: pointer; padding-right: 6px; }
  .campo-fecha.abierto { outline: 2px solid var(--primary); outline-offset: 1px; }
  .campo-fecha input { cursor: pointer; text-overflow: ellipsis; }
  .campo-fecha input:focus { cursor: text; }
  .campo-fecha .sufijo { font-size: 12px; color: var(--ink-2); flex: none; }
  .campo-fecha input::placeholder { color: var(--ink-3); }
  .campo-fecha input:read-only { cursor: pointer; }
  .ico { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; color: var(--ink-3); }
  .abierto .ico { color: var(--primary); }
  .quitar { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--ink-3); cursor: pointer; }
  .quitar:hover { background: var(--track); color: var(--ink); }
  .quitar svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }

  svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  /* Panel (Mac/tablet) */
  .pop { position: fixed; z-index: 1000; width: 320px; box-sizing: border-box; padding: var(--space-4); border-radius: var(--r-lg); display: flex; flex-direction: column; gap: var(--space-3); }
  .pop.arriba { transform: translateY(-100%); }
  .cal { display: flex; flex-direction: column; gap: var(--space-3); }
  .cab { display: flex; align-items: center; gap: var(--space-1); }
  .titulo { flex: 1; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 8px; margin-left: -8px; border: 0; border-radius: var(--r-sm); background: transparent;
    font: 650 17px/22px var(--font-display); letter-spacing: -.01em; color: var(--ink); cursor: pointer; text-align: left; }
  .titulo svg { width: 16px; height: 16px; color: var(--ink-3); }
  .titulo.fijo { cursor: default; }
  .flecha { width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--ink-2); cursor: pointer; }
  .flecha svg { width: 18px; height: 18px; }
  .titulo:not(.fijo):hover, .flecha:hover { background: var(--track); }
  .semana { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); text-align: center; font: 600 11px/16px var(--font-sans); letter-spacing: .06em; color: var(--ink-3); }
  .dias { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
  .dia { height: 38px; border: 0; border-radius: var(--r-sm); background: transparent; font: 500 14px/1 var(--font-sans); font-variant-numeric: tabular-nums; color: var(--ink); cursor: pointer; }
  .dia:hover:not(:disabled) { background: var(--primary-soft); }
  .dia.fuera { color: var(--ink-3); }
  .dia.hoy { box-shadow: inset 0 0 0 1.5px var(--primary); color: var(--primary-text); font-weight: 650; }
  .dia.inicio { background: var(--primary-soft); color: var(--primary-text); font-weight: 650; }
  .dia.foco { outline: 2px solid var(--primary); outline-offset: -2px; }
  .dia.elegido, .celda.elegido { background: linear-gradient(180deg, var(--primary-hi), var(--primary)); color: var(--on-primary); font-weight: 650; box-shadow: 0 8px 20px color-mix(in srgb, var(--primary) 30%, transparent); }
  .dia:disabled { opacity: .35; cursor: not-allowed; }
  .dia:focus-visible, .celda:focus-visible, .flecha:focus-visible, .titulo:focus-visible, .btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
  .rejilla { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .celda { height: 52px; border: 0; border-radius: var(--r-md); background: transparent; font: 500 15px/1 var(--font-sans); color: var(--ink); cursor: pointer; text-transform: capitalize; }
  .celda:hover { background: var(--primary-soft); }
  .celda.actual { box-shadow: inset 0 0 0 1.5px var(--primary); color: var(--primary-text); font-weight: 650; }
  .pie { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--line); }
  .btn { height: 36px; padding: 0 12px; border: 0; border-radius: var(--r-sm); background: transparent; font: 600 13px/18px var(--font-sans); color: var(--primary-text); cursor: pointer; }
  .btn:hover { background: var(--primary-soft); }
  .btn.suave { color: var(--ink-2); }
  .ayuda { font-size: 12px; color: var(--ink-3); }

  /* Hoja (celular) */
  .velo { position: fixed; inset: 0; z-index: 999; background: rgba(13, 10, 24, .38); }
  .hoja { position: fixed; z-index: 1000; left: 0; right: 0; bottom: 0; border-radius: var(--r-xl) var(--r-xl) 0 0; border-bottom: 0;
    padding: 10px var(--space-4) calc(var(--area-abajo, 0px) + var(--space-5)); display: flex; flex-direction: column; gap: var(--space-3); }
  .asa { align-self: center; width: 40px; height: 5px; border-radius: var(--r-full); background: var(--track); }
  .hoja-cab { display: flex; align-items: baseline; justify-content: space-between; padding: 4px 4px 0; }
  .hoja-cab h3 { margin: 0; font: 650 20px/26px var(--font-display); color: var(--ink); }
  .hoja-cab span { font-size: 13px; color: var(--ink-2); }
  .grande .titulo { font-size: 18px; height: 44px; }
  .grande .flecha { width: 44px; height: 44px; }
  .grande .dia { height: 44px; font-size: 16px; border-radius: 12px; }
  .grande .dias { gap: 4px; }
  .hoja-pie { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 10px; padding-top: 4px; }
  .hoja-pie .cf-btn { height: 48px; font-size: 15px; }
</style>
