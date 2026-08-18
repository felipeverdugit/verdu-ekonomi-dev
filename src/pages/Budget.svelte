<script lang="ts">
  import { onMount } from 'svelte';
  import { initAuth } from '../auth';
  import { budgetStore, ekStore } from '../store';
  import { computeNV } from '../calculations';
  import { initSyncWidget } from '../syncWidget';
  import { renderTopnav, injectInfoBtn } from '../nav';
  import { INFO } from '../infoContent';
  import type { BudgetData } from '../types';

  // ── Gruppdefinitioner (identiska med budget.ts) ──────────────────────────────

  type FieldDef = {
    id: keyof BudgetData;
    label: string;
    skipTotal?: boolean;
    isAmor?: boolean;
    isInfo?: boolean;
    exclSparkvot?: boolean;
  };
  type GroupDef = { id: string; label: string; icon: string; isIncome?: boolean; fields: FieldDef[] };

  const GROUPS: GroupDef[] = [
    { id: 'ink', label: 'Inkomster', icon: '💼', isIncome: true, fields: [
      { id: 'brutto_f',       label: 'Felipe brutto',    skipTotal: true, isInfo: true },
      { id: 'netto_f',        label: 'Felipe netto' },
      { id: 'brutto_u',       label: 'Ulrika brutto',    skipTotal: true, isInfo: true },
      { id: 'netto_u',        label: 'Ulrika netto' },
      { id: 'vardnadsbidrag', label: 'Vårdnadsbidrag' },
      { id: 'barnbidrag',     label: 'Barnbidrag' },
      { id: 'hyra_lag_ink',   label: 'Hyra lägenhet' },
      { id: 'sparkonto_ink',  label: 'Sparkonto', exclSparkvot: true },
    ]},
    { id: 'boende', label: 'Boende', icon: '🏠', fields: [
      { id: 'lan_villa',  label: 'Ränta villa' },
      { id: 'lan_lag',    label: 'Ränta lägenhet' },
      { id: 'vatten',     label: 'Vatten & avlopp' },
      { id: 'el',         label: 'El' },
      { id: 'energi',     label: 'Fjärrvärme/energi' },
      { id: 'avfall',     label: 'Avfall' },
    ]},
    { id: 'transport', label: 'Transport', icon: '🚗', fields: [
      { id: 'kia_leasing', label: 'KIA leasing' },
      { id: 'kia_el',      label: 'KIA el' },
    ]},
    { id: 'telefoni', label: 'Telefoni & Internet', icon: '📱', fields: [
      { id: 'streaming',      label: 'Streaming' },
      { id: 'bredband_fiber', label: 'Bredband fiber' },
      { id: 'mobil',          label: 'Mobilabonnemang' },
      { id: 'bredband_5g',    label: 'Bredband 5G' },
      { id: 'telia_cloud',    label: 'Telia Cloud' },
    ]},
    { id: 'forsakring', label: 'Försäkringar', icon: '🛡️', fields: [
      { id: 'hemforsakring',  label: 'Hemförsäkring' },
      { id: 'tryghansa',      label: 'Trygg-Hansa' },
      { id: 'skandia_liv',    label: 'Skandia Liv' },
      { id: 'if_skadef',      label: 'Livsförsäkring F' },
      { id: 'sv_lararnas',    label: 'SV Lärarnas' },
      { id: 'djurforsakring', label: 'Djurförsäkring' },
    ]},
    { id: 'fack', label: 'Fack & Övrigt', icon: '🤝', fields: [
      { id: 'ledarna',       label: 'Ledarna' },
      { id: 'ledarnas_akas', label: 'Ledarnas a-kassa' },
      { id: 'lararnas_akas', label: 'Lärarnas a-kassa' },
      { id: 'csn',           label: 'CSN' },
      { id: 'hjarnfonden',   label: 'Hjärnfonden' },
      { id: 'friskis',       label: 'Friskis & Svettis' },
    ]},
    { id: 'sparande', label: 'Sparande', icon: '💎', fields: [
      { id: 'amor_villa',        label: 'Amortering villa' },
      { id: 'amor_lag',         label: 'Amortering lägenhet' },
      { id: 'lysa_f_mon',       label: 'Lysa Felipe' },
      { id: 'lysa_u_mon',       label: 'Lysa Ulrika' },
      { id: 'lysa_buffert_mon', label: 'Lysa Buffert (U+F)' },
      { id: 'lysa_n_mon',       label: 'Lysa N', skipTotal: true },
      { id: 'borgo_bank_mon',   label: 'Borgo Bank' },
      { id: 'resor_mon',        label: 'Resor (månadsspar)' },
      { id: 'lonevxl_mon',      label: 'Löneväxling Felipe' },
    ]},
    { id: 'ovriga', label: 'Övriga utgifter', icon: '💳', fields: [
      { id: 'mc_felipe', label: 'MC Felipe' },
      { id: 'mc_ulrika', label: 'MC Ulrika' },
    ]},
    { id: 'prenums', label: 'Prenumerationer', icon: '📡', fields: [
      { id: 'nextory',      label: 'Nextory' },
      { id: 'anthropic',    label: 'Anthropic Claude' },
      { id: 'spotify',      label: 'Spotify' },
      { id: 'misc_prenums', label: 'Övrigt' },
    ]},
  ];

  // ── State ─────────────────────────────────────────────────────────────────────

  let bd = $state<BudgetData>((() => {
    const data = budgetStore.get();
    if (!data.lonevxl_mon) data.lonevxl_mon = ekStore.getField('lonevxl_pmt');
    return data;
  })());

  // ── Beräkningar (reaktiva) ────────────────────────────────────────────────────

  function groupTotal(g: GroupDef): number {
    return g.fields.filter(f => !f.skipTotal).reduce((s, f) => s + ((bd[f.id] ?? 0) as number), 0);
  }

  const inkGroup  = GROUPS.find(g => g.isIncome)!;
  const sparGroup = GROUPS.find(g => g.id === 'sparande')!;

  let kpis = $derived((() => {
    const totalInk  = groupTotal(inkGroup);
    const totalSpar = groupTotal(sparGroup);
    const totalUt   = GROUPS.filter(g => !g.isIncome).reduce((s, g) => s + groupTotal(g), 0);
    const lonevxl   = bd.lonevxl_mon ?? 0;
    const saldo     = totalInk - totalUt + lonevxl;
    const exclInk   = inkGroup.fields.filter(f => f.exclSparkvot).reduce((s, f) => s + (bd[f.id] as number ?? 0), 0);
    const adjInk    = totalInk + lonevxl - exclInk;
    const sparkvot  = adjInk > 0 ? (totalSpar / adjInk) * 100 : 0;
    const nv        = computeNV(ekStore.get());
    return { totalInk, totalUt, saldo, sparkvot, nv };
  })());

  // ── Hjälp ─────────────────────────────────────────────────────────────────────

  const fmt  = (n: number) => Math.round(n).toLocaleString('sv-SE');
  const fmtM = (n: number) => (n / 1_000_000).toFixed(2) + ' MSEK';

  function handleInput(field: keyof BudgetData, raw: string) {
    const v = parseFloat(raw) || 0;
    (bd as Record<string, number>)[field] = v;
    budgetStore.setField(field, v);
  }

  onMount(async () => {
    await initAuth();
    renderTopnav('budget.html');
    injectInfoBtn(INFO.budget.title, INFO.budget.sections);
  });
</script>

<svelte:head>
  <title>Budget — Verdu Ekonomi</title>
</svelte:head>

<div class="page">
  <nav class="topnav" id="topnav"></nav>

  <h1>📋 Budget</h1>
  <p class="subtitle">Månadsöversikt · Redigera värden direkt i tabellen · Sparas automatiskt</p>

  <div class="kpi-bar">
    <div class="kpi">
      <div class="kpi-label">Inkomster</div>
      <div class="kpi-value green">{fmt(kpis.totalInk)}</div>
      <div style="font-size:.7rem;color:var(--muted)">kr/mån</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Utgifter</div>
      <div class="kpi-value">{fmt(kpis.totalUt)}</div>
      <div style="font-size:.7rem;color:var(--muted)">kr/mån</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Saldo</div>
      <div class="kpi-value" style:color={kpis.saldo >= 0 ? 'var(--green)' : 'var(--red)'}>{fmt(kpis.saldo)}</div>
      <div style="font-size:.7rem;color:var(--muted)">kr/mån</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Sparkvot</div>
      <div class="kpi-value">{kpis.sparkvot.toFixed(1)} %</div>
      <div style="font-size:.7rem;color:var(--muted)">av inkomst</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Nettovärde</div>
      <div class="kpi-value">{fmtM(kpis.nv)}</div>
      <div style="font-size:.7rem;color:var(--muted)">portfölj + fastigheter</div>
    </div>
  </div>

  <div class="budget-cards">
    {#each GROUPS as g}
      {@const tot = groupTotal(g)}
      <div class="card">
        <div class="bgt-card-head">
          <h3>{g.icon} {g.label}</h3>
          <span class="bgt-card-total" class:green={g.isIncome}>{fmt(tot)} kr/mån</span>
        </div>
        <table class="bgt-tbl">
          <tbody>
            {#each g.fields as f}
              <tr class:bgt-amor={f.isAmor} class:bgt-info={f.isInfo}>
                <td>{f.label}</td>
                <td>
                  <input
                    type="number"
                    class="bgt-inp"
                    value={(bd[f.id] ?? 0) as number}
                    step="1"
                    min="0"
                    oninput={e => handleInput(f.id, (e.target as HTMLInputElement).value)}
                  />
                </td>
                <td>kr</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr class="bgt-sum-row">
              <td>Summa</td>
              <td>{fmt(tot)}</td>
              <td>kr/mån</td>
            </tr>
          </tfoot>
        </table>
      </div>
    {/each}
  </div>

  <footer>Budget · Verdu Ekonomi</footer>
</div>

<style>
  .budget-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
    gap: 18px;
    margin-bottom: 32px;
  }
  :global(.bgt-tbl) { width: 100%; border-collapse: collapse; font-size: .85rem; }
  :global(.bgt-tbl td) { padding: 5px 4px; vertical-align: middle; }
  :global(.bgt-tbl td:nth-child(2)) { text-align: right; }
  :global(.bgt-tbl td:nth-child(3)) { color: var(--muted); font-size: .72rem; padding-left: 4px; white-space: nowrap; }
  :global(.bgt-inp) {
    width: 90px; text-align: right; background: transparent;
    border: 1px solid var(--border, #444); border-radius: 4px;
    padding: 3px 6px; color: inherit; font-size: .85rem; font-family: inherit;
  }
  :global(.bgt-inp:focus) { outline: none; border-color: var(--accent, #4a9eff); }
  :global(.bgt-amor td) { color: var(--muted); font-size: .78rem; padding-top: 1px; }
  :global(.bgt-amor .bgt-inp) { font-size: .78rem; width: 80px; }
  :global(.bgt-info td) { color: var(--muted); }
  :global(.bgt-sum-row td) { border-top: 1px solid var(--border, #444); font-weight: 600; padding-top: 8px; }
  .bgt-card-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
  .bgt-card-head h3 { margin: 0; font-size: 1rem; }
  .bgt-card-total { font-weight: 600; font-size: .9rem; }
  @media (max-width: 600px) { .budget-cards { grid-template-columns: 1fr; } }
</style>
