<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { initAuth } from '../auth';
  import { ekStore } from '../store';
  import { KREDITKORT } from '../constants';
  import { renderTopnav, injectInfoBtn } from '../nav';
  import { INFO } from '../infoContent';
  import type { EkonomiData } from '../types';

  // ── Beräkning ─────────────────────────────────────────────────────────────────
  interface HinkarResult {
    hink1: number; hink2: number; hink3: number; hink4: number;
    h1_borgo: number; h2_ip: number; h2_nav: number;
    h3_lysa: number; h3_buffert: number; h3_tjpSve: number; h3_tjpNor: number; h3_pp: number;
    h4_norco: number; h4_oncop: number;
    totalFin: number; totalAll: number;
    lekMax: number; lekPct: number; lekExcess: number;
    buffMin: number; buffMax: number;
    h1_kredit: number; h2_villa: number; h2_lagenhet: number; h2_amor: number;
    fireNum: number; maalPct: number; sparMon: number;
  }

  function computeHinkar(ek: EkonomiData): HinkarResult {
    const h1_borgo    = ek.sparkonto_pv;
    const h2_ip       = ek.ap_f + ek.ap_u;
    const h2_nav      = (ek.nav_f_nok + ek.nav_u_nok) * (ek.nok_sek || 0.97);
    const h2_villa    = Math.max(0, (ek.villa_varde ?? 0) - (ek.villa_lan ?? 0));
    const h2_lagenhet = Math.max(0, (ek.lagenhet_varde ?? 0) - (ek.lagenhet_lan ?? 0));
    const h2_amor     = (ek.villa_amor ?? 0) + (ek.lagenhet_amor ?? 0);
    const h3_lysa     = ek.lysa_f_pv + ek.lysa_u_pv;
    const h3_buffert  = ek.buffert_u_pv;
    const h3_tjpSve   = ek.tjp_f_pv + ek.lonevxl_pv + ek.tidigare_pv + ek.kapan_pv + ek.tjp_u_pv;
    const h3_tjpNor   = ek.norge_f_pv + ek.dnb_f_pv + ek.sb_f_pv + ek.sb_u_pv + ek.dnb_u_pv;
    const h3_pp       = ek.pp_f + ek.pp_u;
    const h4_norco    = ek.norco_antal * ek.norco_kurs;
    const h4_oncop    = ek.oncop_antal * ek.oncop_kurs;
    const hink1  = h1_borgo;
    const hink2  = h2_ip + h2_nav + h2_villa + h2_lagenhet;
    const hink3  = h3_lysa + h3_buffert + h3_tjpSve + h3_tjpNor + h3_pp;
    const hink4  = h4_norco + h4_oncop;
    const totalFin  = hink1 + hink3 + hink4;
    const totalAll  = hink1 + hink2 + hink3 + hink4;
    const lekMax    = hink3 * 0.10;
    const lekPct    = hink3 > 0 ? hink4 / hink3 * 100 : 0;
    const lekExcess = Math.max(0, hink4 - lekMax);
    const buffMin   = ek.levnadskostnad * 3;
    const buffMax   = ek.levnadskostnad * 6;
    const h1_kredit = KREDITKORT.reduce((s, k) => s + k.limit, 0);
    const fireNum   = ek.levnadskostnad * 12 / 0.04;
    const maalPct   = fireNum > 0 ? totalAll / fireNum * 100 : 0;
    const sparMon   = ek.lysa_f_pmt + ek.lysa_u_pmt + ek.buffert_u_pmt + ek.sparkonto_pmt;
    return {
      hink1, hink2, hink3, hink4,
      h1_borgo, h2_ip, h2_nav, h2_villa, h2_lagenhet, h2_amor,
      h3_lysa, h3_buffert, h3_tjpSve, h3_tjpNor, h3_pp,
      h4_norco, h4_oncop,
      totalFin, totalAll, lekMax, lekPct, lekExcess,
      buffMin, buffMax, h1_kredit, fireNum, maalPct, sparMon,
    };
  }

  // ── State ─────────────────────────────────────────────────────────────────────
  let ek = $state<EkonomiData>(ekStore.get());
  let h  = $derived(computeHinkar(ek));

  // ── Formatering ───────────────────────────────────────────────────────────────
  const fmt  = (n: number) => Math.round(n).toLocaleString('sv-SE') + ' kr';
  const fmtK = (n: number) => Math.round(n / 1000).toLocaleString('sv-SE') + ' kkr';
  const fmtM = (n: number) => (n / 1e6).toFixed(2) + ' MSEK';
  const pct  = (n: number) => n.toFixed(1) + ' %';

  // ── Badge ─────────────────────────────────────────────────────────────────────
  type Variant = 'ok' | 'warn' | 'bad';
  function badgeColor(v: Variant) {
    return v === 'ok' ? 'var(--green)' : v === 'warn' ? 'var(--orange)' : 'var(--red)';
  }

  // ── Rikedomstrappan ───────────────────────────────────────────────────────────
  type LevelCheck = { lbl: string; ok: boolean };
  type Level = { n: number; icon: string; namn: string; desc: string; check: LevelCheck[] };

  let levels = $derived<Level[]>([
    {
      n: 1, icon: '🛡', namn: 'Ekonomisk trygghet',
      desc: 'Inga dåliga skulder, börjat spara, grundskydd på plats.',
      check: [
        { lbl: 'Har buffert (hink 1 > 0)',            ok: h.hink1 > 0 },
        { lbl: 'Sparar regelbundet (>3 000/mån)',       ok: h.sparMon > 3000 },
        { lbl: 'TjP/IP aktiva (hink 2 > 0)',            ok: h.hink2 > 0 },
      ],
    },
    {
      n: 2, icon: '💰', namn: 'Ekonomisk stabilitet',
      desc: '3–6 mån buffert, kontroll på ekonomin.',
      check: [
        { lbl: `3 mån buffert (≥ ${fmt(h.buffMin)})`, ok: h.hink1 >= h.buffMin },
        { lbl: 'Aktivt fondspararande (>5 000/mån)',    ok: h.sparMon > 5000 },
        { lbl: 'Hink 3 > 2 MSEK',                      ok: h.hink3 > 2_000_000 },
      ],
    },
    {
      n: 3, icon: '📈', namn: 'Ekonomisk frihet',
      desc: 'Passiv inkomst täcker grundbehov. Kan ta risker med jobbet.',
      check: [
        { lbl: 'Hink 2 > 3 MSEK (pension + fastigheter)', ok: h.hink2 > 3_000_000 },
        { lbl: 'Hink 3 > 5 MSEK (tillväxt)',               ok: h.hink3 > 5_000_000 },
      ],
    },
    {
      n: 4, icon: '🎯', namn: 'Ekonomiskt oberoende',
      desc: 'Kan leva på passiv avkastning. FIRE är möjligt.',
      check: [
        { lbl: 'Måluppfyllnad ≥ 80 % av FIRE-tal',      ok: h.maalPct >= 80 },
        { lbl: `Buffert OK (≥ ${fmt(h.buffMin)})`,       ok: h.hink1 >= h.buffMin },
        { lbl: 'Lek ≤ 10 % av hink 3',                  ok: h.lekPct <= 10 },
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
  ]);

  let topLevel = $derived(levels.reduce((top, l) => l.check.every(c => c.ok) ? l.n : top, 0));

  let summaryText = $derived(
    topLevel >= 4
      ? `Nivå ${topLevel} — ${levels[topLevel - 1].namn}. Stark position. ${topLevel < 5 ? 'Nivå 5 kräver avsevärt större portfölj och måluppfyllnad ≥ 150 %.' : 'Imponerande!'}`
      : topLevel === 3
        ? 'Nivå 3 — Ekonomisk frihet. Solid bas. Buffert och lek-andel är det som avgör om ni når nivå 4.'
        : topLevel === 2
          ? 'Nivå 2 — Ekonomisk stabilitet. God grund. Väx hink 2 och 3 för att nå Ekonomisk frihet.'
          : `Nivå ${topLevel} uppnådd. Fortsätt bygga steg för steg.`
  );

  // ── Gap-fält ──────────────────────────────────────────────────────────────────
  const TARGET_PCT = 80;

  let gapInfo = $derived(() => {
    const ok = h.maalPct >= TARGET_PCT;
    const gapKr       = h.fireNum * TARGET_PCT / 100 - h.totalAll;
    const levnadFor80 = h.totalAll * 0.04 / 12 / (TARGET_PCT / 100);
    return { ok, gapKr, levnadFor80 };
  });

  // ── Stapel ────────────────────────────────────────────────────────────────────
  let stapel = $derived({
    p1: h.hink1 / (h.totalAll || 1) * 100,
    p2: h.hink2 / (h.totalAll || 1) * 100,
    p3: h.hink3 / (h.totalAll || 1) * 100,
    p4: h.hink4 / (h.totalAll || 1) * 100,
  });

  let maalColor = $derived(
    h.maalPct >= TARGET_PCT ? 'var(--green)'
    : h.maalPct >= 60 ? 'var(--orange)'
    : 'var(--red)'
  );

  // ── Likviditet ────────────────────────────────────────────────────────────────
  let likviditet = $derived(h.hink1 + h.h1_kredit);
  let manader    = $derived(ek.levnadskostnad > 0 ? (likviditet / ek.levnadskostnad).toFixed(1) : '—');

  function onStorage(e: StorageEvent) {
    if (e.key?.startsWith('vek_ek_') || e.key?.startsWith('vek_fire_')) ek = ekStore.get();
  }

  onMount(async () => {
    await initAuth();
    renderTopnav('hinkar.html');
    injectInfoBtn(INFO.hinkar.title, INFO.hinkar.sections);
    window.addEventListener('storage', onStorage);
  });

  onDestroy(() => window.removeEventListener('storage', onStorage));
</script>

<svelte:head><title>Fyra Hinkar — Verdu Ekonomi</title></svelte:head>

<div class="page">
  <nav class="topnav" id="topnav"></nav>

  <h1>🪣 Fyra Hinkar</h1>
  <p class="subtitle">Nuläge per hink · Synkas automatiskt från Ekonomi-sidan.</p>

  <!-- KPI-rad -->
  <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:32px">
    <div class="kpi-card"><div class="kpi-label">Totalt finansiellt</div><div class="kpi-value" style="color:var(--accent2)">{fmtM(h.totalFin)}</div><div class="kpi-sub">fonder + TjP + aktier</div></div>
    <div class="kpi-card"><div class="kpi-label">Levnadskostnad</div><div class="kpi-value" style="color:var(--accent1)">{fmt(ek.levnadskostnad)}</div><div class="kpi-sub">kr/mån</div></div>
    <div class="kpi-card"><div class="kpi-label">Buffert behov</div><div class="kpi-value" style="color:var(--orange)">{fmtK(h.buffMin)}–{fmtK(h.buffMax)}</div><div class="kpi-sub">3–6 månaders kostnader</div></div>
    <div class="kpi-card"><div class="kpi-label">Lek-andel</div><div class="kpi-value" style="color:var(--red)">{pct(h.lekPct)}</div><div class="kpi-sub">av hink 3 (max 10 %)</div></div>
    <div class="kpi-card"><div class="kpi-label">Månadsparande</div><div class="kpi-value" style="color:var(--accent1)">{fmt(h.sparMon)}/mån</div><div class="kpi-sub">privata fonder + sparkonto</div></div>
  </div>

  <!-- Måluppfyllnad -->
  <div class="card" style="margin-bottom:24px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <div>
        <div style="font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Nuvarande kapital, alla hinkar vs FIRE-tal</div>
        <div style="font-size:1.6rem;font-weight:800;font-variant-numeric:tabular-nums" style:color={maalColor}>{pct(h.maalPct)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">FIRE-tal (4%-regeln)</div>
        <div style="font-size:1rem;font-weight:700;color:var(--muted)">{fmtM(h.fireNum)}</div>
      </div>
    </div>
    <div style="background:var(--border);border-radius:6px;height:10px;margin-bottom:16px;overflow:hidden">
      <div style:width="{Math.min(h.maalPct, 100).toFixed(1)}%" style:background={maalColor}
           style="height:100%;border-radius:6px;transition:width .4s"></div>
    </div>

    {#if gapInfo().ok}
      <p style="color:var(--green);font-size:.88rem;margin:0">✓ FIRE-kapital uppnått — ni har nått 80 %+ av FIRE-talet.</p>
    {:else}
      <div style="font-size:.88rem;color:var(--muted)">
        <p style="margin:0 0 6px">Gap till 80 %: <strong style="color:var(--orange)">{fmt(Math.round(gapInfo().gapKr))}</strong></p>
        <p style="margin:0">Levnadskostnad för att nå 80 %: <strong style="color:var(--orange)">{fmt(Math.round(gapInfo().levnadFor80))}/mån</strong></p>
      </div>
    {/if}
  </div>

  <!-- Stapeldiagram -->
  <div class="card" style="margin-bottom:24px">
    <div style="display:flex;height:28px;border-radius:8px;overflow:hidden;gap:2px;margin-bottom:12px">
      <div style:width="{stapel.p1.toFixed(1)}%" style="background:#6ee7b7;transition:width .4s" title="Hink 1: {pct(stapel.p1)}"></div>
      <div style:width="{stapel.p2.toFixed(1)}%" style="background:#4f8ef7;transition:width .4s" title="Hink 2: {pct(stapel.p2)}"></div>
      <div style:width="{stapel.p3.toFixed(1)}%" style="background:#a78bfa;transition:width .4s" title="Hink 3: {pct(stapel.p3)}"></div>
      <div style:width="{stapel.p4.toFixed(1)}%" style="background:#f59e0b;transition:width .4s" title="Hink 4: {pct(stapel.p4)}"></div>
    </div>
    <div style="display:flex;gap:16px;font-size:.78rem;flex-wrap:wrap">
      <span><span style="color:#6ee7b7">■</span> Hink 1: {pct(stapel.p1)}</span>
      <span><span style="color:#4f8ef7">■</span> Hink 2: {pct(stapel.p2)}</span>
      <span><span style="color:#a78bfa">■</span> Hink 3: {pct(stapel.p3)}</span>
      <span><span style="color:#f59e0b">■</span> Hink 4: {pct(stapel.p4)}</span>
    </div>
    <div style="font-size:.75rem;color:var(--muted);margin-top:8px">Totalt ~{fmtM(h.totalAll)} · Hink 2 inkluderar IP + NAV + fastigheter (villa + lägenhet equity)</div>
  </div>

  <!-- Hink 1 -->
  <div class="card" style="margin-bottom:16px;border-left:4px solid #6ee7b7">
    <h3 style="margin-top:0">🛡 Hink 1 — Likviditet &amp; buffert</h3>
    <div class="form-row"><label>Borgo sparkonto</label><span class="num">{fmt(h.h1_borgo)}</span></div>
    <div class="form-row" style="font-weight:700"><label>Hink 1 totalt</label><span class="num">{fmt(h.hink1)}</span></div>
    <div class="form-row"><label style="color:var(--muted);font-size:.8rem">Mål: {fmt(h.buffMin)}–{fmt(h.buffMax)}</label>
      {@html h.hink1 >= h.buffMin
        ? `<span class="badge" style="background:${badgeColor('ok')}18;color:${badgeColor('ok')};border:1px solid ${badgeColor('ok')}40">✓ OK</span>`
        : h.hink1 >= h.buffMin * 0.5
          ? `<span class="badge" style="background:${badgeColor('warn')}18;color:${badgeColor('warn')};border:1px solid ${badgeColor('warn')}40">⚠ Underfunderad</span>`
          : `<span class="badge" style="background:${badgeColor('bad')}18;color:${badgeColor('bad')};border:1px solid ${badgeColor('bad')}40">⚠ Kritiskt liten</span>`}
    </div>
    <hr style="border-color:var(--border);margin:12px 0">
    <div style="font-size:.8rem;color:var(--muted);margin-bottom:6px">Kreditkortslimiter (ej tillgångar, men likviditetsbuffert)</div>
    {#each KREDITKORT as k}
      <div class="form-row"><label>{k.label}</label><span class="num" style="color:var(--muted)">{fmt(k.limit)}</span></div>
    {/each}
    <div class="form-row"><label>Total kreditgräns</label><span class="num">{fmt(h.h1_kredit)}</span></div>
    <div class="form-row" style="font-weight:700"><label>Total likviditet (hink 1 + kredit)</label><span class="num">{fmt(likviditet)}</span></div>
    <div style="font-size:.8rem;color:var(--muted);margin-top:4px">{manader} månaders utgifter inkl. kredit</div>
  </div>

  <!-- Hink 2 -->
  <div class="card" style="margin-bottom:16px;border-left:4px solid #4f8ef7">
    <h3 style="margin-top:0">🏠 Hink 2 — Bevara värde</h3>
    <div class="form-row"><label>Inkomstpension SE (IP)</label><span class="num">{fmtK(h.h2_ip)}</span></div>
    <div class="form-row"><label>NAV inntektspension NO</label><span class="num">{fmtK(h.h2_nav)}</span></div>
    <div class="form-row"><label>Villa (equity)</label><span class="num">{fmtK(h.h2_villa)}</span></div>
    <div class="form-row"><label>Lägenhet (equity)</label><span class="num">{fmtK(h.h2_lagenhet)}</span></div>
    <div class="form-row"><label style="color:var(--muted);font-size:.8rem">Amortering/mån</label><span class="num" style="color:var(--muted)">+{fmt(h.h2_amor)}/mån</span></div>
    <div class="form-row" style="font-weight:700"><label>Hink 2 totalt</label><span class="num">~{fmtK(h.hink2)}</span></div>
  </div>

  <!-- Hink 3 -->
  <div class="card" style="margin-bottom:16px;border-left:4px solid #a78bfa">
    <h3 style="margin-top:0">📈 Hink 3 — Tillväxt</h3>
    <div class="form-row"><label>Lysa (F+U)</label><span class="num">{fmtK(h.h3_lysa)}</span></div>
    <div class="form-row"><label>Buffert Lysa</label><span class="num">{fmtK(h.h3_buffert)}</span></div>
    <div class="form-row"><label>TjP Sverige</label><span class="num">{fmtK(h.h3_tjpSve)}</span></div>
    <div class="form-row"><label>TjP Norge</label><span class="num">{fmtK(h.h3_tjpNor)}</span></div>
    <div class="form-row"><label>Premiepension (AP7)</label><span class="num">{fmtK(h.h3_pp)}</span></div>
    <div class="form-row" style="font-weight:700"><label>Hink 3 totalt</label><span class="num">~{fmtM(h.hink3)}</span></div>
    <div style="font-size:.8rem;color:var(--muted);margin-top:6px">Max lekandel (10 %): {fmt(h.lekMax)}</div>
  </div>

  <!-- Hink 4 -->
  <div class="card" style="margin-bottom:24px;border-left:4px solid #f59e0b">
    <h3 style="margin-top:0">🎲 Hink 4 — Lek (spekulativt)</h3>
    <div class="form-row"><label>Norconsult</label><span class="num">{fmtK(h.h4_norco)}</span></div>
    <div class="form-row"><label>Oncopeptides</label><span class="num">{fmtK(h.h4_oncop)}</span></div>
    <div class="form-row"><label style="color:var(--muted)">Max (10 % av hink 3)</label><span class="num" style="color:var(--muted)">{fmt(h.lekMax)}</span></div>
    <div class="form-row" style="font-weight:700"><label>Hink 4 totalt</label><span class="num">{fmtK(h.hink4)}</span></div>
    {#if h.lekExcess > 0}
      <div class="form-row"><label style="color:var(--red)">Överskott att ombalansera</label><span class="num" style="color:var(--red)">~{fmtK(h.lekExcess)}</span></div>
    {/if}
    <div style="margin-top:10px">
      {@html h.lekPct <= 10
        ? `<span class="badge" style="background:var(--green)18;color:var(--green);border:1px solid var(--green)40">✓ ${pct(h.lekPct)} — OK</span>`
        : h.lekPct <= 15
          ? `<span class="badge" style="background:var(--orange)18;color:var(--orange);border:1px solid var(--orange)40">⚠ ${pct(h.lekPct)} — lite högt</span>`
          : `<span class="badge" style="background:var(--red)18;color:var(--red);border:1px solid var(--red)40">⚠ ${pct(h.lekPct)} — för högt</span>`}
    </div>
  </div>

  <!-- Rikedomstrappan -->
  <h2>Rikedomstrappan</h2>
  <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:32px">
    {#each [...levels].reverse() as level}
      {@const allOk  = level.check.every(c => c.ok)}
      {@const isTop  = allOk && level.n === topLevel}
      {@const isNext = !allOk && level.n === Math.min(topLevel + 1, 5)}
      {@const bColor = allOk ? 'var(--green)' : isNext ? 'var(--accent1)' : 'var(--border)'}
      {@const nColor = allOk ? 'var(--green)' : isNext ? 'var(--accent1)' : 'var(--muted)'}
      <div style="background:var(--card);border:1px solid var(--border);border-left:4px solid {bColor};border-radius:12px;padding:14px 18px;display:flex;gap:14px;align-items:flex-start">
        <div style="font-size:1.3rem;flex-shrink:0;margin-top:2px">{level.icon}</div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:6px">
            <div>
              <div style="font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Nivå {level.n}</div>
              <div style="font-weight:700;font-size:.95rem;color:{nColor}">{level.namn}</div>
              <div style="font-size:.75rem;color:var(--muted)">{level.desc}</div>
            </div>
            {#if isTop}
              <span class="badge" style="background:var(--green)18;color:var(--green);border:1px solid var(--green)40">✓ Ni är här</span>
            {:else if allOk}
              <span class="badge" style="background:var(--green)18;color:var(--green);border:1px solid var(--green)40">✓ Uppnådd</span>
            {:else if isNext}
              <span class="badge" style="background:var(--orange)18;color:var(--orange);border:1px solid var(--orange)40">← Nästa mål</span>
            {/if}
          </div>
          {#each level.check as c}
            <div style="font-size:.78rem;color:{c.ok ? 'var(--green)' : 'var(--red)'};margin-top:3px">{c.ok ? '✓' : '✗'} {c.lbl}</div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <div class="card" style="margin-bottom:24px">
    <div style="font-size:.9rem">
      {#if topLevel >= 4}
        <strong style="color:var(--green)">{summaryText}</strong>
      {:else if topLevel >= 2}
        <strong style="color:var(--green)">{summaryText}</strong>
      {:else}
        <strong style="color:var(--orange)">{summaryText}</strong>
      {/if}
    </div>
  </div>

  <footer>Fyra Hinkar · Verdu Ekonomi</footer>
</div>
