<script lang="ts">
  import Topnav from '../components/Topnav.svelte';
  import { onMount, onDestroy } from 'svelte';
  import {
    Chart, LineController, LineElement, PointElement,
    LinearScale, CategoryScale, Tooltip, Legend, Filler,
  } from 'chart.js';
  import { initAuth } from '../auth';
  import { computeFire, simulateUttag, incomeTax, STATLIG_GRANS } from '../calculations';
  import { ekStore, fireStore } from '../store';
  import { injectInfoBtn } from '../nav';
  import { CHART_DARK_GRID, CHART_DARK_TEXT } from '../constants';
  import { INFO } from '../infoContent';
  import type { PensionStream } from '../types';

  Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

  const STATLIG_MON = STATLIG_GRANS / 12;

  // ── Formatering ───────────────────────────────────────────────────────────────
  const fmt  = (n: number) => Math.round(n).toLocaleString('sv-SE') + ' kr';
  const fmtM = (n: number) => (n / 1e6).toFixed(2) + ' MSEK';
  const pct  = (n: number) => n.toFixed(1) + ' %';

  // ── State ─────────────────────────────────────────────────────────────────────
  let uttag = $state(ekStore.getField('levnadskostnad') || 0);

  // ── Computed ──────────────────────────────────────────────────────────────────
  type OptRow = { year: number; fNet: number; uNet: number; fGross: number; uGross: number; fTax: number; uTax: number; taxCur: number; taxOpt: number; saving: number };

  function computeAll() {
    const ek        = ekStore.get();
    const s         = fireStore.get();
    const r         = computeFire(ek, s);
    const skattFak  = 1 - s.skattPct / 100;
    const FELIPE    = 1975;
    const ULRIKA    = 1970;

    // Pension-tabell
    const pensions = r.pensions;

    // Skatteoptimering
    const optRows: OptRow[] = [];
    for (let yr = r.fireYear; yr <= 2080; yr++) {
      const fNet = pensions.filter(p => p.who === 'f' && yr >= p.fromYear && yr <= p.toYear).reduce((s, p) => s + p.monthly, 0);
      const uNet = pensions.filter(p => p.who === 'u' && yr >= p.fromYear && yr <= p.toYear).reduce((s, p) => s + p.monthly, 0);
      const fGross  = skattFak > 0 ? fNet / skattFak : 0;
      const uGross  = skattFak > 0 ? uNet / skattFak : 0;
      const fAge    = yr - FELIPE;
      const uAge    = yr - ULRIKA;
      const fTaxCur = incomeTax(fGross * 12, fAge >= 65) / 12;
      const uTaxCur = incomeTax(uGross * 12, uAge >= 65) / 12;
      const fTaxOpt = incomeTax(Math.min(fGross, STATLIG_MON) * 12, fAge >= 65) / 12;
      const uTaxOpt = incomeTax(Math.min(uGross, STATLIG_MON) * 12, uAge >= 65) / 12;
      optRows.push({ year: yr, fNet, uNet, fGross, uGross, fTax: fTaxCur, uTax: uTaxCur, taxCur: fTaxCur + uTaxCur, taxOpt: fTaxOpt + uTaxOpt, saving: (fTaxCur + uTaxCur) - (fTaxOpt + uTaxOpt) });
    }
    // Snabb-lookup: år → skattedata för detaljsimuleringen
    const taxByYear = new Map(optRows.map(o => [o.year, o]));

    // Simulering
    const uttag2   = ek.levnadskostnad2;
    const switchAr = ekStore.getField('exp_switch_ar');
    const sim      = simulateUttag(r.kapital, s.uttakAvkPct, r.fireYear, uttag, pensions, uttag2, switchAr);

    // Rekommendationsbullets
    const bullets: string[] = [];
    const skattPct  = s.skattPct;
    const firstYr   = optRows.length > 0 ? optRows[0].year : r.fireYear;
    const totalSav  = optRows.reduce((s, r) => s + r.saving * 12, 0);
    const fOver     = optRows.filter(r => r.fGross > STATLIG_MON);
    const uOver     = optRows.filter(r => r.uGross > STATLIG_MON);

    if (firstYr > r.fireYear) bullets.push(`✓ ${r.fireYear}–${firstYr - 1} (bryggafas): Inga pensioner aktiva — ta enbart ur ISK/Lysa. Noll inkomstskatt på uttagen.`);
    if (fOver.length > 0) bullets.push(`⚠ Felipe ${fOver[0].year}+: Pensionsinkomst ${fmt(Math.round(fOver[0].fGross))}/mån brutto → statlig skatt 20 % på överskott.`);
    if (uOver.length > 0) bullets.push(`⚠ Ulrika ${uOver[0].year}+: Pensionsinkomst ${fmt(Math.round(uOver[0].uGross))}/mån brutto → statlig skatt aktiveras.`);
    if (fOver.length === 0 && uOver.length === 0) bullets.push(`✓ Ingen av er når statlig skattegräns — progressiv skatt är lägre än schablon ${skattPct} %.`);
    if (totalSav > 1_000) bullets.push(`💡 Hypotetisk total besparing om pensionsinkomsten per person hålls under ${fmt(Math.round(STATLIG_MON))}/mån: ${fmtM(totalSav)}.`);
    else if (totalSav > 0) bullets.push(`💡 Progressiv skatt sparar ${fmtM(totalSav)} totalt vs schablon ${skattPct} % — ingen optimering krävs.`);

    return { r, pensions, optRows, taxByYear, sim, bullets, uttag2, switchAr };
  }

  let data = $state(computeAll());

  // ── Verdict ───────────────────────────────────────────────────────────────────
  let verdict = $derived(() => {
    const { sim, r } = data;
    if (sim.depletedYear && (!sim.pensionFullYear || sim.depletedYear < sim.pensionFullYear)) {
      const gap = sim.pensionFullYear ? ` (pensionerna täcker 100 % först ${sim.pensionFullYear})` : '';
      return { cls: 'verdict bad', text: `⚠ Bryggan räcker inte — kapitalet tar slut ${sim.depletedYear}${gap}.` };
    } else if (sim.pensionFullYear) {
      const bridgeYears = sim.pensionFullYear - r.fireYear;
      const capLeft = fmtM(sim.capitalAtBridge);
      return { cls: 'verdict ok', text: `✓ Pensionerna täcker 100 % av levnadskostnaden ${sim.pensionFullYear} (om ${bridgeYears} år) — kapital kvar: ${capLeft}.` };
    }
    return { cls: 'verdict warn', text: `~ Pensionerna täcker inte 100 % av levnadskostnaden — kapitalet behövs hela vägen.` };
  });

  // ── Chart ─────────────────────────────────────────────────────────────────────
  let chartCanvas = $state<HTMLCanvasElement>(null!);
  let chart: Chart | null = null;

  function buildChart() {
    if (!chartCanvas) return;
    if (chart) chart.destroy();
    const { sim, uttag2, switchAr, r } = data;
    const switchYear2   = switchAr > 0 && uttag2 > 0 ? r.fireYear + switchAr : 9999;
    const levnadLinje   = sim.rows.map(row => row.year >= switchYear2 ? uttag2 : uttag);
    chart = new Chart(chartCanvas.getContext('2d')!, {
      type: 'line',
      data: {
        labels: sim.rows.map(row => String(row.year)),
        datasets: [
          { label: 'Kapital (MSEK)', data: sim.rows.map(row => row.capital / 1e6), borderColor: '#4f8ef7', backgroundColor: '#4f8ef720', fill: true, tension: 0.3, pointRadius: 0, yAxisID: 'y' },
          { label: 'Pension/mån (kr)', data: sim.rows.map(row => row.pensionMon), borderColor: '#6ee7b7', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, yAxisID: 'y1' },
          { label: 'Levnadskostnad/mån (kr)', data: levnadLinje, borderColor: '#fb923c', backgroundColor: 'transparent', borderDash: [5, 3], tension: 0, pointRadius: 0, yAxisID: 'y1' },
        ],
      },
      options: {
        scales: {
          x:  { grid: { color: CHART_DARK_GRID }, ticks: { color: CHART_DARK_TEXT, maxTicksLimit: 10 } },
          y:  { grid: { color: CHART_DARK_GRID }, ticks: { color: CHART_DARK_TEXT, callback: v => `${v} M` }, position: 'left' },
          y1: { grid: { drawOnChartArea: false }, ticks: { color: '#6ee7b7', callback: v => `${Math.round(Number(v) / 1000)}k` }, position: 'right' },
        },
        plugins: { legend: { labels: { color: CHART_DARK_TEXT } } },
      },
    });
  }

  $effect(() => { void data; void chartCanvas; buildChart(); });

  function onStorage(e: StorageEvent) {
    if (e.key?.startsWith('vek_ek_') || e.key?.startsWith('vek_fire_')) data = computeAll();
  }

  onMount(async () => {
    requestAnimationFrame(() => buildChart());
    injectInfoBtn(INFO.uttag.title, INFO.uttag.sections);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', (e) => { if (e.persisted) data = computeAll(); });
    await initAuth();
  });

  onDestroy(() => {
    chart?.destroy();
    window.removeEventListener('storage', onStorage);
  });
</script>

<svelte:head><title>Uttagsstrategi — Verdu Ekonomi</title></svelte:head>

<div class="page">
  <Topnav active="uttag.html" />

  <h1>📤 Uttagsstrategi</h1>
  <p class="subtitle">Simulera hur länge kapitalet räcker · Skatteoptimering per år</p>

  <!-- Kapital-info -->
  <div class="kpi-bar" style="margin-bottom:24px">
    <div class="kpi"><div class="kpi-label">Fritt kapital vid FIRE</div><div class="kpi-value">{fmtM(data.r.kapital)}</div></div>
    <div class="kpi"><div class="kpi-label">Uttaksavkastning</div><div class="kpi-value">{pct(fireStore.get().uttakAvkPct)}</div></div>
    <div class="kpi"><div class="kpi-label">Brygga-startår</div><div class="kpi-value orange">{data.r.fireYear}</div></div>
    <div class="kpi"><div class="kpi-label">Månadsuttag</div><div class="kpi-value">{fmt(uttag)}</div></div>
  </div>

  <!-- Slider -->
  <div class="card" style="margin-bottom:24px">
    <div class="form-row">
      <label>Önskat månadsuttag</label>
      <div class="slider-row">
        <input type="range" min="0" max="100000" step="500" value={uttag}
               oninput={e => { uttag = parseFloat((e.target as HTMLInputElement).value) || 0; data = computeAll(); }} />
        <span class="val">{fmt(uttag)}/mån</span>
      </div>
    </div>
  </div>

  <!-- Pensionstabell -->
  <h2>Pensionsströmmar</h2>
  <div class="card" style="overflow-x:auto;margin-bottom:24px">
    <table style="width:100%;border-collapse:collapse;font-size:.88rem">
      <thead><tr style="color:var(--muted);font-size:.75rem">
        <th style="text-align:left;padding:6px 8px">Pension</th>
        <th style="text-align:center;padding:6px 8px">Från</th>
        <th style="text-align:center;padding:6px 8px">Till</th>
        <th style="text-align:right;padding:6px 8px">kr/mån (netto)</th>
      </tr></thead>
      <tbody>
        {#each data.pensions.slice().sort((a, b) => a.fromYear - b.fromYear) as p}
          <tr style:color={p.livsvarig ? 'var(--green)' : undefined}>
            <td style="padding:5px 8px">{p.label}</td>
            <td style="text-align:center;padding:5px 8px">{p.fromYear}</td>
            <td style="text-align:center;padding:5px 8px;font-size:.78rem">{p.livsvarig ? 'livsvarig' : p.toYear < 9999 ? p.toYear : '—'}</td>
            <td class="num fw-bold" style="padding:5px 8px">{fmt(p.monthly)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Verdict -->
  <div class={verdict().cls} style="margin-bottom:24px;padding:14px 18px;border-radius:10px">{verdict().text}</div>

  <!-- Chart -->
  <div class="card" style="margin-bottom:24px">
    <canvas bind:this={chartCanvas} height="260"></canvas>
  </div>

  <!-- Detajtabell -->
  <h2>Detaljsimulering per år</h2>
  <div class="card" style="overflow-x:auto;margin-bottom:24px">
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead><tr style="color:var(--muted);font-size:.72rem">
        <th style="padding:5px 8px">År</th>
        <th class="num">Kapital</th>
        <th class="num" style="color:var(--green)">Avkastning/år</th>
        <th class="num" style="color:#6ee7b7">Pension F/mån</th>
        <th class="num" style="color:#a78bfa">Pension U/mån</th>
        <th class="num">Netto-uttag/mån</th>
        <th class="num">Δ kapital/år</th>
        <th class="num" style="color:#6ee7b7">Skatt F/år</th>
        <th class="num" style="color:#a78bfa">Skatt U/år</th>
        <th class="num" style="color:#f87171">Skatt tot/år</th>
      </tr></thead>
      <tbody>
        {#each data.sim.rows as row}
          {@const dep    = data.sim.depletedYear !== null && row.year >= data.sim.depletedYear}
          {@const fColor = row.delta >= 0 ? '#6ee7b7' : '#f87171'}
          {@const sign   = row.delta >= 0 ? '+' : ''}
          {@const tx     = data.taxByYear.get(row.year)}
          {@const fTaxYr = tx ? tx.fTax * 12 : 0}
          {@const uTaxYr = tx ? tx.uTax * 12 : 0}
          {@const fOver  = tx ? tx.fGross > STATLIG_MON : false}
          {@const uOver  = tx ? tx.uGross > STATLIG_MON : false}
          <tr style:opacity={dep ? 0.4 : undefined}>
            <td style="padding:4px 8px">{row.year}</td>
            <td class="num">{dep ? '—' : fmtM(row.capital)}</td>
            <td class="num" style="color:var(--green)">{fmt(row.returns)}</td>
            <td class="num" style="color:#6ee7b7">{tx && tx.fNet > 0 ? fmt(Math.round(tx.fNet)) : '—'}</td>
            <td class="num" style="color:#a78bfa">{tx && tx.uNet > 0 ? fmt(Math.round(tx.uNet)) : '—'}</td>
            <td class="num">{fmt(row.netUttag)}/mån</td>
            <td class="num" style:color={fColor}>{sign}{fmt(row.delta)}</td>
            <td class="num" style:color={fOver ? '#f87171' : '#6ee7b7'}>{fTaxYr > 0 ? fmt(Math.round(fTaxYr)) : '—'}{fOver ? ' ▲' : ''}</td>
            <td class="num" style:color={uOver ? '#f87171' : '#a78bfa'}>{uTaxYr > 0 ? fmt(Math.round(uTaxYr)) : '—'}{uOver ? ' ▲' : ''}</td>
            <td class="num" style="color:#f87171">{fTaxYr + uTaxYr > 0 ? fmt(Math.round(fTaxYr + uTaxYr)) : '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Skattestrategitabell -->
  <h2>Skatteoptimering per år</h2>
  <div class="card" style="margin-bottom:16px;font-size:.9rem">
    {#each data.bullets as b}
      <p style="margin:8px 0">{b}</p>
    {/each}
  </div>
  <div class="card" style="overflow-x:auto;margin-bottom:32px">
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead><tr style="color:var(--muted);font-size:.72rem">
        <th style="padding:5px 8px">År</th>
        <th class="num">Felipe brutto/mån</th>
        <th class="num">Utrymme F</th>
        <th class="num">Ulrika brutto/mån</th>
        <th class="num">Utrymme U</th>
        <th class="num" style="color:var(--red)">Skatt nuläge/mån</th>
        <th class="num" style="color:var(--orange)">Skatt optimerad/mån</th>
        <th class="num">Besparing/år</th>
      </tr></thead>
      <tbody>
        {#each data.optRows.filter(o => o.fGross > 0 || o.uGross > 0) as row}
          {@const isOver  = row.fGross > STATLIG_MON || row.uGross > STATLIG_MON}
          {@const fRoom   = STATLIG_MON - row.fGross}
          {@const uRoom   = STATLIG_MON - row.uGross}
          <tr style:background={isOver ? 'rgba(248,113,113,.05)' : undefined}>
            <td style="padding:5px 8px;color:var(--muted)">{row.year}</td>
            <td class="num">{row.fGross > 0 ? fmt(Math.round(row.fGross)) : '—'}{row.fGross > STATLIG_MON ? ' ▲' : ''}</td>
            <td class="num" style:color={fRoom >= 0 ? '#6ee7b7' : '#f87171'}>
              {row.fGross > 0 ? (fRoom >= 0 ? '+' : '') + fmt(Math.round(fRoom)) : '—'}
            </td>
            <td class="num">{row.uGross > 0 ? fmt(Math.round(row.uGross)) : '—'}{row.uGross > STATLIG_MON ? ' ▲' : ''}</td>
            <td class="num" style:color={uRoom >= 0 ? '#6ee7b7' : '#f87171'}>
              {row.uGross > 0 ? (uRoom >= 0 ? '+' : '') + fmt(Math.round(uRoom)) : '—'}
            </td>
            <td class="num" style="color:var(--red)">{fmt(Math.round(row.taxCur))}/mån</td>
            <td class="num" style="color:var(--orange)">{fmt(Math.round(row.taxOpt))}/mån</td>
            <td class="num">
              {#if row.saving > 100}
                <span style="color:var(--green)">+{fmt(Math.round(row.saving * 12))}</span>
              {:else}
                <span style="color:var(--muted)">—</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <footer>Uttagsstrategi · Verdu Ekonomi</footer>
</div>

<style>
  .verdict { border-radius: 10px; padding: 14px 18px; font-size: .9rem; font-weight: 500; }
  :global(.verdict.ok)   { background: rgba(110,231,183,.08); border: 1px solid rgba(110,231,183,.4); color: var(--green); }
  :global(.verdict.warn) { background: rgba(251,146,60,.08);  border: 1px solid rgba(251,146,60,.4);  color: var(--orange); }
  :global(.verdict.bad)  { background: rgba(248,113,113,.08); border: 1px solid rgba(248,113,113,.4); color: var(--red); }
</style>
