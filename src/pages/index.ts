import '../../src/style.css';
import { initAuth } from '../auth';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { computeFire, computeNV } from '../calculations';
import { ekStore, fireStore } from '../store';
import { renderTopnav, injectInfoBtn } from '../nav';
import { INFO } from '../infoContent';
import { AP_INDEX_RATE, AP_TAK, PP_RATE, CHART_DARK_GRID, CHART_DARK_TEXT } from '../constants';

await initAuth();

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

renderTopnav('index.html');

injectInfoBtn(INFO.index.title, INFO.index.sections);

// ── AKAP-KR 2026 ──────────────────────────────────────────────────────────────
const AKAP_CAP  = 52_125;   // 7,5 IBB kr/mån
const AKAP_LOW  = 0.06;     // 6 % under taket
const AKAP_HIGH = 0.315;    // 31,5 % över taket

function akapMon(brutto: number): number {
  return Math.min(brutto, AKAP_CAP) * AKAP_LOW +
         Math.max(0, brutto - AKAP_CAP) * AKAP_HIGH;
}

const LS_BOSTAD = 'vek_idx_bostad_avk';

function fmt(n: number)  { return Math.round(n).toLocaleString('sv-SE') + ' kr'; }
function fmtM(n: number) { return (n / 1e6).toFixed(2) + ' MSEK'; }

// CHART_DARK_GRID / CHART_DARK_TEXT importeras från constants.ts

let nvChart: Chart | null = null;

function render(): void {
  const ek  = ekStore.get();
  const s   = fireStore.get();
  const r   = computeFire(ek, s);
  const avk = s.avkPct / 100;
  const isk = s.iskPct / 100;
  const bostadAvk = parseFloat(
    (document.getElementById('idx-bostad-avk') as HTMLInputElement)?.value ?? '2'
  ) / 100;

  // ── Netto förmögenhet ────────────────────────────────────────────────────────
  const nv = computeNV(ek);

  document.getElementById('hero-nv')!.textContent = fmtM(nv);
  document.getElementById('hero-nv-sub')!.textContent =
    `Totalt = ${fmt(nv)} · Fritt FIRE-kapital ${fmtM(r.kapital)}`;

  // ── Brygga-KPI:er ────────────────────────────────────────────────────────────
  document.getElementById('kpi-year')!.textContent    = String(r.fireYear);
  const pctEl = document.getElementById('kpi-pct')!;
  pctEl.textContent = `${r.bryggaTackning.toFixed(1)} %`;
  pctEl.style.color = r.bryggaTackning >= 100 ? 'var(--green)' : r.bryggaTackning >= 75 ? 'var(--orange)' : 'var(--red)';
  document.getElementById('kpi-kapital')!.textContent = fmtM(r.kapital);
  document.getElementById('kpi-total')!.textContent   = fmtM(r.totaltFV);
  document.getElementById('kpi-levnad')!.textContent  = fmt(ek.levnadskostnad);

  // ── Nästa händelse ────────────────────────────────────────────────────────────
  const today = new Date().getFullYear();
  const nextEv = r.events.find(e => e.year > today);
  const card   = document.getElementById('next-event-card')!;
  if (nextEv) {
    const arKvar = nextEv.year - today;
    card.innerHTML = `<span class="fw-bold">${nextEv.label}</span> <span class="text-muted">&nbsp;· om ${arKvar} år (${nextEv.year})</span>`;
  }

  // ── Pensionstabell ────────────────────────────────────────────────────────────
  document.getElementById('pension-summary')!.innerHTML = r.pensions.map(p => {
    const isLiv  = p.livsvarig;
    const tomCell = isLiv
      ? `<td style="color:var(--green);font-size:.78rem">livsvarig</td>`
      : `<td>${p.toYear < 9999 ? p.toYear : '—'}</td>`;
    const style  = isLiv ? 'color:var(--green)' : '';
    return `<tr>
      <td style="${style}">${p.label}</td>
      <td>${p.fromYear}</td>
      ${tomCell}
      <td class="num fw-bold">${fmt(p.monthly)}</td>
    </tr>`;
  }).join('');

  // ── Förmögenhetsförändring per år ────────────────────────────────────────────

  // 1. AP (inkomstpension) — indexuppräkning 1,9 % + nya avsättningar 16 %
  const apKapital    = ek.ap_f + ek.ap_u;
  const apIndex      = apKapital * AP_INDEX_RATE;
  const pgiFelipe    = Math.min(ek.brutto_f * 12, AP_TAK);
  const pgiUlrika    = Math.min(ek.brutto_u * 12, AP_TAK);
  const apBidragF    = pgiFelipe * 0.16;
  const apBidragU    = pgiUlrika * 0.16;
  const apTotal      = apIndex + apBidragF + apBidragU;

  // 2. Premiepension — 2,5 % av PGI + avkastning på befintligt kapital
  const ppBidrag = (pgiFelipe + pgiUlrika) * PP_RATE;
  const ppTotal  = (ek.pp_f + ek.pp_u) * avk + ppBidrag;

  // 3. TjP Sverige — AKAP-KR arbetsgivaravgift + löneväxling + avkastning
  const akapF        = akapMon(ek.brutto_f) * 12;
  const akapU        = akapMon(ek.brutto_u) * 12;
  const lonevxlAr    = ek.lonevxl_pmt * 12;
  const tjpKapital   = ek.tjp_f_pv + ek.lonevxl_pv + ek.tidigare_pv + ek.kapan_pv + ek.tjp_u_pv;
  const tjpTotal     = akapF + akapU + lonevxlAr + tjpKapital * avk;

  // 4. TjP Norge — avkastning på befintligt kapital (ingen ny pmt modellerad)
  const norgeKapital = ek.norge_f_pv + ek.dnb_f_pv + ek.sb_f_pv + ek.sb_u_pv + ek.dnb_u_pv;
  const norgeTotal   = norgeKapital * avk;

  // 5. Bostad — marknadsvärdetillväxt (amortering är nettoneutral mot lån)
  const bostadMarket = ek.villa_varde + ek.lagenhet_varde;
  const bostadTotal  = bostadMarket * bostadAvk;

  // 6. Privata fonder (ISK) — avkastning + nya insättningar
  const lysaKapital  = ek.lysa_f_pv + ek.lysa_u_pv + ek.buffert_u_pv;
  const lysaAvk      = lysaKapital * (avk - isk);
  const lysaSpar     = (ek.lysa_f_pmt + ek.lysa_u_pmt + ek.buffert_u_pmt) * 12;
  const lysaTotal    = lysaAvk + lysaSpar;

  // 7. Sparkonto / borgensavi
  const borgoAvk  = ek.sparkonto_pv * (s.borgoRanta / 100);
  const borgoSpar = ek.sparkonto_pmt * 12;
  const borgoTotal = borgoAvk + borgoSpar;

  const total = apTotal + ppTotal + tjpTotal + norgeTotal + bostadTotal + lysaTotal + borgoTotal;
  const totalPct = nv > 0 ? (total / nv) * 100 : 0;

  document.getElementById('nv-change-total')!.textContent =
    `+${fmtM(total)}/år  (+${totalPct.toFixed(1)} % av NV)`;

  // ── Stapeldiagram ─────────────────────────────────────────────────────────────
  const labels = [
    'AP (inkomstpension)',
    'Premiepension',
    'TjP Sverige (AKAP-KR + löneväxling + avk)',
    'TjP Norge (avkastning)',
    'Bostad (marknadstillväxt)',
    'Lysa/ISK (avk + insättningar)',
    'Sparkonto (avk + insättningar)',
  ];
  const values = [apTotal, ppTotal, tjpTotal, norgeTotal, bostadTotal, lysaTotal, borgoTotal];
  const colors = ['#34d399','#6ee7b7','#f59e0b','#f87171','#a78bfa','#4f8ef7','#60a5fa'];

  const ctx = (document.getElementById('nv-change-chart') as HTMLCanvasElement).getContext('2d')!;
  if (nvChart) nvChart.destroy();
  nvChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => ` ${fmt(c.raw as number)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: CHART_DARK_GRID },
          ticks: { color: CHART_DARK_TEXT, callback: v => `${Math.round(Number(v) / 1000)}k` },
        },
        y: { grid: { color: CHART_DARK_GRID }, ticks: { color: CHART_DARK_TEXT, font: { size: 11 } } },
      },
    },
  });
}

// ── Kom igång-kort ────────────────────────────────────────────────────────────
function updateOnboarding(): void {
  const ek = ekStore.get();
  const isEmpty =
    ek.lysa_f_pv === 0 && ek.lysa_u_pv === 0 &&
    ek.tjp_f_pv  === 0 && ek.sparkonto_pv === 0 &&
    ek.ap_f      === 0;
  const card = document.getElementById('onboarding-card')!;
  card.style.display = isEmpty ? '' : 'none';
}

// ── Scenario-sliders ──────────────────────────────────────────────────────────
function initDashSliders(): void {
  const s = fireStore.get();

  const slAvk   = document.getElementById('dash-avk')   as HTMLInputElement;
  const slAr    = document.getElementById('dash-ar')    as HTMLInputElement;
  const slUttak = document.getElementById('dash-uttak') as HTMLInputElement;

  slAvk.value   = String(s.avkPct);
  slAr.value    = String(s.antalAr);
  slUttak.value = String(s.uttakAvkPct);

  function sync() {
    const avk   = parseFloat(slAvk.value);
    const ar    = parseFloat(slAr.value);
    const uttak = parseFloat(slUttak.value);
    document.getElementById('dash-avk-val')!.textContent   = `${avk} %`;
    document.getElementById('dash-ar-val')!.textContent    = `${ar} år`;
    document.getElementById('dash-uttak-val')!.textContent = `${uttak} %`;
    fireStore.setField('avkPct',      avk);
    fireStore.setField('antalAr',     ar);
    fireStore.setField('uttakAvkPct', uttak);
    render();
  }

  sync(); // initialt
  slAvk.addEventListener('input',   sync);
  slAr.addEventListener('input',    sync);
  slUttak.addEventListener('input', sync);
}

initDashSliders();
updateOnboarding();
render();

// Bostad-input
const bostadInp = document.getElementById('idx-bostad-avk') as HTMLInputElement;
bostadInp.value = localStorage.getItem(LS_BOSTAD) ?? '2';
bostadInp.addEventListener('input', () => {
  localStorage.setItem(LS_BOSTAD, bostadInp.value);
  render();
});

window.addEventListener('storage', (e) => {
  if (e.key?.startsWith('vek_')) { updateOnboarding(); render(); }
});
