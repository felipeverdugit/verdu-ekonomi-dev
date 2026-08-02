/**
 * calculations.ts — Ren beräkningsmotor
 *
 * Inga sidoeffekter. Inga DOM-anrop. Inga localStorage-anrop.
 * Tar EkonomiData + FireSettings → returnerar FireResult.
 *
 * Testbar utan webbläsare.
 */

import { PEOPLE, FAST_TJP_FELIPE, FAST_TJP_AGE, NORSK_TJP_PERIOD, AP_INDEX_RATE, AP_TAK } from './constants';
import type { EkonomiData, FireSettings, FireResult, PensionStream, Phase, TimelineEvent, UttakResult, UttakRow } from './types';

const BASE_YEAR  = new Date().getFullYear();
const BASE_MONTH = new Date().getMonth() + 1; // 1-12

// ── Finansiella hjälpfunktioner ────────────────────────────────────────────────

/** Excel FV: framtida värde av ett konto med insättningar */
function fv(rate: number, nper: number, pmt: number, pv: number): number {
  if (rate === 0) return -(pv + pmt * nper);
  return -(pv * Math.pow(1 + rate, nper) + pmt * ((Math.pow(1 + rate, nper) - 1) / rate));
}

/** PMT: månatligt uttag från kapital under n månader */
export function pmt(rate: number, nper: number, pv: number): number {
  if (rate === 0) return pv / nper;
  return pv * rate / (1 - Math.pow(1 + rate, -nper));
}

/** Beräkna FV för ett konto med månatliga eller kvartalsvisa insättningar */
function accountFV(
  pv: number,
  pmtVal: number,
  freq: 'monthly' | 'quarterly',
  avkPctAr: number,
  yearsActive: number,
  yearsTotal: number,
): number {
  const periods  = freq === 'quarterly' ? 4 : 12;
  const r        = Math.pow(1 + avkPctAr / 100, 1 / periods) - 1;
  const nAkt     = yearsActive * periods;
  const nRest    = (yearsTotal - yearsActive) * periods;
  const pvAtFire = fv(r, nAkt, -pmtVal, -pv);
  if (nRest <= 0) return pvAtFire;
  return fv(r, nRest, 0, -pvAtFire);
}

/**
 * FV för ett konto där insättningen växer med growthPctAr per år (lönehöjning).
 * Använder formel för växande annuitet: PMT₁·[(1+r)ⁿ − (1+g)ⁿ]/(r−g)
 */
function accountFVGrowing(
  pv: number,
  pmt: number,
  freq: 'monthly' | 'quarterly',
  avkPctAr: number,
  growthPctAr: number,
  yearsActive: number,
  yearsTotal: number,
): number {
  if (growthPctAr === 0) return accountFV(pv, pmt, freq, avkPctAr, yearsActive, yearsTotal);
  const periods = freq === 'quarterly' ? 4 : 12;
  const r       = Math.pow(1 + avkPctAr    / 100, 1 / periods) - 1;
  const g       = Math.pow(1 + growthPctAr / 100, 1 / periods) - 1;
  const n       = yearsActive * periods;

  const fvPV      = pv * Math.pow(1 + r, n);
  const fvAnnuity = Math.abs(r - g) < 1e-12
    ? pmt * n * Math.pow(1 + r, n - 1)
    : pmt * (Math.pow(1 + r, n) - Math.pow(1 + g, n)) / (r - g);

  const pvAtFire = fvPV + fvAnnuity;
  const nRest    = (yearsTotal - yearsActive) * periods;
  return nRest > 0 ? pvAtFire * Math.pow(1 + r, nRest) : pvAtFire;
}

// ── Huvud-beräkningsfunktion ───────────────────────────────────────────────────

export function computeFire(ek: EkonomiData, s: FireSettings): FireResult {
  const { felipe, ulrika } = PEOPLE;
  const avkPct     = s.avkPct;
  const antalAr    = s.antalAr;
  const skattFaktor = 1 - s.skattPct / 100;
  const uttakAvkMon = s.uttakAvkPct / 100 / 12;

  const fireYear = Math.round(BASE_YEAR + (BASE_MONTH - 1) / 12 + antalAr);

  // ── Portföljvärden vid FIRE ────────────────────────────────────────────────

  // Privata fonder
  const lysa_f_fv    = accountFV(ek.lysa_f_pv,    ek.lysa_f_pmt,    'monthly',   avkPct, antalAr, antalAr);
  const lysa_u_fv    = accountFV(ek.lysa_u_pv,    ek.lysa_u_pmt,    'monthly',   avkPct, antalAr, antalAr);
  const buffert_u_fv = accountFV(ek.buffert_u_pv,  ek.buffert_u_pmt, 'monthly',   avkPct, antalAr, antalAr);

  // Tjänstepension Sverige (insättningar slutar vid FIRE, växer med lönehöjning)
  const tjp_f_fv     = accountFVGrowing(ek.tjp_f_pv,   ek.tjp_f_pmt_q,  'quarterly', avkPct, s.lonehojF, antalAr, antalAr);
  const lonevxl_fv   = accountFVGrowing(ek.lonevxl_pv, ek.lonevxl_pmt,  'monthly',   avkPct, s.lonehojF, antalAr, antalAr);
  const tidigare_fv  = accountFV(ek.tidigare_pv,  0,                     'monthly',   avkPct, antalAr, antalAr);
  const kapan_fv     = accountFV(ek.kapan_pv,     0,                     'monthly',   avkPct, antalAr, antalAr);
  const tjp_u_fv     = accountFVGrowing(ek.tjp_u_pv,   ek.tjp_u_pmt_q,  'quarterly', avkPct, s.lonehojU, antalAr, antalAr);

  // TjP Norge (ingen pmt — kapitalbaserat)
  const norge_f_fv   = accountFV(ek.norge_f_pv + ek.dnb_f_pv + ek.sb_f_pv, 0, 'monthly', avkPct, antalAr, antalAr);
  const norge_u_fv   = accountFV(ek.sb_u_pv + ek.dnb_u_pv,                  0, 'monthly', avkPct, antalAr, antalAr);

  // Sparkonto (växter med borgaRanta, ej avkPct)
  const r_sp_mon = Math.pow(1 + s.borgoRanta / 100, 1 / 12) - 1;
  const sparkonto_fv = ek.sparkonto_pv * Math.pow(1 + s.borgoRanta / 100, antalAr)
    + ek.sparkonto_pmt * (Math.pow(1 + r_sp_mon, antalAr * 12) - 1) / r_sp_mon;

  // Premiepension (AP7, ingen insättning — växer med avkPct)
  const pp_fv = (ek.pp_f + ek.pp_u) * Math.pow(1 + avkPct / 100, antalAr);

  // Inkomstpension — kapital indexeras med AP_INDEX_RATE, avsättningar växer med lön
  const ap_brutto_f   = Math.min(ek.brutto_f * 12, AP_TAK);
  const ap_brutto_u   = Math.min(ek.brutto_u * 12, AP_TAK);
  const ap_annual_f   = ap_brutto_f * 0.16;
  const ap_annual_u   = ap_brutto_u * 0.16;
  const apIndexR      = AP_INDEX_RATE;

  function apGrowingContrib(annualPmt: number, salaryGrowth: number): number {
    const g = salaryGrowth / 100;
    if (Math.abs(apIndexR - g) < 1e-12) return annualPmt * antalAr * Math.pow(1 + apIndexR, antalAr - 1);
    return annualPmt * (Math.pow(1 + apIndexR, antalAr) - Math.pow(1 + g, antalAr)) / (apIndexR - g);
  }

  const ap_fv = (ek.ap_f + ek.ap_u) * Math.pow(1 + apIndexR, antalAr)
    + apGrowingContrib(ap_annual_f, s.lonehojF)
    + apGrowingContrib(ap_annual_u, s.lonehojU);

  // NAV (norsk statspension) — nuv. kapital i SEK
  const nav_sek = (ek.nav_f_nok + ek.nav_u_nok) * ek.nok_sek;

  // Aktier
  const aktierVal = (ek.norco_antal * ek.norco_kurs) + (ek.oncop_antal * ek.oncop_kurs);

  // Engångsuttag-justering (minskar fonder om uttaget sker före FIRE)
  const engJust = (s.engBelopp > 0 && s.engAr > 0 && s.engAr < fireYear)
    ? s.engBelopp * Math.pow(1 + avkPct / 100, fireYear - s.engAr)
    : 0;

  // Grupperade totaler
  const grp_fonder_f = lysa_f_fv;
  const grp_fonder_u = lysa_u_fv + buffert_u_fv;
  const grp_tjp_f    = tjp_f_fv + kapan_fv;
  const grp_lonevxl  = lonevxl_fv + tidigare_fv;
  const grp_tjp_u    = tjp_u_fv;
  const grp_norge_f  = norge_f_fv;
  const grp_norge_u  = norge_u_fv;

  const fonder_fv  = Math.max(0, grp_fonder_f + grp_fonder_u - engJust);
  const tjp_fv_tot = grp_tjp_f + grp_lonevxl + grp_tjp_u;
  const norge_fv   = grp_norge_f + grp_norge_u;

  const kapital   = fonder_fv + sparkonto_fv + (s.aktierIFire ? aktierVal : 0);
  const totaltFV  = fonder_fv + tjp_fv_tot + norge_fv + pp_fv + ap_fv + nav_sek + sparkonto_fv;

  // ── Pensionsströmmar ───────────────────────────────────────────────────────

  // Startår för varje ström (inga fireYear-klampningar — slidern bestämmer)
  const YR_U_NORSK_TJP = ulrika.born + s.uNorskTjpAge;
  const YR_F_NORSK_TJP = felipe.born + s.fNorskTjpAge;
  const u_tjp_start    = ulrika.born + s.uTjpAge;
  const f_tjp_start    = felipe.born + s.fTjpAge;
  const YR_F_FAST_TJP  = felipe.born + FAST_TJP_AGE;
  const YR_U_ALLMAN    = ulrika.born + s.uAllmanAge;
  const YR_F_ALLMAN    = felipe.born + s.fAllmanAge;

  // Slutår
  const u_norsk_end = ulrika.born + 77;
  const f_norsk_end = felipe.born + 77;
  const u_tjp_end   = u_tjp_start + s.tjpAr;
  const f_tjp_end   = f_tjp_start + s.tjpAr;

  // PMT för norsk TjP: kapitalet växer från FIRE till startår, sedan 15-år PMT
  const u_norsk_extra = Math.max(0, YR_U_NORSK_TJP - fireYear);
  const f_norsk_extra = Math.max(0, YR_F_NORSK_TJP - fireYear);
  const u_norsk_cap   = grp_norge_u * Math.pow(1 + avkPct / 100, u_norsk_extra);
  const f_norsk_cap   = grp_norge_f * Math.pow(1 + avkPct / 100, f_norsk_extra);
  const u_norsk_mon   = Math.round(pmt(uttakAvkMon, NORSK_TJP_PERIOD * 12, u_norsk_cap));
  const f_norsk_mon   = Math.round(pmt(uttakAvkMon, NORSK_TJP_PERIOD * 12, f_norsk_cap));

  // PMT för svensk TjP: kapitalet växer från FIRE till startår, sedan tjpAr-PMT
  const u_tjp_extra    = Math.max(0, u_tjp_start - fireYear);
  const f_tjp_extra    = Math.max(0, f_tjp_start - fireYear);
  const u_tjp_cap      = grp_tjp_u   * Math.pow(1 + avkPct / 100, u_tjp_extra);
  const f_tjp_cap      = grp_tjp_f   * Math.pow(1 + avkPct / 100, f_tjp_extra);
  const f_lonevxl_cap  = grp_lonevxl * Math.pow(1 + avkPct / 100, f_tjp_extra);
  const u_tjp_mon      = Math.round(pmt(uttakAvkMon, s.tjpAr * 12, u_tjp_cap));
  const f_tjp_mon      = Math.round(pmt(uttakAvkMon, s.tjpAr * 12, f_tjp_cap));
  const f_lonevxl_mon  = Math.round(pmt(uttakAvkMon, s.tjpAr * 12, f_lonevxl_cap));

  // Allmänpension (statlig + norsk NAV inntektspension)
  const u_allman_mon = Math.round((ek.allman_se_u + ek.norsk_u) * skattFaktor);
  const f_allman_mon = Math.round((ek.allman_se_f + ek.norsk_f) * skattFaktor);

  const pensions: PensionStream[] = [
    { id: 1, label: 'Norsk TjP — Ulrika',             who: 'u', fromYear: YR_U_NORSK_TJP, toYear: u_norsk_end, monthly: Math.round(u_norsk_mon * skattFaktor), livsvarig: false },
    { id: 2, label: 'Svensk TjP — Ulrika',            who: 'u', fromYear: u_tjp_start,    toYear: u_tjp_end,   monthly: Math.round(u_tjp_mon  * skattFaktor), livsvarig: false },
    { id: 3, label: 'Norsk TjP — Felipe',             who: 'f', fromYear: YR_F_NORSK_TJP, toYear: f_norsk_end, monthly: Math.round(f_norsk_mon * skattFaktor), livsvarig: false },
    { id: 4, label: 'Allmänpension Ulrika (SE+NAV)',  who: 'u', fromYear: YR_U_ALLMAN,    toYear: 9999,        monthly: u_allman_mon,                          livsvarig: true  },
    { id: 5, label: 'Svensk TjP — Felipe',            who: 'f', fromYear: f_tjp_start,    toYear: f_tjp_end,   monthly: Math.round(f_tjp_mon      * skattFaktor), livsvarig: false },
    { id: 8, label: 'Löneväxling — Felipe',           who: 'f', fromYear: f_tjp_start,    toYear: f_tjp_end,   monthly: Math.round(f_lonevxl_mon  * skattFaktor), livsvarig: false },
    { id: 6, label: 'Fast TjP Felipe (Alecta/KPA)',  who: 'f', fromYear: YR_F_FAST_TJP,  toYear: 9999,        monthly: Math.round(FAST_TJP_FELIPE * skattFaktor), livsvarig: true  },
    { id: 7, label: 'Allmänpension Felipe (SE+NAV)', who: 'f', fromYear: YR_F_ALLMAN,    toYear: 9999,        monthly: f_allman_mon,                          livsvarig: true  },
  ];

  function incomeF(yr: number): number {
    const inF = pensions.filter(p => p.who === 'f' && p.fromYear <= yr && yr <= p.toYear);
    return Math.round(inF.reduce((s, p) => s + p.monthly, 0));
  }
  function incomeU(yr: number): number {
    const inU = pensions.filter(p => p.who === 'u' && p.fromYear <= yr && yr <= p.toYear);
    return Math.round(inU.reduce((s, p) => s + p.monthly, 0));
  }

  // ── Tidslinje-händelser ────────────────────────────────────────────────────
  const events: TimelineEvent[] = [
    { year: YR_U_NORSK_TJP, who: 'u', type: 'norsk_tjp_start', label: `Ulrika ${s.uNorskTjpAge}: Norsk TjP startar (t.o.m. 77)` },
    { year: u_norsk_end,     who: 'u', type: 'norsk_tjp_end',   label: `Ulrika 77: Norsk TjP slutar` },
    { year: u_tjp_start,     who: 'u', type: 'tjp_start',       label: `Ulrika ${s.uTjpAge}: Svensk TjP startar (${s.tjpAr} år)` },
    { year: u_tjp_end,       who: 'u', type: 'tjp_end',         label: `Ulrika ${u_tjp_end - ulrika.born}: Svensk TjP slutar` },
    { year: YR_F_NORSK_TJP, who: 'f', type: 'norsk_tjp_start', label: `Felipe ${s.fNorskTjpAge}: Norsk TjP startar (t.o.m. 77)` },
    { year: f_norsk_end,     who: 'f', type: 'norsk_tjp_end',   label: `Felipe 77: Norsk TjP slutar` },
    { year: f_tjp_start,     who: 'f', type: 'tjp_start',       label: `Felipe ${s.fTjpAge}: Svensk TjP startar (${s.tjpAr} år)` },
    { year: f_tjp_end,       who: 'f', type: 'tjp_end',         label: `Felipe ${f_tjp_end - felipe.born}: Svensk TjP slutar` },
    { year: YR_F_FAST_TJP,  who: 'f', type: 'fast_tjp',        label: `Felipe ${FAST_TJP_AGE}: Fast TjP (Alecta/KPA/Kåpan)` },
    { year: YR_U_ALLMAN,    who: 'u', type: 'allman',           label: `Ulrika ${s.uAllmanAge}: Allmänpension SE+NAV` },
    { year: YR_F_ALLMAN,    who: 'f', type: 'allman',           label: `Felipe ${s.fAllmanAge}: Allmänpension SE+NAV` },
  ].sort((a, b) => a.year - b.year) as TimelineEvent[];

  // ── Fasdata ────────────────────────────────────────────────────────────────
  const phases: Phase[] = [];

  // Fas 1: FIRE-dag
  phases.push({
    nr: '1', year: fireYear,
    ageF: fireYear - felipe.born,
    ageU: fireYear - ulrika.born,
    labels: ['Brygga-start — privata fonder täcker gapet',
      ...events.filter(e => e.year <= fireYear).map(e => e.label + ' (redan aktiv)')],
    incomeF: incomeF(fireYear),
    incomeU: incomeU(fireYear),
  });

  // Framtida faser: en fas per unik händelseår efter FIRE
  const futureYears = [...new Set(events.filter(e => e.year > fireYear).map(e => e.year))].sort((a, b) => a - b);
  futureYears.forEach((yr, i) => {
    const yearEvents = events.filter(e => e.year === yr);
    phases.push({
      nr: String(i + 2), year: yr,
      ageF: yr - felipe.born,
      ageU: yr - ulrika.born,
      labels: yearEvents.map(e => e.label),
      incomeF: incomeF(yr),
      incomeU: incomeU(yr),
    });
  });

  // ── FIRE-nummer & procent ──────────────────────────────────────────────────
  const levnad     = ek.levnadskostnad;
  const fireNumber = levnad * 12 / 0.04;

  // Brygga-kapital = PV av gapet (levnadskostnad − pension) tills pensioner täcker allt
  const r = (s.uttakAvkPct ?? 5) / 100;
  let bryggaKapital = 0;
  for (let yr = fireYear; yr <= fireYear + 60; yr++) {
    const pensionMon = pensions
      .filter(p => p.fromYear <= yr && yr <= p.toYear)
      .reduce((sum, p) => sum + p.monthly, 0);
    const gapAnnual = Math.max(0, levnad - pensionMon) * 12;
    if (gapAnnual <= 0) break;
    bryggaKapital += gapAnnual / Math.pow(1 + r, yr - fireYear);
  }

  const firePct      = fireNumber > 0 ? (kapital / fireNumber) * 100 : 0;
  const bryggaTackning = bryggaKapital > 0 ? (kapital / bryggaKapital) * 100 : 0;

  return {
    fireYear, fireNumber, firePct, bryggaKapital, bryggaTackning, kapital, totaltFV,
    uttakAvkPct: s.uttakAvkPct, skattFaktor,
    fonder_fv, sparkonto_fv, tjp_fv: tjp_fv_tot,
    norge_fv, pp_fv, ap_fv,
    pensions, phases, events,
  };
}

// ── Uttags-simulering ──────────────────────────────────────────────────────────
export function simulateUttag(
  kapital: number,
  avkPct: number,
  startYear: number,
  monthlyUttag: number,
  pensions: PensionStream[],
  monthlyUttag2 = 0,
  switchAfterYears = 0,
): UttakResult {
  const rows: UttakRow[] = [];
  let cap = kapital;
  let depletedYear:    number | null = null;
  let pensionFullYear: number | null = null;
  let capitalAtBridge = 0;
  const avkPctDecimal  = avkPct / 100;
  const switchYear     = switchAfterYears > 0 && monthlyUttag2 > 0 ? startYear + switchAfterYears : 9999;

  for (let yr = startYear; yr <= 2080; yr++) {
    const currentUttag = yr >= switchYear ? monthlyUttag2 : monthlyUttag;
    const pensionMon = pensions
      .filter(p => p.fromYear <= yr && yr <= p.toYear)
      .reduce((s, p) => s + p.monthly, 0);
    const netUttag = Math.max(0, currentUttag - pensionMon);
    const returns  = cap * avkPctDecimal;
    const delta    = returns - netUttag * 12;

    rows.push({ year: yr, capital: Math.max(0, cap), returns, pensionMon, netUttag, delta });

    if (cap <= 0 && depletedYear === null) depletedYear = yr;

    if (pensionFullYear === null && pensionMon >= currentUttag) {
      pensionFullYear = yr;
      capitalAtBridge = Math.max(0, cap);
    }

    cap = Math.max(0, cap + delta);
  }

  return { rows, depletedYear, pensionFullYear, capitalAtBridge };
}
