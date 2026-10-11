<script lang="ts" module>
  export interface SerieBarras {
    nombre: string;
    valores: number[];
    /** Token de color del sistema, p. ej. "--primary". */
    color: string;
  }
</script>

<script lang="ts">
  // Barras agrupadas o apiladas con colores de los tokens. La leyenda y el tooltip nombran cada serie
  // (el color nunca va solo) y hay una tabla para lectores de pantalla.
  import { onMount } from "svelte";
  import * as echarts from "echarts/core";
  import { BarChart } from "echarts/charts";
  import { GridComponent, TooltipComponent } from "echarts/components";
  import { SVGRenderer } from "echarts/renderers";
  import { pesos, pesosCorto } from "$lib/formato";
  import { tema } from "$lib/tema.svelte";

  echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);

  let { categorias, series, apiladas = false, descripcion, alto = 240, resaltar = -1, extra = [] }: {
    categorias: string[];
    series: SerieBarras[];
    apiladas?: boolean;
    descripcion: string;
    alto?: number;
    /** Índice de categoría a destacar (las demás se atenúan). */
    resaltar?: number;
    /** Línea extra por categoría en el tooltip (p. ej. la cuota mensual). */
    extra?: string[];
  } = $props();

  let nodo: HTMLDivElement;
  let grafica: echarts.ECharts | undefined;
  let dibujado = "";

  const token = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function opciones(): echarts.EChartsCoreOption {
    const c = { tinta: token("--ink"), tinta2: token("--ink-2"), linea: token("--line"), superficie: token("--surface"), fuente: token("--font-sans") };
    return {
      animation: false,
      textStyle: { fontFamily: c.fuente },
      grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: c.linea } },
        backgroundColor: c.superficie, borderColor: c.linea, padding: [10, 12],
        extraCssText: "border-radius:14px;box-shadow:0 12px 32px rgba(40,19,99,.18);",
        textStyle: { color: c.tinta, fontSize: 13 },
        formatter: (ps: any[]) =>
          `<div style="font-size:12px;color:${c.tinta2}">${ps[0].axisValueLabel}${extra[ps[0].dataIndex] ? ` · ${extra[ps[0].dataIndex]}` : ""}</div>` +
          ps.map((p) => `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
            <span style="width:10px;height:10px;border-radius:3px;background:${p.color}"></span>
            <b style="font-weight:650">${pesos(p.value)}</b><span style="color:${c.tinta2}">${p.seriesName}</span></div>`).join(""),
      },
      xAxis: {
        type: "category", data: categorias,
        axisLine: { lineStyle: { color: c.linea } }, axisTick: { show: false },
        axisLabel: { color: c.tinta2, fontSize: 12, hideOverlap: true },
      },
      yAxis: {
        type: "value", splitNumber: 3,
        axisLabel: { color: c.tinta2, fontSize: 11, formatter: (v: number) => (v ? pesosCorto(v) : "0") },
        splitLine: { lineStyle: { color: c.linea } },
      },
      series: series.map((s, k) => ({
        name: s.nombre, type: "bar", stack: apiladas ? "total" : undefined,
        barMaxWidth: apiladas ? 22 : 18, barGap: "20%",
        data: s.valores.map((v, i) => ({
          value: v,
          itemStyle: {
            color: token(s.color),
            opacity: resaltar >= 0 && i !== resaltar ? 0.38 : 1,
            borderRadius: apiladas ? (k === series.length - 1 ? [6, 6, 0, 0] : 0) : [6, 6, 0, 0],
          },
        })),
      })),
    };
  }

  function dibujar() {
    const huella = JSON.stringify([categorias, series, apiladas, resaltar, extra]) + tema.actual;
    if (!grafica || huella === dibujado) return;
    dibujado = huella;
    grafica.setOption(opciones(), { notMerge: true });
  }

  onMount(() => {
    grafica = echarts.init(nodo, undefined, { renderer: "svg" });
    dibujar();
    const ajustar = new ResizeObserver(() => grafica?.resize());
    ajustar.observe(nodo);
    return () => { ajustar.disconnect(); grafica?.dispose(); };
  });

  $effect(() => {
    categorias; series; apiladas; resaltar; extra; tema.actual;
    dibujar();
  });
</script>

<div class="leyenda" aria-hidden="true">
  {#each series as s (s.nombre)}<span class="ley"><span class="clave" style:background="var({s.color})"></span>{s.nombre}</span>{/each}
</div>
<div class="grafica" style:height="{alto}px" bind:this={nodo} role="img" aria-label={descripcion}></div>
<table class="cf-sr">
  <caption>{descripcion}</caption>
  <thead><tr><th></th>{#each series as s (s.nombre)}<th>{s.nombre}</th>{/each}</tr></thead>
  <tbody>
    {#each categorias as cat, i (cat)}<tr><td>{cat}</td>{#each series as s (s.nombre)}<td>{pesos(s.valores[i])}</td>{/each}</tr>{/each}
  </tbody>
</table>

<style>
  .leyenda { display: flex; gap: var(--space-4); font-size: 12px; line-height: 16px; color: var(--ink-2); }
  .ley { display: inline-flex; align-items: center; gap: 6px; }
  .clave { width: 10px; height: 10px; border-radius: 3px; }
  .grafica { width: 100%; }
</style>
