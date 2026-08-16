import { describe, it, expect } from 'vitest';
import { fv, pmt, computeNV, computeFire, incomeTax, simulateUttag, STATLIG_GRANS } from '../calculations';
import type { PensionStream } from '../types';
import type { EkonomiData, FireSettings } from '../types';

// ── Hjälp: minimala testdata ───────────────────────────────────────────────────

const EMPTY_EK: EkonomiData = {
  lysa_f_pv: 0, lysa_f_pmt: 0, lysa_u_pv: 0, lysa_u_pmt: 0,
  buffert_u_pv: 0, buffert_u_pmt: 0,
  tjp_f_pv: 0, tjp_f_pmt_q: 0, lonevxl_pv: 0, lonevxl_pmt: 0,
  tidigare_pv: 0, kapan_pv: 0, tjp_u_pv: 0, tjp_u_pmt_q: 0,
  norge_f_pv: 0, dnb_f_pv: 0, sb_f_pv: 0, sb_u_pv: 0, dnb_u_pv: 0,
  sparkonto_pv: 0, sparkonto_pmt: 0,
  ap_f: 0, ap_u: 0, nav_f_nok: 0, nav_u_nok: 0, nok_sek: 0.97,
  pp_f: 0, pp_u: 0,
  norco_antal: 0, norco_kurs: 0, oncop_antal: 0, oncop_kurs: 0,
  brutto_f: 0, brutto_u: 0,
  allman_se_f: 0, allman_se_u: 0, norsk_f: 0, norsk_u: 0,
  villa_varde: 0, villa_lan: 0, villa_amor: 0,
  lagenhet_varde: 0, lagenhet_lan: 0, lagenhet_amor: 0,
  levnadskostnad: 30_000, levnadskostnad2: 0, exp_switch_ar: 0,
};

const FIRE_S: FireSettings = {
  avkPct: 8, antalAr: 10, uttakAvkPct: 2, tjpAr: 20,
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
    const ek = { ...EMPTY_EK, norco_antal: 100, norco_kurs: 50 };
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
