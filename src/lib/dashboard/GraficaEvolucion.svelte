<script lang="ts" module>
  export interface Punto { etiqueta: string; etiquetaLarga: string; ingresos: number; egresos: number }
</script>

<script lang="ts">
  // Ingresos (violeta, línea continua con área) vs egresos (frambuesa, punteada).
  // El color nunca va solo: la línea punteada, la leyenda y el tooltip nombran cada serie.
  import { onMount } from "svelte";
  import * as echarts from "echarts/core";
  import { LineChart } from "echarts/charts";
  import { GridComponent, TooltipComponent } from "echarts/components";
  import { SVGRenderer } from "echarts/renderers";
  import { pesos, pesosCorto } from "$lib/formato";
  import { tema } from "$lib/tema.svelte";

  echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

  let { puntos, descripcion }: { puntos: Punto[]; descripcion: string } = $props();

  let nodo: HTMLDivElement;
  let grafica: echarts.ECharts | undefined;
  let dibujado = ""; // huella de lo último dibujado: evita el doble dibujo al abrir

  function dibujar() {
    const huella = JSON.stringify(puntos) + tema.actual;
    if (!grafica || huella === dibujado) return;
    dibujado = huella;
    grafica.setOption(opciones(), { notMerge: true });
  }

  const token = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function opciones(): echarts.EChartsCoreOption {
    const c = {
      ingreso: token("--primary"), egreso: token("--expense"), tinta: token("--ink"), tinta2: token("--ink-2"),
      linea: token("--line"), superficie: token("--surface"), fuente: token("--font-sans"),
    };
    const fila = (color: string, guion: boolean, nombre: string, v: number) =>
      `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
        <span style="width:14px;border-top:2px ${guion ? "dashed" : "solid"} ${color}"></span>
        <b style="font-weight:650;color:${c.tinta}">${pesos(v)}</b>
        <span style="color:${c.tinta2}">${nombre}</span></div>`;
    return {
      animation: false, // WebKit cortaba la línea si se redibujaba durante la animación
      textStyle: { fontFamily: c.fuente },
      grid: { left: 8, right: 12, top: 12, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: c.superficie,
        borderColor: c.linea,
        padding: [10, 12],
        // Sin desenfoque: el tooltip se mueve con el mouse y WebKit lo recalcularía en cada movimiento.
        extraCssText: "border-radius:14px;box-shadow:0 12px 32px rgba(40,19,99,.18);",
        textStyle: { color: c.tinta, fontSize: 13 },
        axisPointer: { type: "line", lineStyle: { color: c.tinta2, width: 1, type: "solid" } },
        formatter: (ps: any) => {
          const i = Array.isArray(ps) ? ps[0].dataIndex : ps.dataIndex;
          const p = puntos[i];
          return `<div style="font-size:12px;color:${c.tinta2}">${p.etiquetaLarga}</div>` +
            fila(c.ingreso, false, "Ingresos", p.ingresos) + fila(c.egreso, true, "Egresos", p.egresos);
        },
      },
      xAxis: {
        type: "category",
        data: puntos.map((p) => p.etiqueta),
        boundaryGap: false,
        axisLine: { lineStyle: { color: c.linea } },
        axisTick: { show: false },
        axisLabel: { color: c.tinta2, fontSize: 12, hideOverlap: true, margin: 10, alignMinLabel: "left", alignMaxLabel: "right" },
      },
      yAxis: {
        type: "value",
        splitNumber: 3,
        axisLabel: { color: c.tinta2, fontSize: 11, formatter: (v: number) => (v ? pesosCorto(v) : "0") },
        splitLine: { lineStyle: { color: c.linea } },
      },
      series: [
        {
          name: "Ingresos", type: "line", data: puntos.map((p) => p.ingresos), smooth: 0.25,
          showSymbol: false, symbolSize: 8, lineStyle: { width: 2, color: c.ingreso }, itemStyle: { color: c.ingreso },
          emphasis: { focus: "none", itemStyle: { borderColor: c.superficie, borderWidth: 2 } },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: c.ingreso + "52" }, { offset: 1, color: c.ingreso + "00" },
            ]),
          },
        },
        {
          name: "Egresos", type: "line", data: puntos.map((p) => p.egresos), smooth: 0.25,
          showSymbol: false, symbolSize: 8, lineStyle: { width: 2, type: [6, 5], color: c.egreso }, itemStyle: { color: c.egreso },
          emphasis: { focus: "none", itemStyle: { borderColor: c.superficie, borderWidth: 2 } },
        },
      ],
    };
  }

  onMount(() => {
    grafica = echarts.init(nodo, undefined, { renderer: "svg" });
    dibujar();
    const ajustar = new ResizeObserver(() => grafica?.resize());
    ajustar.observe(nodo);
    return () => {
      ajustar.disconnect();
      grafica?.dispose();
    };
  });

  // Redibujar con los datos nuevos o al cambiar de tema (los colores salen de los tokens).
  $effect(() => {
    puntos;
    tema.actual;
    dibujar();
  });
</script>

<div class="leyenda" aria-hidden="true">
  <span class="ley"><span class="clave continua"></span>Ingresos</span>
  <span class="ley"><span class="clave punteada"></span>Egresos</span>
</div>
<div class="grafica" bind:this={nodo} role="img" aria-label={descripcion}></div>

<!-- Vista de tabla para lectores de pantalla -->
<table class="cf-sr">
  <caption>{descripcion}</caption>
  <thead><tr><th>Período</th><th>Ingresos</th><th>Egresos</th></tr></thead>
  <tbody>
    {#each puntos as p (p.etiquetaLarga)}<tr><td>{p.etiquetaLarga}</td><td>{pesos(p.ingresos)}</td><td>{pesos(p.egresos)}</td></tr>{/each}
  </tbody>
</table>

<style>
  .leyenda { display: flex; gap: var(--space-4); font-size: 12px; line-height: 16px; color: var(--ink-2); }
  .ley { display: inline-flex; align-items: center; gap: 6px; }
  .clave { width: 16px; border-top: 2px solid; }
  .continua { border-color: var(--primary); }
  .punteada { border-top-style: dashed; border-color: var(--expense); }
  .grafica { width: 100%; height: 220px; }
</style>
