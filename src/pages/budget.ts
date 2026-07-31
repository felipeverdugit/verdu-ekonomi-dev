import '../../src/style.css';
import { initAuth } from '../auth';
import { budgetStore, ekStore } from '../store';
import { NAV_LINKS } from '../constants';
import type { BudgetData } from '../types';

await initAuth();

document.getElementById('topnav')!.innerHTML = NAV_LINKS.map(l =>
  `<a href="${l.href}"${l.href === 'budget.html' ? ' class="active"' : ''}>${l.icon} ${l.label}</a>`
).join('');

const fmt  = (n: number) => Math.round(n).toLocaleString('sv-SE');
const fmtM = (n: number) => (n / 1_000_000).toFixed(2) + ' MSEK';

type FieldDef = {
  id: keyof BudgetData;
  label: string;
  skipTotal?: boolean;
  isAmor?: boolean;
  isInfo?: boolean;
};

type GroupDef = {
  id: string;
  label: string;
  icon: string;
  isIncome?: boolean;
  fields: FieldDef[];
};

const GROUPS: GroupDef[] = [
  {
    id: 'ink', label: 'Inkomster', icon: '💼', isIncome: true,
    fields: [
      { id: 'brutto_f',       label: 'Felipe brutto',    skipTotal: true, isInfo: true },
      { id: 'netto_f',        label: 'Felipe netto' },
      { id: 'brutto_u',       label: 'Ulrika brutto',    skipTotal: true, isInfo: true },
      { id: 'netto_u',        label: 'Ulrika netto' },
      { id: 'vardnadsbidrag', label: 'Vårdnadsbidrag' },
      { id: 'barnbidrag',     label: 'Barnbidrag' },
      { id: 'hyra_lag_ink',   label: 'Hyra lägenhet' },
    ],
  },
  {
    id: 'boende', label: 'Boende', icon: '🏠',
    fields: [
      { id: 'lan_villa',  label: 'Lån villa' },
      { id: 'amor_villa', label: 'varav amortering',  skipTotal: true, isAmor: true },
      { id: 'lan_lag',    label: 'Lån lägenhet' },
      { id: 'amor_lag',   label: 'varav amortering',  skipTotal: true, isAmor: true },
      { id: 'vatten',     label: 'Vatten & avlopp' },
      { id: 'el',         label: 'El' },
      { id: 'energi',     label: 'Fjärrvärme/energi' },
      { id: 'avfall',     label: 'Avfall' },
    ],
  },
  {
    id: 'transport', label: 'Transport', icon: '🚗',
    fields: [
      { id: 'kia_leasing', label: 'KIA leasing' },
      { id: 'kia_el',      label: 'KIA el' },
    ],
  },
  {
    id: 'telefoni', label: 'Telefoni & Internet', icon: '📱',
    fields: [
      { id: 'streaming',      label: 'Streaming (TV4 etc.)' },
      { id: 'bredband_fiber', label: 'Bredband fiber' },
      { id: 'mobil',          label: 'Mobil (2 abonnemang)' },
      { id: 'bredband_5g',    label: 'Bredband 5G' },
      { id: 'telia_cloud',    label: 'Telia Cloud' },
    ],
  },
  {
    id: 'forsakring', label: 'Försäkringar', icon: '🛡️',
    fields: [
      { id: 'hemforsakring', label: 'Hemförsäkring' },
      { id: 'tryghansa',     label: 'Trygg-Hansa' },
      { id: 'skandia_liv',   label: 'Skandia Liv' },
      { id: 'if_skadef',     label: 'IF Skadeförs.' },
      { id: 'sv_lararnas',   label: 'SV Lärarnas' },
    ],
  },
  {
    id: 'fack', label: 'Fack & Övrigt', icon: '🤝',
    fields: [
      { id: 'ledarna',       label: 'Ledarna' },
      { id: 'ledarnas_akas', label: 'Ledarnas a-kassa' },
      { id: 'lararnas_akas', label: 'Lärarnas a-kassa' },
      { id: 'csn',           label: 'CSN' },
      { id: 'hjarnfonden',   label: 'Hjärnfonden' },
      { id: 'friskis',       label: 'Friskis & Svettis' },
    ],
  },
  {
    id: 'sparande', label: 'Sparande', icon: '💎',
    fields: [
      { id: 'lysa_f_mon',       label: 'Lysa Felipe' },
      { id: 'lysa_u_mon',       label: 'Lysa Ulrika' },
      { id: 'lysa_buffert_mon', label: 'Lysa Buffert' },
      { id: 'lysa_n_mon',       label: 'Lysa N' },
      { id: 'borgo_bank_mon',   label: 'Borgo Bank' },
      { id: 'resor_mon',        label: 'Resor (månadsspar)' },
    ],
  },
  {
    id: 'ovriga', label: 'Övriga utgifter', icon: '💳',
    fields: [
      { id: 'mc_felipe', label: 'MC Felipe' },
      { id: 'mc_ulrika', label: 'MC Ulrika' },
    ],
  },
  {
    id: 'prenums', label: 'Prenumerationer', icon: '📡',
    fields: [
      { id: 'nextory',      label: 'Nextory' },
      { id: 'anthropic',    label: 'Anthropic Claude' },
      { id: 'spotify',      label: 'Spotify' },
      { id: 'misc_prenums', label: 'Övrigt' },
    ],
  },
];

function groupTotal(g: GroupDef, bd: Partial<BudgetData>): number {
  return g.fields
    .filter(f => !f.skipTotal)
    .reduce((s, f) => s + ((bd[f.id] ?? 0) as number), 0);
}

function renderCard(g: GroupDef, bd: BudgetData): string {
  const total = groupTotal(g, bd);
  const colorClass = g.isIncome ? 'green' : '';

  const rows = g.fields.map(f => {
    const val = (bd[f.id] ?? 0) as number;
    const rowClass = f.isAmor ? 'bgt-amor' : f.isInfo ? 'bgt-info' : '';
    return `<tr class="${rowClass}">
      <td>${f.label}</td>
      <td><input type="number" class="bgt-inp" data-field="${f.id}" value="${val}" step="1" min="0"></td>
      <td>kr</td>
    </tr>`;
  }).join('');

  return `<div class="card">
    <div class="bgt-card-head">
      <h3>${g.icon} ${g.label}</h3>
      <span class="bgt-card-total ${colorClass}" id="grptot-${g.id}">${fmt(total)} kr/mån</span>
    </div>
    <table class="bgt-tbl">
      <tbody>${rows}</tbody>
      <tr class="bgt-sum-row">
        <td>Summa</td>
        <td id="grpsum-${g.id}">${fmt(total)}</td>
        <td>kr/mån</td>
      </tr>
    </table>
  </div>`;
}

const bd = budgetStore.get();
const container = document.getElementById('budget-cards')!;
container.innerHTML = GROUPS.map(g => renderCard(g, bd)).join('');

function recalc(): void {
  const cur = {} as Record<keyof BudgetData, number>;

  document.querySelectorAll<HTMLInputElement>('.bgt-inp').forEach(inp => {
    const field = inp.dataset.field as keyof BudgetData;
    cur[field] = parseFloat(inp.value) || 0;
    budgetStore.setField(field, cur[field]);
  });

  GROUPS.forEach(g => {
    const tot = groupTotal(g, cur);
    const el1 = document.getElementById(`grptot-${g.id}`);
    const el2 = document.getElementById(`grpsum-${g.id}`);
    if (el1) el1.textContent = `${fmt(tot)} kr/mån`;
    if (el2) el2.textContent = fmt(tot);
  });

  const inkGroup  = GROUPS.find(g => g.isIncome)!;
  const sparGroup = GROUPS.find(g => g.id === 'sparande')!;

  const totalInk  = groupTotal(inkGroup,  cur);
  const totalSpar = groupTotal(sparGroup, cur);
  const totalUt   = GROUPS.filter(g => !g.isIncome).reduce((s, g) => s + groupTotal(g, cur), 0);
  const saldo     = totalInk - totalUt;
  const sparkvot  = totalInk > 0 ? (totalSpar / totalInk) * 100 : 0;

  function setKpi(id: string, val: string, color?: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    if (color) el.className = `kpi-value ${color}`;
  }

  setKpi('kpi-ink',     `${fmt(totalInk)} kr`);
  setKpi('kpi-ut',      `${fmt(totalUt)} kr`);
  setKpi('kpi-saldo',   `${fmt(saldo)} kr`, saldo >= 0 ? 'green' : 'red');
  setKpi('kpi-sparkvot',`${sparkvot.toFixed(0)} %`, sparkvot >= 25 ? 'green' : 'orange');

  const ek = ekStore.get();
  const nv =
    ek.sparkonto_pv +
    ek.ap_f + ek.ap_u +
    (ek.nav_f_nok + ek.nav_u_nok) * (ek.nok_sek || 0.97) +
    Math.max(0, ek.villa_varde - ek.villa_lan) +
    Math.max(0, ek.lagenhet_varde - ek.lagenhet_lan) +
    ek.lysa_f_pv + ek.lysa_u_pv + ek.buffert_u_pv +
    ek.tjp_f_pv + ek.lonevxl_pv + ek.tidigare_pv + ek.kapan_pv + ek.tjp_u_pv +
    ek.norge_f_pv + ek.dnb_f_pv + ek.sb_f_pv + ek.sb_u_pv + ek.dnb_u_pv +
    ek.pp_f + ek.pp_u +
    ek.norco_antal * ek.norco_kurs + ek.oncop_antal * ek.oncop_kurs;
  setKpi('kpi-nv', fmtM(nv));
}

document.querySelectorAll<HTMLInputElement>('.bgt-inp').forEach(inp => {
  inp.addEventListener('input', recalc);
});

recalc();
