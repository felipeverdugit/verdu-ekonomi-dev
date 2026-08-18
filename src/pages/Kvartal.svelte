<script lang="ts">
  import { onMount } from 'svelte';
  import { initAuth } from '../auth';
  import { ekStore, fireStore, kvartalStore } from '../store';
  import { computeFire } from '../calculations';
  import { renderTopnav, injectInfoBtn } from '../nav';
  import { INFO } from '../infoContent';

  // ── Aktiva pensioner beräknas direkt ─────────────────────────────────────────
  function activePensionsMon(): number {
    const yr = new Date().getFullYear();
    const r  = computeFire(ekStore.get(), fireStore.get());
    return r.pensions
      .filter(p => yr >= p.fromYear && yr <= p.toYear)
      .reduce((sum, p) => sum + p.monthly, 0);
  }

  // ── State ─────────────────────────────────────────────────────────────────────
  const saved = kvartalStore.get();
  const defaultFaktisk = ekStore.getField('levnadskostnad');
  const defaultPension = activePensionsMon();
  const defaultBuffert = ekStore.getField('sparkonto_pv');

  let faktisk = $state<number>(saved.faktisk || defaultFaktisk);
  let pension  = $state<number>(saved.pension || defaultPension);
  let buffert  = $state<number>(saved.buffert || defaultBuffert);
  let rorelse  = $state<number>(saved.rorelse ?? 0);

  // ── Deriverade ────────────────────────────────────────────────────────────────
  let kv    = $derived(Math.max(0, faktisk - pension) * 3);
  let kvMax = $derived(Math.round(4 / 3 * kv));

  let rSign  = $derived(rorelse > 0 ? '+' : '');
  let rText  = $derived(`${rSign}${rorelse} %`);
  let rColor = $derived(rorelse < 0 ? 'var(--red)' : rorelse > 0 ? 'var(--green)' : 'var(--muted)');

  let buffertPct   = $derived(kvMax > 0 ? Math.min(100, (buffert / kvMax) * 100) : 0);
  let barColor     = $derived(
    buffertPct >= 100 ? 'var(--green)'
    : buffertPct >= 66 ? '#4f8ef7'
    : buffertPct >= 33 ? 'var(--orange)'
    : 'var(--red)'
  );

  // ── Scenariotyp ───────────────────────────────────────────────────────────────
  type Scenario = {
    label: string; color: string; bg: string; border: string;
    actions: string[]; belaning?: string;
  };

  function getScenario(r: number, kv: number, buffert: number, kvMax: number): Scenario {
    const f        = (n: number) => fmtKr(Math.round(n));
    const fillRoom = Math.max(0, kvMax - buffert);
    const fillAmt  = (frac: number) => Math.min(Math.round(frac * kv), fillRoom);

    if (r <= -18) return {
      label:   `Krasch / Svart svan  (${r} %)`,
      color:   'var(--red)', bg: 'rgba(248,113,113,.08)', border: 'rgba(248,113,113,.35)',
      actions: [`Ta ut ${f(4/3 * kv)} ur bufferten (4/3 × kvartalsbehov ${f(kv)}).`],
      belaning: 'Aktivera portföljbelåning om räntan är låg och du förstår villkoren och marginalriskerna.',
    };
    if (r <= -13) return {
      label:   `Kraftig nedgång  (${r} %)`,
      color:   'var(--red)', bg: 'rgba(248,113,113,.08)', border: 'rgba(248,113,113,.35)',
      actions: [`Ta ut ${f(kv)} ur bufferten (3/3 × kvartalsbehov).`],
    };
    if (r <= -8) return {
      label:   `Nedgång  (${r} %)`,
      color:   'var(--orange)', bg: 'rgba(251,146,60,.08)', border: 'rgba(251,146,60,.35)',
      actions: [`Ta ut ${f(2/3 * kv)} ur bufferten (2/3 × kvartalsbehov).`],
    };
    if (r <= -3) return {
      label:   `Svag nedgång  (${r} %)`,
      color:   'var(--orange)', bg: 'rgba(251,146,60,.08)', border: 'rgba(251,146,60,.35)',
      actions: [`Ta ut ${f(1/3 * kv)} ur bufferten (1/3 × kvartalsbehov).`],
    };
    if (r <= 7) return {
      label:   `Neutralt  (${r} %)`,
      color:   '#4f8ef7', bg: 'rgba(79,142,247,.08)', border: 'rgba(79,142,247,.35)',
      actions: [
        'Ta ut kvartalsbehov från bäst presterande fond (naturlig ombalansering).',
        'Jämför fondernas senaste kvartalsutveckling och sälj "vinnaren" först.',
      ],
      belaning: 'Utvärdera eventuell portföljbelåning.',
    };

    const [fillFrac, fillLbl, scenLabel] =
      r <= 12 ? [1/3, '1/3', 'Uppgång'] :
      r <= 17 ? [2/3, '2/3', 'Stark uppgång'] :
      r <= 22 ? [3/3, '3/3', 'Mycket stark uppgång'] :
                [3/3, '3/3', 'Exceptionell uppgång'];

    const fill = fillAmt(fillFrac);
    const actions = [
      'Ta ut kvartalsbehov från bäst presterande fond.',
      fill > 0
        ? `Sälj ytterligare ${f(fill)} (${fillLbl} av kvartalsbehov ${f(kv)}) och lägg i bufferten — buffertmål: ${f(kvMax)}.`
        : 'Bufferten är redan full — ingen extra försäljning behövs.',
    ];

    const belaning = r > 22
      ? (fillRoom > 0
          ? `Fyll bufferten upp till 4/3-nivå om utrymme finns (+${f(fillAmt(4/3) - fillAmt(3/3))} extra). Om portföljbelåning finns: betala av om räntan motiverar det.`
          : 'Om portföljbelåning finns: betala av om räntan motiverar det.')
      : undefined;

    return {
      label: `${scenLabel}  (${r} %)`,
      color: 'var(--green)', bg: 'rgba(110,231,183,.08)', border: 'rgba(110,231,183,.35)',
      actions, belaning,
    };
  }

  let scenario = $derived(getScenario(rorelse, kv, buffert, kvMax));

  // ── Nästa kvartalsdag ─────────────────────────────────────────────────────────
  function calcNextKvartal(): { dateStr: string; daysText: string; periodText: string } {
    const now   = new Date();
    const year  = now.getFullYear();
    const kv_months = [0, 3, 6, 9];
    const kv_day    = 5;
    const candidates: Date[] = [];
    for (const yr of [year, year + 1]) {
      for (const m of kv_months) candidates.push(new Date(yr, m, kv_day));
    }
    const nextDate = candidates.find(d => d > now)!;
    const diffMs   = nextDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const kvNames  = ['Q1 (jan–mar)', 'Q2 (apr–jun)', 'Q3 (jul–sep)', 'Q4 (okt–dec)'];
    const kvIdx    = kv_months.indexOf(nextDate.getMonth());
    const period   = kvNames[kvIdx] ?? '';
    return {
      dateStr:    nextDate.toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      daysText:   diffDays === 1 ? '🔔 Imorgon!' : `om ${diffDays} dagar`,
      periodText: `Kolla Lysa-portföljens procentutveckling för ${period} och ange den i slidern nedan.`,
    };
  }

  const nextKv = calcNextKvartal();

  // ── Hjälp ─────────────────────────────────────────────────────────────────────
  const fmtKr = (n: number) => Math.round(n).toLocaleString('sv-SE') + ' kr';

  function save(field: 'faktisk' | 'pension' | 'buffert' | 'rorelse', v: number) {
    kvartalStore.setField(field, v);
  }

  onMount(async () => {
    await initAuth();
    renderTopnav('kvartal.html');
    injectInfoBtn(INFO.kvartal.title, INFO.kvartal.sections);
  });
</script>

<svelte:head>
  <title>Kvartalsstrategi — Verdu Ekonomi</title>
</svelte:head>

<div class="page">
  <nav class="topnav" id="topnav"></nav>

  <h1>📅 Kvartalsstrategi</h1>
  <p class="subtitle">Inför varje kvartal — summera faktiska utgifter, ange börsutvecklingen, följ reglerna. Baserat på Jespers uttagsstrategi.</p>

  <!-- KPI-rad -->
  <div class="kpi-bar" style="margin-bottom:24px">
    <div class="kpi-item">
      <div class="kpi-label">Netto kvartalsbehov</div>
      <div class="kpi-value text-orange">{fmtKr(Math.round(kv))}</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-label">Buffertmål (max 4/3)</div>
      <div class="kpi-value">{fmtKr(kvMax)}</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-label">Marknadsrörelse</div>
      <div class="kpi-value fw-bold" style:color={rColor}>{rText}</div>
    </div>
  </div>

  <!-- Förutsättningar -->
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Förutsättningar</div>
    <div class="form-grid">
      <div class="form-row">
        <label>Faktisk månadsutgift <span class="text-muted" style="font-size:.8rem">(genomsnitt senaste 3 mån, inkl. bankkonton)</span></label>
        <input type="number" step="500" style="width:140px" value={faktisk}
               oninput={e => { faktisk = parseFloat((e.target as HTMLInputElement).value) || 0; save('faktisk', faktisk); }} />
      </div>
      <div class="form-row">
        <label>Aktiva pensioner denna månad <span class="text-muted" style="font-size:.8rem">(auto från FIRE-simulatorn)</span></label>
        <input type="number" step="500" style="width:140px" value={pension}
               oninput={e => { pension = parseFloat((e.target as HTMLInputElement).value) || 0; save('pension', pension); }} />
      </div>
      <div class="form-row">
        <label>Buffert idag (Borgo sparkonto, kr)</label>
        <input type="number" step="10000" style="width:140px" value={buffert}
               oninput={e => { buffert = parseFloat((e.target as HTMLInputElement).value) || 0; save('buffert', buffert); }} />
      </div>
    </div>
  </div>

  <!-- Buffert-status -->
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Buffert-status</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-size:1rem;font-weight:600" style:color={barColor}>{fmtKr(buffert)} / {fmtKr(kvMax)}</span>
      <span style="font-size:.9rem;color:var(--muted)">{buffertPct.toFixed(0)} %</span>
    </div>
    <div style="height:14px;background:#2d3348;border-radius:7px;overflow:hidden">
      <div style:width="{buffertPct.toFixed(1)}%" style:background={barColor}
           style="height:100%;border-radius:7px;transition:width .3s,background .3s"></div>
    </div>
    <div style="display:flex;justify-content:space-between;color:var(--muted);font-size:.75rem;margin-top:5px">
      <span>0 kr</span><span>Mål (4/3 × kvartalsbehov)</span>
    </div>
  </div>

  <!-- Nästa kvartalsreview -->
  <div class="card" style="margin-bottom:24px;display:flex;align-items:center;gap:24px;flex-wrap:wrap">
    <div>
      <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:4px">Nästa kvartalsreview</div>
      <div style="font-size:1.4rem;font-weight:700;color:var(--accent1)">{nextKv.dateStr}</div>
    </div>
    <div style="color:var(--muted);font-size:.85rem">{nextKv.daysText}</div>
    <div style="margin-left:auto;font-size:.8rem;color:var(--muted);max-width:280px;line-height:1.6">{nextKv.periodText}</div>
  </div>

  <!-- Marknadsrörelse -->
  <div class="card" style="margin-bottom:24px">
    <div class="card-title">Lysas portföljutveckling senaste kvartal</div>
    <div style="text-align:center;font-size:3rem;font-weight:800;margin:16px 0;letter-spacing:-.02em"
         style:color={rColor}>{rText}</div>
    <div style="position:relative;margin-top:4px">
      <input type="range" min="-50" max="50" step="1" value={rorelse} style="width:100%;accent-color:var(--accent1)"
             oninput={e => { rorelse = parseFloat((e.target as HTMLInputElement).value) || 0; save('rorelse', rorelse); }} />
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                  width:3px;height:18px;background:var(--muted);border-radius:2px;
                  pointer-events:none;opacity:.7"></div>
    </div>
    <div style="display:flex;justify-content:space-between;color:var(--muted);font-size:.8rem;margin-top:8px">
      <span style="color:var(--red)">−50 % krasch</span>
      <span style="font-weight:600;color:var(--muted)">▲ 0 %</span>
      <span style="color:var(--green)">+50 % rus</span>
    </div>
  </div>

  <!-- Rekommendation -->
  <h2>Rekommendation</h2>
  <div class="card" id="scenario-box" style="margin-bottom:24px;border:1px solid transparent"
       style:background={scenario.bg} style:border-color={scenario.border}>
    <div style="font-size:1.15rem;font-weight:700;margin-bottom:14px" style:color={scenario.color}>
      {scenario.label}
    </div>
    <ul style="margin:0;padding-left:20px;line-height:1.9;font-size:.95rem">
      {#each scenario.actions as action}
        <li style="margin-bottom:6px">{action}</li>
      {/each}
    </ul>
    {#if scenario.belaning}
      <div style="margin-top:14px;padding:10px 14px;background:rgba(79,142,247,.1);border-radius:6px;
                  font-size:.88rem;color:#4f8ef7;border-left:3px solid #4f8ef7">
        {scenario.belaning}
      </div>
    {/if}
  </div>

  <!-- Förklaring buffert & belåning -->
  <div class="card" style="margin-bottom:24px;font-size:.88rem;line-height:1.7;color:var(--muted)">
    <div class="card-title">Om bufferten och portföljbelåning</div>
    <p style="margin:0 0 8px">
      <strong style="color:var(--fg)">Buffert</strong> = likvida medel (t.ex. Borgo sparkonto) som täcker 1–1.33 kvartal.
      Den fyller du på vid uppgång och tömmer vid nedgång — så att du aldrig tvingas sälja fonder när de är billiga.
    </p>
    <p style="margin:0 0 8px">
      <strong style="color:var(--fg)">Portföljbelåning</strong> = du lånar mot dina fondvärden som säkerhet.
      Passar vid djup krasch om räntan är låg, men riskerar margin call om portföljvärdet faller ytterligare.
      Använd med stor försiktighet — förstå alltid lånevillkoren innan du aktiverar.
    </p>
    <p style="margin:0">
      <strong style="color:var(--fg)">ISK/Lysa</strong> = schablonbeskattas (~0.9 %/år) oavsett om du tar ut eller inte.
      Uttag härifrån räknas inte som inkomst → ingen extra inkomstskatt vid uttaget.
    </p>
  </div>

  <footer>Kvartalsstrategi · Verdu Ekonomi</footer>
</div>
