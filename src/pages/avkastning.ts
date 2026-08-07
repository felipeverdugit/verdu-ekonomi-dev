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
    html: `<p>Logga den <strong>faktiska årsavkastningen</strong> för Lysa och tjänstepensioner. Jämför mot simulatorns antagande — både i procent och kronor.</p>`,
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
    heading: 'Startvärden',
    html: `<p>Ange ingående kapital vid det första år du loggar. Utan startvärden visas bara procent — med dem beräknas faktisk kr-utveckling och jämförs mot simulerad portfölj (om du haft antaget % varje år).</p>`,
  },
  {
    heading: 'CAGR',
    html: `<p><strong>CAGR</strong> (Compound Annual Growth Rate) = sammansatt genomsnittsavkastning. Det är den siffra som stämmer med hur simulatorn räknar — jämför den mot "Antaget" i Brygga.</p>`,
  },
]);

// ── Datatyper & lagring ───────────────────────────────────────────────────────
interface AvkRow {
  year:       number;
  lysaPct:    number | null;
  tjpSvePct:  number | null;
  tjpNorPct:  number | null;
}

interface StartValues {
  year:     number;
  lysaKr:   number;
  tjpSveKr: number;
  tjpNorKr: number;
}

const LS_ROWS  = 'vek_avk_rows';
const LS_START = 'vek_avk_start';

function loadRows(): AvkRow[] {
  try { return JSON.parse(localStorage.getItem(LS_ROWS) ?? '[]'); }
  catch { return []; }
}
function saveRows(rows: AvkRow[]): void {
  localStorage.setItem(LS_ROWS, JSON.stringify(rows));
}
function loadStart(): StartValues {
  try {
    return JSON.parse(localStorage.getItem(LS_START) ?? 'null') ??
      { year: new Date().getFullYear() - 1, lysaKr: 0, tjpSveKr: 0, tjpNorKr: 0 };
  } catch {
    return { year: new Date().getFullYear() - 1, lysaKr: 0, tjpSveKr: 0, tjpNorKr: 0 };
  }
}
function saveStart(s: StartValues): void {
  localStorage.setItem(LS_START, JSON.stringify(s));
}

// ── Formatering ───────────────────────────────────────────────────────────────
const fmtKr  = (n: number) => Math.round(n).toLocaleString('sv-SE') + ' kr';
const fmtKrS = (n: number) => (n >= 0 ? '+' : '') + Math.round(n).toLocaleString('sv-SE') + ' kr';
const fmtM   = (n: number) => (n / 1e6).toFixed(2) + ' MSEK';
const fmtPct = (v: number | null) =>
  v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`;

function colorForPct(v: number | null, ref: number): string {
  if (v === null) return 'var(--muted)';
  return v >= ref ? 'var(--green)' : v >= 0 ? 'var(--orange)' : 'var(--red)';
}

// ── CAGR ─────────────────────────────────────────────────────────────────────
function cagr(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  const product = valid.reduce((acc, v) => acc * (1 + v / 100), 1);
  return (Math.pow(product, 1 / valid.length) - 1) * 100;
}

// ── Kr-beräkning ──────────────────────────────────────────────────────────────
interface KrRow {
  year:         number;
  lysaStart:    number;
  lysaAvkKr:    number;
  lysaEnd:      number;
  tjpSveEnd:    number;
  tjpNorEnd:    number;
  total:        number;
  // simulerat (antaget % varje år)
  lysaSimEnd:   number;
  tjpSveSimEnd: number;
  tjpNorSimEnd: number;
  totalSim:     number;
}

function computeKrRows(rows: AvkRow[], sv: StartValues, antaget: number): KrRow[] {
  const sorted = rows.slice().sort((a, b) => a.year - b.year);
  if (sorted.length === 0 || (sv.lysaKr === 0 && sv.tjpSveKr === 0 && sv.tjpNorKr === 0)) return [];

  const result: KrRow[] = [];
  let lysaAct  = sv.lysaKr;
  let tjpSveAct = sv.tjpSveKr;
  let tjpNorAct = sv.tjpNorKr;
  let lysaSim   = sv.lysaKr;
  let tjpSveSim = sv.tjpSveKr;
  let tjpNorSim = sv.tjpNorKr;

  for (const row of sorted) {
    if (row.year < sv.year) continue; // hoppa över år före startår

    const lPct   = row.lysaPct   ?? 0;
    const sPct   = row.tjpSvePct ?? 0;
    const nPct   = row.tjpNorPct ?? 0;
    const aFrac  = antaget / 100;

    const lysaStart  = lysaAct;
    const lysaEndAct = lysaAct   * (1 + lPct / 100);
    const tjpSveEndA = tjpSveAct * (1 + sPct / 100);
    const tjpNorEndA = tjpNorAct * (1 + nPct / 100);

    const lysaEndSim  = lysaSim   * (1 + aFrac);
    const tjpSveEndS  = tjpSveSim * (1 + aFrac);
    const tjpNorEndS  = tjpNorSim * (1 + aFrac);

    result.push({
      year:         row.year,
      lysaStart,
      lysaAvkKr:    lysaEndAct - lysaStart,
      lysaEnd:      lysaEndAct,
      tjpSveEnd:    tjpSveEndA,
      tjpNorEnd:    tjpNorEndA,
      total:        lysaEndAct + tjpSveEndA + tjpNorEndA,
      lysaSimEnd:   lysaEndSim,
      tjpSveSimEnd: tjpSveEndS,
      tjpNorSimEnd: tjpNorEndS,
      totalSim:     lysaEndSim + tjpSveEndS + tjpNorEndS,
    });

    lysaAct   = lysaEndAct;
    tjpSveAct = tjpSveEndA;
    tjpNorAct = tjpNorEndA;
    lysaSim   = lysaEndSim;
    tjpSveSim = tjpSveEndS;
    tjpNorSim = tjpNorEndS;
  }
  return result;
}

// ── Diagram-instanser ─────────────────────────────────────────────────────────
let pctChart: Chart | null = null;
let krChart:  Chart | null = null;

const GRID = '#2d3348';
const TEXT = '#8892a4';

function renderPctChart(rows: AvkRow[], antaget: number): void {
  const canvas  = document.getElementById('avk-chart') as HTMLCanvasElement;
  const emptyEl = document.getElementById('chart-empty')!;
  if (rows.length === 0) {
    canvas.style.display = 'none'; emptyEl.style.display = '';
    if (pctChart) { pctChart.destroy(); pctChart = null; }
    return;
  }
  canvas.style.display = ''; emptyEl.style.display = 'none';

  const sorted  = rows.slice().sort((a, b) => a.year - b.year);
  const labels  = sorted.map(r => String(r.year));
  const lysa    = sorted.map(r => r.lysaPct);
  const tjpSve  = sorted.map(r => r.tjpSvePct);
  const tjpNor  = sorted.map(r => r.tjpNorPct);
  const assumed = sorted.map(() => antaget);

  if (pctChart) { pctChart.destroy(); pctChart = null; }
  pctChart = new Chart(canvas.getContext('2d')!, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar', label: 'Lysa %', data: lysa,
          backgroundColor: lysa.map(v => v === null ? '#2d3348' : v >= antaget ? '#4f8ef740' : '#f8717140'),
          borderColor:     lysa.map(v => v === null ? '#2d3348' : v >= antaget ? '#4f8ef7'   : '#f87171'),
          borderWidth: 1.5, borderRadius: 4,
        },
        {
          type: 'bar', label: 'TjP Sverige %', data: tjpSve,
          backgroundColor: '#6ee7b730', borderColor: '#6ee7b7', borderWidth: 1.5, borderRadius: 4,
        },
        {
          type: 'bar', label: 'TjP Norge %', data: tjpNor,
          backgroundColor: '#f8717130', borderColor: '#f87171', borderWidth: 1.5, borderRadius: 4,
        },
        {
          type: 'line', label: `Antaget ${antaget} %`, data: assumed,
          borderColor: '#f59e0b', borderDash: [6, 3], borderWidth: 2, pointRadius: 0, tension: 0,
        },
      ] as never,
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: TEXT, boxWidth: 14 } },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtPct(c.raw as number | null)}` } },
      },
      scales: {
        x: { grid: { color: GRID }, ticks: { color: TEXT } },
        y: { grid: { color: GRID }, ticks: { color: TEXT, callback: v => `${v} %` } },
      },
    },
  });
}

function renderKrChart(krRows: KrRow[], sv: StartValues): void {
  const canvas  = document.getElementById('kr-chart') as HTMLCanvasElement;
  const emptyEl = document.getElementById('kr-chart-empty')!;
  if (krRows.length === 0) {
    canvas.style.display = 'none'; emptyEl.style.display = '';
    if (krChart) { krChart.destroy(); krChart = null; }
    return;
  }
  canvas.style.display = ''; emptyEl.style.display = 'none';

  // Inkludera startpunkten som första punkt
  const startTotal = sv.lysaKr + sv.tjpSveKr + sv.tjpNorKr;
  const labels  = [String(sv.year), ...krRows.map(r => String(r.year))];
  const faktisk = [startTotal, ...krRows.map(r => r.total)];
  const simul   = [startTotal, ...krRows.map(r => r.totalSim)];
  const lysaAkt = [sv.lysaKr,  ...krRows.map(r => r.lysaEnd)];

  if (krChart) { krChart.destroy(); krChart = null; }
  krChart = new Chart(canvas.getContext('2d')!, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Totalt faktisk', data: faktisk,
          borderColor: '#6ee7b7', backgroundColor: '#6ee7b710',
          tension: 0.3, pointRadius: 4, fill: false, borderWidth: 2,
        },
        {
          label: 'Totalt simulerat', data: simul,
          borderColor: '#f59e0b', borderDash: [6, 3],
          tension: 0.3, pointRadius: 3, fill: false, borderWidth: 2,
        },
        {
          label: 'Lysa faktisk', data: lysaAkt,
          borderColor: '#4f8ef7', backgroundColor: '#4f8ef710',
          tension: 0.3, pointRadius: 3, fill: false, borderWidth: 1.5,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: TEXT, boxWidth: 14 } },
        tooltip: {
          callbacks: {
            label: c => ` ${c.dataset.label}: ${fmtKr(c.raw as number)}`,
          },
        },
      },
      scales: {
        x: { grid: { color: GRID }, ticks: { color: TEXT } },
        y: {
          grid: { color: GRID },
          ticks: { color: TEXT, callback: v => fmtM(Number(v)) },
        },
      },
    },
  });
}

// ── Kr-tabell ─────────────────────────────────────────────────────────────────
function renderKrTable(krRows: KrRow[]): void {
  const tbody   = document.getElementById('kr-tbody')!;
  const emptyEl = document.getElementById('kr-empty')!;

  if (krRows.length === 0) {
    tbody.innerHTML = ''; emptyEl.style.display = ''; return;
  }
  emptyEl.style.display = 'none';

  tbody.innerHTML = krRows.map(r => {
    const avkColor = r.lysaAvkKr >= 0 ? 'var(--green)' : 'var(--red)';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:9px 10px;font-weight:700">${r.year}</td>
      <td style="text-align:right;padding:9px 10px;color:var(--muted)">${fmtKr(r.lysaStart)}</td>
      <td style="text-align:right;padding:9px 10px;font-weight:700;color:${avkColor}">${fmtKrS(r.lysaAvkKr)}</td>
      <td style="text-align:right;padding:9px 10px;color:#4f8ef7">${fmtKr(r.lysaEnd)}</td>
      <td style="text-align:right;padding:9px 10px;color:#6ee7b7">${fmtKr(r.tjpSveEnd)}</td>
      <td style="text-align:right;padding:9px 10px;color:#f87171">${fmtKr(r.tjpNorEnd)}</td>
      <td style="text-align:right;padding:9px 10px;font-weight:700;color:var(--accent2)">${fmtKr(r.total)}</td>
    </tr>`;
  }).join('');

  // Summerad diff-rad: faktisk vs simulerat
  const last = krRows[krRows.length - 1];
  const diff = last.total - last.totalSim;
  const dColor = diff >= 0 ? 'var(--green)' : 'var(--red)';
  tbody.innerHTML += `<tr style="border-top:2px solid var(--border);background:var(--card)">
    <td style="padding:9px 10px;font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em" colspan="5">Faktisk vs simulerad (senaste år)</td>
    <td style="text-align:right;padding:9px 10px;color:var(--muted);font-size:.82rem">Simulerat: ${fmtKr(last.totalSim)}</td>
    <td style="text-align:right;padding:9px 10px;font-weight:700;color:${dColor}">${diff >= 0 ? '+' : ''}${fmtKr(diff)}</td>
  </tr>`;
}

// ── % Tabell ──────────────────────────────────────────────────────────────────
function renderPctTable(rows: AvkRow[], antaget: number): void {
  const tbody   = document.getElementById('avk-tbody')!;
  const emptyEl = document.getElementById('empty-msg')!;
  const sorted  = rows.slice().sort((a, b) => a.year - b.year);

  emptyEl.style.display = rows.length === 0 ? '' : 'none';

  function inp(val: number | null, field: string, color: string, realIdx: number): string {
    return `<td style="text-align:right;padding:9px 10px">
      <input type="number" step="0.1" value="${val !== null ? val : ''}" placeholder="—"
        data-idx="${realIdx}" data-field="${field}"
        style="width:80px;background:var(--bg);border:1px solid var(--border);border-radius:6px;
               color:${color};font-size:.88rem;padding:4px 8px;text-align:right;font-weight:600">
    </td>`;
  }

  tbody.innerHTML = sorted.map(row => {
    const realIdx = rows.indexOf(row);
    const diffVal = row.lysaPct !== null ? row.lysaPct - antaget : null;
    const diffStr = diffVal !== null ? `${diffVal >= 0 ? '+' : ''}${diffVal.toFixed(1)} %` : '—';
    const diffColor = diffVal === null ? 'var(--muted)' : diffVal >= 0 ? 'var(--green)' : 'var(--red)';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:9px 10px;font-weight:700">${row.year}</td>
      ${inp(row.lysaPct,   'lysaPct',   colorForPct(row.lysaPct,   antaget), realIdx)}
      ${inp(row.tjpSvePct, 'tjpSvePct', colorForPct(row.tjpSvePct, antaget), realIdx)}
      ${inp(row.tjpNorPct, 'tjpNorPct', colorForPct(row.tjpNorPct, antaget), realIdx)}
      <td style="text-align:right;padding:9px 10px;font-weight:700;color:${diffColor}">${diffStr}</td>
      <td style="padding:9px 10px;text-align:right"><button class="btn-del" data-del="${realIdx}">✕</button></td>
    </tr>`;
  }).join('');

  // CAGR-rad
  if (rows.length > 0) {
    const cL = cagr(rows.map(r => r.lysaPct));
    const cS = cagr(rows.map(r => r.tjpSvePct));
    const cN = cagr(rows.map(r => r.tjpNorPct));
    const dV = cL !== null ? cL - antaget : null;
    tbody.innerHTML += `<tr style="border-top:2px solid var(--border);background:var(--card)">
      <td style="padding:9px 10px;font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">CAGR</td>
      <td style="text-align:right;padding:9px 10px;font-weight:700;color:#4f8ef7">${fmtPct(cL)}</td>
      <td style="text-align:right;padding:9px 10px;font-weight:700;color:#6ee7b7">${fmtPct(cS)}</td>
      <td style="text-align:right;padding:9px 10px;font-weight:700;color:#f87171">${fmtPct(cN)}</td>
      <td style="text-align:right;padding:9px 10px;font-weight:700;color:${dV === null ? 'var(--muted)' : dV >= 0 ? 'var(--green)' : 'var(--red)'}">${dV !== null ? `${dV >= 0 ? '+' : ''}${dV.toFixed(1)} %` : '—'}</td>
      <td></td>
    </tr>`;
  }

  // Events: input
  tbody.querySelectorAll('input[data-field]').forEach(el => {
    el.addEventListener('change', e => {
      const inp   = e.target as HTMLInputElement;
      const idx   = parseInt(inp.dataset.idx!);
      const field = inp.dataset.field as keyof AvkRow;
      const val   = inp.value === '' ? null : parseFloat(inp.value);
      (rows[idx] as unknown as Record<string, unknown>)[field] = val;
      saveRows(rows);
      render(rows, loadStart());
    });
  });

  // Events: ta bort
  tbody.querySelectorAll('button[data-del]').forEach(el => {
    el.addEventListener('click', () => {
      rows.splice(parseInt((el as HTMLElement).dataset.del!), 1);
      saveRows(rows);
      render(rows, loadStart());
    });
  });
}

// ── KPI-rad ───────────────────────────────────────────────────────────────────
function renderKPIs(rows: AvkRow[], krRows: KrRow[], antaget: number): void {
  const cL  = cagr(rows.map(r => r.lysaPct));
  const cS  = cagr(rows.map(r => r.tjpSvePct));
  const cN  = cagr(rows.map(r => r.tjpNorPct));
  const diff = cL !== null ? cL - antaget : null;

  const lyEl  = document.getElementById('kpi-lysa-cagr')!;
  const svEl  = document.getElementById('kpi-tjpsve-cagr')!;
  const norEl = document.getElementById('kpi-tjpnor-cagr')!;
  const difEl = document.getElementById('kpi-diff')!;
  const krEl  = document.getElementById('kpi-lysa-kr')!;
  const simEl = document.getElementById('kpi-lysa-sim')!;

  lyEl.textContent  = fmtPct(cL);  lyEl.style.color  = colorForPct(cL,  antaget);
  svEl.textContent  = fmtPct(cS);  svEl.style.color  = colorForPct(cS,  antaget);
  norEl.textContent = fmtPct(cN);  norEl.style.color = colorForPct(cN,  antaget);
  document.getElementById('kpi-antaget')!.textContent = `${antaget.toFixed(1)} %`;
  difEl.textContent = diff !== null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} %` : '—';
  difEl.style.color = diff === null ? 'var(--muted)' : diff >= 0 ? 'var(--green)' : 'var(--red)';

  if (krRows.length > 0) {
    const last = krRows[krRows.length - 1];
    krEl.textContent  = fmtM(last.lysaEnd);
    simEl.textContent = fmtM(last.lysaSimEnd);
    const d = last.lysaEnd - last.lysaSimEnd;
    krEl.style.color  = d >= 0 ? 'var(--green)' : 'var(--orange)';
  } else {
    krEl.textContent  = '—'; krEl.style.color  = 'var(--muted)';
    simEl.textContent = '—';
  }
}

// ── Huvud-render ──────────────────────────────────────────────────────────────
function render(rows: AvkRow[], sv: StartValues): void {
  const antaget = fireStore.get().avkPct;
  const krRows  = computeKrRows(rows, sv, antaget);

  renderKPIs(rows, krRows, antaget);
  renderPctTable(rows, antaget);
  renderKrTable(krRows);
  renderPctChart(rows, antaget);
  renderKrChart(krRows, sv);
}

// ── Startvärde-inputs ─────────────────────────────────────────────────────────
const sv = loadStart();
const svYear   = document.getElementById('sv-year')   as HTMLInputElement;
const svLysa   = document.getElementById('sv-lysa')   as HTMLInputElement;
const svTjpSve = document.getElementById('sv-tjpsve') as HTMLInputElement;
const svTjpNor = document.getElementById('sv-tjpnor') as HTMLInputElement;

svYear.value   = String(sv.year);
svLysa.value   = sv.lysaKr   > 0 ? String(sv.lysaKr)   : '';
svTjpSve.value = sv.tjpSveKr > 0 ? String(sv.tjpSveKr) : '';
svTjpNor.value = sv.tjpNorKr > 0 ? String(sv.tjpNorKr) : '';

function onSvChange(): void {
  sv.year     = parseInt(svYear.value)     || sv.year;
  sv.lysaKr   = parseFloat(svLysa.value)   || 0;
  sv.tjpSveKr = parseFloat(svTjpSve.value) || 0;
  sv.tjpNorKr = parseFloat(svTjpNor.value) || 0;
  saveStart(sv);
  render(loadRows(), sv);
}
[svYear, svLysa, svTjpSve, svTjpNor].forEach(el =>
  el.addEventListener('change', onSvChange)
);

// ── Lägg till år ──────────────────────────────────────────────────────────────
const rows = loadRows();
render(rows, sv);

function nextYear(rs: AvkRow[]): number {
  if (rs.length === 0) return new Date().getFullYear() - 1;
  return Math.max(...rs.map(r => r.year)) + 1;
}

document.getElementById('btn-add')!.addEventListener('click', () => {
  rows.push({ year: nextYear(rows), lysaPct: null, tjpSvePct: null, tjpNorPct: null });
  saveRows(rows);
  render(rows, loadStart());
});

window.addEventListener('storage', e => {
  if (e.key?.startsWith('vek_fire_')) render(loadRows(), loadStart());
});
