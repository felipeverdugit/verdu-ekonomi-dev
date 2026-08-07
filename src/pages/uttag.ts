import '../../src/style.css';
import { initAuth } from '../auth';
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js';
import { simulateUttag } from '../calculations';
import { resultStore, ekStore, fireStore } from '../store';
import { renderTopnav, injectInfoBtn } from '../nav';
import type { PensionStream } from '../types';

await initAuth();

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

// ── Navigation ─────────────────────────────────────────────────────────────────
renderTopnav('uttag.html');

injectInfoBtn('📊 Uttaksplan', [
  {
    heading: 'Vad är det här?',
    html: `<p>En detaljerad år-för-år-simulering av hela uttaksfasen. Visar hur kapitalet utvecklas, när varje pensionsström aktiveras och hur länge pengarna räcker.</p>`,
  },
  {
    heading: 'Vad visas i diagrammet?',
    html: `<ul>
      <li><strong>Kapital</strong>: det fria kapitalet (Lysa, sparkonto m.m.) som minskar med uttag.</li>
      <li><strong>Uttag/mån</strong>: vad du tar ut ur kapitalet varje månad (minskar när pensioner slår in).</li>
      <li><strong>Levnadskostnad</strong> (orange streckad linje): din planerade levnadskostnad, inkl. steget ner till period 2.</li>
      <li><strong>Pensioner</strong>: de staplar som byggs upp allteftersom pensionerna startar.</li>
    </ul>`,
  },
  {
    heading: 'Målet',
    html: `<p>Kapitalet ska inte nå noll under din livstid. Målet är att <strong>uttagen täcks av pensioner</strong> senast när kapitalet är nära slut — helst med god marginal.</p>`,
  },
  {
    heading: 'Tips',
    html: `<p>Justera startåldrarna för varje pension i Brygga-simulatorn för att se hur timing påverkar uttaksbehovet.</p>`,
  },
]);

const DARK_GRID = '#2d3348';
const DARK_TEXT = '#8892a4';
let chart: Chart | null = null;

function fmt(n: number) { return Math.round(n).toLocaleString('sv-SE') + ' kr'; }
function fmtM(n: number) { return (n / 1e6).toFixed(2) + ' MSEK'; }

// ── Skattekalkyl ───────────────────────────────────────────────────────────────
const KOMMUNAL      = 0.31;
const STATLIG_GRANS = 615_300;
const STATLIG_RATE  = 0.20;
const STATLIG_MON   = STATLIG_GRANS / 12; // ≈ 51 275 kr/mån

function fga65(annual: number): number {
  if (annual <= 134_600) return annual;
  if (annual <= 220_000) return 134_600;
  if (annual <= 450_000) return 134_600 + 0.08 * (annual - 220_000);
  if (annual <= 615_300) return Math.max(85_000, 152_000 - 0.08 * (annual - 450_000));
  return Math.max(75_000, 140_000 - 0.08 * (annual - 450_000));
}
function ga(annual: number): number {
  return annual <= 134_600 ? annual : 13_900;
}
function incomeTax(annualGross: number, isPensioner: boolean): number {
  if (annualGross <= 0) return 0;
  const avdrag  = isPensioner ? fga65(annualGross) : ga(annualGross);
  const taxable = Math.max(0, annualGross - avdrag);
  return Math.round(taxable * KOMMUNAL + Math.max(0, annualGross - STATLIG_GRANS) * STATLIG_RATE);
}

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
  renderTaxStrategy(pensions);

  // Simulering
  const uttag2    = ekStore.getField('levnadskostnad2');
  const switchAr  = ekStore.getField('exp_switch_ar');
  const sim = simulateUttag(kapital, avkPct, startYear, uttag, pensions, uttag2, switchAr);

  // Verdict — bryggeperspektiv, inte SWR
  const verdictEl = document.getElementById('verdict')!;
  if (sim.depletedYear && (!sim.pensionFullYear || sim.depletedYear < sim.pensionFullYear)) {
    // Kapitalet tar slut innan pensionen täcker allt
    const gap = sim.pensionFullYear
      ? ` (pensionerna täcker 100 % först ${sim.pensionFullYear})`
      : '';
    verdictEl.className = 'verdict bad';
    verdictEl.textContent = `⚠ Bryggan räcker inte — kapitalet tar slut ${sim.depletedYear}${gap}.`;
  } else if (sim.pensionFullYear) {
    const bridgeYears = sim.pensionFullYear - startYear;
    const capLeft     = fmtM(sim.capitalAtBridge);
    verdictEl.className = 'verdict ok';
    verdictEl.textContent = `✓ Pensionerna täcker 100 % av levnadskostnaden ${sim.pensionFullYear} (om ${bridgeYears} år) — kapital kvar: ${capLeft}.`;
  } else {
    // Pensionerna täcker aldrig 100 % — visa hur länge kapitalet räcker
    verdictEl.className = 'verdict warn';
    verdictEl.textContent = `~ Pensionerna täcker inte 100 % av levnadskostnaden — kapitalet behövs hela vägen.`;
  }

  // Diagram
  const switchYear2   = switchAr > 0 && uttag2 > 0 ? startYear + switchAr : 9999;
  const levnadLinje   = sim.rows.map(r => r.year >= switchYear2 ? uttag2 : uttag);
  const ctx = (document.getElementById('uttaks-chart') as HTMLCanvasElement).getContext('2d')!;
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sim.rows.map(r => String(r.year)),
      datasets: [
        { label: 'Kapital (MSEK)', data: sim.rows.map(r => r.capital / 1e6), borderColor: '#4f8ef7', backgroundColor: '#4f8ef720', fill: true, tension: 0.3, pointRadius: 0, yAxisID: 'y' },
        { label: 'Pension/mån (kr)', data: sim.rows.map(r => r.pensionMon), borderColor: '#6ee7b7', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, yAxisID: 'y1' },
        { label: 'Levnadskostnad/mån (kr)', data: levnadLinje, borderColor: '#fb923c', backgroundColor: 'transparent', borderDash: [5, 3], tension: 0, pointRadius: 0, yAxisID: 'y1' },
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

// ── Skattestrategitabell ───────────────────────────────────────────────────────
function renderTaxStrategy(pensions: PensionStream[]): void {
  const startYear   = resultStore.getNum('fireYear', new Date().getFullYear() + 10);
  const skattPct    = fireStore.get().skattPct;
  const skattFaktor = 1 - skattPct / 100;
  const FELIPE      = 1975;
  const ULRIKA      = 1970;

  type OptRow = { year: number; fGross: number; uGross: number; taxCur: number; taxOpt: number; saving: number };
  const rows: OptRow[] = [];

  for (let yr = startYear; yr <= startYear + 35; yr++) {
    const fNet = pensions.filter(p => p.who === 'f' && yr >= p.fromYear && yr <= p.toYear).reduce((s, p) => s + p.monthly, 0);
    const uNet = pensions.filter(p => p.who === 'u' && yr >= p.fromYear && yr <= p.toYear).reduce((s, p) => s + p.monthly, 0);
    if (fNet === 0 && uNet === 0) continue;

    const fGross = skattFaktor > 0 ? fNet / skattFaktor : 0;
    const uGross = skattFaktor > 0 ? uNet / skattFaktor : 0;
    const fAge   = yr - FELIPE;
    const uAge   = yr - ULRIKA;

    const fTaxCur = incomeTax(fGross * 12, fAge >= 65) / 12;
    const uTaxCur = incomeTax(uGross * 12, uAge >= 65) / 12;
    const fTaxOpt = incomeTax(Math.min(fGross, STATLIG_MON) * 12, fAge >= 65) / 12;
    const uTaxOpt = incomeTax(Math.min(uGross, STATLIG_MON) * 12, uAge >= 65) / 12;

    rows.push({ year: yr, fGross, uGross, taxCur: fTaxCur + uTaxCur, taxOpt: fTaxOpt + uTaxOpt, saving: (fTaxCur + uTaxCur) - (fTaxOpt + uTaxOpt) });
  }

  // Rekommendationsruta
  const rec      = document.getElementById('rec-box')!;
  const firstYr  = rows.length > 0 ? rows[0].year : startYear;
  const totalSav = rows.reduce((s, r) => s + r.saving * 12, 0);
  const fOver    = rows.filter(r => r.fGross > STATLIG_MON);
  const uOver    = rows.filter(r => r.uGross > STATLIG_MON);

  const bullets: string[] = [];

  if (firstYr > startYear) {
    bullets.push(`<span style="color:var(--green)">✓</span> <strong>${startYear}–${firstYr - 1} (bryggafas):</strong> Inga pensioner aktiva — ta enbart ur ISK/Lysa. Noll inkomstskatt på uttagen (ISK schablonbeskattas ~0.9 %/år på portföljvärdet oavsett uttag).`);
  }

  if (fOver.length > 0) {
    const g      = Math.round(fOver[0].fGross);
    const excess = Math.round(fOver[0].fGross - STATLIG_MON);
    bullets.push(`<span style="color:var(--orange)">⚠</span> <strong>Felipe ${fOver[0].year}+:</strong> Pensionsinkomst ${fmt(g)}/mån brutto (>${fmt(Math.round(STATLIG_MON))}/mån) → statlig skatt 20 % på ${fmt(excess)}/mån överskott.`);
  }

  if (uOver.length > 0) {
    const g = Math.round(uOver[0].uGross);
    bullets.push(`<span style="color:var(--orange)">⚠</span> <strong>Ulrika ${uOver[0].year}+:</strong> Pensionsinkomst ${fmt(g)}/mån brutto → statlig skatt aktiveras.`);
  }

  if (fOver.length === 0 && uOver.length === 0) {
    bullets.push(`<span style="color:var(--green)">✓</span> Ingen av er når statlig skattegräns — progressiv skatt är lägre än schablon ${skattPct} %.`);
  }

  if (totalSav > 1_000) {
    bullets.push(`<span style="color:#4f8ef7">💡</span> Hypotetisk total besparing om pensionsinkomsten per person hålls under 51 275 kr/mån: <strong style="color:var(--green)">${fmtM(totalSav)}</strong>. Kräver att TjP senareläggs eller periodiseras om — ISK-uttag kan täcka mellanskillnaden skattefritt.`);
  } else if (totalSav > 0) {
    bullets.push(`<span style="color:#4f8ef7">💡</span> Progressiv skatt sparar <strong style="color:var(--green)">${fmtM(totalSav)}</strong> totalt vs schablon ${skattPct} % — ingen optimering krävs.`);
  }

  rec.innerHTML = bullets.map(b => `<p style="margin:8px 0;font-size:.9rem">${b}</p>`).join('');

  // Jämförelsetabell
  const tbody = document.getElementById('skatt-opt-tbody')!;
  tbody.innerHTML = rows.map(row => {
    const isOver = row.fGross > STATLIG_MON || row.uGross > STATLIG_MON;
    const fFlag  = row.fGross > STATLIG_MON ? ' <span style="color:var(--orange);font-size:.72rem">▲</span>' : '';
    const uFlag  = row.uGross > STATLIG_MON ? ' <span style="color:var(--orange);font-size:.72rem">▲</span>' : '';
    const savCol = row.saving > 100
      ? `<span style="color:var(--green)">+${fmt(Math.round(row.saving * 12))}</span>`
      : `<span style="color:var(--muted)">—</span>`;
    return `<tr style="${isOver ? 'background:rgba(248,113,113,.05)' : ''}">
      <td style="padding:5px 8px;color:var(--muted)">${row.year}</td>
      <td style="text-align:right;padding:5px 6px">${row.fGross > 0 ? fmt(Math.round(row.fGross)) + fFlag : '—'}</td>
      <td style="text-align:right;padding:5px 6px">${row.uGross > 0 ? fmt(Math.round(row.uGross)) + uFlag : '—'}</td>
      <td style="text-align:right;padding:5px 6px;color:var(--red)">${fmt(Math.round(row.taxCur))}/mån</td>
      <td style="text-align:right;padding:5px 6px;color:var(--orange)">${fmt(Math.round(row.taxOpt))}/mån</td>
      <td style="text-align:right;padding:5px 6px">${savCol}</td>
    </tr>`;
  }).join('');
}

// ── Slider — initialisera från levnadskostnad i Ekonomi ────────────────────────
const slUttag = document.getElementById('sl-uttag') as HTMLInputElement;
const levnad = ekStore.getField('levnadskostnad');
if (levnad > 0) slUttag.value = String(levnad);
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
