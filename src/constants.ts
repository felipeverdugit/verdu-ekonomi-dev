// ── Personkonstanter ──────────────────────────────────────────────────────────
export const PEOPLE = {
  felipe: { name: 'Felipe', born: 1975 },
  ulrika: { name: 'Ulrika', born: 1970 },
} as const;

// ── Fasta pensionsbelopp ──────────────────────────────────────────────────────
export const FAST_TJP_FELIPE = 2353; // KPA 334 + Alecta 1637 + Kåpan 382 kr/mån
export const FAST_TJP_AGE    = 65;   // Livsvarig från 65 år

// Norsk OTP (privat tjänstepension) betalas ut 62→77 år (15 år)
export const NORSK_TJP_START_AGE = 62;
export const NORSK_TJP_END_AGE   = 77;
export const NORSK_TJP_PERIOD    = NORSK_TJP_END_AGE - NORSK_TJP_START_AGE; // 15 år

// ── Allmänpension — default-estimat (skrivs över av calcAP) ──────────────────
// Garantipension nollställs pga EES 883/2004-samordning med norsk garantipensjon
export const ALLMAN_DEFAULTS = {
  felipeSE:  18700, // IP+PP Sweden kr/mån
  ulrikaSE:  16800,
  felipeNO:   9406, // NAV inntektspension (enbart inntekt, ej garanti)
  ulrikaUSE:  9000,
} as const;

// ── Skattekoefficienter ───────────────────────────────────────────────────────
// Slidern i FIRE-rapporten justerar detta — defaultvärde 0 % (brutto = netto)
export const DEFAULT_SKATT_PCT = 0;

// ── Inkomstpension-index ──────────────────────────────────────────────────────
export const AP_INDEX_RATE = 0.019;  // 1,9 % (pensionsmyndigheten 2025/2026)
export const AP_IBB        = 89_680; // Inkomstbasbelopp 2026
export const AP_TAK        = 7.5 * AP_IBB; // 672 600 kr/år = 56 050 kr/mån
export const PP_RATE       = 0.025;  // 2,5 % av pensionsgrundande inkomst

// ── Slider-defaultvärden ──────────────────────────────────────────────────────
export const SLIDER_DEFAULTS = {
  avkPct:        10,   // Årsavkastning ackumuleringsfas %
  antalAr:       10,   // År till FIRE
  uttakAvkPct:    2,   // Uttaksavkastning %
  tjpAr:         20,   // TjP uttaksperiod (år)
  skattPct:       0,   // Skatt på pensionsinkomster %
  borgoRanta:   2.3,   // Borgensränta / sparkonto %
  lonehojF:       0,   // Löneökning Felipe %
  lonehojU:       0,   // Löneökning Ulrika %
  sparandel:    100,   // Andel av nettolön som sparas %
  fTjpAge:       65,   // Felipe: Svensk TjP startålder
  fNorskTjpAge:  62,   // Felipe: Norsk TjP startålder
  uTjpAge:       65,   // Ulrika: Svensk TjP startålder
  uNorskTjpAge:  62,   // Ulrika: Norsk TjP startålder
  fAllmanAge:    67,   // Felipe: Allmänpension startålder
  uAllmanAge:    68,   // Ulrika: Allmänpension startålder
  iskPct:      1.25,   // ISK-schablonskatt %/år
} as const;

// ── Slider-gränser ────────────────────────────────────────────────────────────
export const SLIDER_RANGES = {
  avkPct:        { min: 0,  max: 15, step: 0.5 },
  antalAr:       { min: 1,  max: 20, step: 1   },
  uttakAvkPct:   { min: 0,  max: 8,  step: 0.5 },
  tjpAr:         { min: 5,  max: 30, step: 1   },
  skattPct:      { min: 0,  max: 40, step: 1   },
  borgoRanta:    { min: 0,  max: 6,  step: 0.1 },
  lonehojF:      { min: 0,  max: 10, step: 0.5 },
  lonehojU:      { min: 0,  max: 10, step: 0.5 },
  sparandel:     { min: 10, max: 100,step: 5   },
  fTjpAge:       { min: 55, max: 70, step: 1   },
  fNorskTjpAge:  { min: 62, max: 70, step: 1   },
  uTjpAge:       { min: 55, max: 70, step: 1   },
  uNorskTjpAge:  { min: 62, max: 70, step: 1   },
  fAllmanAge:    { min: 62, max: 70, step: 1    },
  uAllmanAge:    { min: 62, max: 70, step: 1    },
  iskPct:        { min: 0,  max: 2.5, step: 0.05 },
} as const;

// ── Google Sheets sync ───────────────────────────────────────────────────────
export const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxtwNDdYA5r412iinnItbLoPO87AQZ3D8Fmjg7oHsQE76C9-1tilYORjbbgR4OtnY2Pjw/exec';

// Mapping: Sheets-nyckel → EkonomiData-fält
// PMT-värden som saknas i Sheets är hämtade från Excel via Python (senast kända)
export const SHEETS_MAP: Record<string, string> = {
  ek_bal_lysaf:       'lysa_f_pv',
  ek_spar_lysaf:      'lysa_f_pmt',
  ek_bal_lysau:       'lysa_u_pv',
  ek_spar_lysau:      'lysa_u_pmt',
  ek_bal_buffert:     'buffert_u_pv',
  ek_spar_buffert:    'buffert_u_pmt',
  ek_bal_tjpf:        'tjp_f_pv',
  ek_bal_lonevxl:     'lonevxl_pv',
  ek_bal_tidligare:   'tidigare_pv',
  ek_bal_kapan:       'kapan_pv',
  ek_bal_tjpu:        'tjp_u_pv',
  ek_bal_norgef:      'norge_f_pv',
  ek_bal_dnbf:        'dnb_f_pv',
  ek_bal_sbf:         'sb_f_pv',
  ek_bal_sbu:         'sb_u_pv',
  ek_bal_dnbu:        'dnb_u_pv',
  ek_bal_sparkonto:   'sparkonto_pv',
  ek_spar_borgo:      'sparkonto_pmt',
  ek_bal_ap_f:        'ap_f',
  ek_bal_ap_u:        'ap_u',
  ek_bal_nav_f:       'nav_f_nok',
  ek_bal_nav_u:       'nav_u_nok',
  ek_bal_nok_sek:     'nok_sek',
  ek_bal_pp_f:        'pp_f',
  ek_bal_pp_u:        'pp_u',
  ek_bal_norco_antal: 'norco_antal',
  ek_bal_norco_kurs:  'norco_kurs',
  ek_bal_oncop_antal: 'oncop_antal',
  ek_bal_oncop_kurs:  'oncop_kurs',
  ek_brutto_f:        'brutto_f',
  ek_brutto_u:        'brutto_u',
  ek_levnadskostnad:  'levnadskostnad',
};

// PMT-värden som saknas i Sheets (från Excel-källa)
export const EXCEL_PMTS = {
  tjp_f_pmt_q:  25000,  // TjP Kommun Felipe, kr/kvartal
  lonevxl_pmt:  11638,  // Löneväxling, kr/månad
  tjp_u_pmt_q:  6500,   // TjP Kommun Ulrika, kr/kvartal
};

// ── Kreditkort (sekundär buffert) ─────────────────────────────────────────────
export const KREDITKORT = [
  { label: 'MC — LF (#1)',     limit: 70_000 },
  { label: 'MC — DNB',        limit: 150_000 },
  { label: 'MC — LF (#2)',    limit: 30_000 },
  { label: 'VISA — Norwegian', limit: 150_000 },
] as const;

// ── Sidonavigation ────────────────────────────────────────────────────────────
export const NAV_LINKS = [
  { href: 'index.html',   label: 'Dashboard',  icon: '🏠' },
  { href: 'ekonomi.html', label: 'Ekonomi',    icon: '💰' },
  { href: 'fire.html',    label: 'Brygga',      icon: '🌉' },
  { href: 'uttag.html',   label: 'Uttag',       icon: '📊' },
  { href: 'hinkar.html',   label: 'Hinkar',      icon: '🪣' },
  { href: 'historik.html', label: 'Historik',    icon: '📈' },
  { href: 'skatt.html',   label: 'Skatt',        icon: '🧾' },
  { href: 'budget.html',   label: 'Budget',    icon: '📋' },
  { href: 'kvartal.html', label: 'Kvartal',   icon: '📅' },
] as const;
