import { describe, it, expect } from 'vitest';
import { fv, pmt, computeNV, computeFire, computeFirePlan, computeLonevaxling, LONEVAXLING_RULES, pensionTak, breakEvenPaslag, maxVaxlingUnderTak, requiredLonForVaxling, incomeTax, simulateUttag, STATLIG_GRANS } from '../calculations';
import type { PensionStream } from '../types';
import type { EkonomiData, FireSettings } from '../types';

// ── Hjälp: minimala testdata ───────────────────────────────────────────────────

const EMPTY_EK: EkonomiData = {
  lysa_f_pv: 0, lysa_f_pmt: 0, lysa_u_pv: 0, lysa_u_pmt: 0,

  tjp_f_pv: 0, tjp_f_pmt_q: 0, lonevxl_pv: 0, lonevxl_pmt: 0,
  tidigare_pa16_pv: 0, tidigare_tjpkonto_pv: 0, tidigare_itpk_pv: 0,
  kapan_pv: 0, fast_tjp_f: 0, itp2_alecta_f: 0, itp2_alecta_ar_f: 0, tjp_u_pv: 0, tjp_u_pmt_q: 0,
  norge_f_pv: 0, dnb_f_pv: 0, sb_f_pv: 0, sb_u_pv: 0, dnb_u_pv: 0,
  sparkonto_pv: 0, sparkonto_pmt: 0,
  ap_f: 0, ap_u: 0, nav_f_nok: 0, nav_u_nok: 0, nok_sek: 0.97,
  pp_f: 0, pp_u: 0,
  oncop_antal: 0, oncop_kurs: 0,
  brutto_f: 0, brutto_u: 0,
  allman_se_f: 0, allman_se_u: 0, norsk_f: 0, norsk_u: 0,
  villa_varde: 0, villa_lan: 0, villa_amor: 0,
  lagenhet_varde: 0, lagenhet_lan: 0, lagenhet_amor: 0,
  levnadskostnad: 30_000, levnadskostnad2: 0, exp_switch_ar: 0,
};

const TEST_YEAR = new Date().getFullYear();

const FIRE_S: FireSettings = {
  avkPct: 8, fireYearF: TEST_YEAR + 10, fireYearU: TEST_YEAR + 10, uttakAvkPct: 2, tjpArF: 20, tjpArU: 20, lonevxlArF: 20,
  tidigarePa16ArF: 20, tidigareTjpkontoArF: 20, tidigareItpkArF: 20,
  skattPct: 0, borgoRanta: 2.3, lonehojF: 0, lonehojU: 0,
  fTjpAge: 65, fNorskTjpAge: 62, uTjpAge: 65,
  uNorskTjpAge: 62, fAllmanAge: 67, uAllmanAge: 68,
  aktierIFire: false, engBelopp: 0, engAr: 0, iskPct: 1.25,
};

// ── fv() ──────────────────────────────────────────────────────────────────────

describe('fv()', () => {
  it('nollränta: FV = PV + PMT × n', () => {
    // 0 % ränta, 100 kr/mån i 12 mån, start 1000 kr
    expect(fv(0, 12, -100, -1000)).toBeCloseTo(2200, 0);
  });

  it('positiv ränta ger mer än nollränta', () => {
    const noInterest = fv(0,    120, -500, -100_000);
    const withInt    = fv(0.005, 120, -500, -100_000);
    expect(withInt).toBeGreaterThan(noInterest);
  });

  it('borgoRanta = 0 ger ej NaN (regressiontest för bugg)', () => {
    const r = Math.pow(1 + 0 / 100, 1 / 12) - 1; // = 0
    const result = fv(r, 10 * 12, -1000, -500_000);
    expect(result).not.toBeNaN();
    expect(result).toBeCloseTo(500_000 + 1000 * 120, -2);
  });
});

// ── pmt() ─────────────────────────────────────────────────────────────────────

describe('pmt()', () => {
  it('nollränta: PMT = PV / n', () => {
    expect(pmt(0, 120, 1_200_000)).toBeCloseTo(10_000, 0);
  });

  it('positiv ränta ger högre PMT än nollränta', () => {
    const p0 = pmt(0,       120, 1_000_000);
    const p1 = pmt(0.005,   120, 1_000_000);
    expect(p1).toBeGreaterThan(p0);
  });
});

// ── computeNV() ───────────────────────────────────────────────────────────────

describe('computeNV()', () => {
  it('tom ekonomi → 0', () => {
    expect(computeNV(EMPTY_EK)).toBe(0);
  });

  it('summerar lysa + sparkonto korrekt', () => {
    const ek = { ...EMPTY_EK, lysa_f_pv: 500_000, sparkonto_pv: 200_000 };
    expect(computeNV(ek)).toBe(700_000);
  });

  it('fastighet: netto = marknadsvärde - lån', () => {
    const ek = { ...EMPTY_EK, villa_varde: 5_000_000, villa_lan: 2_000_000 };
    expect(computeNV(ek)).toBe(3_000_000);
  });

  it('negativt eget kapital i fastighet kläms till 0', () => {
    const ek = { ...EMPTY_EK, villa_varde: 1_000_000, villa_lan: 1_500_000 };
    expect(computeNV(ek)).toBe(0);
  });

  it('aktier: antal × kurs', () => {
    const ek = { ...EMPTY_EK, oncop_antal: 100, oncop_kurs: 50 };
    expect(computeNV(ek)).toBe(5_000);
  });

  it('NAV konverteras med nok_sek', () => {
    const ek = { ...EMPTY_EK, nav_f_nok: 100_000, nok_sek: 1.0 };
    expect(computeNV(ek)).toBe(100_000);
  });
});

// ── incomeTax() ───────────────────────────────────────────────────────────────

describe('incomeTax()', () => {
  it('noll inkomst → noll skatt', () => {
    expect(incomeTax(0, false)).toBe(0);
    expect(incomeTax(0, true)).toBe(0);
  });

  it('inkomst under skattefri gräns → noll skatt (pensionär)', () => {
    expect(incomeTax(100_000, true)).toBe(0);
  });

  it('pensionär betalar lägre skatt än icke-pensionär vid samma inkomst', () => {
    const gross = 400_000;
    expect(incomeTax(gross, true)).toBeLessThan(incomeTax(gross, false));
  });

  it('statlig skatt tillkommer ovanför gränsen', () => {
    const under = incomeTax(STATLIG_GRANS - 1, false);
    const over  = incomeTax(STATLIG_GRANS + 100_000, false);
    // Mer inkomst = mer skatt, och marginalskatten ökar pga statlig skatt
    expect(over).toBeGreaterThan(under);
  });
});

// ── simulateUttag() ───────────────────────────────────────────────────────────

/** Hjälp: skapa en enkel pensionsström */
function pension(fromYear: number, monthly: number, toYear = 9999): PensionStream {
  return { id: 1, label: 'Test', who: 'f', fromYear, toYear, monthly, livsvarig: toYear === 9999 };
}

describe('simulateUttag()', () => {
  it('kapital utarmas när uttag > avkastning, inga pensioner', () => {
    // 1 MSEK, 0 % avkastning, 50 000 kr/mån uttag → tomt på 20 år (startYear 2030)
    const res = simulateUttag(1_000_000, 0, 2030, 50_000, []);
    expect(res.depletedYear).not.toBeNull();
    expect(res.depletedYear).toBeLessThanOrEqual(2032); // ca 1,67 år
    expect(res.pensionFullYear).toBeNull();
  });

  it('kapital utarmas aldrig när avkastning täcker uttaget', () => {
    // 10 MSEK, 6 % avkastning (600k/år), 40 000 kr/mån uttag (480k/år) → surplus
    const res = simulateUttag(10_000_000, 6, 2030, 40_000, []);
    expect(res.depletedYear).toBeNull();
    // Sista raden ska ha positivt kapital
    const last = res.rows[res.rows.length - 1];
    expect(last.capital).toBeGreaterThan(0);
  });

  it('pensionFullYear sätts när pension >= uttag från startYear', () => {
    // Pension täcker hela uttaget direkt från start
    const p = pension(2030, 50_000);
    const res = simulateUttag(500_000, 2, 2030, 50_000, [p]);
    expect(res.pensionFullYear).toBe(2030);
    expect(res.depletedYear).toBeNull();
  });

  it('pensionFullYear sätts rätt år när pension aktiveras efter 5 år', () => {
    const START = 2030;
    const p = pension(START + 5, 60_000); // pension från 2035
    // Litet kapital men pension täcker allt när den aktiveras
    const res = simulateUttag(2_000_000, 0, START, 60_000, [p]);
    expect(res.pensionFullYear).toBe(START + 5);
  });

  it('period 2: lägre uttag efter switchAfterYears minskar kapitaluttömning', () => {
    // Utan period 2: 500 000 kr, 0 % avk, 25 000 kr/mån → töms snabbt
    const without = simulateUttag(500_000, 0, 2030, 25_000, []);
    // Med period 2: efter 1 år sänks uttaget till 5 000 kr/mån → töms senare
    const with2   = simulateUttag(500_000, 0, 2030, 25_000, [], 5_000, 1);
    expect(without.depletedYear).not.toBeNull();
    expect(with2.depletedYear).not.toBeNull();
    expect(with2.depletedYear!).toBeGreaterThan(without.depletedYear!);
  });

  it('noll kapital och inga pensioner → depletedYear = startYear', () => {
    const res = simulateUttag(0, 5, 2030, 10_000, []);
    expect(res.depletedYear).toBe(2030);
  });

  it('rader täcker intervallet startYear → 2080', () => {
    const res = simulateUttag(1_000_000, 5, 2035, 30_000, []);
    expect(res.rows[0].year).toBe(2035);
    expect(res.rows[res.rows.length - 1].year).toBe(2080);
    expect(res.rows.length).toBe(2080 - 2035 + 1);
  });

  it('capitalAtBridge är positivt när pension täcker uttag innan kapital tar slut', () => {
    const p = pension(2032, 40_000);
    const res = simulateUttag(2_000_000, 3, 2030, 40_000, [p]);
    expect(res.pensionFullYear).toBe(2032);
    expect(res.capitalAtBridge).toBeGreaterThan(0);
  });
});

// ── computeFire() smoke test ───────────────────────────────────────────────────

describe('computeFire()', () => {
  it('returnerar rimliga värden med minimalt kapital', () => {
    const ek  = { ...EMPTY_EK, lysa_f_pv: 1_000_000 };
    const res = computeFire(ek, FIRE_S);
    expect(res.kapital).toBeGreaterThan(0);
    expect(res.fireYear).toBeGreaterThan(2020);
    expect(res.pensions.length).toBeGreaterThan(0);
  });

  it('borgoRanta = 0 kraschar inte', () => {
    const s   = { ...FIRE_S, borgoRanta: 0 };
    const ek  = { ...EMPTY_EK, sparkonto_pv: 500_000, sparkonto_pmt: 2_000 };
    expect(() => computeFire(ek, s)).not.toThrow();
    const res = computeFire(ek, s);
    expect(res.kapital).not.toBeNaN();
  });

  it('högre avkastning ger större kapital vid FIRE', () => {
    const ek   = { ...EMPTY_EK, lysa_f_pv: 1_000_000 };
    const low  = computeFire(ek, { ...FIRE_S, avkPct: 4 });
    const high = computeFire(ek, { ...FIRE_S, avkPct: 10 });
    expect(high.kapital).toBeGreaterThan(low.kapital);
  });
});

describe('computeFirePlan', () => {
  const today = new Date(TEST_YEAR, 0, 1);

  it('buffert = 4/3 × kvartalsbehov och nödfond = månader × levnadskostnad', () => {
    const ek = { ...EMPTY_EK, levnadskostnad: 60_000 };
    const p  = computeFirePlan(ek, FIRE_S, { nodfondManader: 3, ovrigtLikvid: 0, today });
    expect(p.steps[0].kvartalsbehov).toBe(60_000 * 3);
    expect(p.steps[0].buffertMal).toBe(240_000);
    expect(p.nodfond).toBe(180_000);
    expect(p.totalMal).toBe(420_000);
  });

  it('gap och extra månadssparande räknas mot likvida medel', () => {
    const ek = { ...EMPTY_EK, levnadskostnad: 60_000, sparkonto_pv: 0, sparkonto_pmt: 0 };
    const p  = computeFirePlan(ek, FIRE_S, { nodfondManader: 3, ovrigtLikvid: 100_000, today });
    expect(p.likvidVidFire).toBeGreaterThanOrEqual(100_000);
    expect(p.gap).toBeCloseTo(p.totalMal - p.likvidVidFire, 0);
    expect(p.monthsToFire).toBe(120);
    expect(p.extraMonthly).toBeGreaterThan(0);
  });

  it('överskott ger gap < 0 och inget extra sparande', () => {
    const ek = { ...EMPTY_EK, levnadskostnad: 10_000 };
    const p  = computeFirePlan(ek, FIRE_S, { nodfondManader: 1, ovrigtLikvid: 5_000_000, today });
    expect(p.gap).toBeLessThan(0);
    expect(p.extraMonthly).toBe(0);
  });

  it('buffertmålet sjunker när pensionsströmmar startar efter FIRE', () => {
    const ek = { ...EMPTY_EK, levnadskostnad: 60_000, allman_se_f: 20_000 };
    const p  = computeFirePlan(ek, FIRE_S, { nodfondManader: 3, ovrigtLikvid: 0, today });
    expect(p.steps.length).toBeGreaterThan(1);
    expect(p.steps[p.steps.length - 1].buffertMal).toBeLessThan(p.steps[0].buffertMal);
  });
});

describe('löneväxling', () => {
  const r26 = LONEVAXLING_RULES[2026];
  const r27 = LONEVAXLING_RULES[2027];

  it('pensionstak 2026 ≈ 56 100 kr/mån och 2027 ≈ 58 200 kr/mån', () => {
    expect(pensionTak(r26) / 12).toBeCloseTo(56_087, -1);
    expect(pensionTak(r27) / 12).toBeCloseTo(58_239, -1);
  });

  it('break-even-påslag ≈ 5,8 %', () => {
    expect(breakEvenPaslag(r26)).toBeCloseTo(0.0576, 3);
  });

  it('växlat belopp ger lägre nettominskning än bruttobeloppet över statlig skatt', () => {
    const res = computeLonevaxling(r26, 80_000, 10_000, 0);
    expect(res.nettoMinskningAr).toBeLessThan(10_000 * 12);
    expect(res.skattSparadAr).toBeGreaterThan(0);
    expect(res.nettoPerKrNetto).toBeGreaterThan(1);
  });

  it('lön under taket efter växling ger förlorad allmän pension, över taket inte', () => {
    expect(computeLonevaxling(r26, 60_000, 10_000, 0).forlorGrundPensionAr).toBeGreaterThan(0);
    expect(computeLonevaxling(r26, 80_000, 10_000, 0).forlorGrundPensionAr).toBe(0);
  });

  it('växlat belopp klampas till lönen och påslag räknas på inbetalningen', () => {
    const res = computeLonevaxling(r26, 30_000, 50_000, 5.8);
    expect(res.lonEfterMon).toBe(0);
    expect(res.tjpInsattAr).toBeCloseTo(30_000 * 12 * 1.058, 0);
  });
});

describe('löneväxling med semesterersättning', () => {
  const r26 = LONEVAXLING_RULES[2026];

  it('årslön = månadslön × 12 + 0,605 % × månadslön × semesterdagar, på lönen före växling', () => {
    const res = computeLonevaxling(r26, 50_000, 5_000, 0, 25);
    const tillagg = 50_000 * 0.00605 * 25;
    expect(res.lonForeAr).toBeCloseTo(50_000 * 12 + tillagg, 0);
    expect(res.lonEfterAr).toBeCloseTo(45_000 * 12 + tillagg, 0);
  });

  it('semesterdagstillägg kan flytta lönen över inkomsttaket', () => {
    // Tak 2026 = 673 038 kr/år; (56 100 − 20) × 12 = 672 960 → under utan tillägg, över med 25 dagars tillägg
    expect(computeLonevaxling(r26, 56_100, 20, 0, 0).underTaket).toBe(true);
    expect(computeLonevaxling(r26, 56_100, 20, 0, 25).underTaket).toBe(false);
  });
});

describe('maxVaxlingUnderTak', () => {
  const r27 = LONEVAXLING_RULES[2027];

  it('föreslaget belopp håller årslönen på eller över taket', () => {
    const v = maxVaxlingUnderTak(r27, 67_300, 32);
    expect(v).toBeGreaterThan(0);
    expect(v % 100).toBe(0);
    expect(computeLonevaxling(r27, 67_300, v, 5.8, 32).underTaket).toBe(false);
    expect(computeLonevaxling(r27, 67_300, v + 100, 5.8, 32).underTaket).toBe(true);
  });

  it('ger 0 när lönen redan ligger under taket', () => {
    expect(maxVaxlingUnderTak(r27, 40_000, 32)).toBe(0);
  });
});

describe('requiredLonForVaxling', () => {
  const r27 = LONEVAXLING_RULES[2027];

  it('ger 68 200 kr för 11 000 kr växlat med 32 semesterdagar', () => {
    expect(requiredLonForVaxling(r27, 11_000, 32)).toBe(68_200);
  });

  it('lönen som krävs håller växlingen under taket, 100 kr lägre gör det inte', () => {
    const lon = requiredLonForVaxling(r27, 11_000, 32);
    expect(computeLonevaxling(r27, lon, 11_000, 5.8, 32).underTaket).toBe(false);
    expect(computeLonevaxling(r27, lon - 100, 11_000, 5.8, 32).underTaket).toBe(true);
  });

  it('är konsistent med maxVaxlingUnderTak', () => {
    const v = maxVaxlingUnderTak(r27, 67_300, 32);
    expect(requiredLonForVaxling(r27, v, 32)).toBeLessThanOrEqual(67_300);
  });
});
