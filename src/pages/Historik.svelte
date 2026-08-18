<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    Chart, LineController, CategoryScale, LinearScale,
    PointElement, LineElement, Legend, Tooltip,
  } from 'chart.js';
  import { initAuth } from '../auth';
  import { historikStore, ekStore } from '../store';
  import type { Snapshot, EkonomiData } from '../types';
  import { renderTopnav, injectInfoBtn } from '../nav';
  import { INFO } from '../infoContent';

  Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Legend, Tooltip);

  // ── Hjälp ─────────────────────────────────────────────────────────────────────
  const fmtKr = (n: number) => Math.round(n).toLocaleString('sv-SE') + ' kr';
  const fmtM  = (n: number) => (n / 1e6).toFixed(2) + ' MSEK';

  function buildSnapshot(ek: EkonomiData): Snapshot {
    const nokSek = ek.nok_sek || 0.97;
    const fonder = ek.lysa_f_pv + ek.lysa_u_pv + ek.buffert_u_pv + ek.sparkonto_pv;
    const tjp    = ek.tjp_f_pv + ek.lonevxl_pv + ek.tidigare_pv + ek.kapan_pv + ek.tjp_u_pv;
    const norge  = ek.norge_f_pv + ek.dnb_f_pv + ek.sb_f_pv + ek.sb_u_pv + ek.dnb_u_pv;
    const allman = ek.ap_f + ek.pp_f + ek.ap_u + ek.pp_u + (ek.nav_f_nok + ek.nav_u_nok) * nokSek;
    const aktier = ek.norco_antal * ek.norco_kurs + ek.oncop_antal * ek.oncop_kurs;
    const totalt = fonder + tjp + norge + allman + aktier;
    return { date: new Date().toISOString().slice(0, 10), fonder, tjp, norge, allman, aktier, totalt };
  }

  function computeSparAr(ek: EkonomiData): number {
    const monthly = ek.lysa_f_pmt + ek.lysa_u_pmt + ek.buffert_u_pmt + ek.sparkonto_pmt;
    const fromQ   = (ek.tjp_f_pmt_q + ek.tjp_u_pmt_q) * 4;
    return monthly * 12 + fromQ;
  }

  // ── State ─────────────────────────────────────────────────────────────────────
  let snaps    = $state<Snapshot[]>([]);
  let saveMsg  = $state('');

  function loadSnaps() {
    snaps = historikStore.load();
  }

  function showMsg(text: string, ms = 3500) {
    saveMsg = text;
    setTimeout(() => saveMsg = '', ms);
  }

  function saveSnapshot() {
    const snap = buildSnapshot(ekStore.get());
    historikStore.add(snap);
    showMsg(`✓ Snapshot sparad ${snap.date}`);
    loadSnaps();
  }

  function importOld() {
    const count = historikStore.importFromOld();
    showMsg(count === 0
      ? 'Inget nytt att importera — alla datum finns redan.'
      : `✓ Importerade ${count} snapshot${count !== 1 ? 's' : ''} från gamla systemet.`, 4000);
    loadSnaps();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(snaps, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `historik-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  function removeSnap(idx: number) {
    historikStore.remove(idx);
    loadSnaps();
  }

  // ── Prognos-data ──────────────────────────────────────────────────────────────
  interface PrognosRow { lbl: string; medSpar: number; utanSpar: number; fireLine: number }

  let prognosData = $derived.by<{ rows: PrognosRow[]; V0: number; sparAr: number; fireNum: number } | null>(() => {
    if (snaps.length === 0) return null;
    const ek      = ekStore.get();
    const last    = snaps[snaps.length - 1];
    const V0      = last.totalt;
    const r       = 0.07;
    const sparAr  = computeSparAr(ek);
    const fireNum = ek.levnadskostnad * 12 / 0.04;
    const startY  = parseInt(last.date.slice(0, 4));
    const rows: PrognosRow[] = [];
    for (let y = startY; y <= 2038; y++) {
      const t = y - startY;
      const vBase = V0 * Math.pow(1 + r, t);
      rows.push({
        lbl:      y.toString(),
        medSpar:  Math.round(sparAr > 0 ? V0 * Math.pow(1+r,t) + sparAr * (Math.pow(1+r,t) - 1) / r : vBase),
        utanSpar: Math.round(vBase),
        fireLine: fireNum,
      });
    }
    return { rows, V0, sparAr, fireNum };
  });

  // ── Charts ────────────────────────────────────────────────────────────────────
  let histCanvas:    HTMLCanvasElement;
  let prognosCanvas: HTMLCanvasElement;
  let chartInst:     Chart | null = null;
  let prognosInst:   Chart | null = null;

  const FIRE_YEARS = new Set(['2035', '2037']);

  function buildHistChart() {
    if (!histCanvas || snaps.length === 0) return;
    if (chartInst) chartInst.destroy();
    const labels   = snaps.map(s => s.date);
    const datasets = [
      { label: 'Privata fonder', data: snaps.map(s => s.fonder),  borderColor: '#4f8ef7', tension: 0.3, fill: false, pointRadius: 4 },
      { label: 'TjP & LöneVXL', data: snaps.map(s => s.tjp),     borderColor: '#6ee7b7', tension: 0.3, fill: false, pointRadius: 4 },
      { label: 'TjP Norge',      data: snaps.map(s => s.norge),   borderColor: '#f87171', tension: 0.3, fill: false, pointRadius: 4 },
      { label: 'Allmänpension',  data: snaps.map(s => s.allman),  borderColor: '#22d3ee', tension: 0.3, fill: false, pointRadius: 4 },
      { label: 'Aktier',         data: snaps.map(s => s.aktier),  borderColor: '#f59e0b', tension: 0.3, fill: false, pointRadius: 4 },
      { label: 'Totalt',         data: snaps.map(s => s.totalt),  borderColor: '#a78bfa', tension: 0.3, fill: false, pointRadius: 5, borderWidth: 3 },
    ];
    chartInst = new Chart(histCanvas.getContext('2d')!, {
      type: 'line', data: { labels, datasets: datasets as never },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#e2e8f0', boxWidth: 14 } },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${Math.round(c.parsed.y as number).toLocaleString('sv-SE')} kr` } },
        },
        scales: {
          x: { ticks: { color: '#8892a4' }, grid: { color: '#2d3348' } },
          y: { ticks: { color: '#8892a4', callback: v => (Number(v) / 1e6).toFixed(1) + ' M' }, grid: { color: '#2d3348' } },
        },
      },
    });
  }

  function buildPrognosChart() {
    if (!prognosCanvas || !prognosData) return;
    if (prognosInst) prognosInst.destroy();
    const { rows } = prognosData;
    const labels   = rows.map(r => r.lbl);
    const ptR  = (l: string, base: number) => FIRE_YEARS.has(l) ? 9 : base;
    const ptC  = (l: string, def: string)  => FIRE_YEARS.has(l) ? '#a78bfa' : def;
    const datasets = [
      { label: 'Med löpande insättningar', data: rows.map(r => r.medSpar), borderColor: '#6ee7b7', tension: 0.35, fill: false, pointRadius: labels.map(l => ptR(l, 3)), pointBackgroundColor: labels.map(l => ptC(l, '#6ee7b7')), pointBorderColor: labels.map(l => ptC(l, '#6ee7b7')) },
      { label: 'Enbart avkastning (inga insättningar)', data: rows.map(r => r.utanSpar), borderColor: '#4f8ef7', borderDash: [7, 4], tension: 0.35, fill: false, pointRadius: labels.map(l => ptR(l, 2)), pointBackgroundColor: labels.map(l => ptC(l, '#4f8ef7')), pointBorderColor: labels.map(l => ptC(l, '#4f8ef7')) },
      { label: 'FIRE-mål', data: rows.map(r => r.fireLine), borderColor: '#f59e0b', borderDash: [3, 4], borderWidth: 1.5, tension: 0, fill: false, pointRadius: 0 },
    ] as never;
    prognosInst = new Chart(prognosCanvas.getContext('2d')!, {
      type: 'line', data: { labels, datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#e2e8f0', boxWidth: 14 } },
          tooltip: { callbacks: { label: (c: { dataset: { label?: string }; parsed: { y: number | null } }) => ` ${c.dataset.label ?? ''}: ${fmtM(c.parsed.y ?? 0)}` } },
        },
        scales: {
          x: { ticks: { color: '#8892a4' }, grid: { color: '#2d3348' } },
          y: { ticks: { color: '#8892a4', callback: (v: unknown) => (Number(v) / 1e6).toFixed(1) + ' M' }, grid: { color: '#2d3348' } },
        },
      },
    });
  }

  $effect(() => {
    void snaps;
    buildHistChart();
    buildPrognosChart();
  });

  // ── Seed ─────────────────────────────────────────────────────────────────────
  function seedIfEmpty() {
    if (historikStore.load().length > 0) return;
    const seed: Snapshot[] = [
      { date: '2026-06-20', fonder:  792699, tjp: 1071468, norge: 1577015, allman: 6491440, aktier: 912368, totalt: 10844990 },
      { date: '2026-06-30', fonder:  864894, tjp: 1120827, norge: 1607916, allman: 6538328, aktier: 849615, totalt: 10981580 },
      { date: '2026-07-05', fonder:  865594, tjp: 1120827, norge: 1589199, allman: 6538328, aktier: 904104, totalt: 11018052 },
      { date: '2026-07-16', fonder: 1038372, tjp: 1142699, norge: 1595079, allman: 6533081, aktier: 873961, totalt: 11183192 },
      { date: '2026-07-18', fonder: 1038372, tjp: 1142699, norge: 1595079, allman: 6533081, aktier: 878687, totalt: 11187918 },
      { date: '2026-07-28', fonder: 1087268, tjp: 1142699, norge: 1595079, allman: 6533081, aktier: 874857, totalt: 11232984 },
    ];
    historikStore.save(seed);
  }

  onMount(async () => {
    await initAuth();
    renderTopnav('historik.html');
    injectInfoBtn(INFO.historik.title, INFO.historik.sections);
    seedIfEmpty();
    loadSnaps();
  });

  onDestroy(() => {
    chartInst?.destroy();
    prognosInst?.destroy();
  });
</script>

<svelte:head><title>Historik — Verdu Ekonomi</title></svelte:head>

<div class="page">
  <nav class="topnav" id="topnav"></nav>

  <h1>📊 Historik</h1>
  <p class="subtitle">Spara snapshot av nuläget · Se trenden över tid · Jämför mot prognos.</p>

  <!-- Knappar -->
  <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;align-items:center">
    <button class="btn btn-primary" onclick={saveSnapshot}>📸 Spara snapshot idag</button>
    <button class="btn btn-secondary" onclick={importOld}>⬆ Importera gamla snapshots</button>
    <button class="btn btn-secondary" onclick={exportJson}>⬇ Exportera JSON</button>
    {#if saveMsg}<span style="color:var(--green);font-size:.85rem">{saveMsg}</span>{/if}
  </div>

  <!-- Historik-chart -->
  <div class="card" style="margin-bottom:24px">
    <h3 style="margin-top:0">Tillgångsutveckling</h3>
    {#if snaps.length === 0}
      <p style="color:var(--muted);text-align:center;padding:40px 0">Inga snapshots sparade än.</p>
    {:else}
      <canvas bind:this={histCanvas} height="280"></canvas>
    {/if}
  </div>

  <!-- Prognos-chart -->
  {#if prognosData}
    <div class="card" style="margin-bottom:24px">
      <h3 style="margin-top:0">Prognos till 2038 (7 %/år)</h3>
      <div style="font-size:.82rem;color:var(--muted);margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap">
        <span>Startkapital: <strong>{fmtM(prognosData.V0)}</strong></span>
        <span>Årsparande: <strong>{prognosData.sparAr ? Math.round(prognosData.sparAr).toLocaleString('sv-SE') + ' kr' : '—'}</strong></span>
        <span>FIRE-mål: <strong>{fmtM(prognosData.fireNum)}</strong></span>
      </div>
      <canvas bind:this={prognosCanvas} height="260"></canvas>
    </div>
  {/if}

  <!-- Tabell -->
  <div class="card" style="overflow-x:auto;margin-bottom:32px">
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead><tr style="color:var(--muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.06em">
        <th style="text-align:left;padding:6px 8px">Datum</th>
        <th style="text-align:right;padding:6px 8px" class="col-fonder">Fonder</th>
        <th style="text-align:right;padding:6px 8px" class="col-tjp">TjP</th>
        <th style="text-align:right;padding:6px 8px" class="col-norge">TjP Norge</th>
        <th style="text-align:right;padding:6px 8px" class="col-allman">Allmänpension</th>
        <th style="text-align:right;padding:6px 8px" class="col-aktier">Aktier</th>
        <th style="text-align:right;padding:6px 8px" class="col-totalt">Totalt</th>
        <th style="text-align:right;padding:6px 8px" class="col-delta">Δ</th>
        <th style="padding:6px 8px"></th>
      </tr></thead>
      <tbody>
        {#each snaps as snap, i}
          {@const prev  = i > 0 ? snaps[i - 1] : null}
          {@const delta = prev !== null ? snap.totalt - prev.totalt : null}
          <tr>
            <td class="text-muted" style="padding:6px 8px">{snap.date}</td>
            <td class="col-fonder" style="text-align:right;padding:6px 8px">{fmtKr(snap.fonder)}</td>
            <td class="col-tjp"    style="text-align:right;padding:6px 8px">{fmtKr(snap.tjp)}</td>
            <td class="col-norge"  style="text-align:right;padding:6px 8px">{fmtKr(snap.norge)}</td>
            <td class="col-allman" style="text-align:right;padding:6px 8px">{fmtKr(snap.allman)}</td>
            <td class="col-aktier" style="text-align:right;padding:6px 8px">{fmtKr(snap.aktier)}</td>
            <td class="col-totalt" style="text-align:right;padding:6px 8px">{fmtM(snap.totalt)}</td>
            <td class="col-delta"  style="text-align:right;padding:6px 8px">
              {#if delta === null}
                <span class="text-muted">—</span>
              {:else if delta >= 0}
                <span style="color:var(--green)">+{fmtKr(delta)}</span>
              {:else}
                <span style="color:var(--red)">{fmtKr(delta)}</span>
              {/if}
            </td>
            <td style="padding:6px 8px">
              <button class="btn-del" onclick={() => removeSnap(i)}>✕</button>
            </td>
          </tr>
        {/each}
        {#if snaps.length === 0}
          <tr><td colspan="9" class="empty" style="text-align:center;padding:32px;color:var(--muted)">Inga snapshots sparade än.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>

  <footer>Historik · Verdu Ekonomi</footer>
</div>
