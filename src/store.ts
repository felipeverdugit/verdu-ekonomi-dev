/**
 * store.ts — Typad localStorage-wrapper
 *
 * Alla nycklar samlade här. Ingen kod utanför denna fil skriver
 * råa strängar till localStorage. Ändras ett nyckelnamn ändras det
 * på ett ställe.
 */

import type { EkonomiData, FireSettings, Snapshot, BudgetData } from './types';
import { SLIDER_DEFAULTS, ALLMAN_DEFAULTS } from './constants';

// ── Nyckelprefix ──────────────────────────────────────────────────────────────
const K = {
  // Ekonomidata (matas in av användaren i ekonomi.html)
  ek: (field: keyof EkonomiData) => `vek_ek_${field}`,

  // FIRE-inställningar (sliders i fire.html)
  fire: (field: keyof FireSettings) => `vek_fire_${field}`,

  // Budget (månadsöversikt)
  bgt: (field: keyof BudgetData) => `vek_bgt_${field}`,

  // Beräknade resultat som uttag.html läser (skrivs av fire.html)
  result: (field: string) => `vek_res_${field}`,

  // Historik
  historik: 'vek_historik',
} as const;

// ── Hjälpfunktioner ────────────────────────────────────────────────────────────
function getNum(key: string, fallback: number): number {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}
function getBool(key: string, fallback: boolean): boolean {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === 'true';
}
function setNum(key: string, val: number): void {
  localStorage.setItem(key, String(val));
}
function setBool(key: string, val: boolean): void {
  localStorage.setItem(key, String(val));
}

// ── EkonomiData ────────────────────────────────────────────────────────────────
const EK_DEFAULTS: EkonomiData = {
  lysa_f_pv: 0, lysa_f_pmt: 0,
  lysa_u_pv: 0, lysa_u_pmt: 0,
  buffert_u_pv: 0, buffert_u_pmt: 0,
  tjp_f_pv: 0, tjp_f_pmt_q: 0,
  lonevxl_pv: 0, lonevxl_pmt: 0,
  tidigare_pv: 0, kapan_pv: 0,
  tjp_u_pv: 0, tjp_u_pmt_q: 0,
  norge_f_pv: 0, dnb_f_pv: 0, sb_f_pv: 0,
  sb_u_pv: 0, dnb_u_pv: 0,
  sparkonto_pv: 0, sparkonto_pmt: 2000,
  ap_f: 0, ap_u: 0,
  nav_f_nok: 0, nav_u_nok: 0, nok_sek: 0.97,
  pp_f: 0, pp_u: 0,
  norco_antal: 0, norco_kurs: 0,
  oncop_antal: 0, oncop_kurs: 0,
  brutto_f: 67_300, brutto_u: 35_500,
  allman_se_f: ALLMAN_DEFAULTS.felipeSE,
  allman_se_u: ALLMAN_DEFAULTS.ulrikaSE,
  norsk_f: ALLMAN_DEFAULTS.felipeNO,
  norsk_u: ALLMAN_DEFAULTS.ulrikaUSE,
  levnadskostnad: 65_000, levnadskostnad2: 50_000,
  exp_switch_ar: 10,
  exp_f: 0, exp_u: 0,
  villa_varde: 5_300_000, villa_lan: 3_569_946, villa_amor: 4_650,
  lagenhet_varde: 1_850_000, lagenhet_lan: 1_249_574, lagenhet_amor: 0,
};

export const ekStore = {
  get(): EkonomiData {
    const d = { ...EK_DEFAULTS };
    (Object.keys(d) as (keyof EkonomiData)[]).forEach(field => {
      const key = K.ek(field);
      if (typeof d[field] === 'number') {
        (d as Record<string, number>)[field] = getNum(key, d[field] as number);
      }
    });
    return d;
  },
  set(data: Partial<EkonomiData>): void {
    (Object.entries(data) as [keyof EkonomiData, number][]).forEach(([field, val]) => {
      setNum(K.ek(field), val);
    });
  },
  setField(field: keyof EkonomiData, val: number): void {
    setNum(K.ek(field), val);
  },
  getField(field: keyof EkonomiData): number {
    return getNum(K.ek(field), EK_DEFAULTS[field] as number);
  },
};

// ── FireSettings ───────────────────────────────────────────────────────────────
const FIRE_DEFAULTS: FireSettings = {
  ...SLIDER_DEFAULTS,
  aktierIFire: false,
  engBelopp: 0,
  engAr: 0,
};

export const fireStore = {
  get(): FireSettings {
    return {
      avkPct:       getNum(K.fire('avkPct'),       FIRE_DEFAULTS.avkPct),
      antalAr:      getNum(K.fire('antalAr'),       FIRE_DEFAULTS.antalAr),
      uttakAvkPct:  getNum(K.fire('uttakAvkPct'),   FIRE_DEFAULTS.uttakAvkPct),
      tjpAr:        getNum(K.fire('tjpAr'),         FIRE_DEFAULTS.tjpAr),
      skattPct:     getNum(K.fire('skattPct'),      FIRE_DEFAULTS.skattPct),
      borgoRanta:   getNum(K.fire('borgoRanta'),    FIRE_DEFAULTS.borgoRanta),
      lonehojF:     getNum(K.fire('lonehojF'),      FIRE_DEFAULTS.lonehojF),
      lonehojU:     getNum(K.fire('lonehojU'),      FIRE_DEFAULTS.lonehojU),
      sparandel:    getNum(K.fire('sparandel'),     FIRE_DEFAULTS.sparandel),
      fTjpAge:      getNum(K.fire('fTjpAge'),       FIRE_DEFAULTS.fTjpAge),
      fNorskTjpAge: getNum(K.fire('fNorskTjpAge'),  FIRE_DEFAULTS.fNorskTjpAge),
      uTjpAge:      getNum(K.fire('uTjpAge'),       FIRE_DEFAULTS.uTjpAge),
      uNorskTjpAge: getNum(K.fire('uNorskTjpAge'),  FIRE_DEFAULTS.uNorskTjpAge),
      fAllmanAge:   getNum(K.fire('fAllmanAge'),    FIRE_DEFAULTS.fAllmanAge),
      uAllmanAge:   getNum(K.fire('uAllmanAge'),    FIRE_DEFAULTS.uAllmanAge),
      aktierIFire:  getBool(K.fire('aktierIFire'),  FIRE_DEFAULTS.aktierIFire),
      engBelopp:    getNum(K.fire('engBelopp'),     FIRE_DEFAULTS.engBelopp),
      engAr:        getNum(K.fire('engAr'),         FIRE_DEFAULTS.engAr),
      iskPct:       getNum(K.fire('iskPct'),        FIRE_DEFAULTS.iskPct),
    };
  },
  setField(field: keyof FireSettings, val: number | boolean): void {
    if (typeof val === 'boolean') setBool(K.fire(field), val);
    else setNum(K.fire(field), val);
  },
};

// ── Resultat-export (fire.html → uttag.html) ──────────────────────────────────
export const resultStore = {
  write(fields: Record<string, number | string>): void {
    Object.entries(fields).forEach(([k, v]) => localStorage.setItem(K.result(k), String(v)));
  },
  getNum(field: string, fallback = 0): number {
    return getNum(K.result(field), fallback);
  },
  getString(field: string, fallback = ''): string {
    return localStorage.getItem(K.result(field)) ?? fallback;
  },
  // Nyckeln uttag.html lyssnar på för att veta att data uppdaterats
  TRIGGER_KEY: K.result('updated_at'),
};

// ── Historik ──────────────────────────────────────────────────────────────────
export const historikStore = {
  load(): Snapshot[] {
    try { return JSON.parse(localStorage.getItem(K.historik) || '[]'); } catch { return []; }
  },
  save(snaps: Snapshot[]): void {
    localStorage.setItem(K.historik, JSON.stringify(snaps));
  },
  add(snap: Snapshot): void {
    const snaps = this.load();
    snaps.push(snap);
    snaps.sort((a, b) => a.date.localeCompare(b.date));
    this.save(snaps);
  },
  remove(index: number): void {
    const snaps = this.load();
    snaps.splice(index, 1);
    this.save(snaps);
  },
  importFromOld(): number {
    try {
      const raw = localStorage.getItem('ek_historik');
      if (!raw) return 0;
      const old: Snapshot[] = JSON.parse(raw);
      const existing = this.load();
      const existingDates = new Set(existing.map(s => s.date));
      const toAdd = old.filter(s => !existingDates.has(s.date));
      const merged = [...existing, ...toAdd];
      merged.sort((a, b) => a.date.localeCompare(b.date));
      this.save(merged);
      return toAdd.length;
    } catch { return 0; }
  },
};

// ── BudgetData ─────────────────────────────────────────────────────────────────
const BUDGET_DEFAULTS: BudgetData = {
  brutto_f: 67_300, netto_f: 44_500,
  brutto_u: 35_500, netto_u: 28_090,
  vardnadsbidrag: 4_317, barnbidrag: 1_250, hyra_lag_ink: 3_800,
  lan_villa: 10_150, amor_villa: 3_400,
  lan_lag:    3_800, amor_lag:   1_250,
  vatten: 916, el: 0, energi: 588, avfall: 750,
  kia_leasing: 4_231, kia_el: 3_978,
  streaming: 499, bredband_fiber: 449, mobil: 1_194,
  bredband_5g: 299, telia_cloud: 200,
  hemforsakring: 411, tryghansa: 993, skandia_liv: 12,
  if_skadef: 200, sv_lararnas: 907, djurforsakring: 96,
  ledarna: 428, ledarnas_akas: 150, lararnas_akas: 150,
  csn: 1_741, hjarnfonden: 600, friskis: 550,
  lysa_f_mon: 5_000, lysa_u_mon: 8_500, lysa_buffert_mon: 9_000,
  lysa_n_mon: 750, borgo_bank_mon: 2_000, resor_mon: 1_000, lonevxl_mon: 0,
  mc_felipe: 11_750, mc_ulrika: 10_000,
  nextory: 269, anthropic: 253, spotify: 219, misc_prenums: 0,
};

export const budgetStore = {
  get(): BudgetData {
    const d = { ...BUDGET_DEFAULTS };
    (Object.keys(d) as (keyof BudgetData)[]).forEach(field => {
      d[field] = getNum(K.bgt(field), d[field]);
    });
    return d;
  },
  setField(field: keyof BudgetData, val: number): void {
    setNum(K.bgt(field), val);
  },
  getField(field: keyof BudgetData): number {
    return getNum(K.bgt(field), BUDGET_DEFAULTS[field]);
  },
};
