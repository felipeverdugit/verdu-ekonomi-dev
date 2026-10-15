<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { initAuth } from '../auth';
  import { computeFire, simulateUttag } from '../calculations';
  import { ekStore, fireStore } from '../store';
  import { SLIDER_RANGES } from '../constants';
  import Topnav from '../components/Topnav.svelte';
  import BridgeChart, { type ChartSeries, type ChartMarker } from '../components/BridgeChart.svelte';
  import DonutChart, { type DonutSlice } from '../components/DonutChart.svelte';
  import { injectInfoBtn } from '../nav';
  import { INFO } from '../infoContent';
  import type { FireSettings } from '../types';

  // ── Slider-config ─────────────────────────────────────────────────────────────
  type SliderKey = keyof typeof SLIDER_RANGES;
  const SLIDER_DEFS: { key: SliderKey; label: string }[] = [
    { key: 'avkPct',        label: 'Årsavkastning (ackumulering)' },
    { key: 'fireYearF',     label: 'Felipe: FIRE-år' },
    { key: 'fireYearU',     label: 'Ulrika: FIRE-år' },
    { key: 'uttakAvkPct',   label: 'Uttaksavkastning' },
    { key: 'tjpArF',        label: 'Felipe: TjP uttaksperiod' },
    { key: 'tjpArU',        label: 'Ulrika: TjP uttaksperiod' },
    { key: 'fTjpAge',       label: 'Felipe: Svensk TjP startålder' },
    { key: 'fNorskTjpAge',  label: 'Felipe: Norsk TjP startålder' },
    { key: 'uNorskTjpAge',  label: 'Ulrika: Norsk TjP startålder' },
    { key: 'uTjpAge',       label: 'Ulrika: Svensk TjP startålder' },
    { key: 'fAllmanAge',    label: 'Felipe: Allmänpension startålder' },
    { key: 'uAllmanAge',    label: 'Ulrika: Allmänpension startålder' },
    { key: 'skattPct',      label: 'Skatt på pensionsinkomster' },
  ];

  const SLIDER_UNITS: Partial<Record<SliderKey, string>> = {
    avkPct: ' %', uttakAvkPct: ' %', tjpArF: ' år', tjpArU: ' år',
    fTjpAge: ' år', fNorskTjpAge: ' år', uNorskTjpAge: ' år',
    uTjpAge: ' år', fAllmanAge: ' år', uAllmanAge: ' år', skattPct: ' %',
  };

  // ── State ─────────────────────────────────────────────────────────────────────
  let s = $state<FireSettings>(fireStore.get());

  function sliderVal(key: SliderKey): number {
    return (s as unknown as Record<string, number>)[key] ?? 0;
  }

  function setSlider(key: SliderKey, v: number) {
    (s as unknown as Record<string, number>)[key] = v;
    fireStore.setField(key as keyof FireSettings, v);
  }

  let engBelopp = $state(fireStore.get().engBelopp ?? 0);
  let engAr     = $state(fireStore.get().engAr ?? 0);

  // ── Computed ──────────────────────────────────────────────────────────────────
  let r = $derived(computeFire(ekStore.get(), s));

  const fmt  = (n: number) => Math.round(n).toLocaleString('sv-SE') + ' kr';
  const fmtM = (n: number) => (n / 1e6).toFixed(2) + ' MSEK';

  const today = new Date().getFullYear();

  // ── Kapital-donut ─────────────────────────────────────────────────────────────
  const donutSlices = $derived.by(() => {
    const res = r;
    const slices: DonutSlice[] = [
      { label: 'Fonder',          value: res.fonder_fv, color: '#5db3dd' },
      { label: 'Sparkonto',       value: res.sparkonto_fv, color: '#6bbd85' },
      { label: 'TjP Sverige',     value: res.tjp_fv,    color: '#d7ab57' },
      { label: 'TjP Norge',       value: res.norge_fv,  color: '#e2726c' },
      { label: 'Premiepension',   value: res.pp_fv,     color: '#e08a4f' },
      { label: 'Inkomstpension',  value: res.ap_fv,     color: '#3f9e3f' },
    ];
    if (res.aktierIFire && res.aktierVal > 0) slices.push({ label: 'Aktier', value: res.aktierVal, color: '#b8650f' });
    return slices;
  });

  // ── Bryggan — uttakssimulator ───────────────────────────────────────────────────
  // Om ni slutar jobba olika år: starta diagrammet redan när den första slutar,
  // med den kvarvarande partnerns lön som extra "pensionsström" fram till Brygga-start.
  const bridge = $derived.by(() => {
    const res = r;
    const ek = ekStore.get();
    const startYear    = res.earlyRetiree ? res.earlyRetiree.year : res.fireYear;
    const startKapital = res.earlyRetiree ? res.earlyKapital! : res.kapital;
    const simPensions  = res.earlyRetiree
      ? [...res.pensions, {
          id: 99, label: 'Lön (kvarvarande arbete)',
          who: res.earlyRetiree.who === 'f' ? 'u' as const : 'f' as const,
          fromYear: res.earlyRetiree.year, toYear: res.fireYear - 1,
          monthly: res.earlyRetiree.workingSalaryNet, livsvarig: false,
        }]
      : res.pensions;

    const sim = simulateUttag(startKapital, res.uttakAvkPct, startYear, ek.levnadskostnad, simPensions, ek.levnadskostnad2, ek.exp_switch_ar, engBelopp, engAr);
    const switchYear2 = ek.exp_switch_ar > 0 && ek.levnadskostnad2 > 0 ? res.fireYear + ek.exp_switch_ar : 9999;
    const laonMon = (year: number) => res.earlyRetiree && year < res.fireYear ? res.earlyRetiree.workingSalaryNet : 0;

    const years: number[] = sim.rows.map(row => row.year);
    const series: ChartSeries[] = [
      { key: 'kapital', label: 'Kapital (MSEK)', color: '#5db3dd', axis: 'left', area: true,
        data: sim.rows.map(row => row.capital / 1e6) },
      { key: 'pension', label: 'Pension/mån (kr)', color: '#6bbd85', axis: 'right',
        data: sim.rows.map(row => row.pensionMon - laonMon(row.year)) },
      ...(res.earlyRetiree ? [{ key: 'lon', label: 'Lön/mån (kvarvarande)', color: '#d7ab57', axis: 'right' as const, dashed: true,
        data: sim.rows.map(row => laonMon(row.year)) }] : []),
      { key: 'levnad', label: 'Levnadskostnad/mån (kr)', color: '#c98500', axis: 'right', dashed: true,
        data: sim.rows.map(row => row.year >= switchYear2 ? ek.levnadskostnad2 : ek.levnadskostnad) },
    ];
    const markers: ChartMarker[] = res.earlyRetiree
      ? [{ year: res.fireYear, label: 'Brygga-start', color: '#c98500' }]
      : [];
    return { years, series, markers };
  });

  // ── Timeline: vem slutar när ────────────────────────────────────────────────────
  const timeline = $derived.by(() => {
    const felipeYear = s.fireYearF, ulrikaYear = s.fireYearU;
    const bryggaYear = Math.max(felipeYear, ulrikaYear);
    const minYear    = Math.min(felipeYear, ulrikaYear);
    const span       = bryggaYear - minYear;
    const pos = (yr: number) => span === 0 ? 50 : (yr - minYear) / span * 100;
    const points = [
      { who: 'Felipe', year: felipeYear, color: 'var(--accent1)' },
      { who: 'Ulrika', year: ulrikaYear, color: 'var(--accent2)' },
    ].sort((a, b) => a.year - b.year);

    let salaryNet = 0, gapMon = 0, fullyCovers = false;
    if (r.earlyRetiree) {
      salaryNet = r.earlyRetiree.workingSalaryNet;
      const ph  = r.phases[0];
      gapMon    = ekStore.get().levnadskostnad - (ph.incomeF + ph.incomeU);
      fullyCovers = gapMon <= 0;
    }
    return { points, pos, minYear, bryggaYear, span, salaryNet, gapMon, fullyCovers };
  });

  // ── Fas-badge ─────────────────────────────────────────────────────────────────
  function badge(label: string, who: string): string {
    const isU    = who === 'u';
    const isFire = label.includes('FIRE');
    const color  = isFire ? '#d7ab57' : isU ? '#e08a4f' : '#6bbd85';
    const short  = label.replace(/^(Felipe|Ulrika) \d+:\s*/, '').replace(' (redan aktiv)', '');
    return `<span class="badge" style="background:${color}18;color:${color};border:1px solid ${color}40">${isU ? 'U: ' : isFire ? '' : 'F: '}${short}</span>`;
  }

  const FASE_COLORS = ['#5db3dd','#6bbd85','#d7ab57','#e2726c','#e08a4f','#3f9e3f','#8fc8e8'];

  function onStorage(e: StorageEvent) {
    if (e.key?.startsWith('vek_ek_') || e.key?.startsWith('vek_fire_')) s = fireStore.get();
  }

  onMount(async () => {
    injectInfoBtn(INFO.fire.title, INFO.fire.sections);
    window.addEventListener('storage', onStorage);
    await initAuth();
  });

  onDestroy(() => {
    window.removeEventListener('storage', onStorage);
  });
</script>

<svelte:head><title>Brygga-simulator — Verdu Ekonomi</title></svelte:head>

<div class="page">
  <Topnav active="fire.html" onPull={() => { s = fireStore.get(); }} />

  <div class="masthead">
    <div class="eyebrow">Verdu Ekonomi</div>
    <h1 class="headline">Bryggan mellan sista lönen och första pensionen</h1>
    <p class="subtitle">
      Felipe och Ulrika slutar jobba olika år. <strong>Brygga-startår</strong> är
      året ingen av er längre har lön — kapitalet bär resten av vägen tills
      pensionerna täcker levnadskostnaden ({fmt(ekStore.get().levnadskostnad)}/mån).
      Genererad {new Date().toLocaleDateString('sv-SE')}.
    </p>
  </div>

  <!-- Hero -->
  <section class="hero-verdict">
    <div class="hero-figure">
      <div class="label">Brygga-startår</div>
      <div class="value mono">{r.fireYear}</div>
      <div class="sub">om {r.fireYear - today} år</div>
    </div>
    <div class="kpi-rail">
      <div class="kpi">
        <div class="k-label">Brygga-kapital</div>
        <div class="k-value">{fmtM(r.bryggaKapital)}</div>
      </div>
      <div class="kpi">
        <div class="k-label">Brygga-täckning</div>
        <div class="k-value" style:color={r.bryggaTackning >= 100 ? 'var(--green)' : r.bryggaTackning >= 75 ? 'var(--orange)' : 'var(--red)'}>{r.bryggaTackning.toFixed(1)} %</div>
      </div>
      <div class="kpi">
        <div class="k-label">Total förmögenhet</div>
        <div class="k-value">{fmtM(r.totaltFV)}</div>
      </div>
      <div class="kpi">
        <div class="k-label">Fritt kapital vid start</div>
        <div class="k-value">{fmtM(r.kapital)}</div>
      </div>
      <div class="kpi">
        <div class="k-label">ISK-skatt/år (Lysa)</div>
        <div class="k-value" style="color:var(--orange)">{fmt(Math.round(r.iskKapital * r.iskPct / 100))}</div>
      </div>
    </div>
  </section>

  {#if timeline.span > 0}
    <h2>Vem slutar när</h2>
    <div class="card timeline-card">
      <div class="timeline-track">
        <div class="timeline-pin" style="left:{timeline.pos(timeline.points[0].year)}%;background:{timeline.points[0].color}"></div>
        <div class="timeline-label" style="left:{timeline.pos(timeline.points[0].year)}%">
          <div class="who" style="color:{timeline.points[0].color}">{timeline.points[0].who} slutar{timeline.points[0].year === timeline.bryggaYear ? ' · Brygga-start' : ''}</div>
          <div class="yr">{timeline.points[0].year}</div>
        </div>
        <div class="timeline-pin" style="left:{timeline.pos(timeline.points[1].year)}%;background:{timeline.points[1].year === timeline.bryggaYear ? 'var(--orange)' : timeline.points[1].color}"></div>
        <div class="timeline-label" style="left:{timeline.pos(timeline.points[1].year)}%">
          <div class="who" style="color:{timeline.points[1].year === timeline.bryggaYear ? 'var(--orange)' : timeline.points[1].color}">{timeline.points[1].who} slutar{timeline.points[1].year === timeline.bryggaYear ? ' · Brygga-start' : ''}</div>
          <div class="yr">{timeline.points[1].year}</div>
        </div>
      </div>
      <div class="timeline-foot"><span>idag · {today}</span><span>+ {timeline.bryggaYear - today} år</span></div>
      <p class="timeline-note">
        {timeline.points[0].who} slutar <strong>{timeline.bryggaYear - timeline.points[0].year} år före</strong> {timeline.points[1].who}.
        {timeline.points[1].who}s lön ({fmt(timeline.salaryNet)}/mån) räknas som inkomst de åren,
        {#if timeline.fullyCovers}
          och täcker <strong>hela</strong> gapet mot levnadskostnaden — inget bryggkapital förbrukas förrän ni båda slutat jobba.
        {:else}
          men täcker inte hela gapet mot levnadskostnaden — det blir ett underskott på <strong>-{fmt(timeline.gapMon)}/mån</strong>
          som ändå tär på bryggkapitalet, fast betydligt mindre än om ingen av er hade lön.
        {/if}
        Brygga-start är alltid samma år som den av er som slutar <strong>sist</strong> — här {timeline.points[1].who}, {timeline.bryggaYear}.
      </p>
    </div>
  {/if}

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start">

    <!-- Sliders -->
    <section>
      <h2>Avkastning &amp; horisont</h2>
      <div class="ctrl-panel" style="grid-template-columns:1fr">
        {#each SLIDER_DEFS.slice(0, 4) as def}
          {@const range = SLIDER_RANGES[def.key]}
          <div class="ctrl-group">
            <label>{def.label}</label>
            <span class="ctrl-val">{sliderVal(def.key)}{SLIDER_UNITS[def.key] ?? ''}</span>
            <input type="range" min={range.min} max={range.max} step={range.step} value={sliderVal(def.key)}
                   oninput={e => setSlider(def.key, parseFloat((e.target as HTMLInputElement).value))} />
          </div>
        {/each}
      </div>

      <h2>Pension</h2>
      <div class="ctrl-panel" style="grid-template-columns:1fr">
        {#each SLIDER_DEFS.slice(4) as def}
          {@const range = SLIDER_RANGES[def.key]}
          <div class="ctrl-group">
            <label>{def.label}</label>
            <span class="ctrl-val">{sliderVal(def.key)}{SLIDER_UNITS[def.key] ?? ''}</span>
            <input type="range" min={range.min} max={range.max} step={range.step} value={sliderVal(def.key)}
                   oninput={e => setSlider(def.key, parseFloat((e.target as HTMLInputElement).value))} />
          </div>
        {/each}
      </div>

      <h2>Engångsuttag</h2>
      <div class="card">
        <div class="form-row">
          <label>Belopp (kr)</label>
          <input type="number" style="width:140px" value={engBelopp} step="10000"
                 oninput={e => { engBelopp = parseFloat((e.target as HTMLInputElement).value) || 0; fireStore.setField('engBelopp', engBelopp); }} />
        </div>
        <div class="form-row">
          <label>Kalenderår</label>
          <input type="number" style="width:140px" value={engAr} step="1" min="2025"
                 oninput={e => { engAr = parseFloat((e.target as HTMLInputElement).value) || 0; fireStore.setField('engAr', engAr); }} />
        </div>
      </div>
    </section>

    <!-- Fasdiagram + pensionstabell -->
    <section>
      <h2>Pensionsinkomster per fas</h2>
      <div class="card" style="overflow-x:auto">
        <table class="fase-table">
          <thead><tr>
            <th>#</th><th>År</th><th>Ålder</th><th>Händelse</th>
            <th class="num text-felipe">F/mån</th>
            <th class="num text-ulrika">U/mån</th>
            <th class="num">Tot/mån</th>
            <th class="num">Gap</th>
          </tr></thead>
          <tbody>
            {#each r.phases as ph, i}
              {@const tot  = ph.incomeF + ph.incomeU}
              {@const gap  = ekStore.get().levnadskostnad - tot}
              {@const col  = FASE_COLORS[i] ?? '#a89b89'}
              <tr>
                <td><span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:{col}22;color:{col};font-size:.72rem;font-weight:700">{ph.nr}</span></td>
                <td class="text-muted">{ph.year}</td>
                <td style="white-space:nowrap;font-size:.82rem"><span class="text-felipe">F:{ph.ageF}</span>&ensp;<span class="text-ulrika">U:{ph.ageU}</span></td>
                <td>
                  {#each ph.labels as lbl}
                    {@const ev = r.events.find(e => e.label === lbl.replace(' (redan aktiv)', ''))}
                    {@html badge(lbl, ev?.who ?? 'f')}
                  {/each}
                </td>
                <td class="num text-felipe fw-bold">{fmt(ph.incomeF)}</td>
                <td class="num text-ulrika fw-bold">{fmt(ph.incomeU)}</td>
                <td class="num fw-bold">{fmt(tot)}</td>
                <td class="num">
                  {#if gap > 0}
                    <span class="text-red fw-bold">-{fmt(Math.round(gap))}</span>
                  {:else}
                    <span class="text-green fw-bold">+{fmt(Math.round(-gap))}</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Kapital-donut -->
      <h2 style="margin-top:24px">Kapital vid FIRE-start</h2>
      <div class="card">
        <DonutChart slices={donutSlices} centerValue={fmtM(r.totaltFV)} fmt={fmtM} />
      </div>
    </section>
  </div>

  <!-- Uttakssimulator -->
  <h2>Uttakssimulator</h2>
  <div class="card">
    <BridgeChart labels={bridge.years} series={bridge.series} markers={bridge.markers}
                 leftFormat={v => v.toFixed(1) + ' M'} rightFormat={v => Math.round(v / 1000) + 'k'} />
  </div>

  <footer>Brygga-simulator · Verdu Ekonomi</footer>
</div>
