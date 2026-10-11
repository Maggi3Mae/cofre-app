<script lang="ts">
  import { pantalla } from "$lib/pantalla.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import Icono from "$lib/Icono.svelte";
  import FormCdt from "$lib/inversiones/FormCdt.svelte";
  import TarjetaCdt from "$lib/inversiones/TarjetaCdt.svelte";
  import FormCajita from "$lib/inversiones/FormCajita.svelte";
  import TarjetaCajita from "$lib/inversiones/TarjetaCajita.svelte";
  import { pesos } from "$lib/formato";
  import { listarCdts, listarCajitas, listarCuentas, alCambiarDatos, type Cdt, type Cajita, type Cuenta } from "$lib/datos";

  type Vista = "cdt" | "cajitas";
  const vista = $derived<Vista>(page.url.searchParams.get("vista") === "cajitas" ? "cajitas" : "cdt");

  let cdts = $state<Cdt[]>([]);
  let cajitas = $state<Cajita[]>([]);
  let formCajita = $state(false);
  let editandoCajita = $state<Cajita | null>(null);
  let cuentas = $state<Cuenta[]>([]);
  let cargando = $state(true);
  let error = $state("");
  let aviso = $state("");

  let formAbierto = $state(false);
  let editando = $state<Cdt | null>(null);

  const porRetirar = $derived(cdts.filter((c) => !c.retirado_en && c.calculo.estado === "vencido"));
  const abiertos = $derived(
    cdts.filter((c) => !c.retirado_en && c.calculo.estado !== "vencido")
      .sort((a, b) => a.calculo.diasRestantes - b.calculo.diasRestantes));
  const historial = $derived(cdts.filter((c) => c.retirado_en));
  const vigentes = $derived([...porRetirar, ...abiertos]);
  const total = $derived({
    invertido: vigentes.reduce((s, c) => s + c.monto, 0),
    neto: vigentes.reduce((s, c) => s + c.calculo.netoHoy, 0),
    hoy: vigentes.reduce((s, c) => s + c.calculo.totalNetoHoy, 0),
    dia: vigentes.reduce((s, c) => s + c.calculo.interesDia, 0),
  });

  async function cargar() {
    try {
      const [k, j, c] = await Promise.all([listarCdts(), listarCajitas(), listarCuentas(false)]);
      cdts = k;
      cajitas = j;
      cuentas = c.filter((x) => x.tipo !== "credito" && x.moneda === "COP");
      error = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      cargando = false;
    }
  }

  cargar();
  $effect(() => alCambiarDatos(cargar));

  function nuevo() {
    editando = null;
    formAbierto = true;
  }

  function nuevaCajita() {
    editandoCajita = null;
    formCajita = true;
  }

  const conMeta = $derived(cajitas.filter((c) => c.meta));
  const totalCajitas = $derived({
    valor: cajitas.reduce((s, c) => s + c.calculo.valorHoy, 0),
    dia: cajitas.reduce((s, c) => s + c.calculo.interesDia, 0),
    acumulado: cajitas.reduce((s, c) => s + c.calculo.acumulado, 0),
    metas: conMeta.length
      ? Math.min(1, conMeta.reduce((s, c) => s + Math.min(c.calculo.valorHoy, c.meta!), 0) / conMeta.reduce((s, c) => s + c.meta!, 0))
      : null,
  });

  function trasCambio(mensaje: string) {
    aviso = mensaje;
    cargar();
  }

  const cambiarVista = (v: Vista) => goto(v === "cdt" ? "?" : `?vista=${v}`, { replaceState: true, keepFocus: true, noScroll: true });
</script>

<header class="encabezado">
  <div>
    <h1 class="titulo-pantalla">Inversiones</h1>
    <p class="caption">CDT y cajitas de ahorro</p>
  </div>
  {#if !pantalla.celular}
  <div class="encabezado-acciones">
    {#if vista === "cdt"}
      <button class="cf-btn cf-btn--primary" onclick={nuevo}><Icono nombre="mas" />Nuevo CDT</button>
    {:else}
      <button class="cf-btn cf-btn--primary" onclick={nuevaCajita}><Icono nombre="mas" />Nueva cajita</button>
    {/if}
  </div>
  {/if}
</header>

<div class="cf-seg" role="group" aria-label="Vista">
  <button aria-pressed={vista === "cdt"} onclick={() => cambiarVista("cdt")}>CDT</button>
  <button aria-pressed={vista === "cajitas"} onclick={() => cambiarVista("cajitas")}>Cajitas</button>
</div>

{#if error}<p class="error-form" role="alert">No se pudieron cargar los datos: {error}</p>{/if}
{#if aviso}<p class="aviso" role="status">{aviso}</p>{/if}

{#if cargando}
  <p class="caption">Cargando…</p>
{:else if vista === "cajitas"}
  {#if !cajitas.length}
    <section class="cf-glass cf-card vacio">
      <p>Registra tus cajitas para ver cuánto ganan cada día y qué tan cerca estás de cada meta.</p>
      {#if pantalla.celular}<p class="caption">Créalas en el Mac: llegan aquí al sincronizar.</p>
      {:else}<button class="cf-btn cf-btn--primary" onclick={nuevaCajita}><Icono nombre="mas" />Nueva cajita</button>{/if}
    </section>
  {:else}
    <section class="cf-glass cf-card resumen" aria-label="Resumen de cajitas">
      <div><span class="cf-overline">Total en cajitas</span><b class="grande jade">{pesos(totalCajitas.valor)}</b></div>
      <div><span class="cf-overline">Interés del día</span><b>{pesos(totalCajitas.dia)}</b></div>
      <div><span class="cf-overline">Interés acumulado</span><b class="cf-amt-income">{pesos(totalCajitas.acumulado)}</b></div>
      <div><span class="cf-overline">Avance de metas</span><b>{totalCajitas.metas == null ? "—" : `${Math.round(totalCajitas.metas * 100)} %`}</b></div>
    </section>
    {#each cajitas as c (c.id)}
      <TarjetaCajita cajita={c} {cuentas} editar={() => { editandoCajita = c; formCajita = true; }} listo={trasCambio} />
    {/each}
  {/if}
{:else if !vigentes.length && !historial.length}
  <section class="cf-glass cf-card vacio">
    <p>Registra tus CDT para ver cuánto valen hoy, cuánto te retienen y cuánto recibirás al vencimiento.</p>
    {#if pantalla.celular}<p class="caption">Créalos en el Mac: llegan aquí al sincronizar.</p>
    {:else}<button class="cf-btn cf-btn--primary" onclick={nuevo}><Icono nombre="mas" />Nuevo CDT</button>{/if}
  </section>
{:else}
  {#if vigentes.length}
    <section class="cf-glass cf-card resumen" aria-label="Resumen de CDT">
      <div><span class="cf-overline">Total neto hoy</span><b class="grande">{pesos(total.hoy)}</b></div>
      <div><span class="cf-overline">Invertido</span><b>{pesos(total.invertido)}</b></div>
      <div><span class="cf-overline">Rendimiento neto</span><b class="cf-amt-income">{pesos(total.neto)}</b></div>
      <div><span class="cf-overline">Interés del día</span><b>{pesos(total.dia)}</b></div>
    </section>
  {/if}

  {#if porRetirar.length}
    <h2 class="seccion">Por retirar</h2>
    {#each porRetirar as c (c.id)}
      <TarjetaCdt cdt={c} {cuentas} editar={() => { editando = c; formAbierto = true; }} listo={trasCambio} />
    {/each}
  {/if}

  {#if abiertos.length}
    <h2 class="seccion">Activos</h2>
    {#each abiertos as c (c.id)}
      <TarjetaCdt cdt={c} {cuentas} editar={() => { editando = c; formAbierto = true; }} listo={trasCambio} />
    {/each}
  {/if}

  {#if historial.length}
    <details class="historial">
      <summary>Historial ({historial.length})</summary>
      <div class="lista">
        {#each historial as c (c.id)}
          <TarjetaCdt cdt={c} {cuentas} editar={() => {}} listo={trasCambio} />
        {/each}
      </div>
    </details>
  {/if}
{/if}

<FormCajita abierto={formCajita} cajita={editandoCajita} {cuentas} cerrar={() => (formCajita = false)} listo={trasCambio} />
<FormCdt abierto={formAbierto} cdt={editando} {cuentas} cerrar={() => (formAbierto = false)} listo={trasCambio} />

<style>
  .aviso { padding: 10px 14px; border-radius: var(--r-md); background: var(--primary-soft); color: var(--primary-text); font-size: 13px; font-weight: 500; align-self: flex-start; }
  .vacio { align-items: flex-start; gap: var(--space-4); }
  .vacio p { color: var(--ink-2); max-width: 560px; }
  .resumen { display: grid; grid-template-columns: 2fr repeat(3, 1fr); gap: var(--space-4); align-items: end; }
  .resumen > div { display: flex; flex-direction: column; gap: 2px; }
  .resumen b { font-size: 16px; font-variant-numeric: tabular-nums; }
  .resumen .grande { font: 650 28px/34px var(--font-display); letter-spacing: -.02em; color: var(--primary-text); }
  .resumen .grande.jade { color: var(--income); }
  .seccion { font: 650 15px/20px var(--font-sans); color: var(--ink-2); margin-top: var(--space-2); }
  .historial summary { cursor: pointer; font-weight: 600; font-size: 14px; color: var(--ink-2); padding: var(--space-2) 0; }
  .historial .lista { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-2); }
  @media (max-width: 760px) { .resumen { grid-template-columns: 1fr 1fr; } }
</style>
