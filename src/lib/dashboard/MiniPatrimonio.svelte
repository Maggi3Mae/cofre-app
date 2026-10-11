<script lang="ts">
  // Mini gráfica blanca del patrimonio (últimos 6 cierres) que va al fondo de la tarjeta de marca.
  // Sin ejes: es contexto visual; el detalle está en el tooltip y en la tabla para lectores de pantalla.
  import { onMount } from "svelte";
  import * as echarts from "echarts/core";
  import { LineChart } from "echarts/charts";
  import { GridComponent, TooltipComponent } from "echarts/components";
  import { SVGRenderer } from "echarts/renderers";
  import { pesos } from "$lib/formato";
  import { nombreMesCorto, nombreMesLargo } from "$lib/periodo";
  import type { PuntoPatrimonio } from "$lib/datos";

  echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

  let { puntos, oculto = false }: { puntos: PuntoPatrimonio[]; oculto?: boolean } = $props();

  let nodo: HTMLDivElement;
  let grafica: echarts.ECharts | undefined;
  let dibujado = ""; // huella de lo último dibujado: evita el doble dibujo al abrir

  function dibujar() {
    const huella = JSON.stringify(puntos) + (oculto ? "|oculto" : "");
    if (!grafica || huella === dibujado) return;
    dibujado = huella;
    grafica.setOption(opciones(), { notMerge: true });
  }

  const descripcion = $derived(
    oculto
      ? "Patrimonio al cierre de cada mes (montos ocultos)"
      : "Patrimonio al cierre de cada mes: " +
        puntos.map((p) => `${nombreMesLargo(p.mes)} ${pesos(p.neto)}`).join(", "),
  );

  function opciones(): echarts.EChartsCoreOption {
    const valores = puntos.map((p) => p.neto);
    const min = Math.min(...valores), max = Math.max(...valores);
    // Aire arriba y abajo: el punto más bajo queda a ~1/3 de la franja, no pegado al borde.
    const rango = max - min || Math.abs(max) * 0.1 || 1;
    return {
      animation: false, // WebKit cortaba la línea si se redibujaba durante la animación
      grid: { left: 24, right: 24, top: 8, bottom: 20 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(40,19,99,.9)",
        borderColor: "rgba(255,255,255,.3)",
        padding: [6, 10],
        extraCssText: "border-radius:12px;box-shadow:none;", // sin desenfoque (rendimiento)
        textStyle: { color: "#FFFFFF", fontSize: 12 },
        axisPointer: { type: "line", lineStyle: { color: "rgba(255,255,255,.35)", width: 1, type: "solid" } },
        formatter: (ps: any) => {
          const p = puntos[(Array.isArray(ps) ? ps[0] : ps).dataIndex];
          const mes = `<span style="opacity:.82">${nombreMesCorto(p.mes, true)}</span>`;
          return oculto ? mes : `${mes} <b>${pesos(p.neto)}</b>`;
        },
      },
      xAxis: {
        type: "category", data: puntos.map((p) => p.mes), boundaryGap: false,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: "rgba(255,255,255,.62)", fontSize: 11, margin: 6, formatter: (m: string) => nombreMesCorto(m) },
      },
      yAxis: { type: "value", show: false, min: min - rango * 0.6, max: max + rango * 0.25 },
      series: [{
        type: "line", data: valores, smooth: 0.3, showSymbol: true, symbol: "circle", symbolSize: 5,
        lineStyle: { width: 2, color: "rgba(255,255,255,.9)" },
        itemStyle: { color: "#FFFFFF" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(255,255,255,.28)" }, { offset: 1, color: "rgba(255,255,255,0)" },
          ]),
        },
      }],
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

  $effect(() => {
    puntos;
    oculto;
    dibujar();
  });
</script>

<div class="mini" bind:this={nodo} role="img" aria-label={descripcion}></div>

<style>
  .mini { width: 100%; height: 100%; }
</style>
