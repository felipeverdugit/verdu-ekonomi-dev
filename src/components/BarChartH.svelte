<script lang="ts">
  // Horizontal bar list matching the Brygga-redesign design language:
  // rounded fills, mono tabular values, legible at rest (no hover
  // required to read the numbers — direct labels per dataviz guidance).
  export interface BarRow {
    label: string;
    value: number;
    color: string;
  }

  let {
    rows,
    fmt = (v: number) => Math.round(v).toLocaleString('sv-SE'),
  }: {
    rows: BarRow[];
    fmt?: (v: number) => string;
  } = $props();

  const maxVal = $derived(Math.max(1, ...rows.map(r => r.value)));
</script>

<div class="bh-list">
  {#each rows as row}
    <div class="bh-row">
      <div class="bh-label">{row.label}</div>
      <div class="bh-track">
        <div class="bh-fill" style:width="{Math.max(2, row.value / maxVal * 100)}%" style:background={row.color}></div>
      </div>
      <div class="bh-value mono">{fmt(row.value)}</div>
    </div>
  {/each}
</div>

<style>
  .bh-list { display: grid; gap: 10px; }
  .bh-row { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(80px, 2fr) auto; gap: 12px; align-items: center; }
  .bh-label { font-size: .82rem; color: var(--muted); min-width: 0; }
  .bh-track { height: 10px; background: var(--bg); border-radius: 99px; overflow: hidden; min-width: 0; }
  .bh-fill { height: 100%; border-radius: 99px; transition: width .2s; }
  .bh-value { font-size: .85rem; font-weight: 600; white-space: nowrap; text-align: right; }
  @media (max-width: 520px) {
    .bh-row { grid-template-columns: 1fr; gap: 4px; }
    .bh-value { text-align: left; }
  }
</style>
