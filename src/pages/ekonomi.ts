import '../../src/style.css';
import { initAuth } from '../auth';
import { ekStore } from '../store';
import { SHEETS_URL, SHEETS_MAP, EXCEL_PMTS, ALLMAN_DEFAULTS } from '../constants';
import { renderTopnav } from '../nav';
import type { EkonomiData } from '../types';

await initAuth();

// ── Navigation ─────────────────────────────────────────────────────────────────
renderTopnav('ekonomi.html');

// ── Alla fält som har ett input-element med samma id som EkonomiData-fältet ────
const FIELDS: (keyof EkonomiData)[] = [
  'lysa_f_pv','lysa_f_pmt','lysa_u_pv','lysa_u_pmt','buffert_u_pv','buffert_u_pmt',
  'tjp_f_pv','tjp_f_pmt_q','lonevxl_pv','lonevxl_pmt','tidigare_pv','kapan_pv',
  'tjp_u_pv','tjp_u_pmt_q',
  'norge_f_pv','dnb_f_pv','sb_f_pv','sb_u_pv','dnb_u_pv',
  'sparkonto_pv','sparkonto_pmt',
  'ap_f','ap_u','nav_f_nok','nav_u_nok','nok_sek',
  'allman_se_f','allman_se_u','norsk_f','norsk_u',
  'pp_f','pp_u',
  'norco_antal','norco_kurs','oncop_antal','oncop_kurs',
  'brutto_f','brutto_u',
  'villa_varde','villa_lan','villa_amor','lagenhet_varde','lagenhet_lan','lagenhet_amor',
  'levnadskostnad','levnadskostnad2','exp_switch_ar',
];

// ── Fyll i sparade värden ──────────────────────────────────────────────────────
const saved = ekStore.get();
FIELDS.forEach(field => {
  const el = document.getElementById(field) as HTMLInputElement | null;
  if (!el) return;
  const v = saved[field];
  if (v !== 0) el.value = String(v);
});

// ── Autospar vid ändring ───────────────────────────────────────────────────────
let saveTimer: ReturnType<typeof setTimeout>;
const statusEl = document.getElementById('save-status')!;

FIELDS.forEach(field => {
  const el = document.getElementById(field) as HTMLInputElement | null;
  if (!el) return;
  el.addEventListener('input', () => {
    ekStore.setField(field, parseFloat(el.value) || 0);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      statusEl.textContent = `✓ Sparat ${new Date().toLocaleTimeString('sv-SE')}`;
    }, 400);
  });
});

// ── Fyll in värden i DOM och spara till store ──────────────────────────────────
function applyValues(vals: Partial<EkonomiData>): void {
  (Object.entries(vals) as [keyof EkonomiData, number][]).forEach(([field, value]) => {
    if (!FIELDS.includes(field)) return;
    ekStore.setField(field, value);
    const el = document.getElementById(field) as HTMLInputElement | null;
    if (el) el.value = String(value);
  });
}

// ── Google Sheets sync ─────────────────────────────────────────────────────────
async function syncFromSheets(): Promise<void> {
  const syncStatusEl = document.getElementById('sync-status')!;
  const btn = document.getElementById('btn-sync-sheets') as HTMLButtonElement;
  btn.disabled = true;
  syncStatusEl.textContent = 'Hämtar…';

  try {
    const res  = await fetch(SHEETS_URL + '?action=read');
    const data = await res.json() as Record<string, string>;

    const vals: Partial<EkonomiData> = {};

    Object.entries(data).forEach(([key, value]) => {
      const field = SHEETS_MAP[key];
      if (field) {
        (vals as Record<string, number>)[field] = parseFloat(value) || 0;
      }
    });

    // PMT-värden som saknas i Sheets
    Object.assign(vals, EXCEL_PMTS);

    // Pensionsestimat (statiska defaults om inte Sheets har dem)
    if (!vals.allman_se_f) vals.allman_se_f = ALLMAN_DEFAULTS.felipeSE;
    if (!vals.allman_se_u) vals.allman_se_u = ALLMAN_DEFAULTS.ulrikaSE;
    if (!vals.norsk_f)     vals.norsk_f     = ALLMAN_DEFAULTS.felipeNO;
    if (!vals.norsk_u)     vals.norsk_u     = ALLMAN_DEFAULTS.ulrikaUSE;

    applyValues(vals);

    const now = new Date().toLocaleTimeString('sv-SE');
    syncStatusEl.textContent = `✓ Synkad ${now}`;
    statusEl.textContent = `✓ Sparat ${now}`;
  } catch (err) {
    syncStatusEl.textContent = `⚠ Misslyckades: ${String(err)}`;
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('btn-sync-sheets')!.addEventListener('click', syncFromSheets);

// Auto-synka från Sheets om enheten saknar data (ny enhet / rensad cache)
if (saved.lysa_f_pv === 0 && saved.tjp_f_pv === 0 && saved.norge_f_pv === 0) {
  syncFromSheets();
}
