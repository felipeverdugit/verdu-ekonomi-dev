import '../../src/style.css';
import { ekStore } from '../store';
import { NAV_LINKS } from '../constants';
import type { EkonomiData } from '../types';

// ── Navigation ─────────────────────────────────────────────────────────────────
document.getElementById('topnav')!.innerHTML = NAV_LINKS.map(l =>
  `<a href="${l.href}"${l.href === 'ekonomi.html' ? ' class="active"' : ''}>${l.icon} ${l.label}</a>`
).join('');

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
