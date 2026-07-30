import '../../src/style.css';
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js';
import { simulateUttag } from '../calculations';
import { resultStore } from '../store';
import { NAV_LINKS } from '../constants';
import type { PensionStream } from '../types';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

// ── Navigation ─────────────────────────────────────────────────────────────────
document.getElementById('topnav')!.innerHTML = NAV_LINKS.map(l =>
  `<a href="${l.href}"${l.href === 'uttag.html' ? ' class="active"' : ''}>${l.icon} ${l.label}</a>`
).join('');

const DARK_GRID = '#2d3348';
const DARK_TEXT = '#8892a4';
let chart: Chart | null = null;

function fmt(n: number) { return Math.round(n).toLocaleString('sv-SE') + ' kr'; }
function fmtM(n: number) { return (n / 1e6).toFixed(2) + ' MSEK'; }

// ── Läs pensionsströmmar från resultStore ─────────────────────────────────────
function loadPensions(): PensionStream[] {
  const streams: PensionStream[] = [];
  for (let i = 1; i <= 7; i++) {
    const from  = resultStore.getNum(`p${i}_from`);
    const to    = resultStore.getNum(`p${i}_to`, 9999);
    const mon   = resultStore.getNum(`p${i}_monthly`);
    const label = resultStore.getString(`p${i}_label`, `Pension ${i}`);
    const liv   = resultStore.getNum(`p${i}_livsvarig`) === 1;
    if (from > 0) {
      streams.push({ id: i, label, who: i <= 3 || i === 5 ? (i % 2 === 0 ? 'u' : 'f') : (i === 4 ? 'u' : 'f'), fromYear: from, toYear: to, monthly: mon, livsvarig: liv });
    }
  }
  return streams;
}

// ── Uppdatera pensionstabell ───────────────────────────────────────────────────
function renderPensionTable(pensions: PensionStream[]): void {
  const tbody = document.getElementById('pension-tbody')!;
  const LIVSVARIG = [4, 6, 7];
  tbody.innerHTML = pensions.map(p => {
    const isLiv  = LIVSVARIG.includes(p.id);
    const tomCell = isLiv
      ? `<td style="text-align:center;color:var(--green);font-size:.78rem">livsvarig</td>`
      : `<td style="text-align:center">${p.toYear < 9999 ? p.toYear : '—'}</td>`;
    const color = isLiv ? 'color:var(--green)' : '';
    return `<tr>
      <td style="${color}">${p.label}</td>
      <td style="text-align:center">${p.fromYear}</td>
      ${tomCell}
      <td class="num fw-bold">${fmt(p.monthly)}</td>
    </tr>`;
  }).join('');
}

// ── Huvud-render ───────────────────────────────────────────────────────────────
function render(): void {
  const kapital    = resultStore.getNum('kapital');
  const avkPct     = resultStore.getNum('uttakAvkPct', 2);
  const startYear  = resultStore.getNum('fireYear', new Date().getFullYear() + 10);
  const uttag      = parseFloat((document.getElementById('sl-uttag') as HTMLInputElement).value);
  const pensions   = loadPensions();

  // Uppdatera displays
  document.getElementById('disp-kapital')!.textContent = fmtM(kapital);
  document.getElementById('disp-avk')!.textContent     = `${avkPct} %`;
  document.getElementById('disp-year')!.textContent    = String(startYear);
  document.getElementById('disp-uttag')!.textContent   = fmt(uttag);

  renderPensionTable(pensions);

  // Simulering
  const sim = simulateUttag(kapital, avkPct, startYear, uttag, pensions);

  // Verdict
  const verdictEl = document.getElementById('verdict')!;
  if (sim.depletedYear) {
    verdictEl.className = 'verdict bad';
    verdictEl.textContent = `⚠ Kapitalet tar slut ${sim.depletedYear} — minska uttag eller öka avkastning.`;
  } else if (sim.swr > 4) {
    verdictEl.className = 'verdict warn';
    verdictEl.textContent = `~ SWR ${sim.swr.toFixed(1)} % är högt — kapitalet kan ta slut vid låg avkastning.`;
  } else {
    verdictEl.className = 'verdict ok';
    verdictEl.textContent = `✓ Kapitalet räcker till 2080+ med SWR ${sim.swr.toFixed(1)} %.`;
  }

  // Diagram
  const ctx = (document.getElementById('uttaks-chart') as HTMLCanvasElement).getContext('2d')!;
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sim.rows.map(r => String(r.year)),
      datasets: [
        { label: 'Kapital (MSEK)', data: sim.rows.map(r => r.capital / 1e6), borderColor: '#4f8ef7', backgroundColor: '#4f8ef720', fill: true, tension: 0.3, pointRadius: 0, yAxisID: 'y' },
        { label: 'Pension/mån (kr)', data: sim.rows.map(r => r.pensionMon), borderColor: '#6ee7b7', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, yAxisID: 'y1' },
      ],
    },
    options: {
      scales: {
        x:  { grid: { color: DARK_GRID }, ticks: { color: DARK_TEXT, maxTicksLimit: 10 } },
        y:  { grid: { color: DARK_GRID }, ticks: { color: DARK_TEXT, callback: v => `${v} M` }, position: 'left' },
        y1: { grid: { drawOnChartArea: false }, ticks: { color: '#6ee7b7', callback: v => `${Math.round(Number(v) / 1000)}k` }, position: 'right' },
      },
      plugins: { legend: { labels: { color: DARK_TEXT } } },
    },
  });

  // Detajtabell
  const detailTbody = document.getElementById('detail-tbody')!;
  const isDep = (yr: number) => sim.depletedYear !== null && yr >= sim.depletedYear;
  detailTbody.innerHTML = sim.rows.map(row => {
    const dep    = isDep(row.year);
    const fColor = row.delta >= 0 ? '#6ee7b7' : '#f87171';
    const sign   = row.delta >= 0 ? '+' : '';
    return `<tr style="${dep ? 'opacity:.4' : ''}">
      <td>${row.year}</td>
      <td class="num">${dep ? '—' : fmtM(row.capital)}</td>
      <td class="num" style="color:var(--green)">${fmt(row.returns)}</td>
      <td class="num" style="color:var(--orange)">${row.pensionMon > 0 ? fmt(row.pensionMon) + '/mån' : '—'}</td>
      <td class="num">${fmt(row.netUttag)}/mån</td>
      <td class="num" style="color:${fColor}">${sign}${fmt(row.delta)}</td>
    </tr>`;
  }).join('');
}

// ── Slider ─────────────────────────────────────────────────────────────────────
const slUttag = document.getElementById('sl-uttag') as HTMLInputElement;
slUttag.addEventListener('input', () => render());

// ── Init & synk ────────────────────────────────────────────────────────────────
render();

// Synk när FIRE-simulatorn uppdateras i annan flik eller vid bfcache
window.addEventListener('storage', (e) => {
  if (e.key?.startsWith('vek_res_')) render();
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted) render();
});
