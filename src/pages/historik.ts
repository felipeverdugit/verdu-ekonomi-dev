import '../style.css';
import { initAuth } from '../auth';
import {
  Chart,
  LineController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Legend,
  Tooltip,
} from 'chart.js';
import { historikStore, ekStore } from '../store';
import type { Snapshot, EkonomiData } from '../types';
import { NAV_LINKS } from '../constants';

await initAuth();

Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Legend, Tooltip);

document.getElementById('topnav')!.innerHTML = NAV_LINKS.map(l =>
  `<a href="${l.href}"${l.href === 'historik.html' ? ' class="active"' : ''}>${l.icon} ${l.label}</a>`
).join('');

function fmtKr(n: number): string {
  return Math.round(n).toLocaleString('sv-SE') + ' kr';
}
function fmtM(n: number): string {
  return (n / 1e6).toFixed(2) + ' MSEK';
}

function buildSnapshot(): Snapshot {
  const ek     = ekStore.get();
  const nokSek = ek.nok_sek || 0.97;
  const fonder = ek.lysa_f_pv + ek.lysa_u_pv + ek.buffert_u_pv + ek.sparkonto_pv;
  const tjp    = ek.tjp_f_pv + ek.lonevxl_pv + ek.tidigare_pv + ek.kapan_pv + ek.tjp_u_pv;
  const norge  = ek.norge_f_pv + ek.dnb_f_pv + ek.sb_f_pv + ek.sb_u_pv + ek.dnb_u_pv;
  const allman = ek.ap_f + ek.pp_f + ek.ap_u + ek.pp_u + (ek.nav_f_nok + ek.nav_u_nok) * nokSek;
  const aktier = ek.norco_antal * ek.norco_kurs + ek.oncop_antal * ek.oncop_kurs;
  const totalt = fonder + tjp + norge + allman + aktier;
  const date   = new Date().toISOString().slice(0, 10);
  return { date, fonder, tjp, norge, allman, aktier, totalt };
}

function computeSparAr(ek: EkonomiData): number {
  const monthly = ek.lysa_f_pmt + ek.lysa_u_pmt + ek.buffert_u_pmt + ek.sparkonto_pmt + ek.lonevxl_pmt;
  const fromQuarterly = (ek.tjp_f_pmt_q + ek.tjp_u_pmt_q) * 4;
  return monthly * 12 + fromQuarterly;
}

let chartInst: Chart | null = null;
let prognosInst: Chart | null = null;

function renderChart(snaps: Snapshot[]): void {
  const labels   = snaps.map(s => s.date);
  const datasets = [
    { label: 'Privata fonder', data: snaps.map(s => s.fonder),  borderColor: '#4f8ef7', tension: 0.3, fill: false, pointRadius: 4 },
    { label: 'TjP & LöneVXL', data: snaps.map(s => s.tjp),     borderColor: '#6ee7b7', tension: 0.3, fill: false, pointRadius: 4 },
    { label: 'TjP Norge',      data: snaps.map(s => s.norge),   borderColor: '#f87171', tension: 0.3, fill: false, pointRadius: 4 },
    { label: 'Allmänpension',  data: snaps.map(s => s.allman),  borderColor: '#22d3ee', tension: 0.3, fill: false, pointRadius: 4 },
    { label: 'Aktier',         data: snaps.map(s => s.aktier),  borderColor: '#f59e0b', tension: 0.3, fill: false, pointRadius: 4 },
    { label: 'Totalt',         data: snaps.map(s => s.totalt),  borderColor: '#a78bfa', tension: 0.3, fill: false, pointRadius: 5, borderWidth: 3 },
  ];

  if (chartInst) {
    chartInst.data.labels   = labels;
    chartInst.data.datasets = datasets as never;
    chartInst.update();
    return;
  }
  const ctx = (document.getElementById('lineChart') as HTMLCanvasElement).getContext('2d')!;
  chartInst = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: datasets as never },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#e2e8f0', boxWidth: 14 } },
        tooltip: {
          callbacks: {
            label: c => ` ${c.dataset.label}: ${Math.round(c.parsed.y as number).toLocaleString('sv-SE')} kr`,
          },
        },
      },
      scales: {
        x: { ticks: { color: '#8892a4' }, grid: { color: '#2d3348' } },
        y: {
          ticks: { color: '#8892a4', callback: v => (Number(v) / 1e6).toFixed(1) + ' M' },
          grid:  { color: '#2d3348' },
        },
      },
    },
  });
}

function renderPrognos(snaps: Snapshot[]): void {
  const last    = snaps.length > 0 ? snaps[snaps.length - 1] : null;
  const ek      = ekStore.get();
  const V0      = last ? last.totalt : 0;
  const r       = 0.07;
  const sparAr  = computeSparAr(ek);
  const fireNum = ek.levnadskostnad * 12 / 0.04;

  const startYear = last ? parseInt(last.date.slice(0, 4)) : new Date().getFullYear();
  const FIRE_YEARS = new Set(['2035', '2037']);
  const labels: string[]  = [];
  const medSpar: number[] = [];
  const utanSpar: number[]= [];
  const fireLine: number[]= [];

  for (let y = startYear; y <= 2038; y++) {
    const t = y - startYear;
    const lbl = y.toString();
    labels.push(lbl);
    const vBase = V0 * Math.pow(1 + r, t);
    medSpar.push(Math.round(sparAr > 0
      ? V0 * Math.pow(1 + r, t) + sparAr * (Math.pow(1 + r, t) - 1) / r
      : vBase));
    utanSpar.push(Math.round(vBase));
    fireLine.push(fireNum);
  }

  const ptR = (lbl: string, base: number) => FIRE_YEARS.has(lbl) ? 9 : base;
  const ptC = (lbl: string, def: string)  => FIRE_YEARS.has(lbl) ? '#a78bfa' : def;

  document.getElementById('prognos-start')!.textContent    = fmtM(V0);
  document.getElementById('prognos-spar-ar')!.textContent  = sparAr ? Math.round(sparAr).toLocaleString('sv-SE') + ' kr' : '—';
  document.getElementById('prognos-fire-num')!.textContent = fmtM(fireNum);

  const datasets = [
    {
      label: 'Med löpande insättningar',
      data: medSpar,
      borderColor: '#6ee7b7',
      tension: 0.35,
      fill: false,
      pointRadius: labels.map(l => ptR(l, 3)),
      pointBackgroundColor: labels.map(l => ptC(l, '#6ee7b7')),
      pointBorderColor:     labels.map(l => ptC(l, '#6ee7b7')),
    },
    {
      label: 'Enbart avkastning (inga insättningar)',
      data: utanSpar,
      borderColor: '#4f8ef7',
      borderDash: [7, 4],
      tension: 0.35,
      fill: false,
      pointRadius: labels.map(l => ptR(l, 2)),
      pointBackgroundColor: labels.map(l => ptC(l, '#4f8ef7')),
      pointBorderColor:     labels.map(l => ptC(l, '#4f8ef7')),
    },
    {
      label: 'FIRE-mål',
      data: fireLine,
      borderColor: '#f59e0b',
      borderDash: [3, 4],
      borderWidth: 1.5,
      tension: 0,
      fill: false,
      pointRadius: 0,
    },
  ] as never;

  const opts = {
    responsive: true,
    plugins: {
      legend: { labels: { color: '#e2e8f0', boxWidth: 14 } },
      tooltip: { callbacks: { label: (c: { dataset: { label?: string }; parsed: { y: number | null } }) => ` ${c.dataset.label ?? ''}: ${fmtM(c.parsed.y ?? 0)}` } },
    },
    scales: {
      x: { ticks: { color: '#8892a4' }, grid: { color: '#2d3348' } },
      y: {
        ticks: { color: '#8892a4', callback: (v: unknown) => (Number(v) / 1e6).toFixed(1) + ' M' },
        grid:  { color: '#2d3348' },
      },
    },
  };

  if (prognosInst) {
    prognosInst.data.labels   = labels;
    prognosInst.data.datasets = datasets;
    prognosInst.update();
    return;
  }
  const ctx = (document.getElementById('prognosChart') as HTMLCanvasElement).getContext('2d')!;
  prognosInst = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: opts });
}

function renderTable(snaps: Snapshot[]): void {
  const tbody = document.getElementById('tbl-body')!;
  if (!snaps.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">Inga snapshots sparade än.</td></tr>';
    return;
  }
  tbody.innerHTML = snaps.map((s, i) => {
    const prev  = i > 0 ? snaps[i - 1] : null;
    const delta = prev !== null ? s.totalt - prev.totalt : null;
    const deltaHtml = delta === null
      ? '<span class="text-muted">—</span>'
      : `<span style="color:${delta >= 0 ? 'var(--green)' : 'var(--red)'}">${delta >= 0 ? '+' : ''}${fmtKr(delta)}</span>`;
    return `<tr>
      <td class="text-muted">${s.date}</td>
      <td class="col-fonder">${fmtKr(s.fonder)}</td>
      <td class="col-tjp">${fmtKr(s.tjp)}</td>
      <td class="col-norge">${fmtKr(s.norge)}</td>
      <td class="col-allman">${fmtKr(s.allman)}</td>
      <td class="col-aktier">${fmtKr(s.aktier)}</td>
      <td class="col-totalt">${fmtM(s.totalt)}</td>
      <td class="col-delta">${deltaHtml}</td>
      <td><button class="btn-del" data-idx="${i}">✕</button></td>
    </tr>`;
  }).join('');
}

function showMsg(text: string, ms = 3500): void {
  const el = document.getElementById('save-msg')!;
  el.textContent = text;
  setTimeout(() => (el.textContent = ''), ms);
}

function render(): void {
  const snaps = historikStore.load();
  renderChart(snaps);
  renderPrognos(snaps);
  renderTable(snaps);
}

// ── Knappar ──────────────────────────────────────────────────────────────────
document.getElementById('btn-save-snap')!.addEventListener('click', () => {
  const snap = buildSnapshot();
  historikStore.add(snap);
  showMsg(`✓ Snapshot sparad ${snap.date}`);
  render();
});

document.getElementById('btn-import-old')!.addEventListener('click', () => {
  const count = historikStore.importFromOld();
  showMsg(count === 0
    ? 'Inget nytt att importera — alla datum finns redan.'
    : `✓ Importerade ${count} snapshot${count !== 1 ? 's' : ''} från gamla systemet.`,
    4000,
  );
  render();
});

document.getElementById('btn-export-json')!.addEventListener('click', () => {
  const snaps = historikStore.load();
  const blob  = new Blob([JSON.stringify(snaps, null, 2)], { type: 'application/json' });
  const a     = document.createElement('a');
  a.href      = URL.createObjectURL(blob);
  a.download  = `historik-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
});

// Radera-knappar via event delegation
document.getElementById('tbl-body')!.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-idx]');
  if (!btn) return;
  historikStore.remove(parseInt(btn.dataset.idx!));
  render();
});

// Seed historiska snapshots om vek_historik är tom
(function seedIfEmpty() {
  if (historikStore.load().length > 0) return;
  const seed: Snapshot[] = [
    { date: '2026-06-20', fonder:  792699, tjp: 1071468, norge: 1577015, allman: 6491440, aktier: 912368, totalt: 10844990 },
    { date: '2026-06-30', fonder:  864894, tjp: 1120827, norge: 1607916, allman: 6538328, aktier: 849615, totalt: 10981580 },
    { date: '2026-07-05', fonder:  865594, tjp: 1120827, norge: 1589199, allman: 6538328, aktier: 904104, totalt: 11018052 },
    { date: '2026-07-16', fonder: 1038372, tjp: 1142699, norge: 1595079, allman: 6533081, aktier: 873961, totalt: 11183192 },
    { date: '2026-07-18', fonder: 1038372, tjp: 1142699, norge: 1595079, allman: 6533081, aktier: 878687, totalt: 11187918 },
    { date: '2026-07-28', fonder: 1087268, tjp: 1142699, norge: 1595079, allman: 6533081, aktier: 874857, totalt: 11232984 },
  ];
  historikStore.save(seed);
})();

render();
