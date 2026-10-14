<script lang="ts">
  // Hoverable donut matching the Brygga-redesign mockup: ring built from
  // stroke-dasharray arcs (one per segment), center big number, legend
  // with per-row amount + %, hover tooltip with exact share.
  export interface DonutSlice {
    label: string;
    value: number;
    color: string;
  }

  let {
    slices,
    centerValue,
    centerLabel = 'totalt',
    size = 168,
    fmt = (v: number) => Math.round(v).toLocaleString('sv-SE'),
  }: {
    slices: DonutSlice[];
    centerValue: string;
    centerLabel?: string;
    size?: number;
    fmt?: (v: number) => string;
  } = $props();

  const R = 68, CX = 84, CY = 84, STROKE = 24, GAP = 3;
  const circumference = 2 * Math.PI * R;
  const total = $derived(slices.reduce((s, c) => s + c.value, 0));

  const segs = $derived.by(() => {
    let acc = 0;
    return slices.map(s => {
      const frac = total > 0 ? s.value / total : 0;
      const len = frac * circumference;
      const seg = { ...s, frac, offset: acc, len };
      acc += len;
      return seg;
    });
  });

  let hovered = $state<number | null>(null);
  let tipX = $state(0), tipY = $state(0);

  function handleMove(e: PointerEvent, wrap: HTMLElement) {
    const rect = wrap.getBoundingClientRect();
    tipX = e.clientX - rect.left;
    tipY = e.clientY - rect.top;
  }
</script>

<div class="dc-grid">
  <div class="dc-wrap" style:width="{size}px" style:height="{size}px"
       onpointerleave={() => hovered = null}>
    <svg viewBox="0 0 168 168">
      <g transform="rotate(-90 {CX} {CY})">
        {#each segs as s, i}
          <circle
            class="dc-seg"
            cx={CX} cy={CY} r={R} fill="none"
            stroke={s.color} stroke-width={STROKE}
            stroke-dasharray="{Math.max(0, s.len - GAP)} {circumference - Math.max(0, s.len - GAP)}"
            stroke-dashoffset={-s.offset}
            style:opacity={hovered === null || hovered === i ? 1 : .45}
            onpointerenter={() => hovered = i}
            onpointermove={(e) => handleMove(e, e.currentTarget.closest('.dc-wrap') as HTMLElement)}
          />
        {/each}
      </g>
    </svg>
    <div class="dc-center">
      <div class="v mono">{centerValue}</div>
      <div class="l">{centerLabel}</div>
    </div>
    {#if hovered !== null}
      {@const s = segs[hovered]}
      <div class="dc-tip" style:left="{tipX}px" style:top="{tipY}px">
        <div class="dc-tip-title" style:color={s.color}>{s.label}</div>
        <div class="dc-tip-row"><span class="k">Andel</span><span>{(s.frac * 100).toFixed(1).replace('.', ',')} %</span></div>
        <div class="dc-tip-row"><span class="k">Belopp</span><span>{fmt(s.value)}</span></div>
      </div>
    {/if}
  </div>

  <div class="dc-legend">
    {#each slices as s}
      {@const frac = total > 0 ? s.value / total * 100 : 0}
      <div class="dc-row">
        <span class="dc-swatch" style:background={s.color}></span>
        <span class="name">{s.label}</span>
        <span class="amt mono">{fmt(s.value)}</span>
        <span class="pct mono">{frac.toFixed(0)}%</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .dc-grid { display: grid; grid-template-columns: auto 1fr; gap: 32px; align-items: center; }
  .dc-wrap { position: relative; flex-shrink: 0; }
  .dc-wrap svg { width: 100%; height: 100%; overflow: visible; }
  .dc-seg { cursor: pointer; transition: opacity .15s; }
  .dc-center {
    position: absolute; inset: 28px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center; pointer-events: none;
  }
  .dc-center .v { font-size: 1.15rem; font-weight: 600; line-height: 1.1; }
  .dc-center .l { font-size: .66rem; color: var(--muted); margin-top: 3px; letter-spacing: .02em; }
  .dc-legend { display: grid; gap: 10px; min-width: 0; }
  .dc-row { display: flex; align-items: center; gap: 10px; font-size: .9rem; }
  .dc-swatch { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
  .dc-row .name { flex: 1; min-width: 0; color: var(--muted); }
  .dc-row .amt { font-weight: 600; white-space: nowrap; }
  .dc-row .pct { color: var(--muted); font-size: .8rem; width: 3.2em; text-align: right; }
  .dc-tip {
    position: absolute; pointer-events: none;
    background: var(--fg); color: var(--bg); border-radius: 9px; padding: 9px 12px;
    font-size: .8rem; line-height: 1.5; white-space: nowrap;
    transform: translate(-50%, -112%);
    box-shadow: 0 6px 18px rgba(0,0,0,.35);
  }
  .dc-tip-title { font-weight: 600; margin-bottom: 4px; }
  .dc-tip-row { display: flex; justify-content: space-between; gap: 14px; }
  .dc-tip-row .k { opacity: .85; margin-right: 10px; }
  @media (max-width: 560px) { .dc-grid { grid-template-columns: 1fr; justify-items: center; } }
</style>
