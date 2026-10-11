<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import Icono from "$lib/Icono.svelte";
  import FormPrestamo from "$lib/medeben/FormPrestamo.svelte";
  import FormPersona from "$lib/medeben/FormPersona.svelte";
  import FormGastoGrupal from "$lib/medeben/FormGastoGrupal.svelte";
  import TarjetaPrestamo from "$lib/medeben/TarjetaPrestamo.svelte";
  import CompartirResumen from "$lib/medeben/CompartirResumen.svelte";
  import MenuAcciones, { type Accion } from "$lib/ui/MenuAcciones.svelte";
  import { pesos } from "$lib/formato";
  import { pantalla } from "$lib/pantalla.svelte";
  import { fechaCorta } from "$lib/periodo";
  import {
    listarPersonas, listarPrestamos, movimientosPrestamo, listarCuentas, archivarPersona, eliminarPersona, alCambiarDatos,
    listarCategorias, listarGastosGrupales, eliminarGastoGrupal, egresoParaDividir,
    type Persona, type Prestamo, type MovimientoPrestamo, type Cuenta, type Categoria, type GastoGrupal, type EgresoDivisible,
  } from "$lib/datos";

  /** Con ?persona=id se ve el detalle de esa persona; sin él, la lista. */
  let compartirAbierto = $state(false);
  /** «⋯» de la persona: lo que se usa poco. */
  const accionesPersona = $derived.by((): Accion[] => {
    const p = persona;
    if (!p) return [];
    const a: Accion[] = [
      { texto: "Editar", icono: "editar", detalle: "Nombre y notas", accion: () => { editandoPersona = p; formPersona = true; } },
      { texto: p.archivada ? "Desarchivar" : "Archivar", icono: "archivar", detalle: p.archivada ? "Vuelve a la lista" : "La quita de la lista; no borra nada", accion: () => alternarArchivo(p) },
    ];
    if (p.num_prestamos === 0) a.push({ texto: "Eliminar", icono: "papelera", peligro: true, accion: () => (confirmarBorrar = true) });
    return a;
  });
  const personaId = $derived(Number(page.url.searchParams.get("persona")) || null);

  let personas = $state<Persona[]>([]);
  let prestamos = $state<Prestamo[]>([]);
  let historial = $state<MovimientoPrestamo[]>([]);
  let cuentas = $state<Cuenta[]>([]);
  let cargando = $state(true);
  let error = $state("");
  let aviso = $state("");
  let verArchivadas = $state(false);
  let confirmarBorrar = $state(false);

  let formPrestamo = $state(false);
  let editando = $state<Prestamo | null>(null);
  let formPersona = $state(false);
  let editandoPersona = $state<Persona | null>(null);
  let formGrupal = $state(false);
  let egresoDividir = $state<EgresoDivisible | null>(null);
  let categorias = $state<Categoria[]>([]);
  let gastos = $state<GastoGrupal[]>([]);
  let borrandoGasto = $state<number | null>(null);

  const activas = $derived(personas.filter((p) => !p.archivada));
  const archivadas = $derived(personas.filter((p) => p.archivada));
  const persona = $derived(personaId != null ? personas.find((p) => p.id === personaId) ?? null : null);
  const suyos = $derived(personaId != null ? prestamos.filter((p) => p.persona_id === personaId) : []);
  const suyosActivos = $derived(suyos.filter((p) => p.calculo.estado === "activo"));
  const suyosCerrados = $derived(suyos.filter((p) => p.calculo.estado !== "activo"));

  /** Resumen de un grupo de préstamos (todos o los de una persona). */
  function resumir(lista: Prestamo[]) {
    const vivos = lista.filter((p) => p.calculo.estado === "activo");
    const vencidos = vivos.filter((p) => p.calculo.vencido);
    return {
      pendiente: vivos.reduce((s, p) => s + p.calculo.pendiente, 0),
      prestado: vivos.reduce((s, p) => s + p.monto, 0),
      abonado: vivos.reduce((s, p) => s + p.calculo.abonado, 0),
      vencidos: vencidos.length,
      atrasado: vencidos.reduce((s, p) => s + p.calculo.atrasado, 0),
    };
  }
  const total = $derived(resumir(prestamos));
  const totalPersona = $derived(resumir(suyos));

  async function cargar() {
    try {
      const [pe, pr, c, k, gg] = await Promise.all([
        listarPersonas(true), listarPrestamos(), listarCuentas(false), listarCategorias(), listarGastosGrupales(),
      ]);
      personas = pe;
      prestamos = pr;
      categorias = k.filter((x) => x.tipo === "egreso");
      gastos = gg;
      cuentas = c.filter((x) => x.moneda === "COP");
      historial = personaId != null ? await movimientosPrestamo({ personaId }) : [];
      error = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      cargando = false;
    }
  }

  $effect(() => {
    personaId;
    confirmarBorrar = false;
    aviso = "";
    cargar();
  });
  $effect(() => alCambiarDatos(cargar));

  // Desde Transacciones: /medeben?dividir=<id del egreso> abre «Dividir este gasto».
  $effect(() => {
    const id = Number(page.url.searchParams.get("dividir")) || null;
    if (id == null) return;
    egresoParaDividir(id)
      .then((e) => { egresoDividir = e; formGrupal = true; })
      .catch((e) => (error = e instanceof Error ? e.message : String(e)));
    goto("/medeben", { replaceState: true, keepFocus: true, noScroll: true });
  });

  function dividirGasto() {
    egresoDividir = null;
    formGrupal = true;
  }

  async function borrarGasto(g: GastoGrupal) {
    try {
      await eliminarGastoGrupal(g.id);
      borrandoGasto = null;
      trasCambio(`«${g.descripcion}» se eliminó con sus préstamos.`);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function trasCambio(mensaje: string) {
    aviso = mensaje;
    cargar();
  }

  const abrirPersona = (id: number | null) => goto(id == null ? "/medeben" : `/medeben?persona=${id}`, { keepFocus: true, noScroll: false });

  function nuevoPrestamo() {
    editando = null;
    formPrestamo = true;
  }

  function nuevaPersona() {
    editandoPersona = null;
    formPersona = true;
  }

  async function alternarArchivo(p: Persona) {
    try {
      await archivarPersona(p.id, !p.archivada);
      trasCambio(p.archivada ? `«${p.nombre}» volvió a tu lista.` : `«${p.nombre}» quedó archivada.`);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function borrarPersona(p: Persona) {
    try {
      await eliminarPersona(p.id);
      await abrirPersona(null);
      aviso = `«${p.nombre}» se eliminó.`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const inicial = (n: string) => n.trim().charAt(0).toUpperCase();
  const textoMov = { prestamo: "Préstamo a", abono: "Abono de", perdido: "Préstamo perdido ·" } as const;
</script>

{#snippet tarjetaPersona(p: Persona)}
  <button class="persona cf-glass cf-card" class:vencida={p.vencidos > 0} class:al-dia={p.pendiente === 0} onclick={() => abrirPersona(p.id)}>
    <span class="cab">
      <span class="inicial" aria-hidden="true">{inicial(p.nombre)}</span>
      <span class="titulo">
        <b>{p.nombre}</b>
        <span class="caption">
          {p.num_prestamos === 0 ? "Sin préstamos" : `${p.num_prestamos} ${p.num_prestamos === 1 ? "préstamo" : "préstamos"}`}{p.notas ? ` · ${p.notas}` : ""}
        </span>
      </span>
      {#if p.vencidos > 0}<span class="cf-chip cf-chip--sm cf-chip--over-100">Vencido</span>
      {:else if p.pendiente > 0 && p.proximaFecha}<span class="cf-chip cf-chip--sm cf-chip--brand">Próximo: {fechaCorta(p.proximaFecha)}</span>
      {:else if p.num_prestamos > 0 && p.pendiente === 0}<span class="cf-chip cf-chip--sm cf-chip--income">Al día</span>{/if}
    </span>
    <span class="monto-fila"><span class="cf-overline">Pendiente</span><b>{pesos(p.pendiente)}</b></span>
    <span class="cf-bar cf-bar--sm" class:cf-bar--income={p.num_prestamos > 0 && p.pendiente === 0}><span style:width="{p.progreso * 100}%"></span></span>
    <span class="caption">
      {#if p.prestado === 0}Aún no le has prestado
      {:else if p.abonado === 0}Aún no ha abonado de {pesos(p.prestado)}
      {:else}Abonó {pesos(p.abonado)} de {pesos(p.prestado)}{/if}
    </span>
  </button>
{/snippet}

{#if personaId != null && persona}
  <!-- ============ Detalle de una persona ============ -->
  <button class="volver" onclick={() => abrirPersona(null)}>← Me deben</button>
  <header class="encabezado cab-persona">
    <div class="titulo-persona">
      <span class="inicial grande" aria-hidden="true">{inicial(persona.nombre)}</span>
      <div class="nombre-persona">
        <h1 class="titulo-pantalla">{persona.nombre}</h1>
        <p class="caption">{persona.archivada ? "Archivada" : persona.notas || (persona.activos ? `${persona.activos} ${persona.activos === 1 ? "préstamo activo" : "préstamos activos"}` : "")}</p>
      </div>
    </div>
    <MenuAcciones titulo={persona.nombre} etiqueta="Más opciones de {persona.nombre}" acciones={accionesPersona} />
  </header>
  <CompartirResumen abierto={compartirAbierto} personaId={persona.id} persona={persona.nombre} pendiente={pesos(persona.pendiente)}
    cerrar={() => (compartirAbierto = false)} />

  {#if confirmarBorrar}
    <div class="confirmar cf-glass" role="alertdialog" aria-label="Eliminar a {persona.nombre}">
      <p class="caption">¿Eliminar a {persona.nombre}? No tiene préstamos, así que no se pierde nada más.</p>
      <div class="acciones">
        <button class="cf-btn cf-btn--ghost" onclick={() => (confirmarBorrar = false)}>Cancelar</button>
        <button class="cf-btn cf-btn--secondary peligro" onclick={() => borrarPersona(persona)}>Eliminar</button>
      </div>
    </div>
  {/if}
  {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  {#if aviso}<p class="aviso" role="status">{aviso}</p>{/if}

  <section class="cf-glass cf-card resumen" aria-label="Resumen de {persona.nombre}">
    <div class="total"><span class="cf-overline">Te debe</span><b class="grande">{pesos(totalPersona.pendiente)}</b></div>
    <div class="datos">
      <div><span class="cf-overline">Prestaste</span><b>{pesos(totalPersona.prestado)}</b></div>
      <div><span class="cf-overline">Te abonó</span><b class="cf-amt-income">{pesos(totalPersona.abonado)}</b></div>
      <div><span class="cf-overline">Atrasado</span><b class:rojo={totalPersona.atrasado > 0}>{pesos(totalPersona.atrasado)}</b></div>
    </div>
    <div class="botones" class:solo={persona.pendiente <= 0}>
      {#if persona.pendiente > 0}
        <button class="cf-btn cf-btn--secondary" onclick={() => (compartirAbierto = true)}><Icono nombre="compartir" />Compartir</button>
      {/if}
      <button class="cf-btn cf-btn--primary" onclick={nuevoPrestamo}><Icono nombre="mas" />Prestarle</button>
    </div>
  </section>

  {#if !suyos.length}
    <section class="cf-glass cf-card vacio">
      <p>{persona.nombre} no tiene préstamos. Registra el primero para llevar la cuenta de lo que te debe.</p>
      <button class="cf-btn cf-btn--primary" onclick={nuevoPrestamo}><Icono nombre="mas" />Prestarle</button>
    </section>
  {/if}

  {#if suyosActivos.length}<h2 class="seccion">{suyosActivos.length === 1 ? "Préstamo activo" : "Préstamos activos"}</h2>{/if}
  {#each suyosActivos as p (p.id)}
    <TarjetaPrestamo prestamo={p} {cuentas} editar={() => { editando = p; formPrestamo = true; }} listo={trasCambio} />
  {/each}

  {#if historial.length}
    <h2 class="seccion">Historial</h2>
    <section class="cf-glass cf-card historial" aria-label="Historial de movimientos">
      {#each historial as m (m.id)}
        <div class="mov">
          <span class="cf-tile {m.tipo === 'abono' ? 'cf-tile--income' : m.tipo === 'perdido' ? 'cf-tile--expense' : 'cf-tile--brand'} mini">
            <Icono nombre={m.tipo === "abono" ? "ingreso" : "egreso"} />
          </span>
          <span class="mov-texto">
            <b>{textoMov[m.tipo]} {persona.nombre}</b>
            <span class="caption">
              {fechaCorta(m.fecha)} · {m.tipo === "abono" ? `a ${m.cuenta}` : m.tipo === "prestamo" ? `desde ${m.cuenta}` : "pasó a gasto"}
            </span>
          </span>
          <b class:cf-amt-income={m.tipo === "abono"} class:cf-amt-expense={m.tipo === "perdido"}>
            {m.tipo === "abono" ? pesos(m.monto, "+") : pesos(m.monto, "−")}
          </b>
        </div>
      {/each}
    </section>
  {/if}

  {#if suyosCerrados.length}
    <details class="cerrados">
      <summary>Pagados y perdidos ({suyosCerrados.length})</summary>
      <div class="lista">
        {#each suyosCerrados as p (p.id)}
          <TarjetaPrestamo prestamo={p} {cuentas} editar={() => { editando = p; formPrestamo = true; }} listo={trasCambio} />
        {/each}
      </div>
    </details>
  {/if}

{:else}
  <!-- ============ Lista de personas ============ -->
  <header class="encabezado">
    <div>
      <h1 class="titulo-pantalla">Me deben</h1>
      <p class="caption">Plata que les prestaste a otras personas</p>
    </div>
    {#if pantalla.celular}
      <div class="acciones-m">
        <button class="cf-btn cf-btn--primary" onclick={nuevoPrestamo}>Prestar</button>
        <button class="cf-btn cf-btn--secondary" onclick={dividirGasto}>Dividir un gasto</button>
      </div>
    {:else}
    <div class="encabezado-acciones">
      <button class="cf-btn cf-btn--secondary" onclick={nuevaPersona}><Icono nombre="mas" />Nueva persona</button>
      <button class="cf-btn cf-btn--secondary" onclick={dividirGasto}><Icono nombre="personas" />Dividir un gasto</button>
      <button class="cf-btn cf-btn--primary" onclick={nuevoPrestamo}><Icono nombre="mas" />Nuevo préstamo</button>
    </div>
    {/if}
  </header>

  {#if personaId != null && !cargando}<p class="aviso" role="status">Esa persona ya no existe.</p>{/if}
  {#if error}<p class="error-form" role="alert">{error}</p>{/if}
  {#if aviso}<p class="aviso" role="status">{aviso}</p>{/if}

  {#if cargando}
    <p class="caption">Cargando…</p>
  {:else if !personas.length}
    <section class="cf-glass cf-card vacio">
      <p>Cuando le prestes plata a alguien, regístralo aquí: Cofre te dice cuánto te falta por recibir y te avisa si se pasa la fecha acordada.</p>
      <button class="cf-btn cf-btn--primary" onclick={nuevoPrestamo}><Icono nombre="mas" />Nuevo préstamo</button>
    </section>
  {:else}
    {#if pantalla.celular}
    <section class="cf-glass cf-card resumen-m" aria-label="Resumen">
      <span class="cf-overline">Te deben</span>
      <b class="total-m">{pesos(total.pendiente)}</b>
      <div class="pie-m">
        <div><span class="caption">Prestado</span><b>{pesos(total.prestado)}</b></div>
        <div><span class="caption">Abonado</span><b class="cf-amt-income">{pesos(total.abonado)}</b></div>
      </div>
    </section>
    {:else}
    <section class="cf-glass cf-card resumen" aria-label="Resumen">
      <div><span class="cf-overline">Te deben</span><b class="grande">{pesos(total.pendiente)}</b></div>
      <div><span class="cf-overline">Prestado (activo)</span><b>{pesos(total.prestado)}</b></div>
      <div><span class="cf-overline">Ya te abonaron</span><b class="cf-amt-income">{pesos(total.abonado)}</b></div>
      <div>
        <span class="cf-overline">Vencidos</span>
        <b class:rojo={total.vencidos > 0}>{total.vencidos}{total.vencidos ? ` · ${pesos(total.atrasado)}` : ""}</b>
      </div>
    </section>
    {/if}

    {#if activas.length}
      <div class="rejilla">
        {#each activas as p (p.id)}{@render tarjetaPersona(p)}{/each}
      </div>
    {/if}

    {#if gastos.length}
      <details class="cerrados">
        <summary>Gastos grupales ({gastos.length})</summary>
        <div class="lista">
          {#each gastos as g (g.id)}
            <article class="gasto cf-glass cf-card">
              <header class="gasto-cab">
                <span class="cf-tile cf-tile--brand mini"><Icono nombre="personas" /></span>
                <span class="mov-texto">
                  <b>{g.descripcion}</b>
                  <span class="caption">
                    {fechaCorta(g.fecha)}{g.cuenta ? ` · ${g.cuenta}` : ""}{g.categoria ? ` · ${g.categoria}` : ""}{g.propina ? ` · propina ${pesos(g.propina)}` : ""}
                  </span>
                </span>
                <b>{pesos(g.total)}</b>
              </header>
              <ul class="partes-gasto">
                <li><span>Tú</span><b>{pesos(g.miParte)}</b></li>
                {#each g.partes as p (p.prestamo.id)}
                  <li>
                    <button class="volver" onclick={() => abrirPersona(p.persona_id)}>{p.persona}</button>
                    <span class="estado">
                      {#if p.prestamo.calculo.estado === "pagado"}<span class="cf-chip cf-chip--sm cf-chip--income">Pagó</span>
                      {:else if p.prestamo.calculo.estado === "perdido"}<span class="cf-chip cf-chip--sm cf-chip--expense">Perdido</span>
                      {:else if p.prestamo.calculo.vencido}<span class="cf-chip cf-chip--sm cf-chip--over-100">Vencido</span>{/if}
                      <b>{pesos(p.monto)}</b>
                    </span>
                  </li>
                {/each}
              </ul>
              {#if borrandoGasto === g.id}
                <div class="confirmar aviso-borrar" role="alertdialog" aria-label="Eliminar {g.descripcion}">
                  <p class="caption">Se borran tu gasto y los préstamos de cada persona, con sus abonos. Los saldos vuelven a como estaban.</p>
                  <div class="acciones">
                    <button class="cf-btn cf-btn--ghost" onclick={() => (borrandoGasto = null)}>Cancelar</button>
                    <button class="cf-btn cf-btn--secondary peligro" onclick={() => borrarGasto(g)}>Eliminar</button>
                  </div>
                </div>
              {:else}
                <footer class="acciones">
                  <span class="caption espacio">{g.pendiente ? `Te deben ${pesos(g.pendiente)}` : "Ya te pagaron todo"}</span>
                  <button class="cf-btn cf-btn--icon peligro" onclick={() => (borrandoGasto = g.id)} aria-label="Eliminar {g.descripcion}" title="Eliminar"><Icono nombre="papelera" /></button>
                </footer>
              {/if}
            </article>
          {/each}
        </div>
      </details>
    {/if}

    {#if archivadas.length}
      <button class="volver" onclick={() => (verArchivadas = !verArchivadas)} aria-expanded={verArchivadas}>
        {verArchivadas ? "Ocultar archivadas" : `Ver archivadas (${archivadas.length})`}
      </button>
      {#if verArchivadas}
        <div class="rejilla archivadas">
          {#each archivadas as p (p.id)}{@render tarjetaPersona(p)}{/each}
        </div>
      {/if}
    {/if}
  {/if}
{/if}

<FormPrestamo abierto={formPrestamo} prestamo={editando} personaInicial={personaId} personas={personas.filter((p) => !p.archivada || p.id === personaId || p.id === editando?.persona_id)}
  {cuentas} cerrar={() => (formPrestamo = false)} listo={trasCambio} />
<FormGastoGrupal abierto={formGrupal} egreso={egresoDividir} personas={personas.filter((p) => !p.archivada)} {cuentas} {categorias}
  cerrar={() => (formGrupal = false)} listo={trasCambio} />
<FormPersona abierto={formPersona} persona={editandoPersona} cerrar={() => (formPersona = false)}
  listo={(m, id) => { trasCambio(m); if (!editandoPersona) abrirPersona(id); }} />

<style>
  .aviso { padding: 10px 14px; border-radius: var(--r-md); background: var(--primary-soft); color: var(--primary-text); font-size: 13px; font-weight: 500; align-self: flex-start; }
  .vacio { align-items: flex-start; gap: var(--space-4); }
  .vacio p { color: var(--ink-2); max-width: 560px; }
  .resumen { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "total botones" "datos botones"; gap: var(--space-4) var(--space-6); align-items: end; }
  .resumen .total { grid-area: total; display: flex; flex-direction: column; gap: 2px; }
  .resumen .datos { grid-area: datos; display: grid; grid-template-columns: repeat(3, minmax(0, max-content)); gap: var(--space-6); }
  .resumen .datos > div { display: flex; flex-direction: column; gap: 2px; }
  .resumen b { font-size: 16px; font-variant-numeric: tabular-nums; }
  .resumen .botones { grid-area: botones; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; min-width: 300px; }
  .resumen .botones.solo { grid-template-columns: minmax(0, 1fr); min-width: 160px; }
  .titulo-persona { flex: 1; min-width: 0; }
  /* El «⋯» va en la misma fila que el nombre, también en el celular (la regla global pone los encabezados en columna). */
  :global(.app-movil) .encabezado.cab-persona, .encabezado.cab-persona { flex-direction: row; flex-wrap: nowrap; align-items: center; }
  .nombre-persona { flex: 1; min-width: 0; }
  .resumen .grande { font: 650 28px/34px var(--font-display); letter-spacing: -.02em; color: var(--primary-text); }
  .rojo { color: var(--over-100-alt); }
  .seccion { font: 650 15px/20px var(--font-sans); color: var(--ink-2); margin-top: var(--space-2); }

  .rejilla { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
  .rejilla.archivadas { opacity: .8; }
  .persona { gap: var(--space-3); text-align: left; font: inherit; color: inherit; cursor: pointer; transition: transform .12s ease; }
  .persona:hover { transform: translateY(-2px); }
  .persona:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .persona.vencida { box-shadow: var(--shadow-2), inset 0 0 0 1.5px var(--over-100-soft); }
  .persona.al-dia { opacity: .82; }
  .persona .cab { display: flex; align-items: center; gap: var(--space-3); }
  .persona .titulo { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .persona .titulo b { font-size: 15px; }
  .persona .titulo .caption { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .monto-fila { display: flex; align-items: baseline; justify-content: space-between; }
  .monto-fila b { font: 650 22px/28px var(--font-display); letter-spacing: -.01em; font-variant-numeric: tabular-nums; }

  .inicial { width: 40px; height: 40px; flex: none; border-radius: var(--r-full); display: grid; place-items: center; background: var(--primary-soft); color: var(--primary-text); font: 700 16px/1 var(--font-display); }
  .inicial.grande { width: 52px; height: 52px; font-size: 22px; background: var(--grad-brand); color: #fff; box-shadow: var(--glow-brand); }
  .titulo-persona { display: flex; align-items: center; gap: var(--space-4); }
  .volver { align-self: flex-start; background: none; border: 0; padding: 0; color: var(--primary-text); font: 600 13px/18px var(--font-sans); cursor: pointer; }
  .volver:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .peligro { color: var(--expense); }

  .confirmar { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-radius: var(--r-lg); }
  .acciones { display: flex; gap: var(--space-2); justify-content: flex-end; }

  .historial { gap: 0; padding-block: var(--space-2); }
  .mov { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--line); }
  .mov:last-child { border-bottom: 0; }
  .mov-texto { display: flex; flex-direction: column; min-width: 0; }
  .mov b { font-variant-numeric: tabular-nums; }
  .cf-tile.mini { width: 32px; height: 32px; border-radius: 10px; }
  .cf-tile.mini :global(.cf-icon) { width: 16px; height: 16px; }

  .gasto { gap: var(--space-3); }
  .gasto-cab { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--space-3); align-items: center; }
  .gasto-cab > b { font-variant-numeric: tabular-nums; }
  .partes-gasto { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .partes-gasto li { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
  .partes-gasto li:last-child { border-bottom: 0; }
  .partes-gasto b { font-variant-numeric: tabular-nums; }
  .estado { display: flex; align-items: center; gap: var(--space-2); }
  .espacio { flex: 1; }
  .aviso-borrar { background: var(--glass-1); border: 1px solid var(--line); }
  .cerrados summary { cursor: pointer; font-weight: 600; font-size: 14px; color: var(--ink-2); padding: var(--space-2) 0; }
  .cerrados .lista { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-2); }

  /* Celular (lienzo «Me deben») */
  .acciones-m { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .acciones-m .cf-btn { height: 48px; }
  .resumen-m { gap: 10px; }
  .total-m { font: 650 36px/40px var(--font-display); letter-spacing: -.025em; color: var(--primary-text); font-variant-numeric: tabular-nums; }
  .pie-m { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding-top: 10px; border-top: 1px solid var(--line); }
  .pie-m div { display: flex; flex-direction: column; }
  .pie-m b { font-weight: 600; font-variant-numeric: tabular-nums; }
  @media (max-width: 760px) {
    .resumen { grid-template-columns: minmax(0, 1fr); grid-template-areas: "total" "datos" "botones"; }
    .resumen .datos { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
    .resumen .datos b { font-size: 15px; }
    .resumen .datos .cf-overline { font-size: 10px; }
    .resumen .botones { min-width: 0; }
    .rejilla { grid-template-columns: minmax(0, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) { .persona { transition: none; } }
</style>
