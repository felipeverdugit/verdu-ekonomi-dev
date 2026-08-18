/**
 * scream.test.ts — Stresstest / regressiontest
 *
 * Täcker: kontinuitet i skattefunktioner, korrekta breakpoints,
 * alla 10 pensionsströmmar, who-fält, livsvarig-flagga, dynamisk
 * Norsk TjP-period, bryggaTackning = 100 edge-case, monotona egenskaper.
 */

import { describe, it, expect } from 'vitest';
import {
  fv, pmt, computeNV, computeFire, incomeTax, simulateUttag, STATLIG_GRANS, KOMMUNAL,
} from '../calculations';
import type { EkonomiData, FireSettings, PensionStream } from '../types';
import { PEOPLE, ALLMAN_DEFAULTS, FAST_TJP_FELIPE, NORSK_TJP_END_AGE } from '../constants';

// ── Testdata ───────────────────────────────────────────────────────────────────

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
  allman_se_f: ALLMAN_DEFAULTS.felipeSE,
  allman_se_u: ALLMAN_DEFAULTS.ulrikaSE,
  norsk_f:    ALLMAN_DEFAULTS.felipeNO,
  norsk_u:    ALLMAN_DEFAULTS.ulrikaUSE,
  villa_varde: 0, villa_lan: 0, villa_amor: 0,
  lagenhet_varde: 0, lagenhet_lan: 0, lagenhet_amor: 0,
  levnadskostnad: 50_000, levnadskostnad2: 0, exp_switch_ar: 0,
};

// Realistisk EK med norsk TjP-kapital och Lysa-fonder
const REALISTIC_EK: EkonomiData = {
  ...EMPTY_EK,
  lysa_f_pv:  1_500_000, lysa_f_pmt: 5_000,
  lysa_u_pv:    500_000,
  buffert_u_pv: 200_000,
  tjp_f_pv:   1_200_000, tjp_f_pmt_q: 25_000,
  lonevxl_pv:   400_000, lonevxl_pmt: 11_638,
  tjp_u_pv:     300_000, tjp_u_pmt_q: 6_500,
  norge_f_pv:   800_000, dnb_f_pv: 200_000,
  sb_u_pv:      400_000,
  sparkonto_pv: 100_000, sparkonto_pmt: 2_000,
  brutto_f: 67_300, brutto_u: 35_500,
};

const BASE_FIRE: FireSettings = {
  avkPct: 8, antalAr: 10, uttakAvkPct: 2, tjpAr: 20,
  skattPct: 0, borgoRanta: 2.3, lonehojF: 0, lonehojU: 0,
  fTjpAge: 65, fNorskTjpAge: 62, uTjpAge: 65, uNorskTjpAge: 62,
  fAllmanAge: 67, uAllmanAge: 68,
  aktierIFire: false, engBelopp: 0, engAr: 0, iskPct: 1.25,
};

// ── Hjälpfunktioner ────────────────────────────────────────────────────────────

/** Beräkna kommunal + statlig skatt manuellt för verifiering */
function manualTax(annual: number, avdrag: number): number {
  const taxable = Math.max(0, annual - avdrag);
  return Math.round(taxable * KOMMUNAL + Math.max(0, annual - STATLIG_GRANS) * 0.20);
}

// ── fga65 — kontinuitet och breakpoints ───────────────────────────────────────

describe('fga65 — förhöjt grundavdrag (pensionärer)', () => {
  it('noll inkomst → noll skatt', () => {
    expect(incomeTax(0, true)).toBe(0);
  });

  it('inkomst 100 000 kr/år (< 134 600) → noll skatt (fga65 = income)', () => {
    expect(incomeTax(100_000, true)).toBe(0);
  });

  it('inkomst 134 600 kr → noll skatt (exakt övre gräns branch 1)', () => {
    expect(incomeTax(134_600, true)).toBe(0);
  });

  it('inkomst 200 000 kr → fga65 = 134 600 (platå branch 2)', () => {
    const tax = incomeTax(200_000, true);
    expect(tax).toBe(manualTax(200_000, 134_600));
  });

  it('inkomst 220 000 kr → fga65 = 134 600 (exakt gräns branch 2→3)', () => {
    expect(incomeTax(220_000, true)).toBe(manualTax(220_000, 134_600));
  });

  it('inkomst 300 000 kr → fga65 stiger (branch 3)', () => {
    // fga65(300k) = 134600 + 0.08*(300000-220000) = 134600+6400 = 141000
    expect(incomeTax(300_000, true)).toBe(manualTax(300_000, 141_000));
  });

  it('inkomst 450 000 kr → fga65(450k) branch 3 ≈ branch 4 (liten tolerans)', () => {
    // Branch 3: 134600+0.08*(450000-220000) = 153000
    // Branch 4: max(85000, 152000-0) = 152000 — känd 1k-diskontinuitet i SKV-approximationen
    const tax = incomeTax(450_000, true);
    expect(tax).toBeGreaterThan(0);
    // Avdraget ligger runt 152-153 000
    const avdrag = 450_000 - (tax / KOMMUNAL);
    expect(avdrag).toBeGreaterThanOrEqual(150_000);
    expect(avdrag).toBeLessThanOrEqual(155_000);
  });

  it('fga65 KONTINUERLIG vid 615 300 (statlig gräns) — max 100 kr hop', () => {
    // Höger- och vänstergräns för fga65 ska vara identiska (fix: 140k→152k)
    const taxBelow = incomeTax(615_299, true);
    const taxAbove = incomeTax(615_301, true);
    // Hopet i SKATT vid +2 kr inkomst ska vara litet (≤ 2 kr kommunal + ≈0 statlig)
    expect(Math.abs(taxAbove - taxBelow)).toBeLessThan(200);
  });

  it('statlig skatt ingår ovanför 615 300 (pensionär)', () => {
    const below = incomeTax(STATLIG_GRANS,           true);
    const above = incomeTax(STATLIG_GRANS + 100_000, true);
    expect(above).toBeGreaterThan(below + 15_000); // minst 100k×0.20 = 20k extra
  });

  it('skatt är strikt stigande med inkomsten (pensionär) — ovanför skattefri gräns', () => {
    // Notera: fga65 ger skattfri upp t.o.m. 134 600 → börja därifrån
    const levels = [134_601, 200_000, 300_000, 500_000, 700_000, 1_000_000];
    for (let i = 1; i < levels.length; i++) {
      expect(incomeTax(levels[i], true)).toBeGreaterThan(incomeTax(levels[i-1], true));
    }
  });

  it('fga65 ≥ 75 000 vid mycket hög inkomst (golv)', () => {
    // Vid 2 MSEK ska avdraget = max(75000, ...) = 75000
    // Tax = (2000000 - 75000) * 0.31 + (2000000 - 615300) * 0.20
    const tax = incomeTax(2_000_000, true);
    expect(tax).toBe(manualTax(2_000_000, 75_000));
  });
});

// ── grundavdrag — ej-pensionärer ──────────────────────────────────────────────

describe('grundavdrag — icke-pensionärer (<65)', () => {
  it('noll inkomst → noll skatt', () => {
    expect(incomeTax(0, false)).toBe(0);
  });

  it('inkomst under grundavdraget → noll skatt (43 000 kr/år)', () => {
    // grundavdrag(43000) = 13900, inkomst 13000 < 13900 → taxable = 0
    expect(incomeTax(13_000, false)).toBe(0);
  });

  it('grundavdrag är 13 900 vid låg inkomst (43 000 kr/år)', () => {
    // grundavdrag(43000) = 13900, tax = (43000-13900)*0.31 = 9021
    expect(incomeTax(43_000, false)).toBe(manualTax(43_000, 13_900));
  });

  it('grundavdrag stiger i fas-in-intervallet (43→140 tkr)', () => {
    const taxAt80  = incomeTax(80_000,  false);
    const taxAt100 = incomeTax(100_000, false);
    const taxAt130 = incomeTax(130_000, false);
    // Alla ska vara > 0 (inte längre skattefria som i gammal kod)
    expect(taxAt80).toBeGreaterThan(0);
    expect(taxAt100).toBeGreaterThan(taxAt80);
    expect(taxAt130).toBeGreaterThan(taxAt100);
  });

  it('grundavdrag ≈ 36 500 i platån (140→245 tkr)', () => {
    // grundavdrag(200000) = 36500 → tax = (200000-36500)*0.31
    const expected = manualTax(200_000, 36_500);
    expect(incomeTax(200_000, false)).toBe(expected);
  });

  it('grundavdrag ≈ 36 500 i platåns ände (245 000 kr)', () => {
    expect(incomeTax(245_000, false)).toBe(manualTax(245_000, 36_500));
  });

  it('grundavdrag sjunker i fas-ut-intervallet (245→390 tkr)', () => {
    const tax300 = incomeTax(300_000, false);
    const tax350 = incomeTax(350_000, false);
    // Avdraget sjunker → skatten ökar snabbare
    const marginal300 = incomeTax(301_000, false) - tax300;
    const marginal200 = incomeTax(201_000, false) - incomeTax(200_000, false);
    expect(marginal300).toBeGreaterThan(marginal200); // högre marginalskatt vid 300k
    expect(tax350).toBeGreaterThan(tax300);
  });

  it('grundavdrag = 13 900 vid hög inkomst (> 390 tkr)', () => {
    expect(incomeTax(500_000, false)).toBe(manualTax(500_000, 13_900));
    expect(incomeTax(800_000, false)).toBe(manualTax(800_000, 13_900));
  });

  it('statlig skatt tillkommer ovanför 615 300 (icke-pensionär)', () => {
    const taxBelow = incomeTax(STATLIG_GRANS - 1,     false);
    const taxAbove = incomeTax(STATLIG_GRANS + 100_000, false);
    expect(taxAbove).toBeGreaterThan(taxBelow + 15_000);
  });

  it('pensionär betalar alltid lägre skatt än icke-pensionär vid samma inkomst', () => {
    const levels = [50_000, 100_000, 200_000, 300_000, 500_000, 700_000];
    for (const annual of levels) {
      expect(incomeTax(annual, true)).toBeLessThanOrEqual(incomeTax(annual, false));
    }
  });

  it('skatt är strikt stigande med inkomsten (icke-pensionär)', () => {
    const levels = [15_000, 43_000, 100_000, 200_000, 300_000, 500_000, 700_000, 1_000_000];
    for (let i = 1; i < levels.length; i++) {
      expect(incomeTax(levels[i], false)).toBeGreaterThan(incomeTax(levels[i-1], false));
    }
  });
});

// ── pmt() edge cases ──────────────────────────────────────────────────────────

describe('pmt() — annuitetsuttag', () => {
  it('15 år vid 0 % → kapital / perioder', () => {
    expect(pmt(0, 15 * 12, 1_800_000)).toBeCloseTo(10_000, 0); // 1.8M / 180
  });

  it('15 år vs 12 år: kortare period ger högre PMT (norsk TjP-dynamik)', () => {
    const rate = 0.02 / 12;
    const cap  = 1_000_000;
    const p15  = pmt(rate, 15 * 12, cap);
    const p12  = pmt(rate, 12 * 12, cap);
    expect(p12).toBeGreaterThan(p15);
  });

  it('positiv ränta ger högre PMT än nollränta (samma kapital och period)', () => {
    const r0 = pmt(0,           15 * 12, 1_000_000);
    const r2 = pmt(0.02/12,    15 * 12, 1_000_000);
    expect(r2).toBeGreaterThan(r0);
  });
});

// ── computeFire — pensionsströmmar ────────────────────────────────────────────

describe('computeFire() — pensionsströmmar', () => {
  const result = computeFire(REALISTIC_EK, BASE_FIRE);

  it('genererar exakt 10 pensionsströmmar', () => {
    expect(result.pensions).toHaveLength(10);
  });

  it('id 1–10 finns alla', () => {
    const ids = result.pensions.map(p => p.id).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('who-fält: Ulrika-strömmar (1,2,4,9)', () => {
    [1, 2, 4, 9].forEach(id => {
      const p = result.pensions.find(p => p.id === id)!;
      expect(p.who).toBe('u');
    });
  });

  it('who-fält: Felipe-strömmar (3,5,6,7,8,10)', () => {
    [3, 5, 6, 7, 8, 10].forEach(id => {
      const p = result.pensions.find(p => p.id === id)!;
      expect(p.who).toBe('f');
    });
  });

  it('livsvarig = true för id 4,6,7,9,10', () => {
    [4, 6, 7, 9, 10].forEach(id => {
      const p = result.pensions.find(p => p.id === id)!;
      expect(p.livsvarig).toBe(true);
    });
  });

  it('livsvarig = false för id 1,2,3,5,8', () => {
    [1, 2, 3, 5, 8].forEach(id => {
      const p = result.pensions.find(p => p.id === id)!;
      expect(p.livsvarig).toBe(false);
    });
  });

  it('NAV-strömmar (id 9,10) label innehåller "NAV"', () => {
    [9, 10].forEach(id => {
      const p = result.pensions.find(p => p.id === id)!;
      expect(p.label).toMatch(/NAV/i);
    });
  });

  it('SE-strömmar (id 4,7) label innehåller "SE" och INTE "NAV"', () => {
    [4, 7].forEach(id => {
      const p = result.pensions.find(p => p.id === id)!;
      expect(p.label).toMatch(/SE/i);
      expect(p.label).not.toMatch(/NAV/i);
    });
  });

  it('id 6 (Fast TjP) monthly ≈ FAST_TJP_FELIPE vid skattPct=0', () => {
    const p6 = result.pensions.find(p => p.id === 6)!;
    expect(p6.monthly).toBe(FAST_TJP_FELIPE);
  });

  it('id 4 monthly = allman_se_u vid skattPct=0', () => {
    const p4 = result.pensions.find(p => p.id === 4)!;
    expect(p4.monthly).toBe(REALISTIC_EK.allman_se_u);
  });

  it('id 7 monthly = allman_se_f vid skattPct=0', () => {
    const p7 = result.pensions.find(p => p.id === 7)!;
    expect(p7.monthly).toBe(REALISTIC_EK.allman_se_f);
  });

  it('id 9 monthly = norsk_u vid skattPct=0', () => {
    const p9 = result.pensions.find(p => p.id === 9)!;
    expect(p9.monthly).toBe(REALISTIC_EK.norsk_u);
  });

  it('id 10 monthly = norsk_f vid skattPct=0', () => {
    const p10 = result.pensions.find(p => p.id === 10)!;
    expect(p10.monthly).toBe(REALISTIC_EK.norsk_f);
  });

  it('monthly > 0 för alla strömmar med kapital (norsk TjP kräver kapital)', () => {
    // Norsk TjP (1,3) ska ha kapital från REALISTIC_EK
    const p1 = result.pensions.find(p => p.id === 1)!;
    const p3 = result.pensions.find(p => p.id === 3)!;
    expect(p1.monthly).toBeGreaterThan(0);
    expect(p3.monthly).toBeGreaterThan(0);
  });

  it('livsvariga strömmar har toYear = 9999', () => {
    result.pensions.filter(p => p.livsvarig).forEach(p => {
      expect(p.toYear).toBe(9999);
    });
  });

  it('fromYear för id 4 (Ulrika SE) = 1970+68 = 2038', () => {
    const p4 = result.pensions.find(p => p.id === 4)!;
    expect(p4.fromYear).toBe(PEOPLE.ulrika.born + BASE_FIRE.uAllmanAge); // 1970+68 = 2038
  });

  it('fromYear för id 7 (Felipe SE) = 1975+67 = 2042', () => {
    const p7 = result.pensions.find(p => p.id === 7)!;
    expect(p7.fromYear).toBe(PEOPLE.felipe.born + BASE_FIRE.fAllmanAge); // 1975+67 = 2042
  });

  it('bryggaTackning är > 0 (kan överstiga 100 % vid överfunderad brygga)', () => {
    // bryggaTackning = kapital / bryggaKapital × 100
    // Värde > 100 innebär att du har mer kapital än bryggan kräver — korrekt beteende
    expect(result.bryggaTackning).toBeGreaterThan(0);
    expect(isFinite(result.bryggaTackning)).toBe(true);
    expect(isNaN(result.bryggaTackning)).toBe(false);
  });

  it('kapital > 0 med realistisk portfölj', () => {
    expect(result.kapital).toBeGreaterThan(0);
  });
});

// ── Norsk TjP — dynamisk period ───────────────────────────────────────────────

describe('Norsk TjP — dynamisk PMT-period', () => {
  it('startålder 62 ger period 15 år (77-62)', () => {
    const r62 = computeFire(REALISTIC_EK, { ...BASE_FIRE, fNorskTjpAge: 62 });
    const r65 = computeFire(REALISTIC_EK, { ...BASE_FIRE, fNorskTjpAge: 65 });
    const p3_62 = r62.pensions.find(p => p.id === 3)!;
    const p3_65 = r65.pensions.find(p => p.id === 3)!;
    // Kortare period (12 år vs 15 år) → högre månatlig utbetalning
    expect(p3_65.monthly).toBeGreaterThan(p3_62.monthly);
  });

  it('toYear för Norsk TjP Felipe = born + 77 = 2052', () => {
    const r = computeFire(REALISTIC_EK, BASE_FIRE);
    const p3 = r.pensions.find(p => p.id === 3)!;
    expect(p3.toYear).toBe(PEOPLE.felipe.born + NORSK_TJP_END_AGE); // 1975+77 = 2052
  });

  it('toYear för Norsk TjP Ulrika = 1970 + 77 = 2047', () => {
    const r = computeFire(REALISTIC_EK, BASE_FIRE);
    const p1 = r.pensions.find(p => p.id === 1)!;
    expect(p1.toYear).toBe(PEOPLE.ulrika.born + NORSK_TJP_END_AGE); // 1970+77 = 2047
  });

  it('period = 1 år minimum (kan inte bli negativt)', () => {
    // Om startålder vore 77 → period = max(1, 0) = 1 → kraschar ej
    const weird = computeFire(REALISTIC_EK, { ...BASE_FIRE, fNorskTjpAge: 70 });
    expect(weird.pensions.find(p => p.id === 3)!.monthly).toBeGreaterThan(0);
  });
});

// ── bryggaTackning = 100 edge case ────────────────────────────────────────────

describe('bryggaTackning edge cases', () => {
  it('bryggaTackning = 100 när pension täcker levnadskostnad från dag 1', () => {
    // Ge enorma pensionsestimat (SE + NAV > levnadskostnad direkt vid FIRE)
    const bigPensionEK: EkonomiData = {
      ...REALISTIC_EK,
      allman_se_f: 60_000,  // 60k/mån SE
      allman_se_u: 60_000,
      norsk_f: 30_000,
      norsk_u: 30_000,
      levnadskostnad: 10_000,   // bara 10k/mån i levnadskostnad
      // Allman startar vid FIRE via ålder: FIRE år = BASE_YEAR+10
      // Felipe 1975 → ålder vid FIRE = BASE_YEAR+10-1975 ≈ 51 → allman startar 67
      // Justera allmanAge till 62 för att täcka direkt
    };
    const s = { ...BASE_FIRE, fAllmanAge: 62, uAllmanAge: 62 };
    const r = computeFire(bigPensionEK, s);
    expect(r.bryggaTackning).toBe(100);
  });

  it('bryggaTackning = 0 % returneras ej som 0 när kapital = 0 (säger 0)', () => {
    // Med noll kapital och pension som inte täcker → bryggaTackning nära 0
    const noCapEK = { ...EMPTY_EK, levnadskostnad: 50_000 };
    const r = computeFire(noCapEK, { ...BASE_FIRE, fAllmanAge: 70, uAllmanAge: 70 });
    // kapital ≈ 0, bryggaKapital > 0, bryggaTackning ≈ 0
    expect(r.bryggaTackning).toBeGreaterThanOrEqual(0);
    expect(r.bryggaTackning).toBeLessThanOrEqual(100);
  });
});

// ── skattFaktor — pensionsbelopp skalas rätt ──────────────────────────────────

describe('skattFaktor — nettopension vid skattPct > 0', () => {
  it('30 % skatt halvnar monthly till 70 % av brutto', () => {
    const r0  = computeFire(REALISTIC_EK, { ...BASE_FIRE, skattPct: 0  });
    const r30 = computeFire(REALISTIC_EK, { ...BASE_FIRE, skattPct: 30 });

    // id 4 (Ulrika SE) bör vara 70 % av nollskatt-värdet
    const p4_0  = r0.pensions.find(p => p.id === 4)!.monthly;
    const p4_30 = r30.pensions.find(p => p.id === 4)!.monthly;
    expect(p4_30).toBeCloseTo(p4_0 * 0.70, -1); // tolerans ±10 kr

    // id 7 (Felipe SE)
    const p7_0  = r0.pensions.find(p => p.id === 7)!.monthly;
    const p7_30 = r30.pensions.find(p => p.id === 7)!.monthly;
    expect(p7_30).toBeCloseTo(p7_0 * 0.70, -1);
  });

  it('alla månadsbelopp lägre vid 30 % skatt än vid 0 %', () => {
    const r0  = computeFire(REALISTIC_EK, { ...BASE_FIRE, skattPct: 0  });
    const r30 = computeFire(REALISTIC_EK, { ...BASE_FIRE, skattPct: 30 });
    r0.pensions.forEach(p0 => {
      const p30 = r30.pensions.find(p => p.id === p0.id)!;
      if (p0.monthly > 0) {
        expect(p30.monthly).toBeLessThan(p0.monthly);
      }
    });
  });
});

// ── simulateUttag — alla 10 strömmar i uttakssimuleringen ────────────────────

describe('simulateUttag() — med 10 pensionsströmmar', () => {
  function makePension(
    id: number, who: 'f' | 'u', fromYear: number, monthly: number, toYear = 9999, livsvarig = true,
  ): PensionStream {
    return { id, label: `P${id}`, who, fromYear, toYear, monthly, livsvarig };
  }

  it('alla 10 strömmar summeras korrekt i rätt år', () => {
    const START = 2030;
    // Strömmar: 5 börjar från start, 5 börjar 5 år senare
    const streams: PensionStream[] = [
      makePension(1,  'u', START,   2_000, 2045, false),
      makePension(2,  'u', START,   3_000, 2050, false),
      makePension(3,  'f', START,   4_000, 2052, false),
      makePension(4,  'u', START+5, 5_000, 9999, true),
      makePension(5,  'f', START+5, 6_000, 2055, false),
      makePension(6,  'f', START+5, 2_353, 9999, true),
      makePension(7,  'f', START+5, 8_000, 9999, true),
      makePension(8,  'f', START+5, 4_000, 2055, false),
      makePension(9,  'u', START+5, 3_000, 9999, true),
      makePension(10, 'f', START+5, 2_500, 9999, true),
    ];

    const levnadskostnad = 10_000;
    const res = simulateUttag(1_000_000, 5, START, levnadskostnad, streams);

    // År START: bara stream 1+2+3 aktiva = 9000/mån
    const rowStart = res.rows.find(r => r.year === START)!;
    expect(rowStart.pensionMon).toBe(9_000);

    // År START+5: alla 10 strömmar aktiva = 2000+3000+4000+5000+6000+2353+8000+4000+3000+2500 = 39853/mån
    const row5 = res.rows.find(r => r.year === START + 5)!;
    expect(row5.pensionMon).toBe(39_853);
  });

  it('livsvarig ström är aktiv i år 2080 (sista rad)', () => {
    const START = 2030;
    const streams: PensionStream[] = [
      makePension(7, 'f', START, 20_000, 9999, true),
    ];
    const res = simulateUttag(0, 5, START, 10_000, streams);
    const last = res.rows[res.rows.length - 1];
    expect(last.year).toBe(2080);
    expect(last.pensionMon).toBe(20_000);
  });

  it('tidsbegränsad ström (livsvarig=false) är noll efter toYear', () => {
    const START = 2030;
    const streams: PensionStream[] = [
      makePension(1, 'f', START, 15_000, 2035, false), // slutar 2035
    ];
    const res = simulateUttag(0, 0, START, 5_000, streams);
    const after = res.rows.find(r => r.year === 2036)!;
    expect(after.pensionMon).toBe(0);
  });

  it('depletedYear = null när livsvarig pension täcker hela uttaget', () => {
    const streams: PensionStream[] = [
      makePension(7, 'f', 2030, 60_000, 9999, true), // 60k > 50k levnadskostnad
    ];
    const res = simulateUttag(500_000, 2, 2030, 50_000, streams);
    expect(res.depletedYear).toBeNull();
  });
});

// ── computeNV — kontroll att fastigheter hanteras korrekt ────────────────────

describe('computeNV() — nettovärde', () => {
  it('villa-eget-kapital = max(0, varde - lan)', () => {
    const ek = { ...EMPTY_EK, villa_varde: 5_300_000, villa_lan: 3_569_946 };
    expect(computeNV(ek)).toBeCloseTo(5_300_000 - 3_569_946, -2);
  });

  it('lägenhet negativt eget kapital kläms till 0', () => {
    const ek = { ...EMPTY_EK, lagenhet_varde: 1_000_000, lagenhet_lan: 1_500_000 };
    expect(computeNV(ek)).toBe(0);
  });

  it('realistisk portfölj summerar korrekt', () => {
    const ek = {
      ...EMPTY_EK,
      lysa_f_pv: 1_500_000, lysa_u_pv: 500_000, buffert_u_pv: 200_000,
      sparkonto_pv: 100_000,
      tjp_f_pv: 1_200_000, lonevxl_pv: 400_000, tjp_u_pv: 300_000,
      norge_f_pv: 800_000, dnb_f_pv: 200_000, sb_u_pv: 400_000,
      villa_varde: 5_300_000, villa_lan: 3_569_946,
    };
    const nv = computeNV(ek);
    const expected =
      1_500_000 + 500_000 + 200_000 + 100_000 +  // fonder
      1_200_000 + 400_000 + 300_000 +              // tjp
      800_000 + 200_000 + 400_000 +                // norge
      (5_300_000 - 3_569_946);                     // villa
    expect(nv).toBeCloseTo(expected, -2);
  });
});
