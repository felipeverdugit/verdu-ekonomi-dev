import '../../src/style.css';
import { computeFire } from '../calculations';
import { ekStore, fireStore } from '../store';
import { NAV_LINKS } from '../constants';

// ── Navigation ─────────────────────────────────────────────────────────────────
document.getElementById('topnav')!.innerHTML = NAV_LINKS.map(l =>
  `<a href="${l.href}"${l.href === 'index.html' ? ' class="active"' : ''}>${l.icon} ${l.label}</a>`
).join('');

function fmt(n: number)  { return Math.round(n).toLocaleString('sv-SE') + ' kr'; }
function fmtM(n: number) { return (n / 1e6).toFixed(2) + ' MSEK'; }

function render(): void {
  // Beräkna färskt resultat direkt — ingen stale data
  const ek = ekStore.get();
  const s  = fireStore.get();
  const r  = computeFire(ek, s);

  document.getElementById('kpi-year')!.textContent    = String(r.fireYear);
  const pctEl = document.getElementById('kpi-pct')!;
  pctEl.textContent = `${r.bryggaTackning.toFixed(1)} %`;
  pctEl.style.color = r.bryggaTackning >= 100 ? 'var(--green)' : r.bryggaTackning >= 75 ? 'var(--orange)' : 'var(--red)';
  document.getElementById('kpi-kapital')!.textContent = fmtM(r.kapital);
  document.getElementById('kpi-total')!.textContent   = fmtM(r.totaltFV);
  document.getElementById('kpi-levnad')!.textContent  = fmt(ek.levnadskostnad);

  // Nästa händelse
  const today = new Date().getFullYear();
  const nextEv = r.events.find(e => e.year > today);
  const card   = document.getElementById('next-event-card')!;
  if (nextEv) {
    const arKvar = nextEv.year - today;
    card.innerHTML = `<span class="fw-bold">${nextEv.label}</span> <span class="text-muted">&nbsp;· om ${arKvar} år (${nextEv.year})</span>`;
  }

  // Pensionstabell
  const LIVSVARIG = [4, 6, 7];
  document.getElementById('pension-summary')!.innerHTML = r.pensions.map(p => {
    const isLiv  = LIVSVARIG.includes(p.id);
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
}

render();

window.addEventListener('storage', (e) => {
  if (e.key?.startsWith('vek_')) render();
});
