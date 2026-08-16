# Verdu Ekonomi

Personligt ekonomi- och FIRE-planeringsverktyg för familjen Verdu. Simulerar bryggan från löneinkomst till full pensionsinkomst, med stöd för svenska och norska pensionsströmmar.

## Sidor

| Sida | Syfte |
|---|---|
| 🏠 Dashboard | Nettovärde, FIRE-KPI:er, nästa händelse |
| 💰 Ekonomi | Datainmatning — portföljvärden, löner, pensionsestimat, simuleringsantaganden |
| 🌉 Brygga | FIRE-simulatorn — kapitaluppbyggnad, pensionsfaser, uttaksdiagram |
| 📊 Uttag | Detaljerad uttaksplan med skatteoptimering |
| 🧾 Skatt | Progressiv vs. schablonskatt-analys per år |
| 🪣 Hinkar | Hinkstrategi (konsumera / bevara / tillväxt) |
| 📈 Historik | Nettovärdes-snapshots över tid |
| 📋 Budget | Månadsöversikt inkomster och utgifter |
| 📅 Kvartal | Kvartalsstrategi — buffert vs. fondförsäljning |
| 🎯 Avkastning | Faktisk avkastning vs. Lysa-index |

## Tech stack

- **Vite** — MPA-byggverktyg (10 HTML-ingångspunkter)
- **TypeScript** — strikt typad källkod
- **Chart.js** — diagram
- **Firebase Realtime Database** — anonym auth, synk mellan enheter via `/verdu/*`
- **Vitest** — enhetstester för beräkningslogiken
- **gh-pages** — deployment till GitHub Pages

## Arkitektur

```
src/
  calculations.ts   # Ren beräkningsmotor (fv, pmt, computeFire, simulateUttag, incomeTax)
  store.ts          # Typad localStorage-wrapper (ekStore, fireStore, resultStore, ...)
  types.ts          # Delade TypeScript-interfaces
  constants.ts      # Personkonstanter, slider-gränser, chart-färger
  infoContent.ts    # Centraliserat innehåll för info-modaler (alla 10 sidor)
  nav.ts            # Topnav + info-knapp
  auth.ts           # Firebase anonym auth
  pages/            # En .ts per sida
  __tests__/        # Vitest-tester
```

### Dataflöde

```
ekonomi.html  →  ekStore (vek_ek_*)
fire.html     →  fireStore (vek_fire_*) + resultStore (vek_res_p1..p10, kapital, ...)
uttag.html    ←  resultStore (läses, simuleras)
kvartal.html  ←  resultStore (läses)
skatt.html    ←  computeFire() direkt
```

### Skattberäkning

`incomeTax(annualGross, isPensioner)` i `calculations.ts` beräknar progressiv skatt:

| Vem | Grundavdrag | Källa |
|---|---|---|
| Pensionär ≥ 65 | `fga65()` — förhöjt grundavdrag, 13 900–134 600 kr | SKV 2024/2025 |
| Ej pensionär < 65 | `grundavdrag()` — platå ~36 500 kr vid 140–245 tkr/år, minimum 13 900 kr | SKV 2024/2025 |

Ovanpå kommunalskatt (31 %) tillkommer 20 % statlig skatt på inkomst över 615 300 kr/år. Används av `skatt.html` och `uttag.html` för jämförelse progressiv vs. schablonbeskattning.

### Pensionsströmmar (id 1–10)

| ID | Ström | Vem | Livsvarig |
|---|---|---|---|
| 1 | Norsk TjP | Ulrika | Nej (→ 77 år) |
| 2 | Svensk TjP | Ulrika | Nej |
| 3 | Norsk TjP | Felipe | Nej (→ 77 år) |
| 4 | Allmänpension SE | Ulrika | Ja |
| 5 | Svensk TjP | Felipe | Nej |
| 6 | Fast TjP (Alecta/KPA/Kåpan) | Felipe | Ja |
| 7 | Allmänpension SE | Felipe | Ja |
| 8 | Löneväxling | Felipe | Nej |
| 9 | NAV (norsk statspension) | Ulrika | Ja |
| 10 | NAV (norsk statspension) | Felipe | Ja |

Belopp lagras i `resultStore` av `fire.html` vid varje omräkning och läses av `uttag.html` och `kvartal.html`.

## Köra lokalt

```bash
npm install
npm run dev       # Vite dev-server
npm test          # Vitest (26 enhetstester)
npm run build     # Bygg till dist/
npm run deploy    # Bygg + publicera till GitHub Pages
```

## localStorage-namnsättning

| Prefix | Innehåll |
|---|---|
| `vek_ek_*` | EkonomiData (portföljvärden, löner) |
| `vek_fire_*` | FireSettings (sliders, antaganden) |
| `vek_res_*` | Beräknade resultat (pension-strömmar, kapital) |
| `vek_bgt_*` | BudgetData |
| `vek_kv_*` | KvartalData |
| `vek_avk_*` | Avkastningslogg |
| `vek_historik` | Nettovärdes-snapshots (JSON) |
| `vek_theme` | Tema (dark/light) |
