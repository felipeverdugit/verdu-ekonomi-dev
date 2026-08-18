<script lang="ts">
  import { onMount } from 'svelte';
  import { initAuth } from '../auth';
  import { ekStore, fireStore } from '../store';
  import { SHEETS_URL, SHEETS_MAP, EXCEL_PMTS, ALLMAN_DEFAULTS } from '../constants';
  import { renderTopnav, injectInfoBtn } from '../nav';
  import { INFO } from '../infoContent';
  import type { EkonomiData, FireSettings } from '../types';

  // ── State ─────────────────────────────────────────────────────────────────────
  let ek   = $state<EkonomiData>(ekStore.get());
  let fire = $state<FireSettings>(fireStore.get());
  let saveStatus  = $state('');
  let syncStatus  = $state('');
  let syncLoading = $state(false);

  let saveTimer: ReturnType<typeof setTimeout>;

  function showSaved() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveStatus = `✓ Sparat ${new Date().toLocaleTimeString('sv-SE')}`;
    }, 400);
  }

  // ── Ek-fält ───────────────────────────────────────────────────────────────────
  function handleEk(field: keyof EkonomiData, val: string) {
    const v = parseFloat(val) || 0;
    (ek as Record<string, number>)[field] = v;
    ekStore.setField(field, v);
    showSaved();
  }

  // ── Fire-fält ─────────────────────────────────────────────────────────────────
  function handleFire(field: keyof FireSettings, val: string) {
    const v = parseFloat(val) || 0;
    (fire as Record<string, number | boolean>)[field] = v;
    fireStore.setField(field, v as never);
    showSaved();
  }

  function handleAktierCheck(checked: boolean) {
    fire.aktierIFire = checked;
    fireStore.setField('aktierIFire', checked);
    showSaved();
  }

  // ── Google Sheets sync ────────────────────────────────────────────────────────
  async function syncFromSheets() {
    syncLoading = true;
    syncStatus = 'Hämtar…';
    try {
      const res  = await fetch(SHEETS_URL + '?action=read');
      const data = await res.json() as Record<string, string>;

      const vals: Partial<EkonomiData> = {};
      Object.entries(data).forEach(([key, value]) => {
        const field = SHEETS_MAP[key];
        if (field) (vals as Record<string, number>)[field] = parseFloat(value) || 0;
      });
      Object.assign(vals, EXCEL_PMTS);
      if (!vals.allman_se_f) vals.allman_se_f = ALLMAN_DEFAULTS.felipeSE;
      if (!vals.allman_se_u) vals.allman_se_u = ALLMAN_DEFAULTS.ulrikaSE;
      if (!vals.norsk_f)     vals.norsk_f     = ALLMAN_DEFAULTS.felipeNO;
      if (!vals.norsk_u)     vals.norsk_u     = ALLMAN_DEFAULTS.ulrikaUSE;

      (Object.entries(vals) as [keyof EkonomiData, number][]).forEach(([f, v]) => {
        ekStore.setField(f, v);
        (ek as Record<string, number>)[f] = v;
      });

      const now = new Date().toLocaleTimeString('sv-SE');
      syncStatus = `✓ Synkad ${now}`;
      saveStatus = `✓ Sparat ${now}`;
    } catch (err) {
      syncStatus = `⚠ Misslyckades: ${String(err)}`;
    } finally {
      syncLoading = false;
    }
  }

  onMount(async () => {
    await initAuth();
    renderTopnav('ekonomi.html');
    injectInfoBtn(INFO.ekonomi.title, INFO.ekonomi.sections);

    // Auto-sync om data saknas
    if (ek.lysa_f_pv === 0 && ek.tjp_f_pv === 0 && ek.norge_f_pv === 0) {
      syncFromSheets();
    }
  });

  // ── Hjälp för nollvärden (visa blankt istf "0") ───────────────────────────────
  const v = (n: number) => n !== 0 ? n : '';
</script>

<svelte:head><title>Ekonomi — Verdu Ekonomi</title></svelte:head>

<div class="page">
  <nav class="topnav" id="topnav"></nav>

  <h1>💰 Ekonomi</h1>
  <p class="subtitle">Mata in alla portföljvärden och inkomster. Sparas automatiskt i webbläsaren.</p>

  <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;flex-wrap:wrap">
    <button onclick={syncFromSheets} disabled={syncLoading}
            style="background:var(--accent1);color:#fff;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:.9rem;font-weight:600">
      ☁️ Synka från Google Sheets
    </button>
    <span style="font-size:.82rem;color:var(--muted)">{syncStatus}</span>
  </div>

  <!-- Privata fonder -->
  <h2>Privata fonder</h2>
  <div class="card"><div class="form-grid">
    <div>
      <div class="form-row"><label>Lysa Felipe — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.lysa_f_pv)} oninput={e => handleEk('lysa_f_pv', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Lysa Felipe — månadsinsättning (kr)</label><input type="number" step="500" value={v(ek.lysa_f_pmt)} oninput={e => handleEk('lysa_f_pmt', (e.target as HTMLInputElement).value)}></div>
    </div>
    <div>
      <div class="form-row"><label>Lysa Ulrika — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.lysa_u_pv)} oninput={e => handleEk('lysa_u_pv', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Lysa Ulrika — månadsinsättning (kr)</label><input type="number" step="500" value={v(ek.lysa_u_pmt)} oninput={e => handleEk('lysa_u_pmt', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Buffert Lysa (U+F) — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.buffert_u_pv)} oninput={e => handleEk('buffert_u_pv', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Buffert Lysa (U+F) — månadsinsättning (kr)</label><input type="number" step="500" value={v(ek.buffert_u_pmt)} oninput={e => handleEk('buffert_u_pmt', (e.target as HTMLInputElement).value)}></div>
    </div>
  </div></div>

  <!-- TjP Sverige -->
  <h2>Tjänstepension Sverige</h2>
  <div class="card"><div class="form-grid">
    <div>
      <p style="font-size:.8rem;color:var(--accent1);margin-bottom:10px">Felipe</p>
      <div class="form-row"><label>TjP Kommun — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.tjp_f_pv)} oninput={e => handleEk('tjp_f_pv', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>TjP Kommun — kvartalsinsättning (kr)</label><input type="number" step="1000" value={v(ek.tjp_f_pmt_q)} oninput={e => handleEk('tjp_f_pmt_q', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Löneväxling — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.lonevxl_pv)} oninput={e => handleEk('lonevxl_pv', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Löneväxling — månadsinsättning (kr)</label><input type="number" step="500" value={v(ek.lonevxl_pmt)} oninput={e => handleEk('lonevxl_pmt', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Tidigare LöneVXL+TjP — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.tidigare_pv)} oninput={e => handleEk('tidigare_pv', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>TjP Kåpan — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.kapan_pv)} oninput={e => handleEk('kapan_pv', (e.target as HTMLInputElement).value)}></div>
    </div>
    <div>
      <p style="font-size:.8rem;color:var(--accent2);margin-bottom:10px">Ulrika</p>
      <div class="form-row"><label>TjP Kommun — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.tjp_u_pv)} oninput={e => handleEk('tjp_u_pv', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>TjP Kommun — kvartalsinsättning (kr)</label><input type="number" step="1000" value={v(ek.tjp_u_pmt_q)} oninput={e => handleEk('tjp_u_pmt_q', (e.target as HTMLInputElement).value)}></div>
    </div>
  </div></div>

  <!-- TjP Norge -->
  <h2>Tjänstepension Norge (OTP)</h2>
  <div class="card"><div class="form-grid">
    <div>
      <p style="font-size:.8rem;color:var(--accent1);margin-bottom:10px">Felipe</p>
      <div class="form-row"><label>TjP Norge (huvud) — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.norge_f_pv)} oninput={e => handleEk('norge_f_pv', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>DNB Felipe — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.dnb_f_pv)} oninput={e => handleEk('dnb_f_pv', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>DNB Norge Felipe — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.sb_f_pv)} oninput={e => handleEk('sb_f_pv', (e.target as HTMLInputElement).value)}></div>
    </div>
    <div>
      <p style="font-size:.8rem;color:var(--accent2);margin-bottom:10px">Ulrika</p>
      <div class="form-row"><label>DNB Norge Ulrika — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.sb_u_pv)} oninput={e => handleEk('sb_u_pv', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>DNB Ulrika — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.dnb_u_pv)} oninput={e => handleEk('dnb_u_pv', (e.target as HTMLInputElement).value)}></div>
    </div>
  </div></div>

  <!-- Sparkonto -->
  <h2>Sparkonto / Borgensavi</h2>
  <div class="card">
    <div class="form-row"><label>Nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.sparkonto_pv)} oninput={e => handleEk('sparkonto_pv', (e.target as HTMLInputElement).value)}></div>
    <div class="form-row"><label>Månadsinsättning (kr)</label><input type="number" step="500" value={v(ek.sparkonto_pmt)} oninput={e => handleEk('sparkonto_pmt', (e.target as HTMLInputElement).value)}></div>
  </div>

  <!-- Allmän pension & NAV -->
  <h2>Allmän pension &amp; NAV</h2>
  <div class="card"><div class="form-grid">
    <div>
      <p style="font-size:.8rem;color:var(--accent1);margin-bottom:10px">Felipe</p>
      <div class="form-row"><label>Inkomstpension — nuv. kapital (kr)</label><input type="number" step="10000" value={v(ek.ap_f)} oninput={e => handleEk('ap_f', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>NAV inntektspension — kapital (NOK)</label><input type="number" step="10000" value={v(ek.nav_f_nok)} oninput={e => handleEk('nav_f_nok', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Estimerat månadsbelopp SE (kr)</label><input type="number" step="500" value={v(ek.allman_se_f)} oninput={e => handleEk('allman_se_f', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Estimerat månadsbelopp NAV (kr)</label><input type="number" step="500" value={v(ek.norsk_f)} oninput={e => handleEk('norsk_f', (e.target as HTMLInputElement).value)}></div>
    </div>
    <div>
      <p style="font-size:.8rem;color:var(--accent2);margin-bottom:10px">Ulrika</p>
      <div class="form-row"><label>Inkomstpension — nuv. kapital (kr)</label><input type="number" step="10000" value={v(ek.ap_u)} oninput={e => handleEk('ap_u', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>NAV inntektspension — kapital (NOK)</label><input type="number" step="10000" value={v(ek.nav_u_nok)} oninput={e => handleEk('nav_u_nok', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Estimerat månadsbelopp SE (kr)</label><input type="number" step="500" value={v(ek.allman_se_u)} oninput={e => handleEk('allman_se_u', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Estimerat månadsbelopp NAV (kr)</label><input type="number" step="500" value={v(ek.norsk_u)} oninput={e => handleEk('norsk_u', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>NOK → SEK kurs</label><input type="number" step="0.01" value={v(ek.nok_sek)} oninput={e => handleEk('nok_sek', (e.target as HTMLInputElement).value)}></div>
    </div>
  </div></div>

  <!-- Premiepension -->
  <h2>Premiepension (AP7)</h2>
  <div class="card"><div class="form-grid">
    <div class="form-row"><label>Felipe — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.pp_f)} oninput={e => handleEk('pp_f', (e.target as HTMLInputElement).value)}></div>
    <div class="form-row"><label>Ulrika — nuv. värde (kr)</label><input type="number" step="10000" value={v(ek.pp_u)} oninput={e => handleEk('pp_u', (e.target as HTMLInputElement).value)}></div>
  </div></div>

  <!-- Aktier -->
  <h2>Aktier</h2>
  <div class="card"><div class="form-grid">
    <div>
      <div class="form-row"><label>Norconsult (NOAB) — antal</label><input type="number" step="1" value={v(ek.norco_antal)} oninput={e => handleEk('norco_antal', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Norconsult — kurs (kr)</label><input type="number" step="1" value={v(ek.norco_kurs)} oninput={e => handleEk('norco_kurs', (e.target as HTMLInputElement).value)}></div>
    </div>
    <div>
      <div class="form-row"><label>Oncopeptides — antal</label><input type="number" step="1" value={v(ek.oncop_antal)} oninput={e => handleEk('oncop_antal', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Oncopeptides — kurs (kr)</label><input type="number" step="0.01" value={v(ek.oncop_kurs)} oninput={e => handleEk('oncop_kurs', (e.target as HTMLInputElement).value)}></div>
    </div>
  </div></div>

  <!-- Fastigheter -->
  <h2>Fastigheter (Hink 2 — Bevara värde)</h2>
  <div class="card"><div class="form-grid">
    <div>
      <p style="font-size:.8rem;color:var(--accent);margin-bottom:10px">Villa</p>
      <div class="form-row"><label>Marknadsvärde villa (kr)</label><input type="number" step="50000" value={ek.villa_varde || 5300000} oninput={e => handleEk('villa_varde', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Bolån villa — totalt (kr)</label><input type="number" step="10000" value={ek.villa_lan || 3569946} oninput={e => handleEk('villa_lan', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Amortering villa (kr/mån)</label><input type="number" step="500" value={ek.villa_amor || 4650} oninput={e => handleEk('villa_amor', (e.target as HTMLInputElement).value)}></div>
    </div>
    <div>
      <p style="font-size:.8rem;color:var(--accent2);margin-bottom:10px">Lägenhet</p>
      <div class="form-row"><label>Marknadsvärde lägenhet (kr)</label><input type="number" step="50000" value={ek.lagenhet_varde || 1850000} oninput={e => handleEk('lagenhet_varde', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Bolån lägenhet (kr)</label><input type="number" step="10000" value={ek.lagenhet_lan || 1249574} oninput={e => handleEk('lagenhet_lan', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Amortering lägenhet (kr/mån)</label><input type="number" step="500" value={v(ek.lagenhet_amor)} oninput={e => handleEk('lagenhet_amor', (e.target as HTMLInputElement).value)}></div>
    </div>
  </div></div>

  <!-- Löner & levnadskostnad -->
  <h2>Löner &amp; levnadskostnad</h2>
  <div class="card"><div class="form-grid">
    <div>
      <div class="form-row"><label>Bruttolön Felipe (kr/mån)</label><input type="number" step="1000" value={v(ek.brutto_f)} oninput={e => handleEk('brutto_f', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Bruttolön Ulrika (kr/mån)</label><input type="number" step="1000" value={v(ek.brutto_u)} oninput={e => handleEk('brutto_u', (e.target as HTMLInputElement).value)}></div>
    </div>
    <div>
      <div class="form-row"><label>Levnadskostnad period 1 (kr/mån)</label><input type="number" step="1000" value={v(ek.levnadskostnad)} oninput={e => handleEk('levnadskostnad', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Levnadskostnad period 2 (kr/mån)</label><input type="number" step="1000" value={v(ek.levnadskostnad2)} oninput={e => handleEk('levnadskostnad2', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Byt till period 2 efter (år)</label><input type="number" step="1" min="1" max="30" value={v(ek.exp_switch_ar)} oninput={e => handleEk('exp_switch_ar', (e.target as HTMLInputElement).value)}></div>
    </div>
  </div></div>

  <!-- Simuleringsantaganden -->
  <h2>Simuleringsantaganden</h2>
  <div class="card"><div class="form-grid">
    <div>
      <div class="form-row"><label>Borgensränta / sparkonto (%/år)</label><input type="number" step="0.1" min="0" max="6" value={fire.borgoRanta} oninput={e => handleFire('borgoRanta', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>ISK-schablonskatt — Lysa (%/år)</label><input type="number" step="0.05" min="0" max="2.5" value={fire.iskPct} oninput={e => handleFire('iskPct', (e.target as HTMLInputElement).value)}></div>
    </div>
    <div>
      <div class="form-row"><label>Löneökning Felipe (%/år)</label><input type="number" step="0.5" min="0" max="10" value={fire.lonehojF} oninput={e => handleFire('lonehojF', (e.target as HTMLInputElement).value)}></div>
      <div class="form-row"><label>Löneökning Ulrika (%/år)</label><input type="number" step="0.5" min="0" max="10" value={fire.lonehojU} oninput={e => handleFire('lonehojU', (e.target as HTMLInputElement).value)}></div>
      <div style="margin-top:14px">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.9rem">
          <input type="checkbox" checked={fire.aktierIFire} style="width:16px;height:16px;accent-color:var(--accent1)"
                 onchange={e => handleAktierCheck((e.target as HTMLInputElement).checked)}>
          Inkludera aktier (Norconsult + Oncopeptides) i fritt kapital
        </label>
      </div>
    </div>
  </div></div>

  <p style="color:var(--green);margin-top:16px;font-size:.85rem">{saveStatus}</p>

  <footer>Ekonomi · Verdu Ekonomi</footer>
</div>
