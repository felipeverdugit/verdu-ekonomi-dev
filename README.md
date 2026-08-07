# Verdu Ekonomi

Personlig ekonomi- och FIRE-planeringsapp för Felipe & Ulrika. Byggd som en statisk MPA (Multi-Page Application) och hostad på GitHub Pages.

🌐 **Live:** https://felipeverdugit.github.io/verdu-ekonomi-dev/

---

## Sidor

| Ikon | Sida | Beskrivning |
|------|------|-------------|
| 🏠 | **Dashboard** | Nettoförmögenhet, brygga-status, uppskattad förmögenhetstillväxt per år (7 komponenter), pensionsströmmar |
| 💰 | **Ekonomi** | Grunddata: kapital (PV), månadsinsättningar (PMT), löner, aktier, fastigheter. Synkas från Google Sheets |
| 🌉 | **Brygga** | FIRE-simulatorn. Simulerar brygga-fas, kapitalutveckling, ISK-schablonskatt, aktier i fritt kapital |
| 📊 | **Uttag** | År-för-år-simulering av uttaksfasen med pensionsströmmar och levnadskostnadslinje |
| 🪣 | **Hinkar** | Fyra-hink-strategi (Likviditet / Trygghet / Tillväxt / Lek), rikedomstrappa |
| 📈 | **Historik** | Månadssnapshotar av förmögenheten, linjediagram per kategori, prognosdiagram |
| 🧾 | **Skatt** | Flat-skatt vs progressiv inkomstskatt per år, ISK-schablonskatt, Felipe & Ulrika separat |
| 📋 | **Budget** | Månadsbudget med inkomster, utgifter, sparande. Sparkvot, saldo, löneväxling |
| 📅 | **Kvartal** | Jespers kvartalsstrategi — buffert-status, marknadsrörelse-slider, rekommendation, nästa reviewdatum |
| 🎯 | **Avkastning** | Logga faktisk årsavkastning (Lysa, TjP Sve, TjP Nor). CAGR, kr-värden, faktisk vs simulerad portfölj |

Varje sida har en **ⓘ-knapp** som förklarar vad sidan gör, vad man behöver göra och målet.

---

## Tech stack

| Verktyg | Användning |
|---------|------------|
| **Vite** (v8) | Bundler, MPA-konfiguration, dev-server |
| **TypeScript** | Hela kodbasen |
| **Chart.js** (v4) | Alla diagram (linje, stapel, doughnut) |
| **Firebase Realtime Database** | Molnsynk mellan enheter |
| **gh-pages** | Deploy till GitHub Pages |

Inga CSS-ramverk — all styling i `src/style.css` med CSS custom properties (ljust/mörkt tema).

---

## Projektstruktur

```
verdu-ekonomi-dev/
├── index.html              # Dashboard
├── ekonomi.html
├── fire.html
├── uttag.html
├── hinkar.html
├── historik.html
├── skatt.html
├── budget.html
├── kvartal.html
├── avkastning.html
│
├── src/
│   ├── style.css           # Global CSS (variabler, komponenter, modal, tema)
│   ├── types.ts            # Alla TypeScript-interface (EkonomiData, FireSettings m.fl.)
│   ├── constants.ts        # Konstanter, slider-defaults/-ranges, NAV_LINKS, SHEETS_MAP
│   ├── store.ts            # Typad localStorage-wrapper (ekStore, fireStore, budgetStore m.fl.)
│   ├── calculations.ts     # computeFire(), simulateUttag() — ren beräkningslogik
│   ├── auth.ts             # Lösenordsskydd via SHA-256 hash (VITE_APP_PWD_HASH)
│   ├── nav.ts              # renderTopnav(), injectInfoBtn() — gemensam navigation + info-modal
│   ├── firebase.ts         # Firebase push/pull (FireSettings, EkonomiData, Historik, Budget, Kvartal, Avkastning)
│   ├── syncWidget.ts       # ☁️ Sync-widget — push/pull alla datatyper till/från Firebase
│   └── pages/
│       ├── index.ts        # Dashboard-logik
│       ├── ekonomi.ts      # Grunddata-formulär + Google Sheets-sync
│       ├── fire.ts         # Brygga-simulatorn
│       ├── uttag.ts        # Uttaksplan
│       ├── hinkar.ts       # Hink-strategi
│       ├── historik.ts     # Historik + prognos
│       ├── skatt.ts        # Skatteanalys
│       ├── budget.ts       # Budget
│       ├── kvartal.ts      # Kvartalsstrategi
│       └── avkastning.ts   # Avkastningslogg
│
├── vite.config.ts          # MPA entry points (en per HTML-fil)
├── package.json
└── .env                    # Hemliga nycklar (ej i git, se nedan)
```

---

## Datalagring

All data sparas primärt i **localStorage** med namnprefix:

| Prefix | Innehåll |
|--------|----------|
| `vek_ek_*` | EkonomiData (balanser, PMT, löner) |
| `vek_fire_*` | FireSettings (slider-värden) |
| `vek_bgt_*` | BudgetData (månadsbudget) |
| `vek_res_*` | Beräknade resultat (fire.html → uttag.html) |
| `vek_kv_*` | Kvartalsinmatning (faktisk, pension, buffert, rörelse) |
| `vek_avk_rows` | Avkastningsrader (JSON array) |
| `vek_avk_start` | Avkastningens startvärden (JSON) |
| `vek_historik` | Historik-snapshots (JSON array) |
| `vek_idx_*` | Index-sidan (bostadstillväxt etc.) |
| `vek_theme` | Ljust/mörkt tema |

---

## Molnsynk (Firebase)

Synk finns på sidorna **Brygga**, **Budget**, **Kvartal** och **Avkastning** via en ☁️-widget längst ner.

### Vad synkas

| Data | Firebase-sökväg |
|------|----------------|
| FireSettings | `verdu/fire-settings` |
| EkonomiData | `verdu/ekonomi` |
| Historik-snapshots | `verdu/historik` |
| BudgetData | `verdu/budget` |
| Kvartalsinmatning | `verdu/kvartal` |
| Avkastningslogg + startvärden | `verdu/avkastning` |

### Arbetsflöde

```
Dator:  mata in data → ⬆ Spara till moln
Mobil:  ⬇ Hämta från moln → sidan laddas om med ny data
```

### Firebase-konfiguration

Lägg till i `.env` (skapas i projektroten, aldrig i git):

```env
VITE_FB_API_KEY=...
VITE_FB_AUTH_DOMAIN=...
VITE_FB_PROJECT_ID=...
VITE_FB_STORAGE_BUCKET=...
VITE_FB_MESSAGING_SENDER_ID=...
VITE_FB_APP_ID=...
VITE_FB_DATABASE_URL=https://<projekt>.firebaseio.com
```

Firebase Realtime Database-regler bör begränsa åtkomst till `/verdu`-sökvägen.

---

## Google Sheets-sync (Ekonomi)

Ekonomi-sidan kan läsa balanser direkt från ett Google Sheets via ett Apps Script.

- **Riktning:** Sheets → App (envägs, read-only)
- **URL:** definieras i `src/constants.ts` → `SHEETS_URL`
- **Mappning:** `SHEETS_MAP` i `constants.ts` kopplar Sheets-nycklar till `EkonomiData`-fält
- **Auto-sync:** Om appen saknar sparad data (ny enhet/rensad cache) synkas automatiskt vid sidladdning

Apps Script ska returnera JSON med `?action=read`.

---

## Lösenordsskydd

Appen skyddas av ett SHA-256-hashat lösenord via `src/auth.ts`.

Lägg till i `.env`:

```env
VITE_APP_PWD_HASH=<sha256-hash av lösenordet>
```

Lämnas env-variabeln tom är appen öppen utan lösenord.

---

## Lokal utveckling

```bash
npm install
npm run dev        # Startar dev-server på http://localhost:5173
```

Kräver `.env`-fil med Firebase-nycklar och eventuellt lösenordshash.

---

## Deploy

```bash
npm run deploy     # Bygger och pushar till gh-pages-branchen
```

Använder `gh-pages -d dist --no-history` för att undvika cachar.

GitHub Pages servar från `gh-pages`-branchen. Propagering tar ca 1–2 minuter efter deploy.

---

## Viktiga beräkningar

### AP (inkomstpension)
- Indexuppräkning: **1,9 %/år** (Pensionsmyndigheten 2025/2026)
- Inkomsttak: **672 600 kr/år** (7,5 × IBB 89 680)
- Avsättning: **16 %** av PGI

### Premiepension
- **2,5 %** av PGI per år + avkastning på befintligt kapital

### TjP AKAP-KR
- **6 %** på lön upp till 52 125 kr/mån
- **31,5 %** på lön däröver
- Gäller Felipe och Ulrika

### ISK-schablonskatt
- Justerbar slider i Brygga (standard 1,25 %/år)
- Reducerar Lysa-avkastningen i beräkningarna

### Kvartalsstrategi (Jesper)
- `Kvartalsbehov = (faktisk utgift − aktiva pensioner) × 3`
- `Buffertmål = 4/3 × kvartalsbehov`
- Reviewdatum: **5 jan · 5 apr · 5 jul · 5 okt**
