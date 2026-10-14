<script lang="ts">
  // Hoverable multi-series line/area chart matching the Brygga-redesign
  // mockup: thin rounded lines, gradient area fill, dashed reference
  // lines, optional vertical year-markers, mono tabular tick labels,
  // crosshair + tooltip. Dual y-axis (left/right) like the original
  // Chart.js charts it replaces.
  export interface ChartSeries {
    key: string;
    label: string;
    color: string;
    data: number[];
    axis: 'left' | 'right';
    dashed?: boolean;
    area?: boolean;
    step?: boolean;
  }
  export interface ChartMarker {
    year: number;
    label: string;
    color: string;
  }

  let {
    labels,
    series,
    leftFormat = (v: number) => String(Math.round(v)),
    rightFormat = (v: number) => String(Math.round(v)),
    markers = [],
    height = 320,
  }: {
    labels: (string | number)[];
    series: ChartSeries[];
    leftFormat?: (v: number) => string;
    rightFormat?: (v: number) => string;
    markers?: ChartMarker[];
    height?: number;
  } = $props();

  const W = 880, padL = 54, padR = 54, padT = 20, padB = 34;
  const H = $derived(height);
  const plotW = $derived(W - padL - padR);
  const plotH = $derived(H - padT - padB);

  const leftSeries  = $derived(series.filter(s => s.axis === 'left'));
  const rightSeries = $derived(series.filter(s => s.axis === 'right'));

  const leftMax  = $derived(Math.max(1, ...leftSeries.flatMap(s => s.data)) * 1.08);
  const rightMax = $derived(Math.max(1, ...rightSeries.flatMap(s => s.data)) * 1.2);

  const x  = $derived((i: number) => padL + (i / Math.max(1, labels.length - 1)) * plotW);
  const yL = $derived((v: number) => padT + plotH - (v / leftMax) * plotH);
  const yR = $derived((v: number) => padT + plotH - (v / rightMax) * plotH);
  const yFor = $derived((s: ChartSeries) => s.axis === 'left' ? yL : yR);

  function linePath(s: ChartSeries): string {
    if (s.step) {
      let d = '';
      labels.forEach((_, i) => {
        const px = x(i), py = yFor(s)(s.data[i]);
        if (i === 0) d += `M ${px},${py}`;
        else {
          const prevY = yFor(s)(s.data[i - 1]);
          d += ` L ${px},${prevY} L ${px},${py}`;
        }
      });
      return d;
    }
    return 'M ' + labels.map((_, i) => `${x(i)},${yFor(s)(s.data[i])}`).join(' L ');
  }
  function areaPath(s: ChartSeries): string {
    const line = labels.map((_, i) => `${x(i)},${yFor(s)(s.data[i])}`).join(' L ');
    return `M ${padL},${padT + plotH} L ${line} L ${padL + plotW},${padT + plotH} Z`;
  }

  // gridline labels: ~6 evenly spaced incl. first/last
  const gridIdx = $derived.by(() => {
    const n = labels.length;
    const step = Math.max(1, Math.round(n / 6));
    const idx: number[] = [];
    for (let i = 0; i < n; i += step) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    return idx;
  });

  const markerPos = $derived(markers.map(m => ({ ...m, idx: labels.indexOf(m.year) })).filter(m => m.idx >= 0));

  // ── Hover state ──────────────────────────────────────────────────────
  let hoverIdx = $state<number | null>(null);
  let tipX = $state(0), tipY = $state(0);
  let svgEl: SVGSVGElement;

  function handleMove(e: PointerEvent) {
    const rect = svgEl.getBoundingClientRect();
    const scale = W / rect.width;
    const localX = (e.clientX - rect.left) * scale;
    let i = Math.round((localX - padL) / plotW * (labels.length - 1));
    i = Math.max(0, Math.min(labels.length - 1, i));
    hoverIdx = i;
    const wrapRect = (svgEl.parentElement as HTMLElement).getBoundingClientRect();
    tipX = ((e.clientX - rect.left) / rect.width) * wrapRect.width;
    tipY = ((e.clientY - rect.top) / rect.height) * wrapRect.height;
  }
  function handleLeave() { hoverIdx = null; }
</script>

<div class="bc-wrap">
  <svg bind:this={svgEl} viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet"
       role="img" aria-label="Diagram, hovra för värden per år"
       onpointermove={handleMove} onpointerleave={handleLeave} ontouchstart={e => handleMove(e.touches[0] as unknown as PointerEvent)}>
    <defs>
      {#each series.filter(s => s.area) as s}
        <linearGradient id="bc-fill-{s.key}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color={s.color} stop-opacity=".22" />
          <stop offset="100%" stop-color={s.color} stop-opacity="0" />
        </linearGradient>
      {/each}
    </defs>

    {#each gridIdx as i}
      <line x1={x(i)} x2={x(i)} y1={padT} y2={padT + plotH} class="bc-grid" />
      <text x={x(i)} y={H - 10} text-anchor="middle" class="bc-tick-x">{labels[i]}</text>
    {/each}

    {#each markers as m}
      {@const mi = labels.indexOf(m.year)}
      {#if mi >= 0}
        <line x1={x(mi)} x2={x(mi)} y1={padT} y2={padT + plotH} stroke={m.color} stroke-width="1" stroke-dasharray="3 3" opacity=".6" />
        <text x={x(mi)} y={padT + 12} text-anchor="middle" class="bc-marker-label" style:fill={m.color}>{m.label}</text>
      {/if}
    {/each}

    {#each series as s}
      {#if s.area}
        <path d={areaPath(s)} fill="url(#bc-fill-{s.key})" />
      {/if}
    {/each}

    {#each series as s}
      <path d={linePath(s)} fill="none" stroke={s.color} stroke-width={s.dashed ? 1.5 : 2.5}
            stroke-linejoin="round" stroke-linecap="round"
            stroke-dasharray={s.dashed ? '5 4' : undefined} opacity={s.dashed ? .85 : 1} />
    {/each}

    {#each markerPos as m}
      <circle cx={x(m.idx)} cy={yL(leftSeries[0]?.data[m.idx] ?? 0)} r="4" fill="var(--card)" stroke={m.color} stroke-width="2.5" />
    {/each}

    {#if hoverIdx !== null}
      <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={padT} y2={padT + plotH} class="bc-crosshair" />
      {#each series as s}
        <circle cx={x(hoverIdx)} cy={yFor(s)(s.data[hoverIdx])} r="4" fill={s.color} stroke="var(--card)" stroke-width="2" />
      {/each}
    {/if}

    <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" />
  </svg>

  {#if hoverIdx !== null}
    <div class="bc-tip" style:left="{tipX}px" style:top="{tipY}px">
      <div class="bc-tip-title">{labels[hoverIdx]}</div>
      {#each series as s}
        <div class="bc-tip-row">
          <span class="bc-tip-k" style:color={s.color}>{s.label}</span>
          <span>{s.axis === 'left' ? leftFormat(s.data[hoverIdx]) : rightFormat(s.data[hoverIdx])}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .bc-wrap { position: relative; }
  .bc-wrap svg { width: 100%; height: auto; display: block; touch-action: none; }
  .bc-grid { stroke: var(--border); stroke-width: 1; }
  .bc-tick-x { font-size: 11px; fill: var(--muted); font-family: 'IBM Plex Mono', ui-monospace, monospace; }
  .bc-marker-label { font-size: 11px; font-weight: 600; font-family: 'Source Sans 3', sans-serif; }
  .bc-crosshair { stroke: var(--muted); stroke-width: 1; opacity: .6; }
  .bc-tip {
    position: absolute; pointer-events: none;
    background: var(--fg); color: var(--bg); border-radius: 9px; padding: 9px 12px;
    font-size: .8rem; line-height: 1.5; white-space: nowrap;
    transform: translate(-50%, -112%);
    box-shadow: 0 6px 18px rgba(0,0,0,.35);
  }
  .bc-tip-title { font-weight: 600; margin-bottom: 4px; font-family: 'IBM Plex Mono', monospace; }
  .bc-tip-row { display: flex; justify-content: space-between; gap: 14px; }
  .bc-tip-k { opacity: .85; margin-right: 10px; }
</style>
