<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
  import { initAuth } from '../auth';
  import { computeFire, computeNV } from '../calculations';
  import { ekStore, fireStore } from '../store';
  import { renderTopnav, injectInfoBtn } from '../nav';
  import { INFO } from '../infoContent';
  import { AP_INDEX_RATE, AP_TAK, PP_RATE, CHART_DARK_GRID, CHART_DARK_TEXT } from '../constants';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

  const AKAP_CAP  = 52_125;
  const AKAP_LOW  = 0.06;
  const AKAP_HIGH = 0.315;
  const LS_BOSTAD = 'vek_idx_bostad_avk';

  function akapMon(brutto: number): number {
    return Math.min(brutto, AKAP_CAP) * AKAP_LOW + Math.max(0, brutto - AKAP_CAP) * AKAP_HIGH;
  }

  const fmt  = (n: number) => Math.round(n).toLocaleString('sv-SE') + ' kr';
  const fmtM = (n: number) => (n / 1e6).toFixed(2) + ' MSEK';

  // ── State ─────────────────────────────────────────────────────────────────────
  let bostadAvkPct = $state(parseFloat(localStorage.getItem(LS_BOSTAD) ?? '2'));

  function compute() {
    const ek   = ekStore.get();
    const s    = fireStore.get();
    const r    = computeFire(ek, s);
    const avk  = s.avkPct / 100;
    const isk  = s.iskPct / 100;
    const bAvk = bostadAvkPct / 100;
    const nv   = computeNV(ek);

    // Nästa händelse
    const today  = new Date().getFullYear();
    const nextEv = r.events.find(e => e.year > today);

    // Förmögenhetsförändring
    const apKapital  = ek.ap_f + ek.ap_u;
    const apIndex    = apKapital * AP_INDEX_RATE;
    const pgiFelipe  = Math.min(ek.brutto_f * 12, AP_TAK);
    const pgiUlrika  = Math.min(ek.brutto_u * 12, AP_TAK);
    const apTotal    = apIndex + pgiFelipe * 0.16 + pgiUlrika * 0.16;
    const ppBidrag   = (pgiFelipe + pgiUlrika) * PP_RATE;
    const ppTotal    = (ek.pp_f + ek.pp_u) * avk + ppBidrag;
    const akapF      = akapMon(ek.brutto_f) * 12;
    const akapU      = akapMon(ek.brutto_u) * 12;
    const lonevxlAr  = ek.lonevxl_pmt * 12;
    const tjpKapital = ek.tjp_f_pv + ek.lonevxl_pv + ek.tidigare_pv + ek.kapan_pv + ek.tjp_u_pv;
    const tjpTotal   = akapF + akapU + lonevxlAr + tjpKapital * avk;
    const norgeKap   = ek.norge_f_pv + ek.dnb_f_pv + ek.sb_f_pv + ek.sb_u_pv + ek.dnb_u_pv;
    const norgeTotal = norgeKap * avk;
    const bostadMkt  = ek.villa_varde + ek.lagenhet_varde;
    const bostadTot  = bostadMkt * bAvk;
    const lysaKap    = ek.lysa_f_pv + ek.lysa_u_pv + ek.buffert_u_pv;
    const lysaTotal  = lysaKap * (avk - isk) + (ek.lysa_f_pmt + ek.lysa_u_pmt + ek.buffert_u_pmt) * 12;
    const borgoTotal = ek.sparkonto_pv * (s.borgoRanta / 100) + ek.sparkonto_pmt * 12;
    const total      = apTotal + ppTotal + tjpTotal + norgeTotal + bostadTot + lysaTotal + borgoTotal;
    const totalPct   = nv > 0 ? (total / nv) * 100 : 0;

    const isEmpty = ek.lysa_f_pv === 0 && ek.lysa_u_pv === 0 && ek.tjp_f_pv === 0 && ek.sparkonto_pv === 0 && ek.ap_f === 0;

    return {
      ek, s, r, nv, today, nextEv, isEmpty, total, totalPct,
      nvValues: [apTotal, ppTotal, tjpTotal, norgeTotal, bostadTot, lysaTotal, borgoTotal],
    };
  }

  let data = $state(compute());

  // ── Sliders (dashboard-scenario) ──────────────────────────────────────────────
  let avkPct   = $state(fireStore.get().avkPct);
  let antalAr  = $state(fireStore.get().antalAr);
  let uttakAvk = $state(fireStore.get().uttakAvkPct);

  function syncSlider() {
    fireStore.setField('avkPct',      avkPct);
    fireStore.setField('antalAr',     antalAr);
    fireStore.setField('uttakAvkPct', uttakAvk);
    data = compute();
  }

  // ── Chart ─────────────────────────────────────────────────────────────────────
  let chartCanvas: HTMLCanvasElement;
  let nvChart: Chart | null = null;

  const NV_LABELS = [
    'AP (inkomstpension)', 'Premiepension',
    'TjP Sverige (AKAP-KR + löneväxling + avk)', 'TjP Norge (avkastning)',
    'Bostad (marknadstillväxt)', 'Lysa/ISK (avk + insättningar)', 'Sparkonto (avk + insättningar)',
  ];
  const NV_COLORS = ['#34d399','#6ee7b7','#f59e0b','#f87171','#a78bfa','#4f8ef7','#60a5fa'];

  function buildChart() {
    if (!chartCanvas) return;
    if (nvChart) nvChart.destroy();
    nvChart = new Chart(chartCanvas.getContext('2d')!, {
      type: 'bar',
      data: {
        labels: NV_LABELS,
        datasets: [{ data: data.nvValues, backgroundColor: NV_COLORS, borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => ` ${fmt(c.raw as number)}` } },
        },
        scales: {
          x: { grid: { color: CHART_DARK_GRID }, ticks: { color: CHART_DARK_TEXT, callback: v => `${Math.round(Number(v) / 1000)}k` } },
          y: { grid: { color: CHART_DARK_GRID }, ticks: { color: CHART_DARK_TEXT, font: { size: 11 } } },
        },
      },
    });
  }

  $effect(() => { void data; buildChart(); });

  function onStorage(e: StorageEvent) {
    if (e.key?.startsWith('vek_')) { data = compute(); }
  }

  onMount(async () => {
    await initAuth();
    renderTopnav('index.html');
    injectInfoBtn(INFO.index.title, INFO.index.sections);
    window.addEventListener('storage', onStorage);
    buildChart();
  });

  onDestroy(() => {
    nvChart?.destroy();
    window.removeEventListener('storage', onStorage);
  });
</script>

<svelte:head><title>Dashboard — Verdu Ekonomi</title></svelte:head>

<div class="page">
  <nav class="topnav" id="topnav"></nav>

  <h1>Verdu Ekonomi</h1>
  <p class="subtitle">Din brygga-plan i ett ögonkast.</p>

  {#if data.isEmpty}
    <div class="card" style="border:1px solid var(--orange);margin-bottom:24px;padding:20px 24px">
      <div style="font-size:1rem;font-weight:700;color:var(--orange);margin-bottom:10px">👋 Kom igång — tre steg</div>
      <ol style="margin:0;padding-left:1.4em;line-height:2;font-size:.9rem">
        <li>Gå till <a href="ekonomi.html" style="color:var(--accent1);font-weight:600">💰 Ekonomi</a> och fyll i dina aktuella balanser, löner och fastighetsvärden.</li>
        <li>Gå till <a href="fire.html" style="color:var(--accent1);font-weight:600">🌉 Brygga</a> och justera antaganden (avkastning, år till FIRE, pensionsålder).</li>
        <li>Återvänd hit — dashboarden räknar ut allt automatiskt.</li>
      </ol>
    </div>
  {/if}

  <!-- Hero NV -->
  <div class="card" style="text-align:center;padding:28px 24px;margin-bottom:24px">
    <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:6px">Netto förmögenhet idag</div>
    <div style="font-size:3rem;font-weight:800;color:var(--accent1);letter-spacing:-.02em">{fmtM(data.nv)}</div>
    <div style="font-size:.85rem;color:var(--muted);margin-top:4px">Totalt = {fmt(data.nv)} · Fritt FIRE-kapital {fmtM(data.r.kapital)}</div>
  </div>

  <!-- KPI-rad -->
  <div class="kpi-bar">
    <div class="kpi"><div class="kpi-label">Brygga-startår</div><div class="kpi-value orange">{data.r.fireYear}</div></div>
    <div class="kpi">
      <div class="kpi-label">Brygga-täckning</div>
      <div class="kpi-value" style:color={data.r.bryggaTackning >= 100 ? 'var(--green)' : data.r.bryggaTackning >= 75 ? 'var(--orange)' : 'var(--red)'}>{data.r.bryggaTackning.toFixed(1)} %</div>
    </div>
    <div class="kpi"><div class="kpi-label">Fritt kapital vid start</div><div class="kpi-value">{fmtM(data.r.kapital)}</div></div>
    <div class="kpi"><div class="kpi-label">Total förmögenhet vid start</div><div class="kpi-value purple">{fmtM(data.r.totaltFV)}</div></div>
    <div class="kpi"><div class="kpi-label">Levnadskostnad</div><div class="kpi-value">{fmt(data.ek.levnadskostnad)}</div></div>
  </div>

  <!-- Scenariosimulator -->
  <h2>Scenariosimulator</h2>
  <div class="card" style="margin-bottom:24px">
    <p style="font-size:.85rem;color:var(--muted);margin:0 0 18px">Justera antaganden direkt här — diagrammen och KPI:erna uppdateras direkt.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px">
      <div class="slider-card">
        <div class="slider-label">Årsavkastning (ackumulering)</div>
        <span class="slider-val">{avkPct} %</span>
        <input type="range" min="0" max="15" step="0.5" value={avkPct}
               oninput={e => { avkPct = parseFloat((e.target as HTMLInputElement).value); syncSlider(); }} />
      </div>
      <div class="slider-card">
        <div class="slider-label">År till FIRE</div>
        <span class="slider-val">{antalAr} år</span>
        <input type="range" min="1" max="20" step="1" value={antalAr}
               oninput={e => { antalAr = parseFloat((e.target as HTMLInputElement).value); syncSlider(); }} />
      </div>
      <div class="slider-card">
        <div class="slider-label">Uttaksavkastning</div>
        <span class="slider-val">{uttakAvk} %</span>
        <input type="range" min="0" max="8" step="0.5" value={uttakAvk}
               oninput={e => { uttakAvk = parseFloat((e.target as HTMLInputElement).value); syncSlider(); }} />
      </div>
    </div>
  </div>

  <!-- Nästa händelse -->
  {#if data.nextEv}
    <div class="card" style="margin-bottom:24px;padding:14px 18px">
      <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px">Nästa händelse</div>
      <span class="fw-bold">{data.nextEv.label}</span>
      <span class="text-muted">&nbsp;· om {data.nextEv.year - data.today} år ({data.nextEv.year})</span>
    </div>
  {/if}

  <!-- Pensionstabell -->
  <h2>Pensionsströmmar</h2>
  <div class="card" style="overflow-x:auto;margin-bottom:24px">
    <table style="width:100%;border-collapse:collapse;font-size:.88rem">
      <thead><tr style="color:var(--muted);font-size:.75rem">
        <th style="text-align:left;padding:6px 8px">Pension</th>
        <th style="text-align:center;padding:6px 8px">Från</th>
        <th style="text-align:center;padding:6px 8px">Till</th>
        <th style="text-align:right;padding:6px 8px">kr/mån</th>
      </tr></thead>
      <tbody>
        {#each data.r.pensions as p}
          <tr style:color={p.livsvarig ? 'var(--green)' : undefined}>
            <td style="padding:5px 8px">{p.label}</td>
            <td style="text-align:center;padding:5px 8px">{p.fromYear}</td>
            <td style="text-align:center;padding:5px 8px;font-size:.78rem;color:var(--green)">{p.livsvarig ? 'livsvarig' : p.toYear < 9999 ? p.toYear : '—'}</td>
            <td class="num fw-bold" style="padding:5px 8px">{fmt(p.monthly)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- NV-förändring per år -->
  <h2>Förmögenhetsförändring per år</h2>
  <div class="card" style="margin-bottom:24px">
    <div style="font-size:.9rem;color:var(--muted);margin-bottom:16px">
      +{fmtM(data.total)}/år &nbsp; (+{data.totalPct.toFixed(1)} % av NV)
    </div>
    <div class="form-row" style="margin-bottom:12px">
      <label>Bostadsvärdetillväxt (%/år)</label>
      <input type="number" step="0.5" min="0" max="10" style="width:100px" value={bostadAvkPct}
             oninput={e => {
               bostadAvkPct = parseFloat((e.target as HTMLInputElement).value) || 0;
               localStorage.setItem(LS_BOSTAD, String(bostadAvkPct));
               data = compute();
             }} />
    </div>
    <canvas bind:this={chartCanvas} height="220"></canvas>
  </div>

  <footer>Dashboard · Verdu Ekonomi</footer>
</div>
