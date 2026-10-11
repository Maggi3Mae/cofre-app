<script lang="ts">
  import { pantalla } from "$lib/pantalla.svelte";
  import Icono from "$lib/Icono.svelte";
  import CampoMonto from "$lib/ui/CampoMonto.svelte";
  import { pesos, leerMonto, montoEditable } from "$lib/formato";
  import { nombreMesLargo } from "$lib/periodo";
  import {
    listarPresupuestos, guardarPresupuesto, eliminarPresupuesto, listarCategorias, mesEnCurso, claseNivel, claseTesela,
    alCambiarDatos, type Presupuesto, type Categoria,
  } from "$lib/datos";

  let mes = $state(mesEnCurso());
  let lista = $state<Presupuesto[]>([]);
  let egresos = $state<Categoria[]>([]);
  let cargando = $state(true);
  let error = $state("");
  let aviso = $state("");

  // Formulario (crear o editar)
  let formAbierto = $state(false);
  let categoriaId = $state<number | null>(null);
  let limite = $state("");
  let errorForm = $state("");
  let confirmarBorrar = $state<number | null>(null);

  const actual = $derived(mes === mesEnCurso());
  const existente = $derived(lista.find((p) => p.categoria_id === categoriaId) ?? null);
  const totalLimite = $derived(lista.reduce((s, p) => s + p.limite, 0));
  const totalGastado = $derived(lista.reduce((s, p) => s + p.gastado, 0));
  const pctTotal = $derived(totalLimite ? (totalGastado / totalLimite) * 100 : 0);

  let consulta = 0;
  async function cargar() {
    const id = ++consulta;
    try {
      const [p, c] = await Promise.all([listarPresupuestos(mes), listarCategorias()]);
      if (id !== consulta) return;
      lista = p;
      egresos = c.filter((k) => k.tipo === "egreso");
      error = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      cargando = false;
    }
  }

  $effect(() => { mes; cargar(); });
  $effect(() => alCambiarDatos(cargar));

  function moverMes(delta: number) {
    const [a, m] = mes.split("-").map(Number);
    const d = new Date(a, m - 1 + delta, 1);
    mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function abrirNuevo() {
    categoriaId = egresos.find((c) => !lista.some((p) => p.categoria_id === c.id))?.id ?? egresos[0]?.id ?? null;
    limite = "";
    errorForm = "";
    formAbierto = true;
  }

  function editar(p: Presupuesto) {
    categoriaId = p.categoria_id;
    limite = montoEditable(p.limite);
    errorForm = "";
    formAbierto = true;
  }

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    errorForm = "";
    const v = leerMonto(limite);
    if (categoriaId == null) return void (errorForm = "Elige una categoría.");
    if (v == null || v <= 0) return void (errorForm = "Escribe un límite mayor que cero.");
    const nombre = egresos.find((c) => c.id === categoriaId)?.nombre ?? "";
    const reemplaza = !!existente;
    try {
      await guardarPresupuesto(categoriaId, v);
      formAbierto = false;
      aviso = reemplaza ? `Presupuesto de «${nombre}» actualizado.` : `Presupuesto de «${nombre}» creado.`;
      cargar();
    } catch (err) {
      errorForm = err instanceof Error ? err.message : String(err);
    }
  }

  async function borrar(p: Presupuesto) {
    try {
      await eliminarPresupuesto(p.categoria_id);
      confirmarBorrar = null;
      aviso = `Presupuesto de «${p.nombre}» eliminado.`;
      cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const pctTexto = (p: number) => `${Math.round(p).toLocaleString("es-CO")} %`;
  const enfocar = (n: HTMLElement) => n.focus();
</script>

<header class="encabezado">
  <div>
    <h1 class="titulo-pantalla">Presupuestos</h1>
    <p class="caption">Límites mensuales por categoría de egreso</p>
  </div>
  <div class="encabezado-acciones">
    <div class="mes" role="group" aria-label="Mes">
      <button class="cf-btn cf-btn--icon atras" onclick={() => moverMes(-1)} aria-label="Mes anterior"><Icono nombre="siguiente" /></button>
      <b>{nombreMesLargo(mes)}</b>
      <button class="cf-btn cf-btn--icon" onclick={() => moverMes(1)} aria-label="Mes siguiente"><Icono nombre="siguiente" /></button>
    </div>
    {#if !pantalla.celular}
    <button class="cf-btn cf-btn--primary" onclick={abrirNuevo} disabled={!egresos.length}><Icono nombre="mas" />Nuevo presupuesto</button>
    {/if}
  </div>
</header>

{#if error}<p class="error-form" role="alert">No se pudieron cargar los datos: {error}</p>{/if}
{#if aviso}<p class="aviso" role="status">{aviso}</p>{/if}

{#if !cargando && !egresos.length && !pantalla.celular}
  <section class="cf-glass cf-card vacio">
    <p>Para crear un presupuesto necesitas al menos una categoría de egreso.</p>
    <a class="cf-btn cf-btn--primary" href="/categorias"><Icono nombre="mas" />Crear categoría</a>
  </section>
{/if}

{#if formAbierto}
  <form class="cf-glass cf-card form" onsubmit={guardar}>
    <h2 class="cf-card-title">{existente ? "Editar presupuesto" : "Nuevo presupuesto"}</h2>
    <div class="campos">
      <label class="campo">
        <span class="etiqueta">Categoría</span>
        <span class="cf-field">
          <select bind:value={categoriaId} use:enfocar>
            {#each egresos as c (c.id)}
              <option value={c.id}>{c.padre_id != null ? "— " : ""}{c.nombre}</option>
            {/each}
          </select>
        </span>
      </label>
      <label class="campo">
        <span class="etiqueta">Límite mensual</span>
        <CampoMonto bind:valor={limite} requerido etiqueta="Límite mensual" />
      </label>
    </div>
    {#if existente}
      <p class="caption">Esta categoría ya tiene un límite de {pesos(existente.limite)}; se reemplazará por el nuevo.</p>
    {/if}
    {#if egresos.find((c) => c.id === categoriaId)?.num_hijas}
      <p class="caption">Incluye el gasto de sus subcategorías.</p>
    {/if}
    {#if errorForm}<p class="error-form" role="alert">{errorForm}</p>{/if}
    <div class="acciones-form">
      <button type="button" class="cf-btn cf-btn--ghost" onclick={() => (formAbierto = false)}>Cancelar</button>
      <button type="submit" class="cf-btn cf-btn--primary">Guardar</button>
    </div>
  </form>
{/if}

{#if cargando}
  <p class="caption">Cargando…</p>
{:else if lista.length}
  <section class="cf-glass cf-card resumen" aria-label="Total del mes">
    <div class="res-fila">
      <div><span class="cf-overline">Gastado</span><b class="grande">{pesos(totalGastado)}</b></div>
      <div class="der"><span class="cf-overline">Presupuestado</span><b>{pesos(totalLimite)}</b></div>
    </div>
    <span class="cf-bar cf-bar--lg cf-bar--{claseNivel[pctTotal >= 100 ? 'over' : pctTotal >= 90 ? 'w90' : pctTotal >= 80 ? 'w80' : 'ok']}"
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(pctTotal))} aria-label="Total usado">
      <span style:width="{Math.min(100, pctTotal)}%"></span>
    </span>
    <span class="caption">
      {pctTexto(pctTotal)} usado · {totalGastado <= totalLimite ? `quedan ${pesos(totalLimite - totalGastado)}` : `exceso de ${pesos(totalGastado - totalLimite)}`}
    </span>
  </section>

  <section class="cf-glass cf-card" aria-label="Presupuestos por categoría">
    <div class="filas">
      {#each lista as p (p.categoria_id)}
        <article class="fila">
          <a class="cf-tile {claseTesela(p.color)}" href="/transacciones?categoria={p.categoria_id}&periodo=mes" title="Ver movimientos">
            <Icono nombre={p.icono ?? "otros"} />
          </a>
          <div class="cuerpo">
            <div class="linea">
              <b>{p.nombre}{#if p.padre_nombre}<span class="caption"> · {p.padre_nombre}</span>{/if}</b>
              <span class="cf-chip cf-chip--sm cf-chip--{claseNivel[p.nivel]}">{pctTexto(p.pct)}</span>
            </div>
            <span class="cf-bar cf-bar--{claseNivel[p.nivel]}" role="progressbar" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.round(p.pct))} aria-label="{p.nombre}: {pctTexto(p.pct)} usado">
              <span style:width="{Math.min(100, p.pct)}%"></span>
            </span>
            <div class="linea caption">
              <span>{pesos(p.gastado)} de {pesos(p.limite)}</span>
              <span class:exceso={p.gastado > p.limite}>
                {p.gastado <= p.limite ? `Quedan ${pesos(p.limite - p.gastado)}` : `Exceso ${pesos(p.gastado - p.limite)}`}
              </span>
            </div>
            {#if actual && p.proyeccion != null}
              <span class="ritmo">A este ritmo gastarás {pesos(p.proyeccion)} al cierre del mes.</span>
            {/if}
          </div>
          <!-- Celular: solo ver; crear y editar en el Mac o la tablet. -->
          {#if !pantalla.celular}
          <div class="acciones">
            {#if confirmarBorrar === p.categoria_id}
              <button class="cf-btn cf-btn--ghost" onclick={() => (confirmarBorrar = null)}>No</button>
              <button class="cf-btn cf-btn--secondary peligro" onclick={() => borrar(p)}>Eliminar</button>
            {:else}
              <button class="cf-btn cf-btn--icon" onclick={() => editar(p)} aria-label="Editar presupuesto de {p.nombre}" title="Editar"><Icono nombre="editar" /></button>
              <button class="cf-btn cf-btn--icon peligro" onclick={() => (confirmarBorrar = p.categoria_id)} aria-label="Eliminar presupuesto de {p.nombre}" title="Eliminar"><Icono nombre="papelera" /></button>
            {/if}
          </div>
          {/if}
        </article>
      {/each}
    </div>
  </section>
{:else if egresos.length && !formAbierto}
  <section class="cf-glass cf-card vacio">
    <p>Aún no tienes presupuestos. Ponle un límite mensual a una categoría y te avisaremos al 80, 90 y 100 %.</p>
    {#if pantalla.celular}<p class="caption">Créalos en el Mac: llegan aquí al sincronizar.</p>
    {:else}<button class="cf-btn cf-btn--primary" onclick={abrirNuevo}><Icono nombre="mas" />Nuevo presupuesto</button>{/if}
  </section>
{/if}

<style>
  .mes { display: flex; align-items: center; gap: var(--space-2); }
  .mes b { min-width: 140px; text-align: center; font-size: 14px; }
  .mes b::first-letter { text-transform: uppercase; }
  .atras :global(.cf-icon) { transform: rotate(180deg); }
  .aviso { padding: 10px 14px; border-radius: var(--r-md); background: var(--primary-soft); color: var(--primary-text); font-size: 13px; font-weight: 500; align-self: flex-start; }
  .vacio { align-items: flex-start; gap: var(--space-4); }
  .vacio p { color: var(--ink-2); max-width: 560px; }
  .form { gap: var(--space-4); max-width: 640px; }
  .campos { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
  .acciones-form { display: flex; justify-content: flex-end; gap: var(--space-2); }
  .resumen { gap: var(--space-3); }
  .res-fila { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-4); }
  .res-fila > div { display: flex; flex-direction: column; gap: 2px; }
  .res-fila .der { text-align: right; }
  .grande { font: 650 28px/34px var(--font-display); letter-spacing: -.02em; }
  .filas { display: flex; flex-direction: column; gap: var(--space-2); }
  .fila {
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-4);
    padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--glass-1);
  }
  .fila > .cf-tile { text-decoration: none; }
  .cuerpo { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .linea { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); }
  .linea b { font-size: 15px; line-height: 20px; }
  .exceso { color: var(--over-100); font-weight: 600; }
  .ritmo { font-size: 12px; line-height: 16px; font-weight: 600; color: var(--warn-80); }
  .acciones { display: flex; gap: var(--space-1); }
  .peligro { color: var(--expense); }
  @media (max-width: 720px) { .campos { grid-template-columns: 1fr; } }
</style>
