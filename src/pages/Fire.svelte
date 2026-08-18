<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    Chart, ArcElement, DoughnutController, LineController, LineElement,
    PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler,
  } from 'chart.js';
  import { initAuth } from '../auth';
  import { computeFire, simulateUttag } from '../calculations';
  import { ekStore, fireStore } from '../store';
  import { SLIDER_RANGES, CHART_DARK_GRID, CHART_DARK_TEXT } from '../constants';
  import { renderTopnav, injectInfoBtn } from '../nav';
  import { INFO } from '../infoContent';
  import { initSyncWidget } from '../syncWidget';
  import type { FireResult, FireSettings } from '../types';

  Chart.register(ArcElement, DoughnutController, LineController, LineElement,
    PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

  // ── Slider-config ─────────────────────────────────────────────────────────────
  type SliderKey = keyof typeof SLIDER_RANGES;
  const SLIDER_DEFS: { key: SliderKey; label: string }[] = [
    { key: 'avkPct',        label: 'Årsavkastning (ackumulering)' },
    { key: 'antalAr',       label: 'År till FIRE' },
    { key: 'uttakAvkPct',   label: 'Uttaksavkastning' },
    { key: 'tjpAr',         label: 'TjP uttaksperiod' },
    { key: 'fTjpAge',       label: 'Felipe: Svensk TjP startålder' },
    { key: 'fNorskTjpAge',  label: 'Felipe: Norsk TjP startålder' },
    { key: 'uNorskTjpAge',  label: 'Ulrika: Norsk TjP startålder' },
    { key: 'uTjpAge',       label: 'Ulrika: Svensk TjP startålder' },
    { key: 'fAllmanAge',    label: 'Felipe: Allmänpension startålder' },
    { key: 'uAllmanAge',    label: 'Ulrika: Allmänpension startålder' },
    { key: 'skattPct',      label: 'Skatt på pensionsinkomster' },
  ];

  const SLIDER_UNITS: Partial<Record<SliderKey, string>> = {
    avkPct: ' %', antalAr: ' år', uttakAvkPct: ' %', tjpAr: ' år',
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

  // ── Charts ────────────────────────────────────────────────────────────────────
  let pieCanvas:    HTMLCanvasElement;
  let uttaksCanvas: HTMLCanvasElement;
  let pieChart:     Chart | null = null;
  let uttaksChart:  Chart | null = null;

  const PIE_LABELS = ['Fonder', 'Sparkonto', 'TjP Sverige', 'TjP Norge', 'Premiepension', 'Inkomstpension'];
  const PIE_COLORS = ['#4f8ef7','#6ee7b7','#f59e0b','#f87171','#a78bfa','#34d399'];

  function buildPieChart(res: FireResult) {
    if (!pieCanvas) return;
    if (pieChart) pieChart.destroy();
    const labels = [...PIE_LABELS];
    const data   = [res.fonder_fv, res.sparkonto_fv, res.tjp_fv, res.norge_fv, res.pp_fv, res.ap_fv];
    const colors = [...PIE_COLORS];
    if (res.aktierIFire && res.aktierVal > 0) { labels.push('Aktier'); data.push(res.aktierVal); colors.push('#f97316'); }
    pieChart = new Chart(pieCanvas.getContext('2d')!, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#1a1d27' }] },
      options: {
        plugins: {
          legend: { position: 'bottom', labels: { color: CHART_DARK_TEXT, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => ` ${fmtM(c.raw as number)}` } },
        },
      },
    });
  }

  function buildUttaksChart(res: FireResult) {
    if (!uttaksCanvas) return;
    if (uttaksChart) uttaksChart.destroy();
    const ek = ekStore.get();
    const sim = simulateUttag(res.kapital, res.uttakAvkPct, res.fireYear, ek.levnadskostnad, res.pensions, ek.levnadskostnad2, ek.exp_switch_ar);
    const switchYear2 = ek.exp_switch_ar > 0 && ek.levnadskostnad2 > 0 ? res.fireYear + ek.exp_switch_ar : 9999;
    const levnadLinje = sim.rows.map(row => row.year >= switchYear2 ? ek.levnadskostnad2 : ek.levnadskostnad);

    uttaksChart = new Chart(uttaksCanvas.getContext('2d')!, {
      type: 'line',
      data: {
        labels: sim.rows.map(row => String(row.year)),
        datasets: [
          { label: 'Kapital (MSEK)', data: sim.rows.map(row => row.capital / 1e6), borderColor: '#4f8ef7', backgroundColor: '#4f8ef720', fill: true, tension: 0.3, pointRadius: 0, yAxisID: 'y' },
          { label: 'Pension/mån (kr)', data: sim.rows.map(row => row.pensionMon), borderColor: '#6ee7b7', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, yAxisID: 'y1' },
          { label: 'Levnadskostnad/mån (kr)', data: levnadLinje, borderColor: '#fb923c', backgroundColor: 'transparent', borderDash: [5, 3], tension: 0, pointRadius: 0, yAxisID: 'y1' },
        ],
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x:  { grid: { color: CHART_DARK_GRID }, ticks: { color: CHART_DARK_TEXT, maxTicksLimit: 10 } },
          y:  { grid: { color: CHART_DARK_GRID }, ticks: { color: CHART_DARK_TEXT, callback: v => `${v} M` }, position: 'left' },
          y1: { grid: { drawOnChartArea: false }, ticks: { color: '#6ee7b7', callback: v => `${Math.round(Number(v) / 1000)}k` }, position: 'right' },
        },
        plugins: { legend: { labels: { color: CHART_DARK_TEXT } } },
      },
    });
  }

  $effect(() => {
    void r;
    buildPieChart(r);
    buildUttaksChart(r);
  });

  // ── Fas-badge ─────────────────────────────────────────────────────────────────
  function badge(label: string, who: string): string {
    const isU    = who === 'u';
    const isFire = label.includes('FIRE');
    const color  = isFire ? '#f59e0b' : isU ? '#a78bfa' : '#6ee7b7';
    const short  = label.replace(/^(Felipe|Ulrika) \d+:\s*/, '').replace(' (redan aktiv)', '');
    return `<span class="badge" style="background:${color}18;color:${color};border:1px solid ${color}40">${isU ? 'U: ' : isFire ? '' : 'F: '}${short}</span>`;
  }

  const FASE_COLORS = ['#4f8ef7','#6ee7b7','#f59e0b','#f87171','#a78bfa','#34d399','#60a5fa'];

  function onStorage(e: StorageEvent) {
    if (e.key?.startsWith('vek_ek_') || e.key?.startsWith('vek_fire_')) s = fireStore.get();
  }

  onMount(async () => {
    await initAuth();
    renderTopnav('fire.html');
    injectInfoBtn(INFO.fire.title, INFO.fire.sections);
    initSyncWidget(() => { s = fireStore.get(); });
    window.addEventListener('storage', onStorage);
  });

  onDestroy(() => {
    pieChart?.destroy();
    uttaksChart?.destroy();
    window.removeEventListener('storage', onStorage);
  });
</script>

<svelte:head><title>Brygga-simulator — Verdu Ekonomi</title></svelte:head>

<div class="page">
  <nav class="topnav" id="topnav"></nav>
  <h1>🌉 Brygga-simulator</h1>
  <p class="subtitle">Genererad {new Date().toLocaleDateString('sv-SE')} · Levnadskostnad {fmt(ekStore.get().levnadskostnad)}/mån</p>

  <!-- KPI -->
  <div class="kpi-bar">
    <div class="kpi"><div class="kpi-label">Brygga-startår</div><div class="kpi-value orange">{r.fireYear} (om {r.fireYear - today} år)</div></div>
    <div class="kpi">
      <div class="kpi-label">Brygga-kapital</div>
      <div class="kpi-value">{fmtM(r.bryggaKapital)}</div>
      <div class="kpi-sub" style="font-size:.7rem;color:var(--muted)">PV av gap tills pension täcker allt</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Brygga-täckning</div>
      <div class="kpi-value" style:color={r.bryggaTackning >= 100 ? 'var(--green)' : r.bryggaTackning >= 75 ? 'var(--orange)' : 'var(--red)'}>{r.bryggaTackning.toFixed(1)} %</div>
      <div class="kpi-sub" style="font-size:.7rem;color:var(--muted)">Fritt kapital / brygga-kapital</div>
    </div>
    <div class="kpi"><div class="kpi-label">Fritt kapital vid start</div><div class="kpi-value">{fmtM(r.kapital)}</div></div>
    <div class="kpi"><div class="kpi-label">Total förmögenhet vid start</div><div class="kpi-value purple">{fmtM(r.totaltFV)}</div></div>
    <div class="kpi"><div class="kpi-label">ISK-skatt/år (Lysa)</div><div class="kpi-value orange">{fmt(Math.round(r.iskKapital * r.iskPct / 100))}</div><div class="kpi-sub" style="font-size:.7rem;color:var(--muted)">schablonbeskattning ISK-konton</div></div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start">

    <!-- Sliders -->
    <section>
      <h2>Avkastning &amp; horisont</h2>
      <div class="ctrl-panel" style="grid-template-columns:1fr">
        {#each SLIDER_DEFS.slice(0, 3) as def}
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
        {#each SLIDER_DEFS.slice(3) as def}
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
          <label>År efter FIRE-start</label>
          <input type="number" style="width:140px" value={engAr} step="1" min="0"
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
              {@const col  = FASE_COLORS[i] ?? '#8892a4'}
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

      <!-- Kapital-doughnut -->
      <h2 style="margin-top:24px">Kapital vid FIRE-start</h2>
      <div class="card">
        <canvas bind:this={pieCanvas} height="240"></canvas>
      </div>
    </section>
  </div>

  <!-- Uttakssimulator -->
  <h2>Uttakssimulator</h2>
  <div class="card" style="height:320px">
    <canvas bind:this={uttaksCanvas} style="height:100%"></canvas>
  </div>

  <footer>Brygga-simulator · Verdu Ekonomi</footer>
</div>
