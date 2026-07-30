// ── Portfolio-konton ──────────────────────────────────────────────────────────
export interface Account {
  name: string;
  pv: number;          // Nuvarande värde (kr)
  pmt: number;         // Periodisk insättning (kr)
  freq: 'monthly' | 'quarterly';
  workRelated: boolean; // Insättningar slutar vid FIRE
}

// ── Ekonomidata (från ekonomi.html) ──────────────────────────────────────────
// Allt som användaren matar in om sin ekonomiska situation
export interface EkonomiData {
  // Privata fonder
  lysa_f_pv:       number;  // Lysa Felipe, nuv. värde
  lysa_f_pmt:      number;  // Lysa Felipe, månadsinsättning
  lysa_u_pv:       number;
  lysa_u_pmt:      number;
  buffert_u_pv:    number;  // Buffert Lysa Ulrika
  buffert_u_pmt:   number;

  // Tjänstepension Sverige
  tjp_f_pv:        number;  // TjP Kommun Felipe, nuv. värde
  tjp_f_pmt_q:     number;  // TjP Felipe, kvartalsinsättning
  lonevxl_pv:      number;  // Löneväxling, nuv. värde
  lonevxl_pmt:     number;  // Löneväxling, månadsinsättning
  tidigare_pv:     number;  // Tidigare LöneVXL+TjP, nuv. värde
  kapan_pv:        number;  // TjP Kåpan Felipe, nuv. värde
  tjp_u_pv:        number;  // TjP UV Kommun Ulrika
  tjp_u_pmt_q:     number;  // TjP Ulrika, kvartalsinsättning

  // Tjänstepension Norge (OTP)
  norge_f_pv:      number;  // TjP Norge — Felipe
  dnb_f_pv:        number;  // DNB Felipe
  sb_f_pv:         number;  // Storebrand Felipe
  sb_u_pv:         number;  // Storebrand Ulrika
  dnb_u_pv:        number;  // DNB Ulrika

  // Sparkonto / borgensavi
  sparkonto_pv:    number;
  sparkonto_pmt:   number;  // Månatlig insättning

  // Allmän pension & NAV
  ap_f:            number;  // Inkomstpension Felipe, nuv. kapital
  ap_u:            number;
  nav_f_nok:       number;  // NAV-kapital Felipe (NOK)
  nav_u_nok:       number;
  nok_sek:         number;  // Växelkurs NOK→SEK

  // Premiepension (AP7)
  pp_f:            number;
  pp_u:            number;

  // Aktier
  norco_antal:     number;
  norco_kurs:      number;
  oncop_antal:     number;
  oncop_kurs:      number;

  // Löner (brutto/mån)
  brutto_f:        number;
  brutto_u:        number;

  // Pensionsestimat (från Pensionsmyndigheten / NAV)
  allman_se_f:     number;  // Svensk allmänpension Felipe kr/mån
  allman_se_u:     number;
  norsk_f:         number;  // NAV inntektspension Felipe kr/mån
  norsk_u:         number;

  // Utgifter
  levnadskostnad:  number;  // kr/mån, period 1
  levnadskostnad2: number;  // kr/mån, period 2
  exp_switch_ar:   number;  // Efter hur många år byter vi till period 2
  exp_f:           number;  // Individuell kostnad Felipe
  exp_u:           number;  // Individuell kostnad Ulrika
}

// ── FIRE-inställningar (sliders) ─────────────────────────────────────────────
export interface FireSettings {
  avkPct:        number;
  antalAr:       number;
  uttakAvkPct:   number;
  tjpAr:         number;
  skattPct:      number;
  borgoRanta:    number;
  lonehojF:      number;
  lonehojU:      number;
  sparandel:     number;
  fTjpAge:       number;
  fNorskTjpAge:  number;
  uTjpAge:       number;
  uNorskTjpAge:  number;
  fAllmanAge:    number;
  uAllmanAge:    number;
  aktierIFire:   boolean;
  engBelopp:     number;   // Engångsuttag belopp
  engAr:         number;   // Engångsuttag år
}

// ── Pensionsström ─────────────────────────────────────────────────────────────
// En enda utbetalninsström — t.ex. "Norsk TjP Felipe"
export interface PensionStream {
  id:       number;         // 1-7
  label:    string;
  who:      'f' | 'u';
  fromYear: number;
  toYear:   number;         // 9999 = livsvarig
  monthly:  number;         // kr/mån efter skatt
  livsvarig: boolean;
}

// ── FIRE-beräkningsresultat ───────────────────────────────────────────────────
// Returneras av calculations.ts — ren data, inga DOM-sidoeffekter
export interface FireResult {
  fireYear:      number;
  fireNumber:    number;   // FIRE-talet (levnadskostnad × 12 / 4 %)
  firePct:       number;   // % av FIRE-talet uppnått
  kapital:       number;   // Fritt kapital vid FIRE (fonder + sparkonto + aktier)
  totaltFV:      number;   // Total förmögenhet vid FIRE inkl. pensionskapital
  uttakAvkPct:   number;   // Vidarebefordras till uttag-sidan
  skattFaktor:   number;

  // Portföljkomponenter vid FIRE
  fonder_fv:     number;
  sparkonto_fv:  number;
  tjp_fv:        number;
  norge_fv:      number;
  pp_fv:         number;
  ap_fv:         number;

  // Pensionsströmmar
  pensions: PensionStream[];

  // Fasdata för fasdiagrammet
  phases: Phase[];

  // Tidslinjehändelser
  events: TimelineEvent[];
}

export interface Phase {
  nr:     string;
  year:   number;
  ageF:   number;
  ageU:   number;
  labels: string[];
  incomeF: number;   // kr/mån Felipe
  incomeU: number;   // kr/mån Ulrika
}

export interface TimelineEvent {
  year:  number;
  who:   'f' | 'u' | 'both';
  type:  string;
  label: string;
}

// ── Uttags-simulering ─────────────────────────────────────────────────────────
export interface UttakRow {
  year:       number;
  capital:    number;
  returns:    number;
  pensionMon: number;
  netUttag:   number;
  delta:      number;
}

export interface UttakResult {
  rows:          UttakRow[];
  depletedYear:  number | null;
  swr:           number;         // Safe withdrawal rate %
}
