<script lang="ts" module>
  import type { Cuenta as C, Categoria as K } from "$lib/datos";
  const cache: { cuentas: C[]; categorias: K[]; etiquetas: string[]; listo: boolean } = { cuentas: [], categorias: [], etiquetas: [], listo: false };
</script>

<script lang="ts">
  // + del celular: el formulario de movimiento como hoja desde abajo, sin salir de la pantalla actual.
  // «Factura» toma la foto, la lee y vuelve a abrir la hoja prellenada.
  import FormTransaccion from "$lib/transacciones/FormTransaccion.svelte";
  import LectorFactura, { type Prellenado } from "$lib/facturas/LectorFactura.svelte";
  import { listarCuentas, listarCategorias, listarEtiquetas, type Cuenta, type Categoria } from "$lib/datos";
  import { mostrarAviso } from "$lib/alertas/estado-alertas.svelte";
  import { hojaNuevo } from "./hoja.svelte";

  // Lo de la vez anterior (se refresca por detrás): la hoja abre al instante.
  let cuentas = $state<Cuenta[]>(cache.cuentas);
  let categorias = $state<Categoria[]>(cache.categorias);
  let etiquetas = $state<string[]>(cache.etiquetas);
  let listos = $state(cache.listo);
  let foto = $state<File | null>(null);
  let prellenado = $state<Prellenado | null>(null);

  // Catálogos frescos cada vez que se abre (pueden llegar cambios del Mac).
  $effect(() => {
    if (!hojaNuevo.abierta) return;
    Promise.all([listarCuentas(true), listarCategorias(), listarEtiquetas()])
      .then(([c, k, e]) => {
        cuentas = c.filter((x) => !x.archivada && x.tipo !== "inversion");
        categorias = k;
        etiquetas = e.map((x) => x.nombre);
        listos = true;
        Object.assign(cache, { cuentas, categorias, etiquetas, listo: true });
      })
      .catch((err) => {
        if (listos) return; // ya abrió con lo anterior
        hojaNuevo.abierta = false;
        mostrarAviso({ titulo: "No se pudo abrir", cuerpo: String(err), nivel: "over" });
      });
  });

  function cerrar() {
    hojaNuevo.abierta = false;
    prellenado = null;
  }
</script>

<FormTransaccion abierto={hojaNuevo.abierta && listos} transaccion={null} {cuentas} {categorias} {etiquetas} {prellenado}
  {cerrar} listo={(m) => mostrarAviso({ titulo: m, cuerpo: "", nivel: "ok" })}
  factura={(f) => { prellenado = null; foto = f; }} />

<LectorFactura archivo={foto} {cuentas} {categorias} cerrar={() => (foto = null)}
  continuar={(p) => { foto = null; prellenado = p; hojaNuevo.abierta = true; }} />
