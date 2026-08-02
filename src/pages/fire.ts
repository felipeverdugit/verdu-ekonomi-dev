import '../../src/style.css';
import { initAuth } from '../auth';
import { Chart, ArcElement, DoughnutController, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js';
import { computeFire, simulateUttag } from '../calculations';
import { ekStore, fireStore, resultStore } from '../store';
import { SLIDER_RANGES } from '../constants';
import { renderTopnav } from '../nav';
import type { FireResult, FireSettings } from '../types';
import { initSyncWidget } from '../syncWidget';

await initAuth();

Chart.register(ArcElement, DoughnutController, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

// ── Navigation ─────────────────────────────────────────────────────────────────
renderTopnav('fire.html');

// ── Slider-konfiguration ───────────────────────────────────────────────────────
type SliderKey = keyof typeof SLIDER_RANGES;
const SLIDERS: SliderKey[] = [
  'avkPct','antalAr','uttakAvkPct','tjpAr','skattPct','borgoRanta',
  'lonehojF','lonehojU','fTjpAge','fNorskTjpAge','uNorskTjpAge','uTjpAge','fAllmanAge','uAllmanAge',
];

// ── Diagram-instanser ──────────────────────────────────────────────────────────
let pieChart: Chart | null = null;
let uttaksChart: Chart | null = null;

const PIE_LABELS = ['Fonder', 'Sparkonto', 'TjP Sverige', 'TjP Norge', 'Premiepension', 'Inkomstpension'];
const PIE_COLORS = ['#4f8ef7','#6ee7b7','#f59e0b','#f87171','#a78bfa','#34d399'];
const DARK_GRID  = '#2d3348';
const DARK_TEXT  = '#8892a4';

function fmt(n: number) { return Math.round(n).toLocaleString('sv-SE') + ' kr'; }
function fmtM(n: number) { return (n / 1e6).toFixed(2) + ' MSEK'; }

// ── Huvud-render ───────────────────────────────────────────────────────────────
function render(): void {
  const ek = ekStore.get();
  const s  = fireStore.get();
  const r  = computeFire(ek, s);

  updateKPIs(r, ek.levnadskostnad);
  updateFaseTable(r, ek);
  updatePieChart(r);
  updateUttaksChart(r, ek);
  exportToUttag(r);
}

function updateKPIs(r: FireResult, levnad: number): void {
  const yr    = r.fireYear;
  const today = new Date().getFullYear();
  document.getElementById('kpi-year')!.textContent    = `${yr} (om ${yr - today} år)`;
  document.getElementById('kpi-brygga')!.textContent  = fmtM(r.bryggaKapital);
  document.getElementById('kpi-pct')!.textContent     = `${r.bryggaTackning.toFixed(1)} %`;
  document.getElementById('kpi-pct')!.style.color     = r.bryggaTackning >= 100 ? 'var(--green)' : r.bryggaTackning >= 75 ? 'var(--orange)' : 'var(--red)';
  document.getElementById('kpi-kapital')!.textContent = fmtM(r.kapital);
  document.getElementById('kpi-total')!.textContent   = fmtM(r.totaltFV);
  document.getElementById('fire-subtitle')!.textContent =
    `Genererad ${new Date().toLocaleDateString('sv-SE')} · Levnadskostnad ${fmt(levnad)}/mån`;
}

function badge(label: string, who: string): string {
  const isU    = who === 'u';
  const isFire = label.includes('FIRE');
  const color  = isFire ? '#f59e0b' : isU ? '#a78bfa' : '#6ee7b7';
  const short  = label.replace(/^(Felipe|Ulrika) \d+:\s*/, '').replace(' (redan aktiv)', '');
  return `<span class="badge" style="background:${color}18;color:${color};border:1px solid ${color}40">${isU ? 'U: ' : isFire ? '' : 'F: '}${short}</span>`;
}

function updateFaseTable(r: FireResult, ek: { levnadskostnad: number }): void {
  const tbody = document.getElementById('fase-tbody')!;
  const FASE_COLORS = ['#4f8ef7','#6ee7b7','#f59e0b','#f87171','#a78bfa','#34d399','#60a5fa'];

  tbody.innerHTML = r.phases.map((ph, i) => {
    const tot      = ph.incomeF + ph.incomeU;
    const gap      = ek.levnadskostnad - tot;
    const color    = FASE_COLORS[i] ?? '#8892a4';
    const gapHtml = gap > 0
      ? `<span class="text-red fw-bold">-${fmt(Math.round(gap))}</span>`
      : `<span class="text-green fw-bold">+${fmt(Math.round(-gap))}</span>`;
    const badges = ph.labels.map(l => {
      const ev = r.events.find(e => e.label === l.replace(' (redan aktiv)', ''));
      return badge(l, ev?.who ?? 'f');
    }).join('');

    return `<tr>
      <td><span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:${color}22;color:${color};font-size:.72rem;font-weight:700">${ph.nr}</span></td>
      <td class="text-muted">${ph.year}</td>
      <td style="white-space:nowrap;font-size:.82rem"><span class="text-felipe">F:${ph.ageF}</span>&ensp;<span class="text-ulrika">U:${ph.ageU}</span></td>
      <td>${badges}</td>
      <td class="num text-felipe fw-bold">${fmt(ph.incomeF)}</td>
      <td class="num text-ulrika fw-bold">${fmt(ph.incomeU)}</td>
      <td class="num fw-bold">${fmt(tot)}</td>
      <td class="num">${gapHtml}</td>
    </tr>`;
  }).join('');
}

function updatePieChart(r: FireResult): void {
  const data = [r.fonder_fv, r.sparkonto_fv, r.tjp_fv, r.norge_fv, r.pp_fv, r.ap_fv];
  const ctx  = (document.getElementById('pie-chart') as HTMLCanvasElement).getContext('2d')!;
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: PIE_LABELS,
      datasets: [{ data, backgroundColor: PIE_COLORS, borderWidth: 2, borderColor: '#1a1d27' }],
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: DARK_TEXT, font: { size: 11 } } },
        tooltip: { callbacks: { label: (c) => ` ${fmtM(c.raw as number)}` } },
      },
    },
  });
}

function updateUttaksChart(r: FireResult, ek: { levnadskostnad: number, levnadskostnad2: number, exp_switch_ar: number }): void {
  const monthlyUttag = ek.levnadskostnad;
  const sim = simulateUttag(r.kapital, r.uttakAvkPct, r.fireYear, monthlyUttag, r.pensions, ek.levnadskostnad2, ek.exp_switch_ar);

  const switchYear2 = ek.exp_switch_ar > 0 && ek.levnadskostnad2 > 0 ? r.fireYear + ek.exp_switch_ar : 9999;
  const levnadLinje = sim.rows.map(row => row.year >= switchYear2 ? ek.levnadskostnad2 : ek.levnadskostnad);

  const ctx = (document.getElementById('uttaks-chart') as HTMLCanvasElement).getContext('2d')!;
  if (uttaksChart) uttaksChart.destroy();
  uttaksChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sim.rows.map(row => String(row.year)),
      datasets: [
        {
          label: 'Kapital (MSEK)',
          data: sim.rows.map(row => row.capital / 1e6),
          borderColor: '#4f8ef7', backgroundColor: '#4f8ef720',
          fill: true, tension: 0.3, pointRadius: 0,
          yAxisID: 'y',
        },
        {
          label: 'Pension/mån (kr)',
          data: sim.rows.map(row => row.pensionMon),
          borderColor: '#6ee7b7', backgroundColor: 'transparent',
          tension: 0.3, pointRadius: 0,
          yAxisID: 'y1',
        },
        {
          label: 'Levnadskostnad/mån (kr)',
          data: levnadLinje,
          borderColor: '#fb923c', backgroundColor: 'transparent',
          borderDash: [5, 3], tension: 0, pointRadius: 0,
          yAxisID: 'y1',
        },
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
}

// ── Exportera resultat till uttag.html via resultStore ──────────────────────────
function exportToUttag(r: FireResult): void {
  const fields: Record<string, number | string> = {
    fireYear:    r.fireYear,
    kapital:     Math.round(r.kapital),
    uttakAvkPct: r.uttakAvkPct,
  };
  // Pensionsströmmar
  r.pensions.forEach(p => {
    fields[`p${p.id}_from`]    = p.fromYear;
    fields[`p${p.id}_to`]      = p.toYear;
    fields[`p${p.id}_monthly`] = p.monthly;
    fields[`p${p.id}_label`]   = p.label;
    fields[`p${p.id}_livsvarig`] = p.livsvarig ? 1 : 0;
  });
  fields['updated_at'] = Date.now();
  resultStore.write(fields);
}

// ── Slider-initiering ──────────────────────────────────────────────────────────
function initSliders(): void {
  const saved = fireStore.get();

  SLIDERS.forEach(key => {
    const el = document.getElementById(`sl-${key}`) as HTMLInputElement | null;
    const valEl = document.getElementById(`val-${key}`);
    if (!el) return;

    // Återställ sparat värde
    const savedVal = (saved as unknown as Record<string, number>)[key];
    if (savedVal !== undefined) {
      el.value = String(savedVal);
      if (valEl) valEl.textContent = String(savedVal);
    }

    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (valEl) valEl.textContent = el.value;
      fireStore.setField(key as keyof FireSettings, v);
      render();
    });
  });

  // Engångsuttag
  ['inp-eng-belopp', 'inp-eng-ar'].forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement;
    const field = id === 'inp-eng-belopp' ? 'engBelopp' : 'engAr';
    el.value = String((saved as unknown as Record<string, number>)[field] ?? 0);
    el.addEventListener('input', () => {
      fireStore.setField(field as keyof FireSettings, parseFloat(el.value) || 0);
      render();
    });
  });
}

// ── Starta ─────────────────────────────────────────────────────────────────────
initSliders();
render();
initSyncWidget(() => { initSliders(); render(); });

// Lyssna om ekonomi.html uppdaterar data i annan flik
window.addEventListener('storage', (e) => {
  if (e.key?.startsWith('vek_ek_') || e.key?.startsWith('vek_fire_')) render();
});
