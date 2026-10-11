<script lang="ts">
  import { pantalla } from "$lib/pantalla.svelte";
  import Icono from "$lib/Icono.svelte";
  import FormCuenta from "$lib/cuentas/FormCuenta.svelte";
  import PagarTarjeta from "$lib/cuentas/PagarTarjeta.svelte";
  import FilaCuenta from "$lib/cuentas/FilaCuenta.svelte";
  import { monto } from "$lib/formato";
  import { listarCuentas, leerTrm, guardarTrm, alCambiarDatos, type Cuenta } from "$lib/datos";

  let cuentas = $state<Cuenta[]>([]);
  let cargando = $state(true);
  let error = $state("");
  let verArchivadas = $state(false);

  // Paneles
  let formAbierto = $state(false);
  let editando = $state<Cuenta | null>(null);
  let pagoAbierto = $state(false);
  let tarjetaPago = $state<Cuenta | null>(null);

  // TRM
  let trm = $state("");
  let trmGuardada = $state(false);
  let errorTrm = $state("");

  let aviso = $state("");

  // CDT y cajitas viven en Inversiones: aquí solo débito, crédito y efectivo.
  const visibles = $derived(cuentas.filter((c) => c.tipo !== "inversion"));
  const activas = $derived(visibles.filter((c) => !c.archivada));
  const archivadas = $derived(visibles.filter((c) => c.archivada));
  // Orden (principal primero, luego alfabético) ya viene de la base de datos.
  const secciones = $derived([
    { id: "tienes", nombre: "Lo que tienes", etiquetaTotal: "Total", lista: activas.filter((c) => c.tipo !== "credito") },
    { id: "debes", nombre: "Lo que debes", etiquetaTotal: "Deuda total", lista: activas.filter((c) => c.tipo === "credito") },
  ]);
  const hayUsd = $derived(activas.some((c) => c.moneda === "USD"));

  async function cargar() {
    try {
      cuentas = await listarCuentas(true);
      error = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      cargando = false;
    }
  }

  async function cargarTrm() {
    const v = await leerTrm().catch(() => null);
    trm = v ? v.toLocaleString("es-CO") : "";
  }

  async function guardarTrmTexto() {
    errorTrm = "";
    trmGuardada = false;
    if (!trm.trim()) return;
    const n = Number(trm.replace(/\./g, "").replace(",", "."));
    try {
      await guardarTrm(n);
      trmGuardada = true;
    } catch (e) {
      errorTrm = e instanceof Error ? e.message : String(e);
    }
  }

  /** Subtotal por moneda: «$ 1.200.000 · USD 350». */
  function subtotal(lista: Cuenta[]) {
    const por = new Map<string, number>();
    for (const c of lista) por.set(c.moneda, (por.get(c.moneda) ?? 0) + c.saldo);
    return [...por].map(([m, v]) => monto(v, m as "COP" | "USD")).join(" · ");
  }

  function nueva() {
    editando = null;
    formAbierto = true;
  }
  function editar(c: Cuenta) {
    editando = c;
    formAbierto = true;
  }
  function pagar(c: Cuenta) {
    tarjetaPago = c;
    pagoAbierto = true;
  }
  function trasEliminar(c: Cuenta, r: "eliminada" | "archivada") {
    aviso = r === "archivada" ? `«${c.nombre}» quedó archivada porque tiene movimientos.` : `«${c.nombre}» se eliminó.`;
    cargar();
  }

  cargar();
  cargarTrm();
  // Cambios que llegan de otro equipo (sincronización) o de otra pantalla.
  $effect(() => alCambiarDatos(() => { cargar(); cargarTrm(); }));
</script>

<header class="encabezado">
  <div>
    <h1 class="titulo-pantalla">Cuentas</h1>
    <p class="caption">{activas.length} {activas.length === 1 ? "cuenta activa" : "cuentas activas"}</p>
  </div>
  {#if !pantalla.celular}
  <div class="encabezado-acciones">
    <button class="cf-btn cf-btn--primary" onclick={nueva}><Icono nombre="mas" />Nueva cuenta</button>
  </div>
  {/if}
</header>

{#if error}<p class="error-form" role="alert">No se pudieron cargar las cuentas: {error}</p>{/if}

{#if hayUsd}
  <section class="trm cf-glass">
    <label class="campo">
      <span class="etiqueta">TRM para tus cuentas en dólares</span>
      <span class="cf-field">
        <span class="sufijo">$</span>
        <input bind:value={trm} inputmode="decimal" placeholder="4.000" onchange={guardarTrmTexto} />
        <span class="sufijo">por USD</span>
      </span>
      <span class="ayuda">
        {#if errorTrm}<span class="cf-amt-expense">{errorTrm}</span>
        {:else if trmGuardada}Guardada. Se usa para sumar los dólares al patrimonio.
        {:else if !trm}Sin TRM, las cuentas en dólares no suman al patrimonio.
        {:else}Se usa para sumar los dólares al patrimonio.{/if}
      </span>
    </label>
  </section>
{/if}

{#if aviso}<p class="aviso" role="status">{aviso}</p>{/if}

{#if cargando}
  <p class="caption">Cargando…</p>
{:else if !activas.length}
  <section class="vacio cf-glass cf-card">
    <span class="cf-tile cf-tile--brand"><Icono nombre="cuentas" /></span>
    <h2 class="cf-card-title">Aún no tienes cuentas</h2>
    {#if pantalla.celular}
      <p class="cf-muted">Crea tus cuentas en el computador: llegan aquí al sincronizar.</p>
    {:else}
    <p class="cf-muted">Crea tu cuenta de ahorros, tus tarjetas y tu efectivo para empezar a registrar movimientos.</p>
    <button class="cf-btn cf-btn--primary" onclick={nueva}><Icono nombre="mas" />Crear la primera</button>
    {/if}
  </section>
{:else}
  {#each secciones as sec (sec.id)}
    {#if sec.lista.length}
      <section class="seccion cf-glass cf-card" aria-labelledby="s-{sec.id}">
        <header class="seccion-cab">
          <h2 id="s-{sec.id}" class="cf-card-title">{sec.nombre}</h2>
          <span class="caption">{sec.etiquetaTotal} <b class="total">{subtotal(sec.lista)}</b></span>
        </header>
        <div class="filas">
          {#each sec.lista as c (c.id)}
            <FilaCuenta cuenta={c} editar={() => editar(c)} pagar={c.tipo === "credito" ? () => pagar(c) : undefined}
              listo={(r) => trasEliminar(c, r)} />
          {/each}
        </div>
      </section>
    {/if}
  {/each}
{/if}

{#if archivadas.length && !pantalla.celular}
  <button class="cf-btn cf-btn--ghost ver-archivadas" onclick={() => (verArchivadas = !verArchivadas)}>
    <Icono nombre="archivar" />{verArchivadas ? "Ocultar" : "Ver"} archivadas ({archivadas.length})
  </button>
  {#if verArchivadas}
    <div class="filas">
      {#each archivadas as c (c.id)}
        <FilaCuenta cuenta={c} editar={() => editar(c)} listo={(r) => trasEliminar(c, r)} />
      {/each}
    </div>
  {/if}
{/if}

<FormCuenta abierto={formAbierto} cuenta={editando} cerrar={() => (formAbierto = false)} listo={cargar} />
<PagarTarjeta abierto={pagoAbierto} tarjeta={tarjetaPago} cuentas={activas} cerrar={() => (pagoAbierto = false)} listo={cargar} />

<style>
  .trm { border-radius: var(--r-xl); padding: var(--space-5); max-width: 480px; }
  .seccion { gap: var(--space-4); }
  .seccion-cab { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
  .total { font-weight: 600; color: var(--ink); }
  .filas { display: flex; flex-direction: column; gap: var(--space-3); }
  .vacio { align-items: flex-start; max-width: 520px; }
  .ver-archivadas { align-self: flex-start; }
  .aviso { padding: 10px 14px; border-radius: var(--r-md); background: var(--primary-soft); color: var(--primary-text); font-size: 13px; font-weight: 500; align-self: flex-start; }
</style>
