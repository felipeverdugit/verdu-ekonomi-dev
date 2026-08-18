<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js';
  import { initAuth } from '../auth';
  import { computeFire, incomeTax } from '../calculations';
  import { ekStore, fireStore } from '../store';
  import { renderTopnav, injectInfoBtn } from '../nav';
  import { INFO } from '../infoContent';
  import { PEOPLE } from '../constants';

  Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

  // ── Typer ─────────────────────────────────────────────────────────────────────
  type Row = {
    year: number;
    fGrossAnn: number; fTax30: number; fTaxProg: number;
    uGrossAnn: number; uTax30: number; uTaxProg: number;
  };

  // ── Compute ───────────────────────────────────────────────────────────────────
  function compute() {
    const ek         = ekStore.get();
    const s          = fireStore.get();
    const r          = computeFire(ek, s);
    const flatRate   = s.skattPct / 100;
    const skattFak   = 1 - flatRate;
    const fBorn      = PEOPLE.felipe.born;
    const uBorn      = PEOPLE.ulrika.born;
    const END_YEAR   = Math.min(r.fireYear + 40, 2075);
    const rows: Row[] = [];

    for (let yr = r.fireYear; yr <= END_YEAR; yr++) {
      const fNet = r.pensions.filter(p => p.who === 'f' && yr >= p.fromYear && yr <= p.toYear).reduce((s, p) => s + p.monthly, 0);
      const uNet = r.pensions.filter(p => p.who === 'u' && yr >= p.fromYear && yr <= p.toYear).reduce((s, p) => s + p.monthly, 0);
      if (fNet === 0 && uNet === 0) continue;
      const fGrossAnn = Math.round(fNet / skattFak) * 12;
      const uGrossAnn = Math.round(uNet / skattFak) * 12;
      rows.push({
        year: yr, fGrossAnn,
        fTax30:   Math.round(fGrossAnn * flatRate),
        fTaxProg: incomeTax(fGrossAnn, (yr - fBorn) >= 65),
        uGrossAnn,
        uTax30:   Math.round(uGrossAnn * flatRate),
        uTaxProg: incomeTax(uGrossAnn, (yr - uBorn) >= 65),
      });
    }

    const totFlat  = rows.reduce((s, r) => s + r.fTax30 + r.uTax30, 0);
    const totProg  = rows.reduce((s, r) => s + r.fTaxProg + r.uTaxProg, 0);
    const saving   = totFlat - totProg;
    const fPeakPct = Math.max(...rows.map(r => r.fGrossAnn > 0 ? r.fTaxProg / r.fGrossAnn * 100 : 0));
    const uPeakPct = Math.max(...rows.map(r => r.uGrossAnn > 0 ? r.uTaxProg / r.uGrossAnn * 100 : 0));
    const iskAr1   = Math.round(r.iskKapital * r.iskPct / 100);
    const iskLbl   = `${r.iskPct.toFixed(2)} % × ${fmtM(r.iskKapital)} ISK`;
    return { rows, totFlat, totProg, saving, fPeakPct, uPeakPct, iskAr1, iskLbl, skattPct: s.skattPct };
  }

  // ── Formatering ───────────────────────────────────────────────────────────────
  const fmt  = (n: number) => Math.round(n).toLocaleString('sv-SE') + ' kr';
  const fmtM = (n: number) => (Math.abs(n) / 1e6).toFixed(2) + ' MSEK';
  const pct  = (n: number) => n.toFixed(1) + ' %';

  // ── State ─────────────────────────────────────────────────────────────────────
  let data = $state(compute());

  // ── Canvas ────────────────────────────────────────────────────────────────────
  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  function buildChart() {
    if (!canvas) return;
    if (chart) chart.destroy();
    const { rows, skattPct } = data;
    const labels  = rows.map(r => String(r.year));
    const fEffArr = rows.map(r => r.fGrossAnn > 0 ? +(r.fTaxProg / r.fGrossAnn * 100).toFixed(1) : 0);
    const uEffArr = rows.map(r => r.uGrossAnn > 0 ? +(r.uTaxProg / r.uGrossAnn * 100).toFixed(1) : 0);
    const flat30  = rows.map(() => skattPct);
    chart = new Chart(canvas.getContext('2d')!, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Felipe eff. %',  data: fEffArr, borderColor: '#6ee7b7', backgroundColor: 'transparent', tension: 0.3, pointRadius: 3 },
          { label: 'Ulrika eff. %',  data: uEffArr, borderColor: '#a78bfa', backgroundColor: 'transparent', tension: 0.3, pointRadius: 3 },
          { label: `Schablonmässig ${skattPct} %`, data: flat30, borderColor: '#f87171', backgroundColor: 'transparent', borderDash: [5, 5], pointRadius: 0 },
        ],
      },
      options: {
        scales: {
          x: { grid: { color: '#2d3348' }, ticks: { color: '#8892a4', maxTicksLimit: 12 } },
          y: { grid: { color: '#2d3348' }, ticks: { color: '#8892a4', callback: v => `${v} %` }, min: 0, max: 50 },
        },
        plugins: { legend: { labels: { color: '#8892a4' } } },
      },
    });
  }

  $effect(() => {
    // Reaktiv: bygg om chart när data ändras
    void data;
    buildChart();
  });

  onMount(async () => {
    await initAuth();
    renderTopnav('skatt.html');
    injectInfoBtn(INFO.skatt.title, INFO.skatt.sections);
    buildChart();
    window.addEventListener('storage', onStorage);
  });

  onDestroy(() => {
    chart?.destroy();
    window.removeEventListener('storage', onStorage);
  });

  function onStorage(e: StorageEvent) {
    if (e.key?.startsWith('vek_')) data = compute();
  }
</script>

<svelte:head><title>Skatt-optimering — Verdu Ekonomi</title></svelte:head>

<div class="page">
  <nav class="topnav" id="topnav"></nav>

  <h1>🧾 Skatt-optimering</h1>
  <p class="subtitle">Progressiv skatt per person vs. schablonmässig 30 % · Förhöjt grundavdrag 65+ · Kommunalskatt 31 % · Statlig skatt &gt;615 300 kr/år</p>

  <div class="kpi-bar">
    <div class="kpi"><div class="kpi-label">Skatt (flat 30 %)</div><div class="kpi-value red">{fmtM(data.totFlat)}</div><div style="font-size:.7rem;color:var(--muted)">totalt over bryggperioden</div></div>
    <div class="kpi"><div class="kpi-label">Skatt (progressiv)</div><div class="kpi-value">{fmtM(data.totProg)}</div><div style="font-size:.7rem;color:var(--muted)">totalt over bryggperioden</div></div>
    <div class="kpi">
      <div class="kpi-label">Besparing vs 30 %</div>
      <div class="kpi-value" style:color={data.saving >= 0 ? 'var(--green)' : 'var(--red)'}>{(data.saving >= 0 ? '+' : '') + fmtM(data.saving)}</div>
    </div>
    <div class="kpi"><div class="kpi-label">Peak effektiv skatt Felipe</div><div class="kpi-value orange">{pct(data.fPeakPct)}</div></div>
    <div class="kpi"><div class="kpi-label">Peak effektiv skatt Ulrika</div><div class="kpi-value" style="color:var(--accent2)">{pct(data.uPeakPct)}</div></div>
    <div class="kpi">
      <div class="kpi-label">ISK-skatt år 1 (Lysa)</div>
      <div class="kpi-value orange">{fmt(data.iskAr1)}</div>
      <div style="font-size:.7rem;color:var(--muted)">{data.iskLbl}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px">
    <div class="card">
      <h3 style="margin-top:0">Effektiv skattesats per år</h3>
      <canvas bind:this={canvas} height="220"></canvas>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Modellens antaganden</h3>
      <ul style="font-size:.85rem;line-height:1.8;color:var(--muted);padding-left:1.2em">
        <li>Pensionärsavdrag (65+): förhöjt grundavdrag approximerat per SKV 2024</li>
        <li>Under 65 år: litet grundavdrag (~13 900 kr), högre effektiv skatt</li>
        <li>Kommunalskatt: 31 % (riksgenomsnitt)</li>
        <li>Statlig inkomstskatt: 20 % på inkomst &gt;615 300 kr/år</li>
        <li>Norsk pension (NAV/TjP-NO) approximeras med samma formel — i verkligheten beskattas dessa i Norge (~22 %)</li>
        <li>Modellen är en approximation — exakt skatt beror på folkbokföringskommun, avdrag och deklaration</li>
      </ul>
    </div>
  </div>

  <div class="card" style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead>
        <tr style="color:var(--muted);text-transform:uppercase;font-size:.68rem;letter-spacing:.06em">
          <th style="text-align:left;padding:6px 8px">År</th>
          <th style="text-align:right;padding:6px 8px" colspan="4">Felipe</th>
          <th style="text-align:right;padding:6px 8px" colspan="4">Ulrika</th>
          <th style="text-align:right;padding:6px 8px">Besparing/år</th>
        </tr>
        <tr style="color:var(--muted);font-size:.7rem">
          <th style="padding:4px 8px"></th>
          <th style="text-align:right;padding:4px 6px">Brutto/mån</th>
          <th style="text-align:right;padding:4px 6px">Skatt 30%</th>
          <th style="text-align:right;padding:4px 6px">Skatt prog.</th>
          <th style="text-align:right;padding:4px 6px;color:var(--accent)">Eff. %</th>
          <th style="text-align:right;padding:4px 6px">Brutto/mån</th>
          <th style="text-align:right;padding:4px 6px">Skatt 30%</th>
          <th style="text-align:right;padding:4px 6px">Skatt prog.</th>
          <th style="text-align:right;padding:4px 6px;color:var(--accent2)">Eff. %</th>
          <th style="text-align:right;padding:4px 6px;color:var(--green)">kr/år</th>
        </tr>
      </thead>
      <tbody>
        {#each data.rows as row}
          {@const saving = (row.fTax30 + row.uTax30) - (row.fTaxProg + row.uTaxProg)}
          {@const fEff   = row.fGrossAnn > 0 ? row.fTaxProg / row.fGrossAnn * 100 : 0}
          {@const uEff   = row.uGrossAnn > 0 ? row.uTaxProg / row.uGrossAnn * 100 : 0}
          <tr style="border-top:1px solid #2d3348">
            <td style="padding:5px 8px;color:var(--muted)">{row.year}</td>
            <td style="text-align:right;padding:5px 6px">{fmt(Math.round(row.fGrossAnn / 12))}</td>
            <td style="text-align:right;padding:5px 6px;color:var(--red)">{fmt(Math.round(row.fTax30 / 12))}</td>
            <td style="text-align:right;padding:5px 6px;color:var(--orange)">{fmt(Math.round(row.fTaxProg / 12))}</td>
            <td style="text-align:right;padding:5px 6px;color:var(--accent)">{pct(fEff)}</td>
            <td style="text-align:right;padding:5px 6px">{fmt(Math.round(row.uGrossAnn / 12))}</td>
            <td style="text-align:right;padding:5px 6px;color:var(--red)">{fmt(Math.round(row.uTax30 / 12))}</td>
            <td style="text-align:right;padding:5px 6px;color:var(--orange)">{fmt(Math.round(row.uTaxProg / 12))}</td>
            <td style="text-align:right;padding:5px 6px;color:var(--accent2)">{pct(uEff)}</td>
            <td style="text-align:right;padding:5px 6px">
              {#if saving >= 0}
                <span style="color:var(--green)">+{fmt(saving)}</span>
              {:else}
                <span style="color:var(--red)">{fmt(saving)}</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
