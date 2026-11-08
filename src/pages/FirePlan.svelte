<script lang="ts">
  import Topnav from '../components/Topnav.svelte';
  import { onMount } from 'svelte';
  import { initAuth } from '../auth';
  import { computeFirePlan } from '../calculations';
  import { ekStore, fireStore } from '../store';
  import { injectInfoBtn } from '../nav';
  import { INFO } from '../infoContent';

  // ── Formatering ───────────────────────────────────────────────────────────────
  const fmt = (n: number) => (Math.round(n) || 0).toLocaleString('sv-SE') + ' kr';

  // ── Planinställningar (sparas lokalt, per webbläsare) ─────────────────────────
  const KEY_NOD = 'vek_fireplan_nodfondMan';
  const KEY_OVR = 'vek_fireplan_ovrigtLikvid';
  function load(key: string, fallback: number): number {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : (parseFloat(v) || 0);
    } catch { return fallback; }
  }
  function save(key: string, v: number) {
    try { localStorage.setItem(key, String(v)); } catch { /* privat läge */ }
  }

  let nodfondMan   = $state(load(KEY_NOD, 4));
  let ovrigtLikvid = $state(load(KEY_OVR, 0));

  const ek = ekStore.get();
  const s  = fireStore.get();

  let plan = $derived(computeFirePlan(ek, s, { nodfondManader: nodfondMan, ovrigtLikvid }));

  // Jämnt sparande från idag till FIRE-start — ungefärlig kurs, ingen ränta
  let checkpoints = $derived.by(() => {
    const total = plan.monthsToFire;
    const points = [total, 12, 6, 3, 0].filter((m, i, a) => m <= total && a.indexOf(m) === i);
    return points.map(m => {
      const share = total === 0 ? 1 : (total - m) / total;
      return { m, saldo: plan.likvidIdag + (plan.totalMal - plan.likvidIdag) * share };
    });
  });

  const REGLER = [
    { range: '−50 % … −18 %', action: 'Ta ut 4/3 av kvartalsbehovet ur bufferten (överväg portföljbelåning)' },
    { range: '−18 % … −13 %', action: 'Ta ut 3/3 ur bufferten' },
    { range: '−13 % … −8 %',  action: 'Ta ut 2/3 ur bufferten' },
    { range: '−8 % … −3 %',   action: 'Ta ut 1/3 ur bufferten' },
    { range: '−3 % … +7 %',   action: 'Ombalansera via uttag från bäst presterande fond' },
    { range: '+7 % … +12 %',  action: 'Ombalansera + fyll bufferten med 1/3 av kvartalsbehovet' },
    { range: '+12 % … +17 %', action: 'Ombalansera + fyll bufferten med 2/3' },
    { range: '+17 % … +22 %', action: 'Ombalansera + fyll bufferten med 3/3' },
    { range: '+22 % … +50 %', action: 'Ombalansera + fyll med 3/3 (4/3 om belåningen inte motiverar amortering)' },
  ];

  onMount(async () => {
    await initAuth();
    injectInfoBtn(INFO.fireplan.title, INFO.fireplan.sections);
  });
</script>

<svelte:head><title>FIRE-plan — Verdu Ekonomi</title></svelte:head>

<div class="page">
  <Topnav active="fireplan.html" />

  <h1>🗓️ FIRE-plan</h1>
  <p class="subtitle">Hur mycket som ska ligga på bankkonto (buffert + nödfond) när FIRE-året startar {plan.fireYear}, och hur det ändras när pensionerna börjar.</p>

  <div class="card" style="margin-bottom:24px">
    <div style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap">
      <div class="form-row" style="margin:0">
        <label>Nödfond (månader av levnadskostnad)</label>
        <input type="number" min="0" max="24" step="1" style="width:90px" value={nodfondMan}
               oninput={e => { nodfondMan = parseFloat((e.target as HTMLInputElement).value) || 0; save(KEY_NOD, nodfondMan); }}>
      </div>
      <div class="form-row" style="margin:0">
        <label>Övriga likvida konton (kr)</label>
        <input type="number" min="0" step="10000" style="width:140px" value={ovrigtLikvid}
               oninput={e => { ovrigtLikvid = parseFloat((e.target as HTMLInputElement).value) || 0; save(KEY_OVR, ovrigtLikvid); }}>
      </div>
    </div>
    <p style="font-size:.78rem;color:var(--muted);margin:12px 0 0">
      Sparkontot ({fmt(ek.sparkonto_pv)}) hämtas från <a href="ekonomi.html" style="color:var(--accent)">ekonomi.html</a>. Lägg till övriga bankkonton ovan.
      Levnadskostnad, FIRE-år och pensioner kommer från ekonomi.html och fire.html.
    </p>
  </div>

  <div class="kpi-bar">
    <div class="kpi">
      <div class="kpi-label">Mål vid FIRE-start</div>
      <div class="kpi-value">{fmt(plan.totalMal)}</div>
      <div style="font-size:.7rem;color:var(--muted)">buffert {fmt(plan.steps[0].buffertMal)} + nödfond {fmt(plan.nodfond)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Likvid idag</div>
      <div class="kpi-value">{fmt(plan.likvidIdag)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Prognos vid FIRE</div>
      <div class="kpi-value">{fmt(plan.likvidVidFire)}</div>
      <div style="font-size:.7rem;color:var(--muted)">med nuvarande sparande</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">{plan.gap > 0 ? 'Saknas' : 'Överskott'}</div>
      <div class="kpi-value" style:color={plan.gap > 0 ? 'var(--red)' : 'var(--green)'}>{fmt(Math.abs(plan.gap))}</div>
      {#if plan.gap > 0}
        <div style="font-size:.7rem;color:var(--muted)">≈ {fmt(plan.extraMonthly)}/mån extra i {plan.monthsToFire} mån</div>
      {/if}
    </div>
  </div>

  <h2 style="margin-top:32px">Buffertmål över tid</h2>
  <div class="card" style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:.85rem">
      <thead>
        <tr style="color:var(--muted);text-transform:uppercase;font-size:.68rem;letter-spacing:.06em">
          <th style="text-align:left;padding:6px 8px">Från år</th>
          <th style="text-align:left;padding:6px 8px">Händelse</th>
          <th style="text-align:right;padding:6px 8px">Levnadskostnad/mån</th>
          <th style="text-align:right;padding:6px 8px">Pension/mån</th>
          <th style="text-align:right;padding:6px 8px">Gap/mån</th>
          <th style="text-align:right;padding:6px 8px">Kvartalsbehov</th>
          <th style="text-align:right;padding:6px 8px;color:var(--accent)">Buffertmål (4/3)</th>
        </tr>
      </thead>
      <tbody>
        {#each plan.steps as st}
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:6px 8px">{st.year}</td>
            <td style="padding:6px 8px">{st.label}</td>
            <td style="padding:6px 8px;text-align:right">{fmt(st.levnadskostnad)}</td>
            <td style="padding:6px 8px;text-align:right">{fmt(st.pensionMon)}</td>
            <td style="padding:6px 8px;text-align:right">{fmt(st.gapMon)}</td>
            <td style="padding:6px 8px;text-align:right">{fmt(st.kvartalsbehov)}</td>
            <td style="padding:6px 8px;text-align:right;font-weight:700;color:var(--accent)">{fmt(st.buffertMal)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p style="font-size:.78rem;color:var(--muted);margin:12px 0 0">Nödfonden är inte inräknad i raderna — den ligger kvar som en separat kudde.</p>
  </div>

  <h2 style="margin-top:32px">Tidsplan fram till FIRE</h2>
  <div class="card" style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:.85rem">
      <thead>
        <tr style="color:var(--muted);text-transform:uppercase;font-size:.68rem;letter-spacing:.06em">
          <th style="text-align:left;padding:6px 8px">Tidpunkt</th>
          <th style="text-align:right;padding:6px 8px">Likvid som behövs om du sparar jämnt</th>
        </tr>
      </thead>
      <tbody>
        {#each checkpoints as c}
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:6px 8px">{c.m === plan.monthsToFire ? 'Idag' : c.m === 0 ? `FIRE-start (1 jan ${plan.fireYear})` : `${c.m} mån före FIRE`}</td>
            <td style="padding:6px 8px;text-align:right">{fmt(c.saldo)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p style="font-size:.78rem;color:var(--muted);margin:12px 0 0">Rak linje från dagens saldo till målet — en riktlinje, ingen ränta inräknad.</p>
  </div>

  <h2 style="margin-top:32px">Kvartalsregler under FIRE</h2>
  <div class="card" style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:.85rem">
      <thead>
        <tr style="color:var(--muted);text-transform:uppercase;font-size:.68rem;letter-spacing:.06em">
          <th style="text-align:left;padding:6px 8px">Marknadsrörelse (kvartal)</th>
          <th style="text-align:left;padding:6px 8px">Åtgärd</th>
        </tr>
      </thead>
      <tbody>
        {#each REGLER as r}
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:6px 8px;white-space:nowrap">{r.range}</td>
            <td style="padding:6px 8px">{r.action}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
