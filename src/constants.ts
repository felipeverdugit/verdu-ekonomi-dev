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
export const AP_INDEX_RATE = 0.03;   // 3 % per år
export const AP_IBB        = 77_400;
export const AP_TAK        = 7.5 * AP_IBB; // ~580 500 kr/år

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
  fAllmanAge:    { min: 62, max: 70, step: 1   },
  uAllmanAge:    { min: 62, max: 70, step: 1   },
} as const;

// ── Sidonavigation ────────────────────────────────────────────────────────────
export const NAV_LINKS = [
  { href: 'index.html',   label: 'Dashboard',  icon: '🏠' },
  { href: 'ekonomi.html', label: 'Ekonomi',    icon: '💰' },
  { href: 'fire.html',    label: 'FIRE',        icon: '🔥' },
  { href: 'uttag.html',   label: 'Uttag',       icon: '📊' },
] as const;
