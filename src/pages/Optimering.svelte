<script lang="ts">
  import Topnav from '../components/Topnav.svelte';
  import { onMount } from 'svelte';
  import { initAuth } from '../auth';
  import { optimizePensionPeriods, type OptimizerResult } from '../calculations';
  import { ekStore, fireStore } from '../store';
  import { injectInfoBtn } from '../nav';
  import { INFO } from '../infoContent';
  import type { FireSettings } from '../types';

  // ── Formatering ───────────────────────────────────────────────────────────────
  const fmt = (n: number) => (Math.round(n) || 0).toLocaleString('sv-SE') + ' kr';

  // ── State ─────────────────────────────────────────────────────────────────────
  let minAr    = $state(5);
  let maxAr    = $state(15);
  let result   = $state<OptimizerResult | null>(null);
  let loading  = $state(false);
  let applied  = $state('');

  function runOptimize() {
    loading = true;
    // Kort timeout så "Beräknar…" hinner renderas innan den synkrona sökningen kör
    setTimeout(() => {
      const lo = Math.min(minAr, maxAr);
      const hi = Math.max(minAr, maxAr);
      result  = optimizePensionPeriods(ekStore.get(), fireStore.get(), lo, hi);
      loading = false;
    }, 10);
  }

  function applySuggestions() {
    if (!result) return;
    result.suggestions.forEach(s => {
      fireStore.setField(s.key as keyof FireSettings, s.optimalAr);
    });
    applied = `✓ Tillämpat ${new Date().toLocaleTimeString('sv-SE')}`;
    setTimeout(() => { applied = ''; }, 3000);
    runOptimize(); // räkna om så "Nuvarande" matchar det nya värdet
  }

  onMount(async () => {
    await initAuth();
    injectInfoBtn(INFO.optimering.title, INFO.optimering.sections);
    runOptimize();
  });
</script>

<svelte:head><title>Optimering — Verdu Ekonomi</title></svelte:head>

<div class="page">
  <Topnav active="optimering.html" />

  <h1>🧮 Optimering</h1>
  <p class="subtitle">Testar alla kombinationer av uttaksperioder för Felipes 5 justerbara tjänstepensionskonton och föreslår den med lägst total inkomstskatt.</p>

  <div class="card" style="margin-bottom:24px">
    <div style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap">
      <div class="form-row" style="margin:0">
        <label>Min period (år)</label>
        <input type="number" min="1" max="30" step="1" style="width:90px" value={minAr}
               oninput={e => minAr = parseInt((e.target as HTMLInputElement).value) || 5}>
      </div>
      <div class="form-row" style="margin:0">
        <label>Max period (år)</label>
        <input type="number" min="1" max="30" step="1" style="width:90px" value={maxAr}
               oninput={e => maxAr = parseInt((e.target as HTMLInputElement).value) || 15}>
      </div>
      <button class="btn btn-primary" onclick={runOptimize} disabled={loading}>
        {loading ? 'Beräknar…' : '🔍 Optimera'}
      </button>
      {#if result}
        <button class="btn btn-secondary" onclick={applySuggestions}>✓ Använd förslag</button>
      {/if}
      {#if applied}
        <span style="color:var(--green);font-size:.85rem">{applied}</span>
      {/if}
    </div>
    <p style="font-size:.78rem;color:var(--muted);margin:12px 0 0">
      Sökningen begränsas till det här spannet — vilket konto som hamnar nära min eller max avgörs av algoritmen, inte hårdkodat per kontostorlek.
    </p>
  </div>

  {#if result}
    {@const missingCap = result.suggestions.filter(s => s.cap === 0)}
    {#if missingCap.length > 0}
      <div class="card" style="border-left:4px solid var(--orange);margin-bottom:16px">
        <p style="margin:0;font-size:.85rem">
          ⚠ Inget startkapital registrerat för: <strong>{missingCap.map(s => s.label).join(', ')}</strong>.
          Fyll i beloppen på <a href="ekonomi.html" style="color:var(--accent)">ekonomi.html</a> för att få ett meningsfullt förslag för de kontona.
        </p>
      </div>
    {/if}

    <div class="kpi-bar">
      <div class="kpi">
        <div class="kpi-label">Skatt — nuvarande reglage</div>
        <div class="kpi-value red">{fmt(result.totalTaxCurrent)}</div>
        <div style="font-size:.7rem;color:var(--muted)">summerad över jämförelseperioden</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Skatt — optimerad</div>
        <div class="kpi-value">{fmt(result.totalTaxOptimal)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Besparing (skatt)</div>
        <div class="kpi-value" style:color={result.savingKr >= 0 ? 'var(--green)' : 'var(--red)'}>
          {(result.savingKr >= 0 ? '+' : '') + fmt(result.savingKr)}
        </div>
        {#if result.savingKr < 0}
          <div style="font-size:.7rem;color:var(--muted)">Dina nuvarande perioder ligger utanför Max-gränsen ovan — därför syns en teoretisk merkostnad</div>
        {/if}
      </div>
      <div class="kpi">
        <div class="kpi-label">Nettoinkomst — nuvarande</div>
        <div class="kpi-value">{fmt(result.totalNetCurrent)}</div>
        <div style="font-size:.7rem;color:var(--muted)">brutto minus skatt, vad som landar i fickan</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Nettoinkomst — optimerad</div>
        <div class="kpi-value" style:color={result.totalNetOptimal >= result.totalNetCurrent ? 'var(--green)' : 'var(--red)'}>
          {fmt(result.totalNetOptimal)}
        </div>
      </div>
    </div>

    <div class="card" style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:.85rem">
        <thead>
          <tr style="color:var(--muted);text-transform:uppercase;font-size:.68rem;letter-spacing:.06em">
            <th style="text-align:left;padding:6px 8px">Konto</th>
            <th style="text-align:right;padding:6px 8px">Kapital vid start</th>
            <th style="text-align:right;padding:6px 8px">Nuvarande period</th>
            <th style="text-align:right;padding:6px 8px;color:var(--accent)">Föreslagen period</th>
            <th style="text-align:right;padding:6px 8px">Diff</th>
            <th style="text-align:right;padding:6px 8px">Nettobelopp/mån idag</th>
            <th style="text-align:right;padding:6px 8px;color:var(--accent)">Nettobelopp/mån föreslaget</th>
          </tr>
        </thead>
        <tbody>
          {#each result.suggestions as s}
            {@const diff = s.optimalAr - s.currentAr}
            <tr style="border-top:1px solid #342c23">
              <td style="padding:7px 8px">{s.label}</td>
              <td style="text-align:right;padding:7px 8px">{fmt(s.cap)}</td>
              <td style="text-align:right;padding:7px 8px;color:var(--muted)">{s.currentAr} år</td>
              <td style="text-align:right;padding:7px 8px;color:var(--accent);font-weight:600">{s.optimalAr} år</td>
              <td style="text-align:right;padding:7px 8px">
                {#if diff === 0}
                  <span style="color:var(--muted)">—</span>
                {:else}
                  <span style:color={diff > 0 ? 'var(--orange)' : 'var(--green)'}>{diff > 0 ? '+' : ''}{diff} år</span>
                {/if}
              </td>
              <td style="text-align:right;padding:7px 8px;color:var(--muted)">{fmt(s.monthlyCurrent)}/mån</td>
              <td style="text-align:right;padding:7px 8px;color:var(--accent);font-weight:600">{fmt(s.monthlyOptimal)}/mån</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <p style="font-size:.78rem;color:var(--muted);margin-top:16px">
      Omfattar bara Felipes 5 fritt justerbara konton (Svensk TjP, Löneväxling, och de 3 Tidigare-kontona). Ulrikas Svenska TjP och ITP 2 (Alecta) styrs fortfarande manuellt via fire.html/ekonomi.html.
    </p>
  {/if}
</div>
