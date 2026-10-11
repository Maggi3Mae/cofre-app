<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import SimCuotas from "$lib/simulador/SimCuotas.svelte";
  import SimCdt from "$lib/simulador/SimCdt.svelte";
  import FormTransaccion from "$lib/transacciones/FormTransaccion.svelte";
  import FormCdt from "$lib/inversiones/FormCdt.svelte";
  import type { Prellenado } from "$lib/facturas/LectorFactura.svelte";
  import {
    listarCuentas, listarCategorias, listarEtiquetas, type Cuenta, type Categoria, type CdtNuevo, type Plan,
  } from "$lib/datos";

  type Vista = "cuotas" | "cdt";
  const vista = $derived<Vista>(page.url.searchParams.get("vista") === "cdt" ? "cdt" : "cuotas");
  const cambiarVista = (v: Vista) => goto(v === "cuotas" ? "?" : `?vista=${v}`, { replaceState: true, keepFocus: true, noScroll: true });

  let cuentas = $state<Cuenta[]>([]);
  let categorias = $state<Categoria[]>([]);
  let etiquetas = $state<string[]>([]);
  let error = $state("");
  let aviso = $state("");

  const tarjetas = $derived(cuentas.filter((c) => c.tipo === "credito"));
  const origenCdt = $derived(cuentas.filter((c) => c.tipo !== "credito" && c.moneda === "COP"));

  async function cargar() {
    try {
      const [c, k, e] = await Promise.all([listarCuentas(false), listarCategorias(), listarEtiquetas()]);
      cuentas = c; categorias = k; etiquetas = e.map((x) => x.nombre);
      error = "";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  cargar();

  // Registrar la compra: el mismo formulario de Transacciones, prellenado.
  let formTx = $state(false);
  let prellenado = $state<Prellenado | null>(null);
  function registrar(tarjetaId: number, plan: Plan, internacional: boolean) {
    prellenado = {
      monto: plan.montoBase, fecha: null, comercio: "", categoriaId: null, cuentaId: tarjetaId, notas: "",
      factura: { cufe: null, nit: null }, cuotas: { numCuotas: plan.numCuotas, internacional },
    };
    formTx = true;
  }

  // Crear el CDT simulado: el formulario de Inversiones, prellenado.
  let formCdt = $state(false);
  let inicialCdt = $state<Partial<CdtNuevo> | null>(null);
  function crearCdt(inicial: Partial<CdtNuevo>) {
    inicialCdt = inicial;
    formCdt = true;
  }

  function listo(mensaje: string) {
    aviso = mensaje;
    cargar();
  }
</script>

<header class="encabezado">
  <div>
    <h1 class="titulo-pantalla">Simulador</h1>
    <p class="caption">{vista === "cuotas" ? "Cuánto pagarías al diferir una compra, antes de hacerla" : "Cuánto ganarías con un CDT"}</p>
  </div>
</header>

<div class="cf-seg" role="group" aria-label="Simulador">
  <button aria-pressed={vista === "cuotas"} onclick={() => cambiarVista("cuotas")}>Compras a cuotas</button>
  <button aria-pressed={vista === "cdt"} onclick={() => cambiarVista("cdt")}>CDT</button>
</div>

{#if error}<p class="error-form" role="alert">No se pudieron cargar los datos: {error}</p>{/if}
{#if aviso}<p class="aviso" role="status">{aviso}</p>{/if}

{#if vista === "cuotas"}
  <SimCuotas {tarjetas} {registrar} />
{:else}
  <SimCdt crear={crearCdt} />
{/if}

<FormTransaccion abierto={formTx} transaccion={null} cuentas={cuentas} {categorias} {prellenado} {etiquetas}
  cerrar={() => { formTx = false; prellenado = null; }} listo={() => listo("Compra registrada. La deuda de la tarjeta ya subió.")} />
<FormCdt abierto={formCdt} cdt={null} cuentas={origenCdt} inicial={inicialCdt}
  cerrar={() => (formCdt = false)} listo={(m) => listo(`${m} Lo ves en Inversiones.`)} />

<style>
  .aviso { padding: 10px 14px; border-radius: var(--r-md); background: var(--primary-soft); color: var(--primary-text); font-size: 13px; font-weight: 500; align-self: flex-start; }
</style>
