/**
 * calculations.ts — Ren beräkningsmotor
 *
 * Inga sidoeffekter. Inga DOM-anrop. Inga localStorage-anrop.
 * Tar EkonomiData + FireSettings → returnerar FireResult.
 *
 * Testbar utan webbläsare.
 */

import { PEOPLE, FAST_TJP_FELIPE, FAST_TJP_AGE, NORSK_TJP_END_AGE, AP_INDEX_RATE, AP_TAK } from './constants';
import type { EkonomiData, FireSettings, FireResult, PensionStream, Phase, TimelineEvent, UttakResult, UttakRow } from './types';

const BASE_YEAR  = new Date().getFullYear();
const BASE_MONTH = new Date().getMonth() + 1; // 1-12

// ── Finansiella hjälpfunktioner ────────────────────────────────────────────────

/** Excel FV: framtida värde av ett konto med insättningar */
export function fv(rate: number, nper: number, pmt: number, pv: number): number {
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
export function accountFVGrowing(
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

// ── Netto förmögenhet (idag) ───────────────────────────────────────────────────

export function computeNV(ek: EkonomiData): number {
  return (
    ek.sparkonto_pv +
    ek.ap_f + ek.ap_u +
    (ek.nav_f_nok + ek.nav_u_nok) * ek.nok_sek +
    Math.max(0, ek.villa_varde   - ek.villa_lan) +
    Math.max(0, ek.lagenhet_varde - ek.lagenhet_lan) +
    ek.lysa_f_pv + ek.lysa_u_pv + ek.buffert_u_pv +
    ek.tjp_f_pv + ek.lonevxl_pv + ek.tidigare_pv + ek.kapan_pv + ek.tjp_u_pv +
    ek.norge_f_pv + ek.dnb_f_pv + ek.sb_f_pv + ek.sb_u_pv + ek.dnb_u_pv +
    ek.pp_f + ek.pp_u +
    ek.norco_antal * ek.norco_kurs + ek.oncop_antal * ek.oncop_kurs
  );
}

// ── Huvud-beräkningsfunktion ───────────────────────────────────────────────────

export function computeFire(ek: EkonomiData, s: FireSettings): FireResult {
  const { felipe, ulrika } = PEOPLE;
  const avkPct     = s.avkPct;
  // Felipe och Ulrika kan sluta jobba/kontribuera olika år. "FIRE" (brygga-start)
  // inträffar när BÅDA har slutat — den som slutar tidigare behåller sin lön i
  // modellen (ingen bryggkapital-förbrukning) tills den andra också slutar; dennes
  // egna konton slutar bara få nya insättningar men fortsätter växa med avkastning.
  const antalArF   = s.antalArF;
  const antalArU   = s.antalArU;
  const antalAr    = Math.max(antalArF, antalArU); // gemensam horisont för kapital-snapshot
  const skattFaktor = 1 - s.skattPct / 100;
  const uttakAvkMon = s.uttakAvkPct / 100 / 12;

  const fireYear = Math.round(BASE_YEAR + (BASE_MONTH - 1) / 12 + antalAr);

  // ── Portföljvärden vid FIRE ────────────────────────────────────────────────

  // Privata fonder (ISK — avkastning reduceras med schablonskatt)
  const iskAvkPct    = Math.max(0, avkPct - s.iskPct);
  const lysa_f_fv    = accountFV(ek.lysa_f_pv,    ek.lysa_f_pmt,    'monthly',   iskAvkPct, antalArF, antalAr);
  const lysa_u_fv    = accountFV(ek.lysa_u_pv,    ek.lysa_u_pmt,    'monthly',   iskAvkPct, antalArU, antalAr);
  const buffert_u_fv = accountFV(ek.buffert_u_pv,  ek.buffert_u_pmt, 'monthly',   iskAvkPct, antalAr,  antalAr);

  // Tjänstepension Sverige (insättningar slutar när resp. person slutar jobba, växer med lönehöjning)
  const tjp_f_fv     = accountFVGrowing(ek.tjp_f_pv,   ek.tjp_f_pmt_q,  'quarterly', avkPct, s.lonehojF, antalArF, antalAr);
  const lonevxl_fv   = accountFVGrowing(ek.lonevxl_pv, ek.lonevxl_pmt,  'monthly',   avkPct, s.lonehojF, antalArF, antalAr);
  const tidigare_fv  = accountFV(ek.tidigare_pv,  0,                     'monthly',   avkPct, antalArF, antalAr);
  const kapan_fv     = accountFV(ek.kapan_pv,     0,                     'monthly',   avkPct, antalArF, antalAr);
  const tjp_u_fv     = accountFVGrowing(ek.tjp_u_pv,   ek.tjp_u_pmt_q,  'quarterly', avkPct, s.lonehojU, antalArU, antalAr);

  // TjP Norge (ingen pmt — kapitalbaserat, frekvens/aktiv-period påverkar inte resultatet)
  const norge_f_fv   = accountFV(ek.norge_f_pv + ek.dnb_f_pv + ek.sb_f_pv, 0, 'monthly', avkPct, antalArF, antalAr);
  const norge_u_fv   = accountFV(ek.sb_u_pv + ek.dnb_u_pv,                  0, 'monthly', avkPct, antalArU, antalAr);

  // Sparkonto (hushållsgemensamt, växer med borgaRanta, ej avkPct)
  // Notera: fv() hanterar nollränta korrekt (undviker 0/0)
  const r_sp_mon = Math.pow(1 + s.borgoRanta / 100, 1 / 12) - 1;
  const sparkonto_fv = fv(r_sp_mon, antalAr * 12, -ek.sparkonto_pmt, -ek.sparkonto_pv);

  // Premiepension (AP7, ingen insättning — växer med avkPct oavsett arbetsstatus)
  const pp_fv = (ek.pp_f + ek.pp_u) * Math.pow(1 + avkPct / 100, antalAr);

  // Inkomstpension — kapital indexeras med AP_INDEX_RATE (oavsett arbetsstatus),
  // avsättningar görs bara medan resp. person jobbar och växer sedan vidare till fireYear
  const ap_brutto_f   = Math.min(ek.brutto_f * 12, AP_TAK);
  const ap_brutto_u   = Math.min(ek.brutto_u * 12, AP_TAK);
  const ap_annual_f   = ap_brutto_f * 0.16;
  const ap_annual_u   = ap_brutto_u * 0.16;
  const apIndexR      = AP_INDEX_RATE;

  function apGrowingContrib(annualPmt: number, salaryGrowth: number, contribYears: number): number {
    const g = salaryGrowth / 100;
    const fvAtRetire = Math.abs(apIndexR - g) < 1e-12
      ? annualPmt * contribYears * Math.pow(1 + apIndexR, contribYears - 1)
      : annualPmt * (Math.pow(1 + apIndexR, contribYears) - Math.pow(1 + g, contribYears)) / (apIndexR - g);
    const restYears = antalAr - contribYears;
    return restYears > 0 ? fvAtRetire * Math.pow(1 + apIndexR, restYears) : fvAtRetire;
  }

  const ap_fv = ek.ap_f * Math.pow(1 + apIndexR, antalAr) + ek.ap_u * Math.pow(1 + apIndexR, antalAr)
    + apGrowingContrib(ap_annual_f, s.lonehojF, antalArF)
    + apGrowingContrib(ap_annual_u, s.lonehojU, antalArU);

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
  const u_norsk_end = ulrika.born + NORSK_TJP_END_AGE;
  const f_norsk_end = felipe.born + NORSK_TJP_END_AGE;
  const u_tjp_end   = u_tjp_start + s.tjpAr;
  const f_tjp_end   = f_tjp_start + s.tjpAr;

  // PMT för norsk TjP: kapitalet växer från FIRE till startår, sedan dynamisk period (start→77)
  const u_norsk_extra  = Math.max(0, YR_U_NORSK_TJP - fireYear);
  const f_norsk_extra  = Math.max(0, YR_F_NORSK_TJP - fireYear);
  const u_norsk_cap    = grp_norge_u * Math.pow(1 + avkPct / 100, u_norsk_extra);
  const f_norsk_cap    = grp_norge_f * Math.pow(1 + avkPct / 100, f_norsk_extra);
  const u_norsk_period = Math.max(1, u_norsk_end - YR_U_NORSK_TJP); // år, beroende på startålder
  const f_norsk_period = Math.max(1, f_norsk_end - YR_F_NORSK_TJP);
  const u_norsk_mon    = Math.round(pmt(uttakAvkMon, u_norsk_period * 12, u_norsk_cap));
  const f_norsk_mon    = Math.round(pmt(uttakAvkMon, f_norsk_period * 12, f_norsk_cap));

  // PMT för svensk TjP: kapitalet växer från FIRE till startår, sedan tjpAr-PMT
  const u_tjp_extra    = Math.max(0, u_tjp_start - fireYear);
  const f_tjp_extra    = Math.max(0, f_tjp_start - fireYear);
  const u_tjp_cap      = grp_tjp_u   * Math.pow(1 + avkPct / 100, u_tjp_extra);
  const f_tjp_cap      = grp_tjp_f   * Math.pow(1 + avkPct / 100, f_tjp_extra);
  const f_lonevxl_cap  = grp_lonevxl * Math.pow(1 + avkPct / 100, f_tjp_extra);
  const u_tjp_mon      = Math.round(pmt(uttakAvkMon, s.tjpAr * 12, u_tjp_cap));
  const f_tjp_mon      = Math.round(pmt(uttakAvkMon, s.tjpAr * 12, f_tjp_cap));
  const f_lonevxl_mon  = Math.round(pmt(uttakAvkMon, s.tjpAr * 12, f_lonevxl_cap));

  // Allmänpension (statlig SE) och NAV inntektspension — visas som separata rader
  const u_allman_se_mon = Math.round(ek.allman_se_u * skattFaktor);
  const f_allman_se_mon = Math.round(ek.allman_se_f * skattFaktor);
  const u_nav_mon       = Math.round(ek.norsk_u     * skattFaktor);
  const f_nav_mon       = Math.round(ek.norsk_f     * skattFaktor);

  const pensions: PensionStream[] = [
    { id: 1,  label: 'Norsk TjP — Ulrika',           who: 'u', fromYear: YR_U_NORSK_TJP, toYear: u_norsk_end, monthly: Math.round(u_norsk_mon    * skattFaktor), livsvarig: false },
    { id: 2,  label: 'Svensk TjP — Ulrika',          who: 'u', fromYear: u_tjp_start,    toYear: u_tjp_end,   monthly: Math.round(u_tjp_mon      * skattFaktor), livsvarig: false },
    { id: 3,  label: 'Norsk TjP — Felipe',           who: 'f', fromYear: YR_F_NORSK_TJP, toYear: f_norsk_end, monthly: Math.round(f_norsk_mon    * skattFaktor), livsvarig: false },
    { id: 4,  label: 'Allmänpension — Ulrika (SE)',  who: 'u', fromYear: YR_U_ALLMAN,    toYear: 9999,        monthly: u_allman_se_mon,                          livsvarig: true  },
    { id: 5,  label: 'Svensk TjP — Felipe',          who: 'f', fromYear: f_tjp_start,    toYear: f_tjp_end,   monthly: Math.round(f_tjp_mon      * skattFaktor), livsvarig: false },
    { id: 6,  label: 'Fast TjP Felipe (Alecta/KPA)', who: 'f', fromYear: YR_F_FAST_TJP,  toYear: 9999,        monthly: Math.round(FAST_TJP_FELIPE * skattFaktor), livsvarig: true  },
    { id: 7,  label: 'Allmänpension — Felipe (SE)',  who: 'f', fromYear: YR_F_ALLMAN,    toYear: 9999,        monthly: f_allman_se_mon,                          livsvarig: true  },
    { id: 8,  label: 'Löneväxling — Felipe',         who: 'f', fromYear: f_tjp_start,    toYear: f_tjp_end,   monthly: Math.round(f_lonevxl_mon  * skattFaktor), livsvarig: false },
    { id: 9,  label: 'NAV — Ulrika',                 who: 'u', fromYear: YR_U_ALLMAN,    toYear: 9999,        monthly: u_nav_mon,                                livsvarig: true  },
    { id: 10, label: 'NAV — Felipe',                 who: 'f', fromYear: YR_F_ALLMAN,    toYear: 9999,        monthly: f_nav_mon,                                livsvarig: true  },
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
  const fireYearF = Math.round(BASE_YEAR + (BASE_MONTH - 1) / 12 + antalArF);
  const fireYearU = Math.round(BASE_YEAR + (BASE_MONTH - 1) / 12 + antalArU);

  // Om ni slutar jobba olika år: den som slutar tidigare får en egen fas,
  // separat från Brygga-start (som alltid är den gemensamma/senare horisonten).
  // Den som fortfarande jobbar har kvar sin (nettoberäknade) lön i tabellen
  // tills även hen slutar — annars ser gapet ut att vara större än det är.
  const earlyRetiree: { who: 'f' | 'u'; year: number; label: string; workingSalaryNet: number } | null =
    antalArF === antalArU ? null :
    antalArF < antalArU
      ? { who: 'f', year: fireYearF, workingSalaryNet: Math.round(ek.brutto_u * skattFaktor),
          label: `Felipe ${fireYearF - felipe.born}: Slutar jobba (Ulrika jobbar ${antalArU - antalArF} år till — hennes lön täcker gapet)` }
      : { who: 'u', year: fireYearU, workingSalaryNet: Math.round(ek.brutto_f * skattFaktor),
          label: `Ulrika ${fireYearU - ulrika.born}: Slutar jobba (Felipe jobbar ${antalArF - antalArU} år till — hans lön täcker gapet)` };

  const events: TimelineEvent[] = [
    ...(earlyRetiree ? [{ year: earlyRetiree.year, who: earlyRetiree.who, type: 'slutar_jobba', label: earlyRetiree.label }] : []),
    { year: YR_U_NORSK_TJP, who: 'u', type: 'norsk_tjp_start', label: `Ulrika ${s.uNorskTjpAge}: Norsk TjP startar (t.o.m. 77)` },
    { year: u_norsk_end,     who: 'u', type: 'norsk_tjp_end',   label: `Ulrika 77: Norsk TjP slutar` },
    { year: u_tjp_start,     who: 'u', type: 'tjp_start',       label: `Ulrika ${s.uTjpAge}: Svensk TjP startar (${s.tjpAr} år)` },
    { year: u_tjp_end,       who: 'u', type: 'tjp_end',         label: `Ulrika ${u_tjp_end - ulrika.born}: Svensk TjP slutar` },
    { year: YR_F_NORSK_TJP, who: 'f', type: 'norsk_tjp_start', label: `Felipe ${s.fNorskTjpAge}: Norsk TjP startar (t.o.m. 77)` },
    { year: f_norsk_end,     who: 'f', type: 'norsk_tjp_end',   label: `Felipe 77: Norsk TjP slutar` },
    { year: f_tjp_start,     who: 'f', type: 'tjp_start',       label: `Felipe ${s.fTjpAge}: Svensk TjP startar (${s.tjpAr} år)` },
    { year: f_tjp_end,       who: 'f', type: 'tjp_end',         label: `Felipe ${f_tjp_end - felipe.born}: Svensk TjP slutar` },
    { year: YR_F_FAST_TJP,  who: 'f', type: 'fast_tjp',        label: `Felipe ${FAST_TJP_AGE}: Fast TjP (Alecta/KPA/Kåpan)` },
    { year: YR_U_ALLMAN,    who: 'u', type: 'allman',           label: `Ulrika ${s.uAllmanAge}: Allmänpension SE + NAV` },
    { year: YR_F_ALLMAN,    who: 'f', type: 'allman',           label: `Felipe ${s.fAllmanAge}: Allmänpension SE + NAV` },
  ].sort((a, b) => a.year - b.year) as TimelineEvent[];

  // ── Fasdata ────────────────────────────────────────────────────────────────
  const phases: Phase[] = [];
  let faseNr = 1;

  // Fas 0 (om asymmetrisk): den som slutar jobba först
  if (earlyRetiree) {
    phases.push({
      nr: String(faseNr++), year: earlyRetiree.year,
      ageF: earlyRetiree.year - felipe.born,
      ageU: earlyRetiree.year - ulrika.born,
      labels: [earlyRetiree.label,
        ...events.filter(e => e.type !== 'slutar_jobba' && e.year <= earlyRetiree.year).map(e => e.label + ' (redan aktiv)')],
      incomeF: incomeF(earlyRetiree.year) + (earlyRetiree.who === 'u' ? earlyRetiree.workingSalaryNet : 0),
      incomeU: incomeU(earlyRetiree.year) + (earlyRetiree.who === 'f' ? earlyRetiree.workingSalaryNet : 0),
    });
  }

  // Fas: Brygga-start (gemensam/senare horisont — ingen av er har längre lön)
  phases.push({
    nr: String(faseNr++), year: fireYear,
    ageF: fireYear - felipe.born,
    ageU: fireYear - ulrika.born,
    labels: ['Brygga-start — privata fonder täcker gapet',
      ...events
        .filter(e => e.year <= fireYear && e.year > (earlyRetiree?.year ?? -Infinity))
        .map(e => e.label + ' (redan aktiv)')],
    incomeF: incomeF(fireYear),
    incomeU: incomeU(fireYear),
  });

  // Framtida faser: en fas per unik händelseår efter Brygga-start
  const futureYears = [...new Set(events.filter(e => e.year > fireYear).map(e => e.year))].sort((a, b) => a - b);
  futureYears.forEach(yr => {
    const yearEvents = events.filter(e => e.year === yr);
    phases.push({
      nr: String(faseNr++), year: yr,
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
  // bryggaKapital = 0 innebär att pensioner täcker allt från FIRE-dag → inget bryggebehov
  const bryggaTackning = bryggaKapital > 0 ? (kapital / bryggaKapital) * 100 : 100;

  const iskKapital = lysa_f_fv + lysa_u_fv + buffert_u_fv;

  return {
    fireYear, fireNumber, firePct, bryggaKapital, bryggaTackning, kapital, totaltFV,
    uttakAvkPct: s.uttakAvkPct, skattFaktor,
    fonder_fv, aktierVal, aktierIFire: s.aktierIFire, iskKapital, iskPct: s.iskPct, sparkonto_fv, tjp_fv: tjp_fv_tot,
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
  engBelopp = 0,
  engYear = 0,       // absolut kalenderår för engångsuttag (0 = inaktivt)
): UttakResult {
  const rows: UttakRow[] = [];
  let cap = kapital;
  let depletedYear:    number | null = null;
  let pensionFullYear: number | null = null;
  let capitalAtBridge = 0;
  const avkPctDecimal  = avkPct / 100;
  const switchYear     = switchAfterYears > 0 && monthlyUttag2 > 0 ? startYear + switchAfterYears : 9999;

  for (let yr = startYear; yr <= 2080; yr++) {
    // Engångsuttag: dra av beloppet det angivna kalenderåret
    if (engBelopp > 0 && engYear > 0 && yr === engYear) {
      cap = Math.max(0, cap - engBelopp);
    }

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

// ── Inkomstskatt (progressiv) ─────────────────────────────────────────────────
// SKV 2024/2025 — delad mellan skatt.ts och uttag.ts för konsekvent beräkning

export const KOMMUNAL      = 0.31;
export const STATLIG_GRANS = 615_300; // kr/år
export const STATLIG_RATE  = 0.20;

/** Förhöjt grundavdrag för pensionärer 65+ (approximation SKV 2024) */
function fga65(annual: number): number {
  if (annual <= 134_600) return annual;
  if (annual <= 220_000) return 134_600;
  if (annual <= 450_000) return 134_600 + 0.08 * (annual - 220_000);
  if (annual <= 615_300) return Math.max(85_000, 152_000 - 0.08 * (annual - 450_000));
  // Samma formel som föregående gren men lägre golv (75 000) ovanför statlig gräns.
  // Använder 152 000 som bas så funktionen är kontinuerlig vid 615 300.
  return Math.max(75_000, 152_000 - 0.08 * (annual - 450_000));
}

/**
 * Grundavdrag för ej-pensionärer (<65) — approximation SKV 2024/2025.
 * Minimum 13 900 kr, platå ~36 500 kr vid 140–245 tkr/år.
 */
function grundavdrag(annual: number): number {
  if (annual <=  43_000) return 13_900;                                                // låg inkomst: minimum
  if (annual <= 140_000) return 13_900 + 0.235 * (annual - 43_000);                   // stigande mot topp
  if (annual <= 245_000) return 36_500;                                                // platå
  if (annual <= 390_000) return Math.max(13_900, 36_500 - 0.155 * (annual - 245_000)); // sjunkande
  return 13_900;                                                                        // hög inkomst: minimum
}

/** Progressiv inkomstskatt. isPensioner = 65+ (förhöjt grundavdrag). */
export function incomeTax(annualGross: number, isPensioner: boolean): number {
  if (annualGross <= 0) return 0;
  const avdrag  = isPensioner ? fga65(annualGross) : grundavdrag(annualGross);
  const taxable = Math.max(0, annualGross - avdrag);
  return Math.round(taxable * KOMMUNAL + Math.max(0, annualGross - STATLIG_GRANS) * STATLIG_RATE);
}
