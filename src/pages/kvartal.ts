import '../../src/style.css';
import { initAuth } from '../auth';
import { resultStore, ekStore } from '../store';
import { renderTopnav, injectInfoBtn } from '../nav';
import { initSyncWidget } from '../syncWidget';

await initAuth();

renderTopnav('kvartal.html');

injectInfoBtn('📅 Kvartalsstrategi', [
  {
    heading: 'Vad är det här?',
    html: `<p>En guided checklista inför varje kvartal baserad på <strong>Jespers uttagsstrategi</strong> (Rika tillsammans). Istället för att ta ut pengar automatiskt varje månad gör du en aktiv bedömning fyra gånger per år.</p>`,
  },
  {
    heading: 'Vad behöver du göra?',
    html: `<ul>
      <li>Logga in på <strong>Lysa</strong> och läs av portföljens procentutveckling sedan förra kvartalet.</li>
      <li>Ange din faktiska genomsnittliga månadsutgift (senaste 3 månaderna).</li>
      <li>Kolla ditt buffertkontos saldo (t.ex. Borgo sparkonto).</li>
      <li>Flytta slidern till rätt procentutveckling — appen visar sedan vad du ska göra.</li>
    </ul>`,
  },
  {
    heading: 'Målet',
    html: `<p>Aldrig tvingas sälja fonder när marknaden är nere. Bufferten (1–1⅓ kvartalsbehov) absorberar nedgångar; uppgångar fylls på igen. Fyra reviewdatum per år: <strong>5 jan · 5 apr · 5 jul · 5 okt</strong>.</p>`,
  },
  {
    heading: 'Nyckeltal',
    html: `<ul>
      <li><strong>Kvartalsbehov</strong> = (faktisk utgift − aktiva pensioner) × 3</li>
      <li><strong>Buffertmål</strong> = 4/3 × kvartalsbehov (≈ ett kvartal + 33 % kudde)</li>
    </ul>`,
  },
]);

function fmt(n: number) { return Math.round(n).toLocaleString('sv-SE') + ' kr'; }

// ── Aktiva pensioner detta år (från resultStore) ───────────────────────────────
function activePensionsMon(): number {
  const yr = new Date().getFullYear();
  let total = 0;
  for (let i = 1; i <= 8; i++) {
    const from = resultStore.getNum(`p${i}_from`);
    const to   = resultStore.getNum(`p${i}_to`, 9999);
    const mon  = resultStore.getNum(`p${i}_monthly`);
    if (from > 0 && yr >= from && yr <= to) total += mon;
  }
  return total;
}

// ── localStorage ──────────────────────────────────────────────────────────────
const LS = {
  faktisk: 'vek_kv_faktisk_mon',
  pension: 'vek_kv_pension_mon',
  buffert: 'vek_kv_buffert',
  rorelse: 'vek_kv_rorelse',
};
function getLS(key: string, fallback: number): number {
  const v = localStorage.getItem(key);
  return v !== null && !isNaN(parseFloat(v)) ? parseFloat(v) : fallback;
}

const defaultFaktisk = ekStore.getField('levnadskostnad');
const defaultPension = activePensionsMon();
const defaultBuffert = ekStore.getField('sparkonto_pv');

// ── Input-element ─────────────────────────────────────────────────────────────
const inpFaktisk = document.getElementById('inp-faktisk') as HTMLInputElement;
const inpPension = document.getElementById('inp-pension') as HTMLInputElement;
const inpBuffert = document.getElementById('inp-buffert') as HTMLInputElement;
const slRorelse  = document.getElementById('sl-rorelse')  as HTMLInputElement;

inpFaktisk.value = String(getLS(LS.faktisk, defaultFaktisk));
inpPension.value = String(getLS(LS.pension, defaultPension));
inpBuffert.value = String(getLS(LS.buffert, defaultBuffert));
slRorelse.value  = String(getLS(LS.rorelse, 0));

inpFaktisk.addEventListener('input', () => { localStorage.setItem(LS.faktisk, inpFaktisk.value); render(); });
inpPension.addEventListener('input', () => { localStorage.setItem(LS.pension, inpPension.value); render(); });
inpBuffert.addEventListener('input', () => { localStorage.setItem(LS.buffert, inpBuffert.value); render(); });
slRorelse.addEventListener('input',  () => { localStorage.setItem(LS.rorelse, slRorelse.value);  render(); });

// ── Scenariologik (Jespers regler) ────────────────────────────────────────────
type Scenario = {
  label: string;
  color: string;  // CSS color value
  bg: string;     // background rgba
  border: string; // border color
  actions: string[];
  belaning?: string;
};

function getScenario(rorelse: number, kv: number, buffert: number, kvMax: number): Scenario {
  const f        = (n: number) => fmt(Math.round(n));
  const fillRoom = Math.max(0, kvMax - buffert);
  const fillAmt  = (frac: number) => Math.min(Math.round(frac * kv), fillRoom);

  if (rorelse <= -18) return {
    label:   `Krasch / Svart svan  (${rorelse} %)`,
    color:   'var(--red)', bg: 'rgba(248,113,113,.08)', border: 'rgba(248,113,113,.35)',
    actions: [`Ta ut ${f(4/3 * kv)} ur bufferten (4/3 × kvartalsbehov ${f(kv)}).`],
    belaning: 'Aktivera portföljbelåning om räntan är låg och du förstår villkoren och marginalriskerna.',
  };
  if (rorelse <= -13) return {
    label:   `Kraftig nedgång  (${rorelse} %)`,
    color:   'var(--red)', bg: 'rgba(248,113,113,.08)', border: 'rgba(248,113,113,.35)',
    actions: [`Ta ut ${f(kv)} ur bufferten (3/3 × kvartalsbehov).`],
  };
  if (rorelse <= -8) return {
    label:   `Nedgång  (${rorelse} %)`,
    color:   'var(--orange)', bg: 'rgba(251,146,60,.08)', border: 'rgba(251,146,60,.35)',
    actions: [`Ta ut ${f(2/3 * kv)} ur bufferten (2/3 × kvartalsbehov).`],
  };
  if (rorelse <= -3) return {
    label:   `Svag nedgång  (${rorelse} %)`,
    color:   'var(--orange)', bg: 'rgba(251,146,60,.08)', border: 'rgba(251,146,60,.35)',
    actions: [`Ta ut ${f(1/3 * kv)} ur bufferten (1/3 × kvartalsbehov).`],
  };
  if (rorelse <= 7) return {
    label:   `Neutralt  (${rorelse} %)`,
    color:   '#4f8ef7', bg: 'rgba(79,142,247,.08)', border: 'rgba(79,142,247,.35)',
    actions: [
      'Ta ut kvartalsbehov från bäst presterande fond (naturlig ombalansering).',
      'Jämför fondernas senaste kvartalsutveckling och sälj "vinnaren" först.',
    ],
    belaning: 'Utvärdera eventuell portföljbelåning.',
  };

  // Uppgång-scenarion
  const [fillFrac, fillLbl, scenLabel] =
    rorelse <= 12 ? [1/3, '1/3', 'Uppgång'] :
    rorelse <= 17 ? [2/3, '2/3', 'Stark uppgång'] :
    rorelse <= 22 ? [3/3, '3/3', 'Mycket stark uppgång'] :
                    [3/3, '3/3', 'Exceptionell uppgång'];

  const fill = fillAmt(fillFrac);
  const actions = [
    'Ta ut kvartalsbehov från bäst presterande fond.',
    fill > 0
      ? `Sälj ytterligare ${f(fill)} (${fillLbl} av kvartalsbehov ${f(kv)}) och lägg i bufferten — buffertmål: ${f(kvMax)}.`
      : 'Bufferten är redan full — ingen extra försäljning behövs.',
  ];

  const belaning = rorelse > 22
    ? (fillRoom > 0
        ? `Fyll bufferten upp till 4/3-nivå om utrymme finns (+${f(fillAmt(4/3) - fillAmt(3/3))} extra). Om portföljbelåning finns: betala av om räntan motiverar det.`
        : 'Om portföljbelåning finns: betala av om räntan motiverar det.')
    : undefined;

  return {
    label: `${scenLabel}  (${rorelse} %)`,
    color: 'var(--green)', bg: 'rgba(110,231,183,.08)', border: 'rgba(110,231,183,.35)',
    actions, belaning,
  };
}

// ── Huvud-render ──────────────────────────────────────────────────────────────
function render(): void {
  const faktisk = parseFloat(inpFaktisk.value) || defaultFaktisk;
  const pension = parseFloat(inpPension.value) || 0;
  const buffert = parseFloat(inpBuffert.value) || 0;
  const rorelse = parseFloat(slRorelse.value)  || 0;

  const kv    = Math.max(0, faktisk - pension) * 3;
  const kvMax = Math.round(4 / 3 * kv);

  // KPI-rad
  document.getElementById('disp-kv')!.textContent    = fmt(Math.round(kv));
  document.getElementById('disp-kvmax')!.textContent = fmt(kvMax);

  // Marknadsrörelse-display
  const rSign = rorelse > 0 ? '+' : '';
  const rText = `${rSign}${rorelse} %`;
  const rColor = rorelse < 0 ? 'var(--red)' : rorelse > 0 ? 'var(--green)' : 'var(--muted)';
  const rEl    = document.getElementById('disp-rorelse')!;
  const rElKpi = document.getElementById('disp-rorelse-kpi')!;
  rEl.textContent     = rText;
  rEl.style.color     = rColor;
  rElKpi.textContent  = rText;
  rElKpi.style.color  = rColor;

  // Buffert-status
  const pct = kvMax > 0 ? Math.min(100, (buffert / kvMax) * 100) : 0;
  const barColor = pct >= 100 ? 'var(--green)' : pct >= 66 ? '#4f8ef7' : pct >= 33 ? 'var(--orange)' : 'var(--red)';
  const bar = document.getElementById('buffert-bar')!;
  bar.style.width      = `${pct.toFixed(1)}%`;
  bar.style.background = barColor;
  document.getElementById('buffert-pct')!.textContent            = `${pct.toFixed(0)} %`;
  document.getElementById('disp-buffert-status')!.textContent    = `${fmt(buffert)} / ${fmt(kvMax)}`;
  document.getElementById('disp-buffert-status')!.style.color    = barColor;

  // Scenario-kort
  const sc    = getScenario(rorelse, kv, buffert, kvMax);
  const box   = document.getElementById('scenario-box')!;
  box.style.background  = sc.bg;
  box.style.borderColor = sc.border;

  document.getElementById('scenario-label')!.textContent  = sc.label;
  (document.getElementById('scenario-label')! as HTMLElement).style.color = sc.color;

  document.getElementById('scenario-actions')!.innerHTML =
    sc.actions.map(a => `<li style="margin-bottom:6px">${a}</li>`).join('');

  const belEl = document.getElementById('scenario-belaning')!;
  if (sc.belaning) {
    belEl.style.display = '';
    belEl.textContent   = sc.belaning;
  } else {
    belEl.style.display = 'none';
  }
}

// ── Nästa kvartalsdag ─────────────────────────────────────────────────────────
function updateNextKvartal(): void {
  const now   = new Date();
  const year  = now.getFullYear();

  // Kvartalsreviewdatum: 5:e dagen i jan/apr/jul/okt (ger marknaderna 4 dagar att landa)
  const kv_months = [0, 3, 6, 9]; // Jan=0, Apr=3, Jul=6, Okt=9
  const kv_day    = 5;

  // Bygg upp en lista med årets + nästa års datum och välj första i framtiden
  const candidates: Date[] = [];
  for (const yr of [year, year + 1]) {
    for (const m of kv_months) {
      candidates.push(new Date(yr, m, kv_day));
    }
  }

  const nextDate = candidates.find(d => d > now)!;
  const diffMs   = nextDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const kvNames = ['Q1 (jan–mar)', 'Q2 (apr–jun)', 'Q3 (jul–sep)', 'Q4 (okt–dec)'];
  const kvIdx   = kv_months.indexOf(nextDate.getMonth());
  const period  = kvNames[kvIdx] ?? '';

  const dateStr = nextDate.toLocaleDateString('sv-SE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  document.getElementById('next-kv-date')!.textContent = dateStr;
  document.getElementById('next-kv-days')!.textContent =
    diffDays === 1 ? '🔔 Imorgon!' : `om ${diffDays} dagar`;
  document.getElementById('next-kv-period')!.textContent =
    `Kolla Lysa-portföljens procentutveckling för ${period} och ange den i slidern nedan.`;
}

updateNextKvartal();
initSyncWidget();

render();

window.addEventListener('storage', e => {
  if (e.key?.startsWith('vek_res_') || e.key?.startsWith('vek_ek_')) render();
});
