import '../../src/style.css';
import { initAuth } from '../auth';
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js';
import { computeFire } from '../calculations';
import { ekStore, fireStore } from '../store';
import { renderTopnav } from '../nav';

await initAuth();

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

renderTopnav('skatt.html');

const KOMMUNAL       = 0.31;
const STATLIG_GRANS  = 615_300;
const STATLIG_RATE   = 0.20;

// ── Skatteberäkning ────────────────────────────────────────────────────────────

/** Förhöjt grundavdrag för pensionärer 65+ (approximation SKV 2024) */
function fga65(annual: number): number {
  if (annual <= 134_600) return annual;            // helt skattefritt
  if (annual <= 220_000) return 134_600;
  if (annual <= 450_000) return 134_600 + 0.08 * (annual - 220_000);
  if (annual <= 615_300) return Math.max(85_000, 152_000 - 0.08 * (annual - 450_000));
  return Math.max(75_000, 140_000 - 0.08 * (annual - 450_000));
}

/** Grundavdrag för ej-pensionärer (<65) */
function ga(annual: number): number {
  if (annual <= 134_600) return annual;
  return 13_900; // förenkling för höga inkomster
}

/** Progressiv inkomstskatt — isPensioner = 65+ (förhöjt grundavdrag) */
function pensionTax(annualGross: number, isPensioner: boolean): number {
  if (annualGross <= 0) return 0;
  const avdrag   = isPensioner ? fga65(annualGross) : ga(annualGross);
  const taxable  = Math.max(0, annualGross - avdrag);
  const kommunal = taxable * KOMMUNAL;
  const statlig  = Math.max(0, annualGross - STATLIG_GRANS) * STATLIG_RATE;
  return Math.round(kommunal + statlig);
}

function fmt(n: number)  { return Math.round(n).toLocaleString('sv-SE') + ' kr'; }
function fmtM(n: number) { return (Math.abs(n) / 1e6).toFixed(2) + ' MSEK'; }
function pct(n: number)  { return n.toFixed(1) + ' %'; }

// ── Huvud-render ───────────────────────────────────────────────────────────────
let chart: Chart | null = null;

function render(): void {
  const ek = ekStore.get();
  const s  = fireStore.get();
  const r  = computeFire(ek, s);

  const flatRate       = s.skattPct / 100;
  const skattFaktor    = 1 - flatRate;
  const felipeBorn     = 1975;
  const ulrikaBorn     = 1970;

  type Row = {
    year: number;
    fGrossAnn: number; fTax30: number; fTaxProg: number;
    uGrossAnn: number; uTax30: number; uTaxProg: number;
  };

  const rows: Row[] = [];
  const END_YEAR = Math.min(r.fireYear + 40, 2075);

  for (let yr = r.fireYear; yr <= END_YEAR; yr++) {
    const fNet = r.pensions.filter(p => p.who === 'f' && yr >= p.fromYear && yr <= p.toYear)
      .reduce((sum, p) => sum + p.monthly, 0);
    const uNet = r.pensions.filter(p => p.who === 'u' && yr >= p.fromYear && yr <= p.toYear)
      .reduce((sum, p) => sum + p.monthly, 0);

    if (fNet === 0 && uNet === 0) continue;

    const fGrossAnn = Math.round(fNet / skattFaktor) * 12;
    const uGrossAnn = Math.round(uNet / skattFaktor) * 12;

    const fAge = yr - felipeBorn;
    const uAge = yr - ulrikaBorn;

    rows.push({
      year: yr,
      fGrossAnn,
      fTax30:   Math.round(fGrossAnn * flatRate),
      fTaxProg: pensionTax(fGrossAnn, fAge >= 65),
      uGrossAnn,
      uTax30:   Math.round(uGrossAnn * flatRate),
      uTaxProg: pensionTax(uGrossAnn, uAge >= 65),
    });
  }

  // ── KPI ─────────────────────────────────────────────────────────────────────
  const totFlat = rows.reduce((s, r) => s + r.fTax30 + r.uTax30, 0);
  const totProg = rows.reduce((s, r) => s + r.fTaxProg + r.uTaxProg, 0);
  const saving  = totFlat - totProg;

  const fPeakPct = Math.max(...rows.map(r => r.fGrossAnn > 0 ? r.fTaxProg / r.fGrossAnn * 100 : 0));
  const uPeakPct = Math.max(...rows.map(r => r.uGrossAnn > 0 ? r.uTaxProg / r.uGrossAnn * 100 : 0));

  document.getElementById('kpi-flat')!.textContent    = fmtM(totFlat);
  document.getElementById('kpi-prog')!.textContent    = fmtM(totProg);
  const savEl = document.getElementById('kpi-saving')!;
  savEl.textContent  = (saving >= 0 ? '+' : '') + fmtM(saving);
  savEl.style.color  = saving >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('kpi-f-peak')!.textContent  = pct(fPeakPct);
  document.getElementById('kpi-u-peak')!.textContent  = pct(uPeakPct);

  // ── Tabell ───────────────────────────────────────────────────────────────────
  const tbody = document.getElementById('skatt-tbody')!;
  tbody.innerHTML = rows.map(row => {
    const saving = (row.fTax30 + row.uTax30) - (row.fTaxProg + row.uTaxProg);
    const fEff   = row.fGrossAnn > 0 ? row.fTaxProg / row.fGrossAnn * 100 : 0;
    const uEff   = row.uGrossAnn > 0 ? row.uTaxProg / row.uGrossAnn * 100 : 0;
    const savCol = saving >= 0
      ? `<span style="color:var(--green)">+${fmt(saving)}</span>`
      : `<span style="color:var(--red)">${fmt(saving)}</span>`;
    return `<tr style="border-top:1px solid #2d3348">
      <td style="padding:5px 8px;color:var(--muted)">${row.year}</td>
      <td style="text-align:right;padding:5px 6px">${fmt(Math.round(row.fGrossAnn / 12))}</td>
      <td style="text-align:right;padding:5px 6px;color:var(--red)">${fmt(Math.round(row.fTax30 / 12))}</td>
      <td style="text-align:right;padding:5px 6px;color:var(--orange)">${fmt(Math.round(row.fTaxProg / 12))}</td>
      <td style="text-align:right;padding:5px 6px;color:var(--accent)">${pct(fEff)}</td>
      <td style="text-align:right;padding:5px 6px">${fmt(Math.round(row.uGrossAnn / 12))}</td>
      <td style="text-align:right;padding:5px 6px;color:var(--red)">${fmt(Math.round(row.uTax30 / 12))}</td>
      <td style="text-align:right;padding:5px 6px;color:var(--orange)">${fmt(Math.round(row.uTaxProg / 12))}</td>
      <td style="text-align:right;padding:5px 6px;color:var(--accent2)">${pct(uEff)}</td>
      <td style="text-align:right;padding:5px 6px">${savCol}</td>
    </tr>`;
  }).join('');

  // ── Graf ─────────────────────────────────────────────────────────────────────
  const labels  = rows.map(r => String(r.year));
  const fEffArr = rows.map(r => r.fGrossAnn > 0 ? +(r.fTaxProg / r.fGrossAnn * 100).toFixed(1) : 0);
  const uEffArr = rows.map(r => r.uGrossAnn > 0 ? +(r.uTaxProg / r.uGrossAnn * 100).toFixed(1) : 0);
  const flat30  = rows.map(() => s.skattPct);

  const ctx = (document.getElementById('skatt-chart') as HTMLCanvasElement).getContext('2d')!;
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Felipe eff. %',  data: fEffArr, borderColor: '#6ee7b7', backgroundColor: 'transparent', tension: 0.3, pointRadius: 3 },
        { label: 'Ulrika eff. %',  data: uEffArr, borderColor: '#a78bfa', backgroundColor: 'transparent', tension: 0.3, pointRadius: 3 },
        { label: `Schablonmässig ${s.skattPct} %`, data: flat30, borderColor: '#f87171', backgroundColor: 'transparent', borderDash: [5, 5], pointRadius: 0 },
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

render();

window.addEventListener('storage', e => {
  if (e.key?.startsWith('vek_')) render();
});
