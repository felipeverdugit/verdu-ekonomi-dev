<script lang="ts">
  import Topnav from '../components/Topnav.svelte';
  import { onMount } from 'svelte';
  import { initAuth } from '../auth';
  import { computeLonevaxling, LONEVAXLING_RULES, pensionTak, breakEvenPaslag, maxVaxlingUnderTak, requiredLonForVaxling } from '../calculations';
  import { ekStore } from '../store';
  import { injectInfoBtn } from '../nav';
  import { INFO } from '../infoContent';

  // ── Formatering ───────────────────────────────────────────────────────────────
  const fmt = (n: number) => (Math.round(n) || 0).toLocaleString('sv-SE') + ' kr';
  const pct = (n: number) => (n * 100).toFixed(2).replace('.', ',') + ' %';

  // ── Inställningar (sparas lokalt) ─────────────────────────────────────────────
  const K = { lon: 'vek_lonevaxling_lonFore', vax: 'vek_lonevaxling_vaxlat', pas: 'vek_lonevaxling_paslag', sem: 'vek_lonevaxling_semdagar', vax27: 'vek_lonevaxling_vaxlat2027' };
  function load(key: string, fallback: number): number {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : (parseFloat(v) || 0);
    } catch { return fallback; }
  }
  function save(key: string, v: number) {
    try { localStorage.setItem(key, String(v)); } catch { /* privat läge */ }
  }

  const ek = ekStore.get();
  const DEFAULT_PASLAG = 5.8;
  let lonFore = $state(load(K.lon, ek.brutto_f));
  // ekonomi.html lagrar inbetalningen inkl. arbetsgivarens påslag — växlat belopp = inbetalning / (1 + påslag)
  let vaxlat  = $state(load(K.vax, Math.round(ek.lonevxl_pmt / (1 + DEFAULT_PASLAG / 100))));
  let paslag  = $state(load(K.pas, DEFAULT_PASLAG));
  let semester = $state(load(K.sem, 32));

  const R26 = LONEVAXLING_RULES[2026];
  const R27 = LONEVAXLING_RULES[2027];
  // 2027 har eget belopp; tomt = samma som 2026
  let vaxlat27 = $state<number | null>((() => {
    try { const v = localStorage.getItem(K.vax27); return v === null ? null : (parseFloat(v) || 0); } catch { return null; }
  })());
  let vaxlat27Eff = $derived(vaxlat27 ?? vaxlat);
  let forslag27 = $derived(maxVaxlingUnderTak(R27, lonFore, semester));
  // Lön 2027 som krävs för att behålla 2026 års belopp
  let kravdLon27 = $derived(requiredLonForVaxling(R27, vaxlat, semester));
  let res26 = $derived(computeLonevaxling(R26, lonFore, vaxlat, paslag, semester));
  let res27 = $derived(computeLonevaxling(R27, lonFore, vaxlat27Eff, paslag, semester));
  let res27Forslag = $derived(computeLonevaxling(R27, lonFore, forslag27, paslag, semester));

  function useForslag27() {
    vaxlat27 = forslag27;
    save(K.vax27, forslag27);
  }

  const bind = (key: string, set: (v: number) => void) => (e: Event) => {
    const v = parseFloat((e.target as HTMLInputElement).value) || 0;
    set(v);
    save(key, v);
  };

  onMount(async () => {
    await initAuth();
    injectInfoBtn(INFO.lonevaxling.title, INFO.lonevaxling.sections);
  });
</script>

<svelte:head><title>Löneväxling — Verdu Ekonomi</title></svelte:head>

<div class="page">
  <Topnav active="lonevaxling.html" />

  <h1>💱 Löneväxling</h1>
  <p class="subtitle">Vad som gäller 2026 och 2027, och vad löneväxlingen betyder för dig i kronor.</p>

  <h2>Regler</h2>
  <div class="card" style="overflow-x:auto;margin-bottom:24px">
    <table style="width:100%;border-collapse:collapse;font-size:.85rem">
      <thead>
        <tr style="color:var(--muted);text-transform:uppercase;font-size:.68rem;letter-spacing:.06em">
          <th style="text-align:left;padding:6px 8px"></th>
          <th style="text-align:right;padding:6px 8px">2026</th>
          <th style="text-align:right;padding:6px 8px">2027 <span style="color:var(--orange)">(prel.)</span></th>
        </tr>
      </thead>
      <tbody>
        {#each [
          ['Prisbasbelopp', fmt(R26.prisbasbelopp), fmt(R27.prisbasbelopp)],
          ['Inkomstbasbelopp', fmt(R26.inkomstbasbelopp), fmt(R27.inkomstbasbelopp)],
          ['Inkomsttak allmän pension (8,07 × IBB), per månad', fmt(pensionTak(R26) / 12), fmt(pensionTak(R27) / 12)],
          ['Brytpunkt statlig skatt (under 66 år), per månad', fmt(R26.statligGrans / 12), fmt(R27.statligGrans / 12)],
          ['Särskild löneskatt på pensionspremie', pct(R26.sarskildLoneskatt), pct(R27.sarskildLoneskatt) + ' (antagen)'],
          ['Arbetsgivaravgift på lön', pct(R26.arbetsgivaravgift), pct(R27.arbetsgivaravgift) + ' (antagen)'],
          ['Arbetsgivarens påslag för kostnadsneutralitet', pct(breakEvenPaslag(R26)), pct(breakEvenPaslag(R27))],
          ['Avdragstak arbetsgivare (10 prisbasbelopp)', fmt(R26.prisbasbelopp * 10), fmt(R27.prisbasbelopp * 10)],
        ] as row}
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:6px 8px">{row[0]}</td>
            <td style="padding:6px 8px;text-align:right">{row[1]}</td>
            <td style="padding:6px 8px;text-align:right">{row[2]}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p style="font-size:.78rem;color:var(--muted);margin:12px 0 0">
      Grundregeln: löneväxlar du lönar det sig oftast när lönen efter växlingen ligger över inkomsttaket
      ({fmt(pensionTak(R26) / 12)}/mån 2026, ≈ {fmt(pensionTak(R27) / 12)}/mån 2027), eftersom du då inte förlorar allmän pension.
      Arbetsgivarens påslag är en överenskommelse och varierar — det är det som avgör hur bra affären blir.
      2027: prisbasbelopp är fastställt, inkomstbasbelopp bygger på Pensionsmyndighetens preliminära beräkning.
    </p>
  </div>

  <h2>Din kalkyl</h2>
  <div class="card" style="margin-bottom:24px">
    <div style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap">
      <div class="form-row" style="margin:0">
        <label>Bruttolön före löneväxling (kr/mån)</label>
        <input type="number" min="0" step="500" style="width:140px" value={lonFore} oninput={bind(K.lon, v => lonFore = v)}>
      </div>
      <div class="form-row" style="margin:0">
        <label>Löneväxlat belopp (kr/mån)</label>
        <input type="number" min="0" step="100" style="width:140px" value={vaxlat} oninput={bind(K.vax, v => vaxlat = v)}>
      </div>
      <div class="form-row" style="margin:0">
        <label>Löneväxlat belopp 2027 (kr/mån)</label>
        <input type="number" min="0" step="100" style="width:140px" value={vaxlat27Eff} oninput={bind(K.vax27, v => vaxlat27 = v)}>
      </div>
      <div class="form-row" style="margin:0">
        <label>Uttagna semesterdagar (tillägg 0,605 % × månadslön × dagar)</label>
        <input type="number" min="0" max="40" step="1" style="width:90px" value={semester} oninput={bind(K.sem, v => semester = v)}>
      </div>
      <div class="form-row" style="margin:0">
        <label>Arbetsgivarens påslag (%)</label>
        <input type="number" min="0" max="30" step="0.1" style="width:90px" value={paslag} oninput={bind(K.pas, v => paslag = v)}>
      </div>
    </div>
    <p style="font-size:.78rem;color:var(--muted);margin:12px 0 0">
      Förifyllt från <a href="ekonomi.html" style="color:var(--accent)">ekonomi.html</a> (brutto och löneväxling; inbetalningen där inkluderar påslaget, så växlat belopp = inbetalning ÷ 1,058). Kontrollera att bruttolönen är <em>före</em> växling.
      Årslön = månadslön × 12 + semesterdagstillägg. Tillägget är 0,605 % × månadslön × uttagna semesterdagar och räknas på lönen före växling (arbetsgivarens regel). Samma lön används för båda åren (ingen löneökning inräknad); 2027 har eget belopp.
    </p>
  </div>

  <div class="card" style="border-left:4px solid var(--accent);margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div>
        <div class="kpi-label">Förslag 2027 — högsta belopp under inkomsttaket</div>
        <div class="kpi-value">{fmt(forslag27)}<span style="font-size:.9rem"> /mån</span></div>
        <div style="font-size:.75rem;color:var(--muted)">
          Årslön efter växling {fmt(res27Forslag.lonEfterAr)} mot inkomsttak {fmt(pensionTak(R27))}.
          Tjänstepension {fmt(res27Forslag.tjpInsattAr)}/år, minskad nettolön {fmt(res27Forslag.nettoMinskningAr / 12)}/mån.
        </div>
      </div>
      <button class="btn btn-primary" onclick={useForslag27}>Använd för 2027</button>
    </div>
    <p style="font-size:.78rem;color:var(--muted);margin:12px 0 0">
      Beloppet är avrundat nedåt till närmaste 100 kr och räknar på nuvarande lön utan löneökning. Taket för 2027 är preliminärt (inkomstbasbeloppet fastställs senare), så lämna gärna lite marginal.
    </p>
  </div>

  <div class="card" style="border-left:4px solid var(--orange);margin-bottom:16px">
    <div class="kpi-label">Lön som krävs 2027 för att behålla beloppet</div>
    <div class="kpi-value">{fmt(kravdLon27)}<span style="font-size:.9rem"> /mån före växling</span></div>
    <div style="font-size:.75rem;color:var(--muted)">
      För att växla {fmt(vaxlat)}/mån (2026 års belopp) utan att hamna under inkomsttaket.
      {#if kravdLon27 > lonFore}
        Du saknar {fmt(kravdLon27 - lonFore)}/mån jämfört med nuvarande lön ({fmt(lonFore)}), ca {((kravdLon27 / lonFore - 1) * 100).toFixed(1).replace('.', ',')} % löneökning.
      {:else}
        Din nuvarande lön ({fmt(lonFore)}) räcker, med {fmt(lonFore - kravdLon27)}/mån marginal.
      {/if}
    </div>
  </div>

  <div class="card" style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:.85rem">
      <thead>
        <tr style="color:var(--muted);text-transform:uppercase;font-size:.68rem;letter-spacing:.06em">
          <th style="text-align:left;padding:6px 8px"></th>
          <th style="text-align:right;padding:6px 8px">2026</th>
          <th style="text-align:right;padding:6px 8px">2027 <span style="color:var(--orange)">(prel.)</span></th>
        </tr>
      </thead>
      <tbody>
        {#each [
          ['Bruttolön efter växling, per månad', fmt(res26.lonEfterMon), fmt(res27.lonEfterMon)],
          ['Årslön före växling (månadslön × 12 + semesterdagstillägg)', fmt(res26.lonForeAr), fmt(res27.lonForeAr)],
          ['Årslön efter växling', fmt(res26.lonEfterAr), fmt(res27.lonEfterAr)],
          ['Under inkomsttaket efter växling?', res26.underTaket ? 'Ja — förlorar allmän pension' : 'Nej', res27.underTaket ? 'Ja — förlorar allmän pension' : 'Nej'],
          ['Sparad skatt per år', fmt(res26.skattSparadAr), fmt(res27.skattSparadAr)],
          ['Minskad nettolön per år', fmt(res26.nettoMinskningAr), fmt(res27.nettoMinskningAr)],
          ['Minskad nettolön per månad', fmt(res26.nettoMinskningAr / 12), fmt(res27.nettoMinskningAr / 12)],
          ['Inbetalt till tjänstepension per år', fmt(res26.tjpInsattAr), fmt(res27.tjpInsattAr)],
          ['Förlorad allmän pensionsrätt per år (uppskattning)', fmt(res26.forlorGrundPensionAr), fmt(res27.forlorGrundPensionAr)],
          ['Tjänstepension per förlorad nettokrona', res26.nettoPerKrNetto.toFixed(2).replace('.', ','), res27.nettoPerKrNetto.toFixed(2).replace('.', ',')],
          ['Arbetsgivarens kostnad jämfört med utan växling, per år', fmt(res26.arbetsgivareKostnadSkillnadAr), fmt(res27.arbetsgivareKostnadSkillnadAr)],
        ] as row, i}
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:6px 8px">{row[0]}</td>
            <td style="padding:6px 8px;text-align:right;{i === 5 || i === 7 ? 'font-weight:700' : ''}">{row[1]}</td>
            <td style="padding:6px 8px;text-align:right;{i === 5 || i === 7 ? 'font-weight:700' : ''}">{row[2]}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p style="font-size:.78rem;color:var(--muted);margin:12px 0 0">
      Förenklad skatteberäkning (samma modell som skatt.html: kommunalskatt 31 % med grundavdrag plus 20 % statlig skatt över brytpunkten).
      Förlorad allmän pension räknas som 18,5 % × 0,93 av den lön som hamnar under taket. Det är ett riktvärde, inte ett pensionsbesked.
      Under FIRE-åren betalas ingen ny löneväxling in, så kalkylen gäller de år du fortfarande arbetar.
    </p>
  </div>

  <h2 style="margin-top:32px">Källor</h2>
  <div class="card" style="font-size:.82rem">
    <ul style="margin:0;padding-left:18px">
      <li><a href="https://www.fortnox.se/fortnox-foretagsguide/skatter-och-moms/belopp-och-procentsatser" style="color:var(--accent)">Fortnox — belopp och procentsatser 2026</a> (särskild löneskatt, arbetsgivaravgift)</li>
      <li><a href="https://www.handelsbanken.se/sv/privat/ekonomi-och-livet/din-pension/lonevaxling" style="color:var(--accent)">Handelsbanken — löneväxling</a> (lönegräns)</li>
      <li><a href="https://www.ekonomifakta.se/sakomraden/skatt/din-skatt-ar-2026_1246309.html" style="color:var(--accent)">Ekonomifakta — din skatt 2026</a> (skiktgräns och brytpunkt)</li>
      <li><a href="https://via.tt.se/pressmeddelande/4477033/hojt-prisbasbelopp-2027-sa-paverkas-din-planbok?publisherId=3236537&lang=sv" style="color:var(--accent)">TT — höjt prisbasbelopp 2027</a> (prisbasbelopp och brytpunkt 2027)</li>
      <li><a href="https://hurbra.se/lonevaxling-2027/" style="color:var(--accent)">Hurbra — löneväxling 2027</a> (preliminär lönegräns)</li>
    </ul>
    <p style="margin:10px 0 0;color:var(--muted)">
      Siffrorna är hämtade från sekundärkällor i november 2026 och bör kontrolleras mot Skatteverket och Pensionsmyndigheten innan du fattar beslut.
      Avdragsgränsen på 35 % av lönen (pensionsgrundande lön) har jag inte kunnat bekräfta och ingår därför inte i kalkylen.
    </p>
  </div>
</div>
