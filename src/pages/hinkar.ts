import '../../src/style.css';
import { initAuth } from '../auth';
import { ekStore } from '../store';
import { KREDITKORT } from '../constants';
import { renderTopnav, injectInfoBtn } from '../nav';
import type { EkonomiData } from '../types';

await initAuth();

// ── Navigation ─────────────────────────────────────────────────────────────────
renderTopnav('hinkar.html');

injectInfoBtn('🪣 Hink-strategi', [
  {
    heading: 'Vad är det här?',
    html: `<p>Kapitalet delas upp i <strong>fyra hinkar</strong> efter risk och tidshorisont. Det gör det lättare att hantera marknadsrörelser utan panik — du vet alltid vilken hink du tar ifrån.</p>`,
  },
  {
    heading: 'De fyra hinkarna',
    html: `<ul>
      <li>🟢 <strong>Hink 1 — Likviditet</strong>: Sparkonto/buffert. Täcker 3–6 månaders utgifter. Noll marknadsrisk. Det är härifrån du betalar räkningar.</li>
      <li>🔵 <strong>Hink 2 — Trygghet</strong>: AP (inkomstpension), NAV (norsk pension), fastigheter (villa + lägenhet equity). Låg risk, ej likvida men stabila.</li>
      <li>🟣 <strong>Hink 3 — Tillväxt</strong>: Lysa-fonder, TjP Sverige, TjP Norge, PP. Hög förväntad avkastning på lång sikt — rörs inte vid kortsiktiga nedgångar.</li>
      <li>🎲 <strong>Hink 4 — Lek</strong>: Enskilda aktier (NorCo, OncoP). Spekulativt — max 10 % av hink 3. Förlust av hela beloppet ska inte påverka planen.</li>
    </ul>`,
  },
  {
    heading: 'Målet',
    html: `<ul>
      <li>Hink 1 täcker alltid <strong>minst 3 månaders</strong> utgifter (helst 6).</li>
      <li>Hink 4 håller sig under <strong>10 % av hink 3</strong>.</li>
      <li>Kvartalstrategin fyller på hink 1 från hink 3 vid uppgång och tär på hink 1 vid nedgång.</li>
    </ul>`,
  },
  {
    heading: 'Vad behöver du göra?',
    html: `<p>Kontrollera att hink 1 är tillräckligt stor och att lek-andelen (hink 4) inte driftat för högt. Rikedomstrappan nedanför visar din ekonomiska nivå baserat på hinkarna.</p>`,
  },
]);

// ── Formatering ────────────────────────────────────────────────────────────────
function fmt(n: number)  { return Math.round(n).toLocaleString('sv-SE') + ' kr'; }
function fmtK(n: number) { return Math.round(n / 1000).toLocaleString('sv-SE') + ' kkr'; }
function fmtM(n: number) { return (n / 1e6).toFixed(2) + ' MSEK'; }
function pct(n: number)  { return n.toFixed(1) + ' %'; }
function el(id: string)  { return document.getElementById(id)!; }

// ── Ren beräkningsfunktion ─────────────────────────────────────────────────────
interface HinkarResult {
  hink1:      number;
  hink2:      number;
  hink3:      number;
  hink4:      number;
  h1_borgo:   number;
  h2_ip:      number;
  h2_nav:     number;
  h3_lysa:    number;
  h3_buffert: number;
  h3_tjpSve:  number;
  h3_tjpNor:  number;
  h3_pp:      number;
  h4_norco:   number;
  h4_oncop:   number;
  totalFin:   number;
  totalAll:   number;
  lekMax:     number;
  lekPct:     number;
  lekExcess:  number;
  buffMin:    number;
  buffMax:    number;
  h1_kredit:     number;
  h2_villa:      number;
  h2_lagenhet:   number;
  h2_amor:       number;
  fireNum:       number;
  maalPct:       number;
  sparMon:       number;
}

function computeHinkar(ek: EkonomiData): HinkarResult {
  const h1_borgo   = ek.sparkonto_pv;
  const hink1      = h1_borgo;

  const h2_ip       = ek.ap_f + ek.ap_u;
  const h2_nav      = (ek.nav_f_nok + ek.nav_u_nok) * (ek.nok_sek || 0.97);
  const h2_villa    = Math.max(0, (ek.villa_varde ?? 0) - (ek.villa_lan ?? 0));
  const h2_lagenhet = Math.max(0, (ek.lagenhet_varde ?? 0) - (ek.lagenhet_lan ?? 0));
  const h2_amor     = (ek.villa_amor ?? 0) + (ek.lagenhet_amor ?? 0);
  const hink2       = h2_ip + h2_nav + h2_villa + h2_lagenhet;

  const h3_lysa    = ek.lysa_f_pv + ek.lysa_u_pv;
  const h3_buffert = ek.buffert_u_pv;
  const h3_tjpSve  = ek.tjp_f_pv + ek.lonevxl_pv + ek.tidigare_pv + ek.kapan_pv + ek.tjp_u_pv;
  const h3_tjpNor  = ek.norge_f_pv + ek.dnb_f_pv + ek.sb_f_pv + ek.sb_u_pv + ek.dnb_u_pv;
  const h3_pp      = ek.pp_f + ek.pp_u;
  const hink3      = h3_lysa + h3_buffert + h3_tjpSve + h3_tjpNor + h3_pp;

  const h4_norco   = ek.norco_antal * ek.norco_kurs;
  const h4_oncop   = ek.oncop_antal * ek.oncop_kurs;
  const hink4      = h4_norco + h4_oncop;

  const totalFin   = hink1 + hink3 + hink4;
  const totalAll   = hink1 + hink2 + hink3 + hink4;
  const lekMax     = hink3 * 0.10;
  const lekPct     = hink3 > 0 ? hink4 / hink3 * 100 : 0;
  const lekExcess  = Math.max(0, hink4 - lekMax);
  const buffMin    = ek.levnadskostnad * 3;
  const buffMax    = ek.levnadskostnad * 6;
  const h1_kredit  = KREDITKORT.reduce((s, k) => s + k.limit, 0);
  const fireNum    = ek.levnadskostnad * 12 / 0.04;
  const maalPct    = fireNum > 0 ? totalAll / fireNum * 100 : 0;
  const sparMon    = ek.lysa_f_pmt + ek.lysa_u_pmt + ek.buffert_u_pmt + ek.sparkonto_pmt;

  return {
    hink1, hink2, hink3, hink4,
    h1_borgo, h2_ip, h2_nav, h2_villa, h2_lagenhet, h2_amor,
    h3_lysa, h3_buffert, h3_tjpSve, h3_tjpNor, h3_pp,
    h4_norco, h4_oncop,
    totalFin, totalAll, lekMax, lekPct, lekExcess,
    buffMin, buffMax, h1_kredit, fireNum, maalPct, sparMon,
  };
}

// ── Badge-hjälp ────────────────────────────────────────────────────────────────
function badge(text: string, variant: 'ok' | 'warn' | 'bad'): string {
  const colors = { ok: 'var(--green)', warn: 'var(--orange)', bad: 'var(--red)' };
  const c = colors[variant];
  return `<span class="badge" style="background:${c}18;color:${c};border:1px solid ${c}40">${text}</span>`;
}

// ── Rikedomstrappan ────────────────────────────────────────────────────────────
function renderRikedomstrappan(h: HinkarResult, ek: EkonomiData): void {
  const sparFonder = h.sparMon;
  const levels = [
    {
      n: 1, icon: '🛡', namn: 'Ekonomisk trygghet',
      desc: 'Inga dåliga skulder, börjat spara, grundskydd på plats.',
      check: [
        { lbl: 'Har buffert (hink 1 > 0)',     ok: h.hink1 > 0 },
        { lbl: 'Sparar regelbundet (>3 000/mån)', ok: sparFonder > 3000 },
        { lbl: 'TjP/IP aktiva (hink 2 > 0)',   ok: h.hink2 > 0 },
      ],
    },
    {
      n: 2, icon: '💰', namn: 'Ekonomisk stabilitet',
      desc: '3–6 mån buffert, kontroll på ekonomin.',
      check: [
        { lbl: `3 mån buffert (≥ ${fmt(h.buffMin)})`, ok: h.hink1 >= h.buffMin },
        { lbl: 'Aktivt fondspararande (>5 000/mån)', ok: sparFonder > 5000 },
        { lbl: 'Hink 3 > 2 MSEK',                ok: h.hink3 > 2_000_000 },
      ],
    },
    {
      n: 3, icon: '📈', namn: 'Ekonomisk frihet',
      desc: 'Passiv inkomst täcker grundbehov. Kan ta risker med jobbet.',
      check: [
        { lbl: 'Hink 2 > 3 MSEK (pension + fastigheter)',  ok: h.hink2 > 3_000_000 },
        { lbl: 'Hink 3 > 5 MSEK (tillväxt)', ok: h.hink3 > 5_000_000 },
      ],
    },
    {
      n: 4, icon: '🎯', namn: 'Ekonomiskt oberoende',
      desc: 'Kan leva på passiv avkastning. FIRE är möjligt.',
      check: [
        { lbl: 'Måluppfyllnad ≥ 80 % av FIRE-tal', ok: h.maalPct >= 80 },
        { lbl: `Buffert OK (≥ ${fmt(h.buffMin)})`,  ok: h.hink1 >= h.buffMin },
        { lbl: 'Lek ≤ 10 % av hink 3',              ok: h.lekPct <= 10 },
      ],
    },
    {
      n: 5, icon: '🏆', namn: 'Ekonomiskt välstånd',
      desc: 'Mer än nog. Kan ge bort och investera utan oro.',
      check: [
        { lbl: 'Måluppfyllnad ≥ 150 % av FIRE-tal', ok: h.maalPct >= 150 },
        { lbl: 'Hink 3 > 10 MSEK',                  ok: h.hink3 > 10_000_000 },
      ],
    },
  ];

  let topLevel = 0;
  levels.forEach(l => { if (l.check.every(c => c.ok)) topLevel = l.n; });

  const wrap = el('rtrappa');
  wrap.innerHTML = [...levels].reverse().map(l => {
    const allOk   = l.check.every(c => c.ok);
    const isTop   = allOk && l.n === topLevel;
    const isNext  = !allOk && l.n === Math.min(topLevel + 1, 5);
    const bColor  = allOk ? 'var(--green)' : isNext ? 'var(--accent1)' : 'var(--border)';
    const nColor  = allOk ? 'var(--green)' : isNext ? 'var(--accent1)' : 'var(--muted)';
    const bdg     = isTop     ? badge('✓ Ni är här', 'ok')
                  : allOk     ? badge('✓ Uppnådd', 'ok')
                  : isNext    ? badge('← Nästa mål', 'warn')
                  : '';
    const checks  = l.check.map(c =>
      `<div style="font-size:.78rem;color:${c.ok ? 'var(--green)' : 'var(--red)'};margin-top:3px">${c.ok ? '✓' : '✗'} ${c.lbl}</div>`
    ).join('');
    return `<div style="background:var(--card);border:1px solid var(--border);border-left:4px solid ${bColor};border-radius:12px;padding:14px 18px;display:flex;gap:14px;align-items:flex-start">
      <div style="font-size:1.3rem;flex-shrink:0;margin-top:2px">${l.icon}</div>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:6px">
          <div>
            <div style="font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Nivå ${l.n}</div>
            <div style="font-weight:700;font-size:.95rem;color:${nColor}">${l.namn}</div>
            <div style="font-size:.75rem;color:var(--muted)">${l.desc}</div>
          </div>
          ${bdg}
        </div>
        ${checks}
      </div>
    </div>`;
  }).join('');

  const sum = el('rt-summary');
  if (topLevel >= 4) {
    sum.innerHTML = `<strong style="color:var(--green)">Nivå ${topLevel} — ${levels[topLevel - 1].namn}.</strong> Stark position. ${topLevel < 5 ? 'Nivå 5 kräver avsevärt större portfölj och måluppfyllnad ≥ 150 %.' : 'Imponerande!'}`;
  } else if (topLevel === 3) {
    sum.innerHTML = `<strong style="color:var(--green)">Nivå 3 — Ekonomisk frihet.</strong> Solid bas. Buffert och lek-andel är det som avgör om ni når nivå 4.`;
  } else if (topLevel === 2) {
    sum.innerHTML = `<strong style="color:var(--green)">Nivå 2 — Ekonomisk stabilitet.</strong> God grund. Väx hink 2 och 3 för att nå Ekonomisk frihet.`;
  } else {
    sum.innerHTML = `<strong style="color:var(--orange)">Nivå ${topLevel} uppnådd.</strong> Fortsätt bygga steg för steg.`;
  }

  void ek; // suppress unused warning
}

// ── Huvud-render ───────────────────────────────────────────────────────────────
function render(): void {
  const ek = ekStore.get();
  const h  = computeHinkar(ek);

  // KPI-rad
  el('kpi-total').textContent    = fmtM(h.totalFin);
  el('kpi-levnad').textContent   = fmt(ek.levnadskostnad);
  el('kpi-buff-need').textContent = fmtK(h.buffMin) + '–' + fmtK(h.buffMax);
  el('kpi-lek-pct').textContent  = pct(h.lekPct);
  el('kpi-spar').textContent     = fmt(h.sparMon) + '/mån';

  // Måluppfyllnad gap-kort
  const TARGET_PCT = 80;
  const maalColor  = h.maalPct >= TARGET_PCT ? 'var(--green)' : h.maalPct >= 60 ? 'var(--orange)' : 'var(--red)';
  el('gap-pct').textContent      = pct(h.maalPct);
  el('gap-pct').style.color      = maalColor;
  el('gap-firetal').textContent  = fmtM(h.fireNum);
  el('gap-bar').style.width      = Math.min(h.maalPct, 100).toFixed(1) + '%';
  el('gap-bar').style.background = maalColor;

  if (h.maalPct >= TARGET_PCT) {
    el('gap-info-ok').style.display      = '';
    el('gap-info-missing').style.display = 'none';
  } else {
    el('gap-info-ok').style.display      = 'none';
    el('gap-info-missing').style.display = '';
    const gapKr       = h.fireNum * TARGET_PCT / 100 - h.totalAll;
    const levnadFor80 = h.totalAll * 0.04 / 12 / (TARGET_PCT / 100);
    el('gap-portf').textContent  = fmt(Math.round(gapKr));
    el('gap-levnad').textContent = fmt(Math.round(levnadFor80)) + '/mån';
  }

  // Hink 1
  el('h1-borgo').textContent   = fmt(h.h1_borgo);
  el('h1-total').textContent   = fmt(h.hink1);
  el('h1-note').textContent    = `Mål: ${fmt(h.buffMin)}–${fmt(h.buffMax)}`;
  el('h1-badge').innerHTML     = h.hink1 >= h.buffMin ? badge('✓ OK', 'ok')
    : h.hink1 >= h.buffMin * 0.5 ? badge('⚠ Underfunderad', 'warn')
    : badge('⚠ Kritiskt liten', 'bad');

  // Kreditkort
  el('h1-kredit-rows').innerHTML = KREDITKORT.map(k =>
    `<div class="form-row"><label>${k.label}</label><span class="num" style="color:var(--muted)">${fmt(k.limit)}</span></div>`
  ).join('');
  el('h1-kredit-total').textContent  = fmt(h.h1_kredit);
  const likviditet = h.hink1 + h.h1_kredit;
  const manader    = ek.levnadskostnad > 0 ? (likviditet / ek.levnadskostnad).toFixed(1) : '—';
  el('h1-likviditet').textContent    = fmt(likviditet);
  el('h1-likviditet-man').textContent = `${manader} månaders utgifter inkl. kredit`;

  // Hink 2
  el('h2-ip').textContent       = fmtK(h.h2_ip);
  el('h2-nav').textContent      = fmtK(h.h2_nav);
  el('h2-villa').textContent    = fmtK(h.h2_villa);
  el('h2-lagenhet').textContent = fmtK(h.h2_lagenhet);
  el('h2-amor').textContent     = `+${fmt(h.h2_amor)}/mån`;
  el('h2-total').textContent    = '~' + fmtK(h.hink2);

  // Hink 3
  el('h3-lysa').textContent    = fmtK(h.h3_lysa);
  el('h3-buffert').textContent = fmtK(h.h3_buffert);
  el('h3-tjp-sve').textContent = fmtK(h.h3_tjpSve);
  el('h3-tjp-nor').textContent = fmtK(h.h3_tjpNor);
  el('h3-pp').textContent      = fmtK(h.h3_pp);
  el('h3-total').textContent   = '~' + fmtM(h.hink3);
  el('h3-lek-max').textContent = fmt(h.lekMax);

  // Hink 4
  el('h4-norco').textContent = fmtK(h.h4_norco);
  el('h4-oncop').textContent = fmtK(h.h4_oncop);
  el('h4-max').textContent   = fmt(h.lekMax);
  el('h4-total').textContent = fmtK(h.hink4);
  const excessRow = el('h4-excess-row');
  if (h.lekExcess > 0) {
    el('h4-excess').textContent = '~' + fmtK(h.lekExcess);
    excessRow.style.display = '';
  } else {
    excessRow.style.display = 'none';
  }
  el('h4-badge').innerHTML = h.lekPct <= 10 ? badge(`✓ ${pct(h.lekPct)} — OK`, 'ok')
    : h.lekPct <= 15 ? badge(`⚠ ${pct(h.lekPct)} — lite högt`, 'warn')
    : badge(`⚠ ${pct(h.lekPct)} — för högt`, 'bad');

  // Stapel
  const tot = h.totalAll || 1;
  const p1  = h.hink1 / tot * 100;
  const p2  = h.hink2 / tot * 100;
  const p3  = h.hink3 / tot * 100;
  const p4  = h.hink4 / tot * 100;
  el('bar-h1').style.width = p1.toFixed(1) + '%';
  el('bar-h2').style.width = p2.toFixed(1) + '%';
  el('bar-h3').style.width = p3.toFixed(1) + '%';
  el('bar-h4').style.width = p4.toFixed(1) + '%';
  el('pct-h1').textContent = pct(p1);
  el('pct-h2').textContent = pct(p2);
  el('pct-h3').textContent = pct(p3);
  el('pct-h4').textContent = pct(p4);
  el('stapel-note').textContent = `Totalt ~${fmtM(h.totalAll)} · Hink 2 inkluderar IP + NAV + fastigheter (villa + lägenhet equity)`;

  // Ombalansering — dynamiska värden
  el('ob-buff-mon').textContent  = `${fmt(h.buffMin)}–${fmt(h.buffMax)}`;
  el('ob-fire-buff').textContent = `${fmt(ek.levnadskostnad * 12)}–${fmt(ek.levnadskostnad * 24)}`;

  renderRikedomstrappan(h, ek);
}

// ── Starta ─────────────────────────────────────────────────────────────────────
render();

window.addEventListener('storage', e => {
  if (e.key?.startsWith('vek_ek_') || e.key?.startsWith('vek_res_')) render();
});
