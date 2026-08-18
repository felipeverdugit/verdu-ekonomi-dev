<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    Chart, BarController, BarElement, LineController, LineElement,
    PointElement, CategoryScale, LinearScale, Tooltip, Legend,
  } from 'chart.js';
  import { initAuth } from '../auth';
  import { fireStore, avkastningStore } from '../store';
  import { renderTopnav, injectInfoBtn } from '../nav';
  import { INFO } from '../infoContent';
  import { initSyncWidget } from '../syncWidget';
  import type { AvkRow, AvkStartValues } from '../types';

  Chart.register(BarController, BarElement, LineController, LineElement,
    PointElement, CategoryScale, LinearScale, Tooltip, Legend);

  const fmtKr  = (n: number) => Math.round(n).toLocaleString('sv-SE') + ' kr';
  const fmtKrS = (n: number) => (n >= 0 ? '+' : '') + Math.round(n).toLocaleString('sv-SE') + ' kr';
  const fmtM   = (n: number) => (n / 1e6).toFixed(2) + ' MSEK';
  const fmtPct = (v: number | null) => v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`;

  function colorForPct(v: number | null, ref: number): string {
    if (v === null) return 'var(--muted)';
    return v >= ref ? 'var(--green)' : v >= 0 ? 'var(--orange)' : 'var(--red)';
  }

  function cagr(values: (number | null)[]): number | null {
    const valid = values.filter((v): v is number => v !== null);
    if (valid.length === 0) return null;
    const product = valid.reduce((acc, v) => acc * (1 + v / 100), 1);
    return (Math.pow(product, 1 / valid.length) - 1) * 100;
  }

  // ── Kr-beräkning ──────────────────────────────────────────────────────────────
  interface KrRow {
    year: number; lysaStart: number; lysaAvkKr: number; lysaEnd: number;
    tjpSveEnd: number; tjpNorEnd: number; total: number;
    lysaSimEnd: number; tjpSveSimEnd: number; tjpNorSimEnd: number; totalSim: number;
  }

  function computeKrRows(rows: AvkRow[], sv: AvkStartValues, antaget: number): KrRow[] {
    const sorted = rows.slice().sort((a, b) => a.year - b.year);
    if (sorted.length === 0 || (sv.lysaKr === 0 && sv.tjpSveKr === 0 && sv.tjpNorKr === 0)) return [];
    const result: KrRow[] = [];
    let lysaAct = sv.lysaKr, tjpSveAct = sv.tjpSveKr, tjpNorAct = sv.tjpNorKr;
    let lysaSim = sv.lysaKr, tjpSveSim = sv.tjpSveKr, tjpNorSim = sv.tjpNorKr;
    const aFrac = antaget / 100;
    for (const row of sorted) {
      if (row.year < sv.year) continue;
      const lysaStart  = lysaAct;
      const lysaEndAct = row.lysaPct   !== null ? lysaAct   * (1 + row.lysaPct   / 100) : lysaAct;
      const tjpSveEndA = row.tjpSvePct !== null ? tjpSveAct * (1 + row.tjpSvePct / 100) : tjpSveAct;
      const tjpNorEndA = row.tjpNorPct !== null ? tjpNorAct * (1 + row.tjpNorPct / 100) : tjpNorAct;
      result.push({
        year: row.year, lysaStart, lysaAvkKr: lysaEndAct - lysaStart,
        lysaEnd: lysaEndAct, tjpSveEnd: tjpSveEndA, tjpNorEnd: tjpNorEndA,
        total: lysaEndAct + tjpSveEndA + tjpNorEndA,
        lysaSimEnd:   lysaSim   * (1 + aFrac),
        tjpSveSimEnd: tjpSveSim * (1 + aFrac),
        tjpNorSimEnd: tjpNorSim * (1 + aFrac),
        totalSim: lysaSim * (1 + aFrac) + tjpSveSim * (1 + aFrac) + tjpNorSim * (1 + aFrac),
      });
      lysaAct = lysaEndAct; tjpSveAct = tjpSveEndA; tjpNorAct = tjpNorEndA;
      lysaSim = lysaSim * (1 + aFrac); tjpSveSim = tjpSveSim * (1 + aFrac); tjpNorSim = tjpNorSim * (1 + aFrac);
    }
    return result;
  }

  // ── State ─────────────────────────────────────────────────────────────────────
  let rows = $state<AvkRow[]>(avkastningStore.getRows());
  let sv   = $state<AvkStartValues>(avkastningStore.getStart());

  let antaget = $derived(fireStore.get().avkPct);
  let krRows  = $derived(computeKrRows(rows, sv, antaget));

  // KPIs
  let cL   = $derived(cagr(rows.map(r => r.lysaPct)));
  let cS   = $derived(cagr(rows.map(r => r.tjpSvePct)));
  let cN   = $derived(cagr(rows.map(r => r.tjpNorPct)));
  let diff = $derived(cL !== null ? cL - antaget : null);

  // ── Charts ────────────────────────────────────────────────────────────────────
  let pctCanvas  = $state<HTMLCanvasElement>(null!);
  let krCanvas   = $state<HTMLCanvasElement>(null!);
  let pctChart:   Chart | null = null;
  let krChart:    Chart | null = null;

  const GRID = '#2d3348';
  const TEXT = '#8892a4';

  function buildPctChart() {
    if (!pctCanvas || rows.length === 0) { pctChart?.destroy(); pctChart = null; return; }
    if (pctChart) pctChart.destroy();
    const sorted  = rows.slice().sort((a, b) => a.year - b.year);
    const labels  = sorted.map(r => String(r.year));
    pctChart = new Chart(pctCanvas.getContext('2d')!, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Lysa %', data: sorted.map(r => r.lysaPct), backgroundColor: sorted.map(r => r.lysaPct === null ? '#2d3348' : r.lysaPct >= antaget ? '#4f8ef740' : '#f8717140'), borderColor: sorted.map(r => r.lysaPct === null ? '#2d3348' : r.lysaPct >= antaget ? '#4f8ef7' : '#f87171'), borderWidth: 1.5, borderRadius: 4 } as never,
          { type: 'bar', label: 'TjP Sverige %', data: sorted.map(r => r.tjpSvePct), backgroundColor: '#6ee7b730', borderColor: '#6ee7b7', borderWidth: 1.5, borderRadius: 4 } as never,
          { type: 'bar', label: 'TjP Norge %', data: sorted.map(r => r.tjpNorPct), backgroundColor: '#f8717130', borderColor: '#f87171', borderWidth: 1.5, borderRadius: 4 } as never,
          { type: 'line', label: `Antaget ${antaget} %`, data: sorted.map(() => antaget), borderColor: '#f59e0b', borderDash: [6, 3], borderWidth: 2, pointRadius: 0, tension: 0 } as never,
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: TEXT, boxWidth: 14 } },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtPct(c.raw as number | null)}` } },
        },
        scales: {
          x: { grid: { color: GRID }, ticks: { color: TEXT } },
          y: { grid: { color: GRID }, ticks: { color: TEXT, callback: v => `${v} %` } },
        },
      },
    });
  }

  function buildKrChart() {
    if (!krCanvas || krRows.length === 0) { krChart?.destroy(); krChart = null; return; }
    if (krChart) krChart.destroy();
    const startTotal = sv.lysaKr + sv.tjpSveKr + sv.tjpNorKr;
    const labels  = [String(sv.year), ...krRows.map(r => String(r.year))];
    const faktisk = [startTotal, ...krRows.map(r => r.total)];
    const simul   = [startTotal, ...krRows.map(r => r.totalSim)];
    const lysaAkt = [sv.lysaKr,  ...krRows.map(r => r.lysaEnd)];
    krChart = new Chart(krCanvas.getContext('2d')!, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Totalt faktisk', data: faktisk, borderColor: '#6ee7b7', backgroundColor: '#6ee7b710', tension: 0.3, pointRadius: 4, fill: false, borderWidth: 2 },
          { label: 'Totalt simulerat', data: simul, borderColor: '#f59e0b', borderDash: [6, 3], tension: 0.3, pointRadius: 3, fill: false, borderWidth: 2 },
          { label: 'Lysa faktisk', data: lysaAkt, borderColor: '#4f8ef7', backgroundColor: '#4f8ef710', tension: 0.3, pointRadius: 3, fill: false, borderWidth: 1.5 },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: TEXT, boxWidth: 14 } },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtKr(c.raw as number)}` } },
        },
        scales: {
          x: { grid: { color: GRID }, ticks: { color: TEXT } },
          y: { grid: { color: GRID }, ticks: { color: TEXT, callback: v => fmtM(Number(v)) } },
        },
      },
    });
  }

  $effect(() => { void rows; void antaget; buildPctChart(); buildKrChart(); });

  // ── Rad-hantering ─────────────────────────────────────────────────────────────
  function addRow() {
    const maxYear = rows.length === 0 ? new Date().getFullYear() - 1 : Math.max(...rows.map(r => r.year)) + 1;
    rows = [...rows, { year: maxYear, lysaPct: null, tjpSvePct: null, tjpNorPct: null }];
    avkastningStore.saveRows(rows);
  }

  function delRow(idx: number) {
    rows = rows.filter((_, i) => i !== idx);
    avkastningStore.saveRows(rows);
  }

  function setField(idx: number, field: keyof AvkRow, val: string) {
    const v = val === '' ? null : parseFloat(val);
    rows = rows.map((r, i) => i === idx ? { ...r, [field]: v } : r);
    avkastningStore.saveRows(rows);
  }

  function setSvField(field: keyof AvkStartValues, val: string) {
    const v = field === 'year' ? parseInt(val) || sv.year : parseFloat(val) || 0;
    sv = { ...sv, [field]: v };
    avkastningStore.saveStart(sv);
  }

  function onStorage(e: StorageEvent) {
    if (e.key?.startsWith('vek_fire_')) { /* antaget uppdateras via $derived */ }
  }

  onMount(async () => {
    await initAuth();
    renderTopnav('avkastning.html');
    injectInfoBtn(INFO.avkastning.title, INFO.avkastning.sections);
    initSyncWidget();
    window.addEventListener('storage', onStorage);
  });

  onDestroy(() => {
    pctChart?.destroy();
    krChart?.destroy();
    window.removeEventListener('storage', onStorage);
  });

  let sorted = $derived(rows.slice().sort((a, b) => a.year - b.year));
</script>

<svelte:head><title>Avkastning — Verdu Ekonomi</title></svelte:head>

<div class="page">
  <nav class="topnav" id="topnav"></nav>

  <h1>📈 Avkastning</h1>
  <p class="subtitle">Faktisk avkastning per år · Jämförelse mot antagen avkastning · Kr-simulation</p>

  <!-- KPI-rad -->
  <div class="kpi-bar" style="margin-bottom:24px">
    <div class="kpi">
      <div class="kpi-label">Lysa CAGR</div>
      <div class="kpi-value" style:color={colorForPct(cL, antaget)}>{fmtPct(cL)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">TjP Sverige CAGR</div>
      <div class="kpi-value" style:color={colorForPct(cS, antaget)}>{fmtPct(cS)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">TjP Norge CAGR</div>
      <div class="kpi-value" style:color={colorForPct(cN, antaget)}>{fmtPct(cN)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Antaget</div>
      <div class="kpi-value">{antaget.toFixed(1)} %</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Lysa vs antaget</div>
      <div class="kpi-value" style:color={diff === null ? 'var(--muted)' : diff >= 0 ? 'var(--green)' : 'var(--red)'}>
        {diff !== null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} %` : '—'}
      </div>
    </div>
    {#if krRows.length > 0}
      {@const last = krRows[krRows.length - 1]}
      <div class="kpi">
        <div class="kpi-label">Lysa faktiskt</div>
        <div class="kpi-value" style:color={last.lysaEnd >= last.lysaSimEnd ? 'var(--green)' : 'var(--orange)'}>{fmtM(last.lysaEnd)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Lysa simulerat</div>
        <div class="kpi-value">{fmtM(last.lysaSimEnd)}</div>
      </div>
    {/if}
  </div>

  <!-- % Chart -->
  <div class="card" style="margin-bottom:24px">
    <h3 style="margin-top:0">Årsavkastning (%)</h3>
    {#if rows.length === 0}
      <p style="color:var(--muted);text-align:center;padding:32px 0">Lägg till år för att se diagram.</p>
    {:else}
      <canvas bind:this={pctCanvas} height="220"></canvas>
    {/if}
  </div>

  <!-- % Tabell -->
  <div class="card" style="overflow-x:auto;margin-bottom:24px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0">Avkastning per år</h3>
      <button class="btn btn-secondary" onclick={addRow}>+ Lägg till år</button>
    </div>
    {#if rows.length === 0}
      <p style="color:var(--muted);text-align:center;padding:24px 0">Inga rader. Klicka "+ Lägg till år".</p>
    {:else}
      <table style="width:100%;border-collapse:collapse;font-size:.88rem">
        <thead><tr style="color:var(--muted);font-size:.72rem;text-transform:uppercase">
          <th style="text-align:left;padding:6px 8px">År</th>
          <th style="text-align:right;padding:6px 8px;color:#4f8ef7">Lysa %</th>
          <th style="text-align:right;padding:6px 8px;color:#6ee7b7">TjP Sverige %</th>
          <th style="text-align:right;padding:6px 8px;color:#f87171">TjP Norge %</th>
          <th style="text-align:right;padding:6px 8px">Lysa vs antaget</th>
          <th style="padding:6px 8px"></th>
        </tr></thead>
        <tbody>
          {#each sorted as row}
            {@const realIdx = rows.indexOf(row)}
            {@const diffVal = row.lysaPct !== null ? row.lysaPct - antaget : null}
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:9px 10px;font-weight:700">{row.year}</td>
              <td style="text-align:right;padding:9px 10px">
                <input type="number" step="0.1" placeholder="—" value={row.lysaPct !== null ? row.lysaPct : ''}
                       style="width:80px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:{colorForPct(row.lysaPct, antaget)};font-size:.88rem;padding:4px 8px;text-align:right;font-weight:600"
                       onchange={e => setField(realIdx, 'lysaPct', (e.target as HTMLInputElement).value)} />
              </td>
              <td style="text-align:right;padding:9px 10px">
                <input type="number" step="0.1" placeholder="—" value={row.tjpSvePct !== null ? row.tjpSvePct : ''}
                       style="width:80px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:{colorForPct(row.tjpSvePct, antaget)};font-size:.88rem;padding:4px 8px;text-align:right;font-weight:600"
                       onchange={e => setField(realIdx, 'tjpSvePct', (e.target as HTMLInputElement).value)} />
              </td>
              <td style="text-align:right;padding:9px 10px">
                <input type="number" step="0.1" placeholder="—" value={row.tjpNorPct !== null ? row.tjpNorPct : ''}
                       style="width:80px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:{colorForPct(row.tjpNorPct, antaget)};font-size:.88rem;padding:4px 8px;text-align:right;font-weight:600"
                       onchange={e => setField(realIdx, 'tjpNorPct', (e.target as HTMLInputElement).value)} />
              </td>
              <td style="text-align:right;padding:9px 10px;font-weight:700;color:{diffVal === null ? 'var(--muted)' : diffVal >= 0 ? 'var(--green)' : 'var(--red)'}">
                {diffVal !== null ? `${diffVal >= 0 ? '+' : ''}${diffVal.toFixed(1)} %` : '—'}
              </td>
              <td style="padding:9px 10px;text-align:right">
                <button class="btn-del" onclick={() => delRow(realIdx)}>✕</button>
              </td>
            </tr>
          {/each}
          <!-- CAGR-rad -->
          {#if rows.length > 0}
            <tr style="border-top:2px solid var(--border);background:var(--card)">
              <td style="padding:9px 10px;font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">CAGR</td>
              <td style="text-align:right;padding:9px 10px;font-weight:700;color:#4f8ef7">{fmtPct(cL)}</td>
              <td style="text-align:right;padding:9px 10px;font-weight:700;color:#6ee7b7">{fmtPct(cS)}</td>
              <td style="text-align:right;padding:9px 10px;font-weight:700;color:#f87171">{fmtPct(cN)}</td>
              <td style="text-align:right;padding:9px 10px;font-weight:700;color:{diff === null ? 'var(--muted)' : diff >= 0 ? 'var(--green)' : 'var(--red)'}">
                {diff !== null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} %` : '—'}
              </td>
              <td></td>
            </tr>
          {/if}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- Startvärden -->
  <div class="card" style="margin-bottom:24px">
    <h3 style="margin-top:0">Startvärden (kr)</h3>
    <div class="form-grid">
      <div class="form-row">
        <label>Startår</label>
        <input type="number" step="1" style="width:100px" value={sv.year} onchange={e => setSvField('year', (e.target as HTMLInputElement).value)} />
      </div>
      <div class="form-row">
        <label>Lysa (kr)</label>
        <input type="number" step="1000" style="width:140px" value={sv.lysaKr || ''} onchange={e => setSvField('lysaKr', (e.target as HTMLInputElement).value)} />
      </div>
      <div class="form-row">
        <label>TjP Sverige (kr)</label>
        <input type="number" step="1000" style="width:140px" value={sv.tjpSveKr || ''} onchange={e => setSvField('tjpSveKr', (e.target as HTMLInputElement).value)} />
      </div>
      <div class="form-row">
        <label>TjP Norge (kr)</label>
        <input type="number" step="1000" style="width:140px" value={sv.tjpNorKr || ''} onchange={e => setSvField('tjpNorKr', (e.target as HTMLInputElement).value)} />
      </div>
    </div>
  </div>

  <!-- Kr-simulation -->
  {#if krRows.length > 0}
    <h2>Kr-simulation</h2>
    <div class="card" style="margin-bottom:24px">
      <canvas bind:this={krCanvas} height="240"></canvas>
    </div>

    <div class="card" style="overflow-x:auto;margin-bottom:32px">
      <table style="width:100%;border-collapse:collapse;font-size:.88rem">
        <thead><tr style="color:var(--muted);font-size:.72rem;text-transform:uppercase">
          <th style="text-align:left;padding:6px 10px">År</th>
          <th style="text-align:right;padding:6px 10px">Lysa start</th>
          <th style="text-align:right;padding:6px 10px">Avkastning kr</th>
          <th style="text-align:right;padding:6px 10px;color:#4f8ef7">Lysa slut</th>
          <th style="text-align:right;padding:6px 10px;color:#6ee7b7">TjP Sverige</th>
          <th style="text-align:right;padding:6px 10px;color:#f87171">TjP Norge</th>
          <th style="text-align:right;padding:6px 10px;color:var(--accent2)">Totalt</th>
        </tr></thead>
        <tbody>
          {#each krRows as r}
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:9px 10px;font-weight:700">{r.year}</td>
              <td style="text-align:right;padding:9px 10px;color:var(--muted)">{fmtKr(r.lysaStart)}</td>
              <td style="text-align:right;padding:9px 10px;font-weight:700;color:{r.lysaAvkKr >= 0 ? 'var(--green)' : 'var(--red)'}">{fmtKrS(r.lysaAvkKr)}</td>
              <td style="text-align:right;padding:9px 10px;color:#4f8ef7">{fmtKr(r.lysaEnd)}</td>
              <td style="text-align:right;padding:9px 10px;color:#6ee7b7">{fmtKr(r.tjpSveEnd)}</td>
              <td style="text-align:right;padding:9px 10px;color:#f87171">{fmtKr(r.tjpNorEnd)}</td>
              <td style="text-align:right;padding:9px 10px;font-weight:700;color:var(--accent2)">{fmtKr(r.total)}</td>
            </tr>
          {/each}
          <!-- Summerad diff-rad -->
          {#if krRows.length > 0}
            {@const last = krRows[krRows.length - 1]}
            {@const d = last.total - last.totalSim}
            <tr style="border-top:2px solid var(--border);background:var(--card)">
              <td colspan="5" style="padding:9px 10px;font-size:.75rem;color:var(--muted);text-transform:uppercase">Faktisk vs simulerad (senaste år)</td>
              <td style="text-align:right;padding:9px 10px;color:var(--muted);font-size:.82rem">Simulerat: {fmtKr(last.totalSim)}</td>
              <td style="text-align:right;padding:9px 10px;font-weight:700;color:{d >= 0 ? 'var(--green)' : 'var(--red)'}">{d >= 0 ? '+' : ''}{fmtKr(d)}</td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  {/if}

  <footer>Avkastning · Verdu Ekonomi</footer>
</div>
