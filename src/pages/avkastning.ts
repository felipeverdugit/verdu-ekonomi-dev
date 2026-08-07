import '../../src/style.css';
import { initAuth } from '../auth';
import {
  Chart, BarController, BarElement, LineController, LineElement,
  PointElement, CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js';
import { fireStore } from '../store';
import { renderTopnav, injectInfoBtn } from '../nav';

await initAuth();

Chart.register(BarController, BarElement, LineController, LineElement,
  PointElement, CategoryScale, LinearScale, Tooltip, Legend);

renderTopnav('avkastning.html');

injectInfoBtn('🎯 Faktisk avkastning', [
  {
    heading: 'Vad är det här?',
    html: `<p>Logga den <strong>faktiska årsavkastningen</strong> för Lysa och tjänstepensioner. Jämför mot simulatorns antagande och se om du är före eller efter plan.</p>`,
  },
  {
    heading: 'Var hittar jag siffrorna?',
    html: `<ul>
      <li><strong>Lysa</strong>: logga in på Lysa → "Min portfölj" → årsavkastning.</li>
      <li><strong>TjP Sverige</strong>: din pensionsförsäkrings årsbesked (Hoist, KPA, Alecta m.fl.).</li>
      <li><strong>TjP Norge</strong>: DNB/Storebrand årsbesked eller inloggning.</li>
    </ul>`,
  },
  {
    heading: 'CAGR',
    html: `<p>KPI-raden visar <strong>CAGR</strong> (Compound Annual Growth Rate) — den genomsnittliga sammansatta årsavkastningen över alla inlagda år. Det är den siffra som stämmer överens med hur simulatorn räknar.</p>`,
  },
  {
    heading: 'Vad behöver du göra?',
    html: `<ul>
      <li>Lägg till ett år i taget och fyll i faktisk % — du kan lämna fält tomma om du saknar data.</li>
      <li>Uppdatera en gång om året efter att årsbesked kommit.</li>
      <li>Jämför CAGR mot antaget i Brygga-simulatorn — är du över eller under plan?</li>
    </ul>`,
  },
]);

// ── Datatyp & lagring ─────────────────────────────────────────────────────────
interface AvkRow {
  year: number;
  lysaPct:    number | null;
  tjpSvePct:  number | null;
  tjpNorPct:  number | null;
}

const LS_KEY = 'vek_avk_rows';

function loadRows(): AvkRow[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); }
  catch { return []; }
}

function saveRows(rows: AvkRow[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(rows));
}

// ── Formatering ───────────────────────────────────────────────────────────────
function fmtPct(v: number | null): string {
  return v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`;
}

function colorForPct(v: number | null, ref: number): string {
  if (v === null) return 'var(--muted)';
  return v >= ref ? 'var(--green)' : v >= 0 ? 'var(--orange)' : 'var(--red)';
}

// ── CAGR-beräkning ────────────────────────────────────────────────────────────
function cagr(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  const product = valid.reduce((acc, v) => acc * (1 + v / 100), 1);
  return (Math.pow(product, 1 / valid.length) - 1) * 100;
}

// ── Diagram-instans ───────────────────────────────────────────────────────────
let chartInst: Chart | null = null;

function renderChart(rows: AvkRow[], antaget: number): void {
  const canvas = document.getElementById('avk-chart') as HTMLCanvasElement;
  const emptyEl = document.getElementById('chart-empty')!;

  if (rows.length === 0) {
    canvas.style.display = 'none';
    emptyEl.style.display = '';
    if (chartInst) { chartInst.destroy(); chartInst = null; }
    return;
  }
  canvas.style.display = '';
  emptyEl.style.display = 'none';

  const labels  = rows.map(r => String(r.year));
  const lysa    = rows.map(r => r.lysaPct);
  const tjpSve  = rows.map(r => r.tjpSvePct);
  const tjpNor  = rows.map(r => r.tjpNorPct);
  const assumed = rows.map(() => antaget);

  const GRID = '#2d3348';
  const TEXT = '#8892a4';

  const datasets = [
    {
      type: 'bar' as const,
      label: 'Lysa %',
      data: lysa,
      backgroundColor: lysa.map(v =>
        v === null ? '#2d3348' : v >= antaget ? '#4f8ef740' : '#f8717140'
      ),
      borderColor: lysa.map(v =>
        v === null ? '#2d3348' : v >= antaget ? '#4f8ef7' : '#f87171'
      ),
      borderWidth: 1.5,
      borderRadius: 4,
    },
    {
      type: 'bar' as const,
      label: 'TjP Sverige %',
      data: tjpSve,
      backgroundColor: '#6ee7b730',
      borderColor: '#6ee7b7',
      borderWidth: 1.5,
      borderRadius: 4,
    },
    {
      type: 'bar' as const,
      label: 'TjP Norge %',
      data: tjpNor,
      backgroundColor: '#f8717130',
      borderColor: '#f87171',
      borderWidth: 1.5,
      borderRadius: 4,
    },
    {
      type: 'line' as const,
      label: `Antaget ${antaget} %`,
      data: assumed,
      borderColor: '#f59e0b',
      borderDash: [6, 3],
      borderWidth: 2,
      pointRadius: 0,
      tension: 0,
    },
  ];

  if (chartInst) { chartInst.destroy(); chartInst = null; }

  chartInst = new Chart(canvas.getContext('2d')!, {
    type: 'bar',
    data: { labels, datasets: datasets as never },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: TEXT, boxWidth: 14 } },
        tooltip: {
          callbacks: {
            label: (c) => {
              const v = c.raw as number | null;
              return ` ${c.dataset.label}: ${v !== null ? fmtPct(v) : '—'}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { color: GRID }, ticks: { color: TEXT } },
        y: {
          grid: { color: GRID },
          ticks: { color: TEXT, callback: v => `${v} %` },
        },
      },
    },
  });
}

// ── Tabellrendering ───────────────────────────────────────────────────────────
function renderTable(rows: AvkRow[], antaget: number): void {
  const tbody   = document.getElementById('avk-tbody')!;
  const emptyEl = document.getElementById('empty-msg')!;

  emptyEl.style.display = rows.length === 0 ? '' : 'none';

  tbody.innerHTML = rows
    .slice()
    .sort((a, b) => a.year - b.year)
    .map((row, _idx) => {
      const realIdx = rows.indexOf(row);
      const diffVal = row.lysaPct !== null ? row.lysaPct - antaget : null;
      const diffStr = diffVal !== null
        ? `${diffVal >= 0 ? '+' : ''}${diffVal.toFixed(1)} %`
        : '—';
      const diffColor = diffVal === null ? 'var(--muted)'
        : diffVal >= 0 ? 'var(--green)' : 'var(--red)';

      function cell(val: number | null, ref: number): string {
        return `<td style="text-align:right;padding:9px 10px">
          <input type="number" step="0.1"
            value="${val !== null ? val : ''}"
            placeholder="—"
            data-idx="${realIdx}" data-field="${arguments.callee.name}"
            style="width:80px;background:var(--bg);border:1px solid var(--border);
                   border-radius:6px;color:${colorForPct(val, ref)};
                   font-size:.88rem;padding:4px 8px;text-align:right;font-weight:600">
        </td>`;
      }

      // Inline cell-builder (avoids name mangling)
      function inp(val: number | null, field: string, color: string): string {
        return `<td style="text-align:right;padding:9px 10px">
          <input type="number" step="0.1"
            value="${val !== null ? val : ''}"
            placeholder="—"
            data-idx="${realIdx}" data-field="${field}"
            style="width:80px;background:var(--bg);border:1px solid var(--border);
                   border-radius:6px;color:${color};
                   font-size:.88rem;padding:4px 8px;text-align:right;font-weight:600">
        </td>`;
      }

      void cell; // suppress

      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:9px 10px;font-weight:700">${row.year}</td>
        ${inp(row.lysaPct,   'lysaPct',   colorForPct(row.lysaPct,   antaget))}
        ${inp(row.tjpSvePct, 'tjpSvePct', colorForPct(row.tjpSvePct, antaget))}
        ${inp(row.tjpNorPct, 'tjpNorPct', colorForPct(row.tjpNorPct, antaget))}
        <td style="text-align:right;padding:9px 10px;font-weight:700;color:${diffColor}">${diffStr}</td>
        <td style="padding:9px 10px;text-align:right">
          <button class="btn-del" data-del="${realIdx}">✕</button>
        </td>
      </tr>`;
    }).join('');

  // Totalsumma-rad
  if (rows.length > 0) {
    const cagrL   = cagr(rows.map(r => r.lysaPct));
    const cagrS   = cagr(rows.map(r => r.tjpSvePct));
    const cagrN   = cagr(rows.map(r => r.tjpNorPct));
    const cagrDiff = cagrL !== null ? cagrL - antaget : null;
    const cagrDiffColor = cagrDiff === null ? 'var(--muted)'
      : cagrDiff >= 0 ? 'var(--green)' : 'var(--red)';

    tbody.innerHTML += `<tr style="border-top:2px solid var(--border);background:var(--card)">
      <td style="padding:9px 10px;font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">CAGR</td>
      <td style="text-align:right;padding:9px 10px;font-weight:700;color:#4f8ef7">${cagrL !== null ? fmtPct(cagrL) : '—'}</td>
      <td style="text-align:right;padding:9px 10px;font-weight:700;color:#6ee7b7">${cagrS !== null ? fmtPct(cagrS) : '—'}</td>
      <td style="text-align:right;padding:9px 10px;font-weight:700;color:#f87171">${cagrN !== null ? fmtPct(cagrN) : '—'}</td>
      <td style="text-align:right;padding:9px 10px;font-weight:700;color:${cagrDiffColor}">${cagrDiff !== null ? `${cagrDiff >= 0 ? '+' : ''}${cagrDiff.toFixed(1)} %` : '—'}</td>
      <td></td>
    </tr>`;
  }

  // Event: input-ändring
  tbody.querySelectorAll('input[data-field]').forEach(el => {
    el.addEventListener('change', (e) => {
      const inp   = e.target as HTMLInputElement;
      const idx   = parseInt(inp.dataset.idx!);
      const field = inp.dataset.field as keyof AvkRow;
      const val   = inp.value === '' ? null : parseFloat(inp.value);
      (rows[idx] as unknown as Record<string, unknown>)[field] = val;
      saveRows(rows);
      render(rows);
    });
  });

  // Event: ta bort rad
  tbody.querySelectorAll('button[data-del]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt((el as HTMLElement).dataset.del!);
      rows.splice(idx, 1);
      saveRows(rows);
      render(rows);
    });
  });
}

// ── KPI-rad ───────────────────────────────────────────────────────────────────
function renderKPIs(rows: AvkRow[], antaget: number): void {
  const cagrL  = cagr(rows.map(r => r.lysaPct));
  const cagrS  = cagr(rows.map(r => r.tjpSvePct));
  const cagrN  = cagr(rows.map(r => r.tjpNorPct));
  const diff   = cagrL !== null ? cagrL - antaget : null;

  const lyEl   = document.getElementById('kpi-lysa-cagr')!;
  const svEl   = document.getElementById('kpi-tjpsve-cagr')!;
  const norEl  = document.getElementById('kpi-tjpnor-cagr')!;
  const difEl  = document.getElementById('kpi-diff')!;

  lyEl.textContent  = cagrL !== null ? fmtPct(cagrL) : '—';
  lyEl.style.color  = cagrL !== null ? colorForPct(cagrL, antaget) : 'var(--muted)';
  svEl.textContent  = cagrS !== null ? fmtPct(cagrS) : '—';
  svEl.style.color  = cagrS !== null ? colorForPct(cagrS, antaget) : 'var(--muted)';
  norEl.textContent = cagrN !== null ? fmtPct(cagrN) : '—';
  norEl.style.color = cagrN !== null ? colorForPct(cagrN, antaget) : 'var(--muted)';

  document.getElementById('kpi-antaget')!.textContent = `${antaget.toFixed(1)} %`;

  difEl.textContent = diff !== null
    ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} %`
    : '—';
  difEl.style.color = diff === null ? 'var(--muted)'
    : diff >= 0 ? 'var(--green)' : 'var(--red)';
}

// ── Huvud-render ──────────────────────────────────────────────────────────────
function render(rows: AvkRow[]): void {
  const antaget = fireStore.get().avkPct;
  renderKPIs(rows, antaget);
  renderTable(rows, antaget);
  renderChart(rows, antaget);
}

// ── Lägg till år ──────────────────────────────────────────────────────────────
function nextYear(rows: AvkRow[]): number {
  if (rows.length === 0) return new Date().getFullYear() - 1;
  return Math.max(...rows.map(r => r.year)) + 1;
}

// ── Start ─────────────────────────────────────────────────────────────────────
const rows = loadRows();
render(rows);

document.getElementById('btn-add')!.addEventListener('click', () => {
  rows.push({ year: nextYear(rows), lysaPct: null, tjpSvePct: null, tjpNorPct: null });
  saveRows(rows);
  render(rows);
});

window.addEventListener('storage', e => {
  if (e.key?.startsWith('vek_fire_')) render(rows);
});
