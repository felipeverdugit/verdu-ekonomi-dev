<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    Chart, ArcElement, DoughnutController, LineController, LineElement, PointElement,
    LinearScale, CategoryScale, Tooltip, Legend, Filler,
  } from 'chart.js';
  import Topnav from '../components/Topnav.svelte';
  import { fireStore, ekStore } from '../store';
  import { simulateUttag, computeFire, accountFVGrowing } from '../calculations';
  import { CHART_DARK_GRID, CHART_DARK_TEXT } from '../constants';
  import type { PensionStream, EkonomiData, FireSettings } from '../types';

  Chart.register(ArcElement, DoughnutController, LineController, LineElement, PointElement,
    LinearScale, CategoryScale, Tooltip, Legend, Filler);

  // ── Inmatning — initieras från sparade Brygga-inställningar ──────────────────
  const _fs = fireStore.get();
  const _ek = ekStore.get();

  let lonNu       = $state(_ek.brutto_f  || 67_300);
  let lonNy       = $state(80_000);
  let lvNu        = $state(_ek.lonevxl_pmt || 11_000);
  let lvNy        = $state(23_000);
  let agBidragPct = $state(5.8);
  let ibb         = $state(82_800);   // IBB per år (2025)
  let avkPct      = $state(_fs.avkPct  || 6.0);
  let arTillFire  = $state(_fs.antalAr || 7);
  let kommunalPct      = $state(31.0);
  let statligGrans     = $state(57_000);   // kr/mån brutto-gräns för löneväxlingsstrategi
  let nyJobbStart      = $state(2027);     // år nytt jobb börjar
  let itp2TidigareAr  = $state(2);        // befintliga ITP 2-tjänsteår (helttal)
  let itp2TidigareMon = $state(4);        // befintliga ITP 2-tjänstemånader

  let livslangd       = $state(85);
  let levnadskostnad  = $state(_ek.levnadskostnad || 65_000);
  let uttakAvkPct     = $state(_fs.uttakAvkPct || 2.0);

  // Chart
  let uttaksCanvas = $state<HTMLCanvasElement | null>(null);
  let uttaksChart: Chart | null = null;

  const CURRENT_YEAR    = 2026;
  const BIRTH_YEAR      = 1975;
  const ITP2_START_AGE  = 65;
  const ITP2_FULL_YEARS = 37;  // 28→65 år = 37 tjänsteår för full ITP2

  // ── Formatering ────────────────────────────────────────────────────────────────
  const fmt  = (n: number) => Math.round(n).toLocaleString('sv-SE') + ' kr';
  const fmtM = (n: number) => (n / 1e6).toFixed(2) + ' MSEK';
  const fmtPct = (n: number) => n.toFixed(1) + ' %';

  // ── Löneskatt — kalibrerad mot Skatteverket 2026 ──────────────────────────────
  // Verifierad: 56 300 kr/mån → 14 087 kr/mån (tabell 33, kolumn 1)
  function salaryTax(monthlyBrutto: number): number {
    const W = monthlyBrutto * 12;
    const k = kommunalPct / 100;
    const PBB = 58_800;  // Prisbasbelopp 2025/2026

    // Grundavdrag (IL 63 kap, piecewise 2025/2026)
    let ga: number;
    if (W <= 17_000)       ga = 13_900;
    else if (W <= 339_300) ga = 13_900 + (W - 17_000) * 0.10303;
    else if (W <= 590_000) ga = 47_100 - (W - 339_300) * 0.13243;
    else                   ga = 13_900;

    // Jobbskatteavdrag (JSA) — kalibrerad mot skattetabell 33
    // Fasas ut med 0.1028 per kr ovanför 8.08 × PBB
    const L = 0.91 * PBB;   // 53 508 kr
    const U = 3.24 * PBB;   // 190 512 kr
    const P = 8.08 * PBB;   // 475 104 kr (plateau-topp)
    let f_W: number;
    if (W <= L)      f_W = 0;
    else if (W <= U) f_W = W - L;
    else if (W <= P) f_W = U - L;
    else             f_W = Math.max(0, (U - L) - 0.1028 * (W - P));
    const jsa = f_W * k;

    const taxable = Math.max(0, W - ga);
    const kommunal = taxable * k;
    // Skiktgräns 2026 ≈ 665 000 kr på beskattningsbar inkomst (efter GA)
    const statlig = Math.max(0, taxable - 665_000) * 0.20;

    return Math.max(0, kommunal + statlig - jsa) / 12;
  }

  // ── Avgiftsbestämd pension ─────────────────────────────────────────────────────
  // AKAP-KR: 6 % upp till 7,5 IBB, 30 % däröver
  function akapContrib(brutto: number): number {
    const ibbMon = ibb * 7.5 / 12;
    return Math.min(brutto, ibbMon) * 6 / 100
         + Math.max(0, brutto - ibbMon) * 30 / 100;
  }
  // ITP 1: 4,5 % upp till 7,5 IBB, 30 % däröver
  function itp1Contrib(brutto: number): number {
    const ibbMon = ibb * 7.5 / 12;
    return Math.min(brutto, ibbMon) * 4.5 / 100
         + Math.max(0, brutto - ibbMon) * 30 / 100;
  }

  // ── ITP 2 full förmån (kr/mån vid 65, 37 tjänsteår) ─────────────────────────
  function itp2FullBenefit(brutto: number): number {
    const g1 = ibb *  7.5 / 12;
    const g2 = ibb * 20.0 / 12;
    const g3 = ibb * 30.0 / 12;
    return Math.min(brutto, g1) * 0.10
         + Math.max(0, Math.min(brutto, g2) - g1) * 0.65
         + Math.max(0, Math.min(brutto, g3) - g2) * 0.325;
  }

  // ── Projicerat kapital (FV av löpande avsättning) ──────────────────────────────
  function fv(monthlyContrib: number): number {
    const r = avkPct / 100 / 12;
    const n = arTillFire * 12;
    return r > 0 ? monthlyContrib * ((Math.pow(1 + r, n) - 1) / r) : monthlyContrib * n;
  }

  // ── Beräkning ─────────────────────────────────────────────────────────────────
  let c = $derived((() => {
    const agLvNu = lvNu * agBidragPct / 100;
    const agLvNy = lvNy * agBidragPct / 100;

    // AKAP-KR (nuläge)
    const akap = (() => {
      const agPens   = akapContrib(lonNu);
      const lvTot    = lvNu + agLvNu;
      const totPens  = agPens + lvTot;
      const skattelön = lonNu - lvNu;
      const tax      = salaryTax(skattelön);
      const netto    = skattelön - tax;
      const totFV    = fv(totPens);
      const totVärde = netto + totPens;
      return { agPens, lvTot, agLvBidrag: agLvNu, totPens, skattelön, tax, netto, totFV, totVärde };
    })();

    // ITP 1 (nytt jobb)
    const itp1 = (() => {
      const agPens   = itp1Contrib(lonNy);
      const lvTot    = lvNy + agLvNy;
      const totPens  = agPens + lvTot;
      const skattelön = lonNy - lvNy;
      const tax      = salaryTax(skattelön);
      const netto    = skattelön - tax;
      const totFV    = fv(totPens);
      const totVärde = netto + totPens;
      return { agPens, lvTot, agLvBidrag: agLvNy, totPens, skattelön, tax, netto, totFV, totVärde };
    })();

    // ITP 2 (nytt jobb — förmånsbestämd)
    const itp2 = (() => {
      const full       = itp2FullBenefit(lonNy);
      const fireYear   = CURRENT_YEAR + arTillFire;
      const newJobYr   = Math.max(0, fireYear - nyJobbStart);
      const totalItp2Yr = itp2TidigareAr + itp2TidigareMon / 12 + newJobYr;
      const prorated   = Math.round(full * Math.min(totalItp2Yr, ITP2_FULL_YEARS) / ITP2_FULL_YEARS);
      const lvTot      = lvNy + agLvNy;
      const skattelön  = lonNy - lvNy;
      const tax        = salaryTax(skattelön);
      const netto      = skattelön - tax;
      const lvFV       = fv(lvTot);

      // Kapitalvärde av ITP 2-förmånen (PV av annuitet 65→livslängd)
      const r          = avkPct / 100 / 12;
      const nMon       = Math.max(0, livslangd - ITP2_START_AGE) * 12;
      const pvAt65     = r > 0 ? prorated * (1 - Math.pow(1 + r, -nMon)) / r : prorated * nMon;
      const ageAtFire  = fireYear - BIRTH_YEAR;
      const monTo65    = Math.max(0, ITP2_START_AGE - ageAtFire) * 12;
      const pvAtFire   = pvAt65 / Math.pow(1 + r, monTo65);
      const nominalTot = prorated * 12 * Math.max(0, livslangd - ITP2_START_AGE);

      return { full: Math.round(full), prorated, totalItp2Yr, newJobYr, fireYear,
               lvTot, agLvBidrag: agLvNy, skattelön, tax, netto, lvFV,
               pvAt65: Math.round(pvAt65), pvAtFire: Math.round(pvAtFire),
               nominalTot: Math.round(nominalTot), ageAtFire, monTo65: Math.round(monTo65 / 12) };
    })();

    const diffNetto1 = itp1.netto - akap.netto;
    const diffPens1  = itp1.totPens - akap.totPens;
    const diffFV1    = itp1.totFV - akap.totFV;

    return { akap, itp1, itp2, diffNetto1, diffPens1, diffFV1 };
  })());

  // ── Färghjälp ─────────────────────────────────────────────────────────────────
  const diffColor = (n: number) => n >= 0 ? 'var(--green)' : 'var(--red)';
  const sign = (n: number) => (n >= 0 ? '+' : '') + fmt(n);

  // ── Brygga-simulator med ITP 1 (hela familjens bild) ──────────────────────────
  // Återanvänder computeFire() från Brygga, men ersätter Felipes AKAP-KR-inbetalningar
  // (tjp_f_pmt_q) med ITP 1-avsättning + ny löneväxling. Alla övriga strömmar
  // (Ulrika, Allmänpension, NAV, Fast TjP) hämtas oförändrade från Ekonomi-sidan.
  const bryggaEk = ekStore.get();
  const bryggaFs = fireStore.get();

  let itp1Brygga = $derived.by(() => {
    const ekItp1: EkonomiData = {
      ...bryggaEk,
      brutto_f:    lonNy,
      tjp_f_pmt_q: 0,                              // AKAP-KR-inbetalningar upphör vid jobbyte
      lonevxl_pmt: itp1Contrib(lonNy) + lvNy,       // ITP 1 AG-avsättning + ny löneväxling
    };
    const sItp1: FireSettings = { ...bryggaFs, avkPct, antalAr: arTillFire };
    return computeFire(ekItp1, sItp1);
  });

  // Bryter ut ITP 1-delen ur "TjP Sverige"-potten så den syns separat i diagrammet
  let itp1Breakdown = $derived.by(() => {
    const ek = bryggaEk;
    const felipeGammalTjp =
      accountFVGrowing(ek.tjp_f_pv,   0, 'quarterly', avkPct, 0, arTillFire, arTillFire) +
      accountFVGrowing(ek.kapan_pv,   0, 'monthly',   avkPct, 0, arTillFire, arTillFire) +
      accountFVGrowing(ek.tidigare_pv,0, 'monthly',   avkPct, 0, arTillFire, arTillFire) +
      accountFVGrowing(ek.lonevxl_pv, 0, 'monthly',   avkPct, 0, arTillFire, arTillFire);
    const ulrikaTjp = accountFVGrowing(ek.tjp_u_pv, ek.tjp_u_pmt_q, 'quarterly', avkPct, bryggaFs.lonehojU, arTillFire, arTillFire);
    const itp1Nytt  = accountFVGrowing(0, itp1Contrib(lonNy) + lvNy, 'monthly', avkPct, bryggaFs.lonehojF, arTillFire, arTillFire);
    return { felipeGammalTjp, ulrikaTjp, itp1Nytt };
  });

  const FASE_COLORS = ['#4f8ef7','#6ee7b7','#f59e0b','#f87171','#a78bfa','#34d399','#60a5fa'];
  function badge(label: string, who: string): string {
    const isU    = who === 'u';
    const isFire = label.includes('FIRE') || label.includes('Brygga');
    const color  = isFire ? '#f59e0b' : isU ? '#a78bfa' : '#6ee7b7';
    const short  = label.replace(/^(Felipe|Ulrika) \d+:\s*/, '').replace(' (redan aktiv)', '');
    return `<span class="badge" style="background:${color}18;color:${color};border:1px solid ${color}40">${isU ? 'U: ' : isFire ? '' : 'F: '}${short}</span>`;
  }

  let bryggaPieCanvas    = $state<HTMLCanvasElement | null>(null);
  let bryggaUttaksCanvas = $state<HTMLCanvasElement | null>(null);
  let bryggaPieChart:    Chart | null = null;
  let bryggaUttaksChart: Chart | null = null;

  const PIE_LABELS = ['Fonder', 'Sparkonto', 'TjP Sverige (tidigare)', 'ITP 1 (nytt jobb)', 'TjP Norge', 'Premiepension', 'Inkomstpension'];
  const PIE_COLORS = ['#4f8ef7','#6ee7b7','#f59e0b','#22d3ee','#f87171','#a78bfa','#34d399'];

  function buildBryggaPieChart() {
    if (!bryggaPieCanvas) return;
    if (bryggaPieChart) { bryggaPieChart.destroy(); bryggaPieChart = null; }
    const res = itp1Brygga;
    const b   = itp1Breakdown;
    const labels = [...PIE_LABELS];
    const data   = [res.fonder_fv, res.sparkonto_fv, b.felipeGammalTjp + b.ulrikaTjp, b.itp1Nytt, res.norge_fv, res.pp_fv, res.ap_fv];
    const colors = [...PIE_COLORS];
    if (res.aktierIFire && res.aktierVal > 0) { labels.push('Aktier'); data.push(res.aktierVal); colors.push('#f97316'); }
    bryggaPieChart = new Chart(bryggaPieCanvas.getContext('2d')!, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#1a1d27' }] },
      options: {
        plugins: {
          legend: { position: 'bottom', labels: { color: CHART_DARK_TEXT, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => ` ${fmtM(ctx.raw as number)}` } },
        },
      },
    });
  }

  function buildBryggaUttaksChart() {
    if (!bryggaUttaksCanvas) return;
    if (bryggaUttaksChart) { bryggaUttaksChart.destroy(); bryggaUttaksChart = null; }
    const res = itp1Brygga;
    const ek  = bryggaEk;
    const sim = simulateUttag(res.kapital, res.uttakAvkPct, res.fireYear, ek.levnadskostnad, res.pensions, ek.levnadskostnad2, ek.exp_switch_ar);
    const switchYear2 = ek.exp_switch_ar > 0 && ek.levnadskostnad2 > 0 ? res.fireYear + ek.exp_switch_ar : 9999;
    const levnadLinje = sim.rows.map(row => row.year >= switchYear2 ? ek.levnadskostnad2 : ek.levnadskostnad);

    bryggaUttaksChart = new Chart(bryggaUttaksCanvas.getContext('2d')!, {
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
        maintainAspectRatio: false,
        scales: {
          x:  { grid: { color: CHART_DARK_GRID }, ticks: { color: CHART_DARK_TEXT, maxTicksLimit: 10 } },
          y:  { grid: { color: CHART_DARK_GRID }, ticks: { color: CHART_DARK_TEXT, callback: v => `${v} M` }, position: 'left' },
          y1: { grid: { drawOnChartArea: false }, ticks: { color: '#6ee7b7', callback: v => `${Math.round(Number(v) / 1000)}k` }, position: 'right' },
        },
        plugins: { legend: { labels: { color: CHART_DARK_TEXT } } },
      },
    });
  }

  $effect(() => {
    void itp1Brygga; void itp1Breakdown; void bryggaPieCanvas; void bryggaUttaksCanvas;
    buildBryggaPieChart();
    buildBryggaUttaksChart();
  });

  onMount(() => { requestAnimationFrame(() => { buildBryggaPieChart(); buildBryggaUttaksChart(); }); });
  onDestroy(() => { bryggaPieChart?.destroy(); bryggaUttaksChart?.destroy(); });

  // ── Uttakssimulator ───────────────────────────────────────────────────────────
  function buildUttaksChart() {
    if (!uttaksCanvas) return;
    if (uttaksChart) { uttaksChart.destroy(); uttaksChart = null; }

    const fireYear = CURRENT_YEAR + arTillFire;
    const itp2Stream: PensionStream = {
      id: 1, label: 'ITP 2 förmån', who: 'f',
      fromYear: BIRTH_YEAR + ITP2_START_AGE,
      toYear: 9999, monthly: c.itp2.prorated, livsvarig: true,
    };

    const simAkap = simulateUttag(c.akap.totFV, uttakAvkPct, fireYear, levnadskostnad, []);
    const simItp1 = simulateUttag(c.itp1.totFV, uttakAvkPct, fireYear, levnadskostnad, []);
    const simItp2 = simulateUttag(c.itp2.lvFV,  uttakAvkPct, fireYear, levnadskostnad, [itp2Stream]);

    uttaksChart = new Chart(uttaksCanvas.getContext('2d')!, {
      type: 'line',
      data: {
        labels: simAkap.rows.map(r => String(r.year)),
        datasets: [
          { label: 'AKAP-KR kapital (MSEK)',  data: simAkap.rows.map(r => r.capital / 1e6), borderColor: '#6ee7b7', backgroundColor: '#6ee7b718', fill: true,  tension: 0.3, pointRadius: 0, yAxisID: 'y' },
          { label: 'ITP 1 kapital (MSEK)',    data: simItp1.rows.map(r => r.capital / 1e6), borderColor: '#4f8ef7', backgroundColor: '#4f8ef718', fill: true,  tension: 0.3, pointRadius: 0, yAxisID: 'y' },
          { label: 'ITP 2 lv-kapital (MSEK)', data: simItp2.rows.map(r => r.capital / 1e6), borderColor: '#a78bfa', backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 0, yAxisID: 'y' },
          { label: 'ITP 2 pension/mån (kr)',   data: simItp2.rows.map(r => r.pensionMon),   borderColor: '#a78bfa', backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 0, yAxisID: 'y1', borderDash: [4, 2] },
          { label: 'Levnadskostnad/mån (kr)', data: simAkap.rows.map(() => levnadskostnad), borderColor: '#fb923c', backgroundColor: 'transparent', fill: false, tension: 0,   pointRadius: 0, yAxisID: 'y1', borderDash: [5, 3] },
        ],
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x:  { grid: { color: CHART_DARK_GRID }, ticks: { color: CHART_DARK_TEXT, maxTicksLimit: 10 } },
          y:  { grid: { color: CHART_DARK_GRID }, ticks: { color: CHART_DARK_TEXT, callback: v => `${v} M` }, position: 'left' },
          y1: { grid: { drawOnChartArea: false }, ticks: { color: '#fb923c', callback: v => `${Math.round(Number(v) / 1000)}k` }, position: 'right' },
        },
        plugins: { legend: { labels: { color: CHART_DARK_TEXT } } },
      },
    });
  }

  $effect(() => {
    void c; void uttaksCanvas; void levnadskostnad; void uttakAvkPct;
    buildUttaksChart();
  });

  onMount(() => { requestAnimationFrame(() => buildUttaksChart()); });
  onDestroy(() => { uttaksChart?.destroy(); });
</script>

<svelte:head><title>Jobbyte-analys — Verdu Ekonomi</title></svelte:head>

<div class="page">
  <Topnav active="jobbyte.html" />

  <h1>💼 Jobbyte-analys</h1>
  <p class="subtitle">Jämför AKAP-KR (nuläge) mot ITP 1 och ITP 2 vid nytt privat jobb</p>

  <!-- Inmatning -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">

    <!-- Nuläge -->
    <div class="card" style="border-left:4px solid #6ee7b7">
      <h3 style="margin-top:0;color:#6ee7b7">Nuläge — AKAP-KR</h3>
      <div class="form-row"><label>Bruttolön (kr/mån)</label>
        <input type="number" class="bgt-inp" bind:value={lonNu} step="100" /></div>
      <div class="form-row"><label>Löneväxling (kr/mån)</label>
        <input type="number" class="bgt-inp" bind:value={lvNu} step="500" /></div>
      <div class="form-row" style="font-size:.8rem;color:var(--muted)">
        <label>AG-bidrag löneväxling</label>
        <span>{fmt(Math.round(lvNu * agBidragPct / 100))}/mån</span>
      </div>
    </div>

    <!-- Nytt jobb -->
    <div class="card" style="border-left:4px solid #4f8ef7">
      <h3 style="margin-top:0;color:#4f8ef7">Nytt jobb — ITP 1 / ITP 2</h3>
      <div class="form-row"><label>Ny bruttolön (kr/mån)</label>
        <input type="number" class="bgt-inp" bind:value={lonNy} step="100" /></div>
      <div class="form-row"><label>Löneväxling (kr/mån)</label>
        <input type="number" class="bgt-inp" bind:value={lvNy} step="500" /></div>
      <div class="form-row" style="font-size:.8rem;color:var(--muted)">
        <label>AG-bidrag löneväxling</label>
        <span>{fmt(Math.round(lvNy * agBidragPct / 100))}/mån</span>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;margin-bottom:8px">ITP 2 — tjänsteår</div>
        <div class="form-row"><label>Nytt jobb startar (år)</label>
          <input type="number" class="bgt-inp" bind:value={nyJobbStart} step="1" min="2024" max="2035" /></div>
        <div class="form-row"><label>Befintliga år (tidig. anst.)</label>
          <input type="number" class="bgt-inp" bind:value={itp2TidigareAr} step="1" min="0" /></div>
        <div class="form-row"><label>Befintliga månader</label>
          <input type="number" class="bgt-inp" bind:value={itp2TidigareMon} step="1" min="0" max="11" /></div>
      </div>
    </div>
  </div>

  <!-- Avancerade inställningar -->
  <details class="card" style="margin-bottom:24px">
    <summary style="cursor:pointer;font-size:.88rem;color:var(--muted)">⚙️ Avancerade inställningar</summary>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:14px">
      <div class="form-row"><label>AG-bidrag löneväxling (%)</label>
        <input type="number" class="bgt-inp" bind:value={agBidragPct} step="0.1" /></div>
      <div class="form-row"><label>IBB per år (kr)</label>
        <input type="number" class="bgt-inp" bind:value={ibb} step="100" /></div>
      <div class="form-row"><label>Avkastning (%/år)</label>
        <input type="number" class="bgt-inp" bind:value={avkPct} step="0.5" /></div>
      <div class="form-row"><label>År till FIRE</label>
        <input type="number" class="bgt-inp" bind:value={arTillFire} step="1" /></div>
      <div class="form-row"><label>Kommunalskatt (%)</label>
        <input type="number" class="bgt-inp" bind:value={kommunalPct} step="0.5" /></div>
      <div class="form-row"><label>Statlig skattegräns (kr/mån)</label>
        <input type="number" class="bgt-inp" bind:value={statligGrans} step="500" /></div>
    </div>
    <p style="font-size:.75rem;color:var(--muted);margin:10px 0 0">
      IBB 2025 = 82 800 kr · 7,5 IBB/mån = {fmt(Math.round(ibb * 7.5 / 12))} ·
      AKAP-KR: 6 % / 30 % · ITP 1: 4,5 % / 30 %
    </p>
  </details>

  <!-- Månadsöversikt -->
  <h2>Månadsöversikt</h2>
  <div class="card" style="overflow-x:auto;margin-bottom:24px">
    <table style="width:100%;border-collapse:collapse;font-size:.88rem">
      <thead>
        <tr style="font-size:.72rem;color:var(--muted)">
          <th style="text-align:left;padding:8px">Post</th>
          <th class="num" style="color:#6ee7b7">AKAP-KR (nu)</th>
          <th class="num" style="color:#4f8ef7">ITP 1 (nytt)</th>
          <th class="num" style="color:#a78bfa">ITP 2 (nytt)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-top:1px solid var(--border)">
          <td style="padding:7px 8px;color:var(--muted)">Bruttolön</td>
          <td class="num">{fmt(lonNu)}</td>
          <td class="num">{fmt(lonNy)}</td>
          <td class="num">{fmt(lonNy)}</td>
        </tr>
        <tr style="border-top:1px solid var(--border)">
          <td style="padding:7px 8px;color:var(--muted)">Löneväxling (löneavdrag)</td>
          <td class="num">−{fmt(lvNu)}</td>
          <td class="num">−{fmt(lvNy)}</td>
          <td class="num">−{fmt(lvNy)}</td>
        </tr>
        <tr style="border-top:1px solid var(--border)">
          <td style="padding:7px 8px;color:var(--muted)">Skattepliktig lön</td>
          <td class="num">{fmt(c.akap.skattelön)}</td>
          <td class="num">{fmt(c.itp1.skattelön)}</td>
          <td class="num">{fmt(c.itp2.skattelön)}</td>
        </tr>
        <tr style="border-top:1px solid var(--border)">
          <td style="padding:7px 8px;color:var(--muted)">Beräknad skatt</td>
          <td class="num" style="color:var(--red)">−{fmt(c.akap.tax)}</td>
          <td class="num" style="color:var(--red)">−{fmt(c.itp1.tax)}</td>
          <td class="num" style="color:var(--red)">−{fmt(c.itp2.tax)}</td>
        </tr>
        <tr style="border-top:1px solid var(--border);font-weight:700">
          <td style="padding:7px 8px">Nettolön (est.)</td>
          <td class="num" style="color:#6ee7b7">{fmt(c.akap.netto)}</td>
          <td class="num" style="color:#4f8ef7">{fmt(c.itp1.netto)}</td>
          <td class="num" style="color:#a78bfa">{fmt(c.itp2.netto)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Pension -->
  <h2>Pensionsavsättning per månad</h2>
  <div class="card" style="overflow-x:auto;margin-bottom:24px">
    <table style="width:100%;border-collapse:collapse;font-size:.88rem">
      <thead>
        <tr style="font-size:.72rem;color:var(--muted)">
          <th style="text-align:left;padding:8px">Post</th>
          <th class="num" style="color:#6ee7b7">AKAP-KR (nu)</th>
          <th class="num" style="color:#4f8ef7">ITP 1 (nytt)</th>
          <th class="num" style="color:#a78bfa">ITP 2 (nytt)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-top:1px solid var(--border)">
          <td style="padding:7px 8px;color:var(--muted)">AG-pensionsbidrag (AKAP-KR: 6 % / ITP 1: 4,5 % · 30 % över 7,5 IBB)</td>
          <td class="num">{fmt(c.akap.agPens)}</td>
          <td class="num">{fmt(c.itp1.agPens)}</td>
          <td class="num" style="color:var(--muted)">Förmånsb. ↓</td>
        </tr>
        <tr style="border-top:1px solid var(--border)">
          <td style="padding:7px 8px;color:var(--muted)">Löneväxling (din del)</td>
          <td class="num">{fmt(lvNu)}</td>
          <td class="num">{fmt(lvNy)}</td>
          <td class="num">{fmt(lvNy)}</td>
        </tr>
        <tr style="border-top:1px solid var(--border)">
          <td style="padding:7px 8px;color:var(--muted)">AG-bidrag på löneväxling ({fmtPct(agBidragPct)})</td>
          <td class="num">{fmt(c.akap.agLvBidrag)}</td>
          <td class="num">{fmt(c.itp1.agLvBidrag)}</td>
          <td class="num">{fmt(c.itp2.agLvBidrag)}</td>
        </tr>
        <tr style="border-top:1px solid var(--border);font-weight:700">
          <td style="padding:7px 8px">Totalt till pension/mån</td>
          <td class="num" style="color:#6ee7b7">{fmt(c.akap.totPens)}</td>
          <td class="num" style="color:#4f8ef7">{fmt(c.itp1.totPens)}</td>
          <td class="num" style="color:#a78bfa">{fmt(c.itp2.lvTot)} <span style="font-size:.72rem;color:var(--muted)">(lv)</span></td>
        </tr>
      </tbody>
    </table>
    <p style="font-size:.75rem;color:var(--muted);margin:10px 0 0">
      ITP 2 är förmånsbestämd — du betalar inte in ett belopp, du garanteras en utbetalning (se nedan).
      Löneväxlingen är avgiftsbestämd även i ITP 2.
    </p>
  </div>

  <!-- ITP 2 förmån -->
  <div class="card" style="margin-bottom:24px;border-left:4px solid #a78bfa">
    <h3 style="margin-top:0;color:#a78bfa">ITP 2 — Garanterad månadsutbetalning vid 65</h3>
    <p style="font-size:.82rem;color:var(--muted);margin:0 0 12px">
      ITP 2 är förmånsbestämd: du vet vad du får ut, men kapitalet äger inte du.
      Beräknat på bruttolön {fmt(lonNy)}/mån.
    </p>
    <!-- Tjänsteår-uppdelning -->
    <div style="font-size:.8rem;color:var(--muted);margin-bottom:12px;line-height:1.8">
      <div>Befintliga år (tidigare anst.): <strong>{itp2TidigareAr} år {itp2TidigareMon} mån</strong></div>
      <div>Nytt jobb ({nyJobbStart}–{c.itp2.fireYear}): <strong>{c.itp2.newJobYr} år</strong></div>
      <div>Totalt intjänat: <strong>{c.itp2.totalItp2Yr.toFixed(1)} av {ITP2_FULL_YEARS} år</strong>
        ({(c.itp2.totalItp2Yr / ITP2_FULL_YEARS * 100).toFixed(0)} % av full förmån)</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Full förmån (37 tjänsteår)</div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--muted)">{fmt(c.itp2.full)}/mån</div>
      </div>
      <div>
        <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Din förmån ({c.itp2.totalItp2Yr.toFixed(1)} av 37 år)</div>
        <div style="font-size:1.4rem;font-weight:700;color:#a78bfa">{fmt(c.itp2.prorated)}/mån</div>
      </div>
    </div>
    <p style="font-size:.75rem;color:var(--muted);margin:12px 0 0">
      ⚠ ITP 2 är ofta inte tillgänglig för nyanställda — de flesta privata arbetsgivare erbjuder numera bara ITP 1.
      Kontrollera med den nye arbetsgivaren vilken plan som gäller.
    </p>
  </div>

  <!-- Projicerat kapital -->
  <h2>Projicerat pensionskapital vid FIRE ({CURRENT_YEAR + arTillFire})</h2>
  <p style="font-size:.82rem;color:var(--muted);margin:-8px 0 16px">
    Löpande avsättning × {avkPct} % avkastning × {arTillFire} år
  </p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px">
    <div class="card" style="border-left:4px solid #6ee7b7">
      <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;margin-bottom:6px">AKAP-KR (nu)</div>
      <div style="font-size:1.6rem;font-weight:800;color:#6ee7b7">{fmtM(c.akap.totFV)}</div>
      <div style="font-size:.8rem;color:var(--muted);margin-top:4px">{fmt(c.akap.totPens)}/mån → pension</div>
    </div>
    <div class="card" style="border-left:4px solid #4f8ef7">
      <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;margin-bottom:6px">ITP 1 (nytt)</div>
      <div style="font-size:1.6rem;font-weight:800;color:#4f8ef7">{fmtM(c.itp1.totFV)}</div>
      <div style="font-size:.8rem;color:var(--muted);margin-top:4px">{fmt(c.itp1.totPens)}/mån → pension</div>
    </div>
    <div class="card" style="border-left:4px solid #a78bfa">
      <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;margin-bottom:6px">ITP 2 — löneväxling (avgiftsb.)</div>
      <div style="font-size:1.6rem;font-weight:800;color:#a78bfa">{fmtM(c.itp2.lvFV)}</div>
      <div style="font-size:.8rem;color:var(--muted);margin-top:4px">{fmt(c.itp2.lvTot)}/mån lv + AG-bidrag</div>
      <div style="font-size:.75rem;color:var(--muted);margin-top:2px">+ {fmt(c.itp2.prorated)}/mån garanterad förmån vid 65</div>
    </div>
  </div>

  <!-- ITP 2 kapitalvärde -->
  <div class="card" style="margin-bottom:24px;border-left:4px solid #a78bfa">
    <div style="display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:12px">
      <h3 style="margin:0;color:#a78bfa">ITP 2 — kapitalvärde av förmånspensionen</h3>
      <div class="form-row" style="margin:0">
        <label style="font-size:.8rem">Livslängd (år)</label>
        <input type="number" class="bgt-inp" bind:value={livslangd} step="1" min="66" max="100"
          style="width:70px" />
      </div>
    </div>
    <p style="font-size:.82rem;color:var(--muted);margin:0 0 14px">
      {fmt(c.itp2.prorated)}/mån × {livslangd - ITP2_START_AGE} år (65→{livslangd}) diskonterat med {avkPct} % avkastning.
      Du är {c.itp2.ageAtFire} år vid FIRE ({CURRENT_YEAR + arTillFire}) — ITP 2 startar {c.itp2.monTo65} år senare.
    </p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px">
      <div>
        <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Nominell total (65→{livslangd})</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--muted)">{fmtM(c.itp2.nominalTot)}</div>
      </div>
      <div>
        <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px">PV vid 65 ({avkPct} % disk.)</div>
        <div style="font-size:1.3rem;font-weight:700;color:#a78bfa">{fmtM(c.itp2.pvAt65)}</div>
      </div>
      <div>
        <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px">PV vid FIRE {CURRENT_YEAR + arTillFire}</div>
        <div style="font-size:1.3rem;font-weight:700;color:#a78bfa">{fmtM(c.itp2.pvAtFire)}</div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:2px">= jämförbart med ITP 1:s {fmtM(c.itp1.totFV)}</div>
      </div>
      <div>
        <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px">ITP 2 totalt vid FIRE</div>
        <div style="font-size:1.3rem;font-weight:700;color:#a78bfa">{fmtM(c.itp2.lvFV + c.itp2.pvAtFire)}</div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:2px">lv-kapital + förmånens PV</div>
      </div>
    </div>
  </div>

  <!-- Skillnad-banner -->
  <h2>Lönar det sig att byta jobb?</h2>
  <div class="card" style="margin-bottom:32px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:16px">
      <div>
        <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Nettolön per mån</div>
        <div style="font-size:1.3rem;font-weight:800" style:color={diffColor(c.diffNetto1)}>{sign(c.diffNetto1)}</div>
        <div style="font-size:.78rem;color:var(--muted)">ITP 1 vs AKAP-KR</div>
      </div>
      <div>
        <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Pension per mån</div>
        <div style="font-size:1.3rem;font-weight:800" style:color={diffColor(c.diffPens1)}>{sign(c.diffPens1)}</div>
        <div style="font-size:.78rem;color:var(--muted)">ITP 1 vs AKAP-KR</div>
      </div>
      <div>
        <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Total förmögenhetsskapande</div>
        <div style="font-size:1.3rem;font-weight:800" style:color={diffColor(c.diffNetto1 + c.diffPens1)}>{sign(c.diffNetto1 + c.diffPens1)}/mån</div>
        <div style="font-size:.78rem;color:var(--muted)">netto + pension, ITP 1 vs AKAP-KR</div>
      </div>
      <div>
        <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Extra pensionskapital vid FIRE</div>
        <div style="font-size:1.3rem;font-weight:800" style:color={diffColor(c.diffFV1)}>{c.diffFV1 >= 0 ? '+' : ''}{fmtM(c.diffFV1)}</div>
        <div style="font-size:.78rem;color:var(--muted)">ITP 1 vs AKAP-KR (om {arTillFire} år)</div>
      </div>
    </div>
    <div style="background:var(--border);height:1px;margin:4px 0 16px"></div>
    {#if c.diffNetto1 + c.diffPens1 > 0}
      <div style="color:var(--green);font-size:.92rem;font-weight:600">
        ✓ Jobbyte med ITP 1 är fördelaktigt — du får mer netto OCH mer pension varje månad.
        {#if c.diffFV1 > 500_000}
          Det ger {fmtM(c.diffFV1)} extra pensionskapital om {arTillFire} år.
        {/if}
      </div>
    {:else}
      <div style="color:var(--orange);font-size:.92rem;font-weight:600">
        ⚠ Jobbbytet ger inte entydigt mer — justera löneväxling eller lönenivå och se hur det påverkar.
      </div>
    {/if}
    <p style="font-size:.78rem;color:var(--muted);margin:10px 0 0">
      Skatteberäkningen är förenklad (kommunalskatt {fmtPct(kommunalPct)} + statlig 20 % + jobbskatteavdrag). Exakt netto beror på din kommun och övriga avdrag.
      AKAP-KR: 6 % upp till 7,5 IBB + 30 % däröver. ITP 1: 4,5 % upp till 7,5 IBB + 30 % däröver.
    </p>
  </div>

  <h2>Uttakssimulator</h2>
  <div class="card" style="margin-bottom:24px">
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
      <div class="form-row" style="margin:0"><label>Levnadskostnad (kr/mån)</label>
        <input type="number" class="bgt-inp" bind:value={levnadskostnad} step="500" /></div>
      <div class="form-row" style="margin:0"><label>Uttaksavkastning (%/år)</label>
        <input type="number" class="bgt-inp" bind:value={uttakAvkPct} step="0.5" /></div>
    </div>
    <div style="position:relative;height:320px">
      <canvas bind:this={uttaksCanvas}></canvas>
    </div>
    <p style="font-size:.75rem;color:var(--muted);margin:8px 0 0">
      Visar enbart pensionskapital från det aktuella jobbet (AKAP-KR/ITP 1/ITP 2 löneväxling).
      ITP 2 garanterad pension (lila streckad) startar {BIRTH_YEAR + ITP2_START_AGE}.
    </p>
  </div>

  <h2>🌉 Brygga-simulator med ITP 1 (hela familjens bild)</h2>
  <p style="font-size:.82rem;color:var(--muted);margin:-8px 0 16px">
    Samma vy som <a href="fire.html">Brygga-simulatorn</a>, men Felipes AKAP-KR-inbetalningar (nuvarande jobb)
    är ersatta med ITP 1-avsättning + löneväxling {fmt(lvNy)}/mån på ny lön {fmt(lonNy)}/mån.
    Ulrikas pensioner, Allmänpension, NAV och redan intjänad Fast TjP är oförändrade (från Ekonomi-sidan).
    Avkastning {fmtPct(avkPct)} · {arTillFire} år till FIRE.
  </p>

  <div class="kpi-bar" style="margin-bottom:16px">
    <div class="kpi"><div class="kpi-label">Brygga-startår</div><div class="kpi-value orange">{itp1Brygga.fireYear} (om {arTillFire} år)</div></div>
    <div class="kpi">
      <div class="kpi-label">Brygga-kapital</div>
      <div class="kpi-value">{fmtM(itp1Brygga.bryggaKapital)}</div>
      <div class="kpi-sub" style="font-size:.7rem;color:var(--muted)">PV av gap tills pension täcker allt</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Brygga-täckning</div>
      <div class="kpi-value" style:color={itp1Brygga.bryggaTackning >= 100 ? 'var(--green)' : itp1Brygga.bryggaTackning >= 75 ? 'var(--orange)' : 'var(--red)'}>{itp1Brygga.bryggaTackning.toFixed(1)} %</div>
      <div class="kpi-sub" style="font-size:.7rem;color:var(--muted)">Fritt kapital / brygga-kapital</div>
    </div>
    <div class="kpi"><div class="kpi-label">Fritt kapital vid start</div><div class="kpi-value">{fmtM(itp1Brygga.kapital)}</div></div>
    <div class="kpi"><div class="kpi-label">Total förmögenhet vid start</div><div class="kpi-value purple">{fmtM(itp1Brygga.totaltFV)}</div></div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start;margin-bottom:24px">
    <section>
      <h3 style="margin-top:0">Pensionsinkomster per fas</h3>
      <div class="card" style="overflow-x:auto">
        <table class="fase-table">
          <thead><tr>
            <th>#</th><th>År</th><th>Ålder</th><th>Händelse</th>
            <th class="num text-felipe">F/mån</th>
            <th class="num text-ulrika">U/mån</th>
            <th class="num">Tot/mån</th>
            <th class="num">Gap</th>
          </tr></thead>
          <tbody>
            {#each itp1Brygga.phases as ph, i}
              {@const tot  = ph.incomeF + ph.incomeU}
              {@const gap  = bryggaEk.levnadskostnad - tot}
              {@const col  = FASE_COLORS[i] ?? '#8892a4'}
              <tr>
                <td><span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:{col}22;color:{col};font-size:.72rem;font-weight:700">{ph.nr}</span></td>
                <td class="text-muted">{ph.year}</td>
                <td style="white-space:nowrap;font-size:.82rem"><span class="text-felipe">F:{ph.ageF}</span>&ensp;<span class="text-ulrika">U:{ph.ageU}</span></td>
                <td>
                  {#each ph.labels as lbl}
                    {@const ev = itp1Brygga.events.find(e => e.label === lbl.replace(' (redan aktiv)', ''))}
                    {@html badge(lbl, ev?.who ?? 'f')}
                  {/each}
                </td>
                <td class="num text-felipe fw-bold">{fmt(ph.incomeF)}</td>
                <td class="num text-ulrika fw-bold">{fmt(ph.incomeU)}</td>
                <td class="num fw-bold">{fmt(tot)}</td>
                <td class="num">
                  {#if gap > 0}
                    <span class="text-red fw-bold">-{fmt(Math.round(gap))}</span>
                  {:else}
                    <span class="text-green fw-bold">+{fmt(Math.round(-gap))}</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h3 style="margin-top:0">Kapital vid FIRE-start</h3>
      <div class="card">
        <canvas bind:this={bryggaPieCanvas} height="240"></canvas>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
          <div>
            <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px">TjP Sverige (tidigare, fryst)</div>
            <div style="font-size:1.15rem;font-weight:700;color:#f59e0b">{fmtM(itp1Breakdown.felipeGammalTjp + itp1Breakdown.ulrikaTjp)}</div>
            <div style="font-size:.72rem;color:var(--muted);margin-top:2px">AKAP-KR/Kåpan/tidigare löneväxling (F) + TjP (U) — inga nya inbetalningar</div>
          </div>
          <div>
            <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px">ITP 1 (nytt jobb)</div>
            <div style="font-size:1.15rem;font-weight:700;color:#22d3ee">{fmtM(itp1Breakdown.itp1Nytt)}</div>
            <div style="font-size:.72rem;color:var(--muted);margin-top:2px">{fmt(itp1Contrib(lonNy) + lvNy)}/mån i {arTillFire} år</div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <h3>Uttakssimulator — hela familjens bild</h3>
  <div class="card" style="height:320px;margin-bottom:24px">
    <canvas bind:this={bryggaUttaksCanvas} style="height:100%"></canvas>
  </div>

  <footer>Jobbyte-analys · Verdu Ekonomi</footer>
</div>
