/**
 * infoContent.ts — Centraliserat innehåll för informationsmodaler.
 *
 * Varje sida importerar sin post och anropar:
 *   injectInfoBtn(INFO.pageName.title, INFO.pageName.sections)
 *
 * Fördelen: Modal-texter hålls separerade från sid-logiken och kan
 * redigeras på ett ställe utan att röra beräkningskoden.
 */
import type { InfoSection } from './nav';

interface PageInfo {
  title: string;
  sections: InfoSection[];
}

export const INFO: Record<string, PageInfo> = {

  // ── Dashboard (index.html) ───────────────────────────────────────────────────
  index: {
    title: '🏠 Dashboard',
    sections: [
      {
        heading: 'Vad är det här?',
        html: `<p>Översiktssidan som visar din ekonomi i ett ögonkast: nettoförmögenhet, brygga-status, uppskattad förmögenhetstillväxt per år och kommande pensionshändelser.</p>`,
      },
      {
        heading: 'Netto förmögenhet (NV)',
        html: `<p>Summan av <strong>alla tillgångar minus skulder</strong>: AP, PP, TjP, Lysa, sparkonto, bostäder, aktier m.m. Uppdateras automatiskt när du ändrar värden i Ekonomi-fliken.</p>`,
      },
      {
        heading: 'Förmögenhetsförändring per år',
        html: `<p>Uppskattning av hur NV förändras under ett normalår — fördelat på sju kategorier. Avkastning hämtas från Brygga-slidern. Bostadstillväxt kan justeras direkt här.</p>`,
      },
      {
        heading: 'Vad behöver du göra?',
        html: `<ul>
          <li>Håll <strong>Ekonomi</strong>-fliken uppdaterad med aktuella balanser.</li>
          <li>Kontrollera brygga-täckning — målet är ≥ 100 %.</li>
          <li>Använd diagrammet för att se vad som driver förmögenhetstillväxten mest.</li>
        </ul>`,
      },
    ],
  },

  // ── Ekonomi (ekonomi.html) ───────────────────────────────────────────────────
  ekonomi: {
    title: '💰 Ekonomi — grunddata',
    sections: [
      {
        heading: 'Vad är det här?',
        html: `<p>Här matar du in alla <strong>aktuella balanser och månadssparanden</strong> som de övriga sidorna räknar med. Det är källan till hela planen.</p>`,
      },
      {
        heading: 'Vad behöver du göra?',
        html: `<ul>
          <li>Uppdatera balanserna (PV) en gång i månaden eller kvartalet från Lysa, Hoist, NAV m.fl.</li>
          <li>Ange månatliga insättningsbelopp (PMT) — dessa hämtas automatiskt till Budget-sidan.</li>
          <li>Synka från Google Sheets med knappen längst ner för snabbare uppdatering.</li>
        </ul>`,
      },
      {
        heading: 'Viktiga fält',
        html: `<ul>
          <li><strong>Lysa F/U/Buffert</strong>: fria fondkonton (ISK) — grunden i brygga-kapitalet.</li>
          <li><strong>AP (inkomstpension)</strong>: hämta intjänad behållning från minpension.se.</li>
          <li><strong>NAV (Norge)</strong>: norsk statlig pension i NOK.</li>
          <li><strong>Levnadskostnad</strong>: din planerade månadskostnad i FIRE — påverkar alla simulatorer.</li>
        </ul>`,
      },
      {
        heading: 'Datalagring & Sheets-sync',
        html: `<p>All data sparas <strong>lokalt i webbläsaren</strong> (localStorage) — ingenting skickas till någon server. Sheets-knappen <em>hämtar</em> balanser från ditt Google Sheets (läsning enbart) och skriver dem till localStorage. Ingen data lämnar appen.</p>`,
      },
    ],
  },

  // ── Brygga-simulatorn (fire.html) ────────────────────────────────────────────
  fire: {
    title: '🌉 Brygga-simulatorn',
    sections: [
      {
        heading: 'Vad är det här?',
        html: `<p>Simulerar <strong>brygga-fasen</strong> — perioden från att du slutar jobba tills pensionerna täcker levnadskostnaderna. Visar om ditt fria kapital räcker och hur länge.</p>`,
      },
      {
        heading: 'Hur fungerar det?',
        html: `<ul>
          <li>Ange antal år till FIRE, avkastning och uttaksprocent via sliders.</li>
          <li>Simulatorn räknar framtida kapital och jämför med planerade uttag.</li>
          <li>Brygga-täckning ≥ 100 % = kapital räcker hela vägen till full pension.</li>
        </ul>`,
      },
      {
        heading: 'Viktiga inställningar',
        html: `<ul>
          <li><strong>ISK-schablonskatt</strong>: reducerar Lysa-avkastningen (standard 1,25 %/år).</li>
          <li><strong>Aktier i fritt kapital</strong>: kryssa i om du vill räkna med aktievärden.</li>
          <li><strong>Levnadskostnad period 2</strong>: lägre belopp efter pensionsstart (t.ex. när båda pensioner är aktiva).</li>
        </ul>`,
      },
      {
        heading: 'Målet',
        html: `<p>Brygga-täckning på <strong>minst 100 %</strong> med rimliga antaganden. Pie-diagrammet visar kapitalfördelningen vid FIRE-start.</p>`,
      },
    ],
  },

  // ── Budget (budget.html) ─────────────────────────────────────────────────────
  budget: {
    title: '📋 Budget',
    sections: [
      {
        heading: 'Vad är det här?',
        html: `<p>Månadsbudgeten visar inkomster, utgifter och sparande samlat på ett ställe. KPI-raden högst upp räknar ut saldo, sparkvot och totalt sparande automatiskt.</p>`,
      },
      {
        heading: 'Vad behöver du göra?',
        html: `<ul>
          <li>Fyll i faktiska månadsbelopp för varje post.</li>
          <li>Löneväxling räknas med i sparkvoten men syns inte som inkomst (det är ett bruttolöneavdrag).</li>
          <li>Lysa N (ej avkastningsbärande) exkluderas från sparkvoten.</li>
        </ul>`,
      },
      {
        heading: 'Nyckeltal',
        html: `<ul>
          <li><strong>Saldo</strong>: inkomst − utgifter (löneväxling adderas tillbaka).</li>
          <li><strong>Sparkvot</strong>: totalt sparande / (inkomst + löneväxling) × 100.</li>
          <li><strong>Totalt sparande</strong>: summan av alla sparande-poster (exkl. Lysa N).</li>
        </ul>`,
      },
      {
        heading: 'Målet',
        html: `<p>En <strong>sparkvot på 30–50 %</strong> är ett vanligt riktmärke för FIRE-planering. Saldo bör vara nära noll — stor positiv rest betyder att mer kan sparas.</p>`,
      },
    ],
  },

  // ── Faktisk avkastning (avkastning.html) ─────────────────────────────────────
  avkastning: {
    title: '🎯 Faktisk avkastning',
    sections: [
      {
        heading: 'Vad är det här?',
        html: `<p>Logga den <strong>faktiska årsavkastningen</strong> för Lysa och tjänstepensioner. Jämför mot simulatorns antagande — både i procent och kronor.</p>`,
      },
      {
        heading: 'Var hittar jag siffrorna?',
        html: `<ul>
          <li><strong>Lysa</strong>: logga in på Lysa → "Min portfölj" → årsavkastning.</li>
          <li><strong>TjP Sverige</strong>: din pensionsförsäkrings årsbesked (Hoist, KPA, Alecta m.fl.).</li>
          <li><strong>TjP Norge</strong>: DNB/Storebrand årsbesked eller inloggning.</li>
        </ul>`,
      },
      {
        heading: 'Startvärden',
        html: `<p>Ange ingående kapital vid det första år du loggar. Utan startvärden visas bara procent — med dem beräknas faktisk kr-utveckling och jämförs mot simulerad portfölj (om du haft antaget % varje år).</p>`,
      },
      {
        heading: 'CAGR',
        html: `<p><strong>CAGR</strong> (Compound Annual Growth Rate) = sammansatt genomsnittsavkastning. Det är den siffra som stämmer med hur simulatorn räknar — jämför den mot "Antaget" i Brygga.</p>`,
      },
    ],
  },

  // ── Hink-strategi (hinkar.html) ──────────────────────────────────────────────
  hinkar: {
    title: '🪣 Hink-strategi',
    sections: [
      {
        heading: 'Vad är det här?',
        html: `<p>Kapitalet delas upp i <strong>fyra hinkar</strong> efter risk och tidshorisont. Det gör det lättare att hantera marknadsrörelser utan panik — du vet alltid vilken hink du tar ifrån.</p>`,
      },
      {
        heading: 'De fyra hinkarna',
        html: `<ul>
          <li>🟢 <strong>Hink 1 — Likviditet</strong>: Sparkonto/buffert. Täcker 3–6 månaders utgifter. Noll marknadsrisk. Det är härifrån du betalar räkningar.</li>
          <li>🔵 <strong>Hink 2 — Trygghet</strong>: AP (inkomstpension), NAV (norsk pension), fastigheter (villa + lägenhet equity). Låg risk, ej likvida men stabila.</li>
          <li>🟣 <strong>Hink 3 — Tillväxt</strong>: Lysa-fonder, TjP Sverige, TjP Norge, PP. Hög förväntad avkastning på lång sikt — rörs inte vid kortsiktiga nedgångar.</li>
          <li>🎲 <strong>Hink 4 — Lek</strong>: Enskilda aktier (NorCo, OncoP). Spekulativt — max 10 % av hink 3. Förlust av hela beloppet ska inte påverka planen.</li>
        </ul>`,
      },
      {
        heading: 'Målet',
        html: `<ul>
          <li>Hink 1 täcker alltid <strong>minst 3 månaders</strong> utgifter (helst 6).</li>
          <li>Hink 4 håller sig under <strong>10 % av hink 3</strong>.</li>
          <li>Kvartalstrategin fyller på hink 1 från hink 3 vid uppgång och tär på hink 1 vid nedgång.</li>
        </ul>`,
      },
      {
        heading: 'Vad behöver du göra?',
        html: `<p>Kontrollera att hink 1 är tillräckligt stor och att lek-andelen (hink 4) inte driftat för högt. Rikedomstrappan nedanför visar din ekonomiska nivå baserat på hinkarna.</p>`,
      },
    ],
  },

  // ── Historik (historik.html) ─────────────────────────────────────────────────
  historik: {
    title: '📈 Historik',
    sections: [
      {
        heading: 'Vad är det här?',
        html: `<p>Loggbok där du tar <strong>månatliga ögonblicksbilder</strong> (snapshots) av förmögenheten. Visar faktisk historik och en framåtblickande prognos mot FIRE-målet.</p>`,
      },
      {
        heading: 'Vad behöver du göra?',
        html: `<ul>
          <li>Klicka <strong>"Spara snapshot"</strong> en gång i månaden (t.ex. sista vardagen) efter att du uppdaterat Ekonomi-fliken.</li>
          <li>Snapshotet fångar alla balanser som de ser ut just nu.</li>
        </ul>`,
      },
      {
        heading: 'Historik-diagrammet',
        html: `<p>Sex linjer: <strong>Privata fonder</strong> (Lysa + sparkonto + buffert), <strong>TjP & LöneVXL</strong>, <strong>TjP Norge</strong>, <strong>Allmänpension</strong> (AP + PP + NAV), <strong>Aktier</strong> och <strong>Totalt</strong>.</p>`,
      },
      {
        heading: 'Prognos',
        html: `<p>Extrapolerar totalt kapital framåt med 7 % avkastning + löpande sparande. Visar FIRE-tal (25× levnadskostnaden/år) och planerade FIRE-år som markeringar.</p>`,
      },
      {
        heading: 'Mål',
        html: `<p>Totalkurvan ska peka uppåt och prognosen ska nå FIRE-talet i tid. Identifiera månader med onormalt stort kapitalfall.</p>`,
      },
    ],
  },

  // ── Kvartalsstrategi (kvartal.html) ──────────────────────────────────────────
  kvartal: {
    title: '📅 Kvartalsstrategi',
    sections: [
      {
        heading: 'Vad är det här?',
        html: `<p>En guided checklista inför varje kvartal baserad på <strong>Jespers uttagsstrategi</strong> (Rika tillsammans). Istället för att ta ut pengar automatiskt varje månad gör du en aktiv bedömning fyra gånger per år.</p>`,
      },
      {
        heading: 'Vad behöver du göra?',
        html: `<ul>
          <li>Logga in på <strong>Lysa</strong> och läs av portföljens procentutveckling sedan förra kvartalet.</li>
          <li>Ange din faktiska genomsnittliga månadsutgift (senaste 3 månaderna).</li>
          <li>Kolla ditt buffertkontos saldo (t.ex. Borgo sparkonto).</li>
          <li>Flytta slidern till rätt procentutveckling — appen visar sedan vad du ska göra.</li>
        </ul>`,
      },
      {
        heading: 'Målet',
        html: `<p>Aldrig tvingas sälja fonder när marknaden är nere. Bufferten (1–1⅓ kvartalsbehov) absorberar nedgångar; uppgångar fylls på igen. Fyra reviewdatum per år: <strong>5 jan · 5 apr · 5 jul · 5 okt</strong>.</p>`,
      },
      {
        heading: 'Nyckeltal',
        html: `<ul>
          <li><strong>Kvartalsbehov</strong> = (faktisk utgift − aktiva pensioner) × 3</li>
          <li><strong>Buffertmål</strong> = 4/3 × kvartalsbehov (≈ ett kvartal + 33 % kudde)</li>
        </ul>`,
      },
    ],
  },

  // ── Skatteanalys (skatt.html) ────────────────────────────────────────────────
  skatt: {
    title: '🧾 Skatteanalys',
    sections: [
      {
        heading: 'Vad är det här?',
        html: `<p>Jämför <strong>schablonmässig flat-skatt</strong> (din slider i Brygga) mot <strong>faktisk progressiv inkomstskatt</strong> för varje år från FIRE-start. Visar hur mycket du faktiskt betalar — och vad du sparar jämfört med ett förenklat antagande.</p>`,
      },
      {
        heading: 'Tabellen & grafen',
        html: `<ul>
          <li>År-för-år-rad med Felipe och Ulrikas bruttopension, flat-skatt och progressiv skatt.</li>
          <li>Progressiv beräkning inkluderar <strong>förhöjt grundavdrag</strong> för pensionärer 65+ (31 % kommunalskatt + 20 % statlig skatt över 615 300 kr/år).</li>
          <li>Grafen visar effektiv skatteprocent över tid — jämfört med din flat-rate-slider.</li>
          <li><strong>Besparing</strong> = total flat-skattepost minus total progressiv skatt (positivt = progressiv är lägre).</li>
        </ul>`,
      },
      {
        heading: 'ISK-schablonskatt',
        html: `<ul>
          <li>Lysa-konton beskattas med en schablonintäkt — justeras via ISK-slidern i Brygga (standard 1,25 %).</li>
          <li>Betalas <strong>oavsett om du tar ut pengar eller inte</strong>.</li>
          <li>Uttag från ISK räknas inte som inkomst → ingen extra inkomstskatt vid uttaget.</li>
        </ul>`,
      },
      {
        heading: 'Vad behöver du göra?',
        html: `<p>Sätt flat-skatt-slidern i Brygga till din bästa uppskattning. Jämför sedan mot den progressiva kolumnen — om progressiv är lägre är din plan konservativt skatteberäknad (bra).</p>`,
      },
    ],
  },

  // ── Uttaksplan (uttag.html) ──────────────────────────────────────────────────
  uttag: {
    title: '📊 Uttaksplan',
    sections: [
      {
        heading: 'Vad är det här?',
        html: `<p>En detaljerad år-för-år-simulering av hela uttaksfasen. Visar hur kapitalet utvecklas, när varje pensionsström aktiveras och hur länge pengarna räcker.</p>`,
      },
      {
        heading: 'Vad visas i diagrammet?',
        html: `<ul>
          <li><strong>Kapital</strong>: det fria kapitalet (Lysa, sparkonto m.m.) som minskar med uttag.</li>
          <li><strong>Uttag/mån</strong>: vad du tar ut ur kapitalet varje månad (minskar när pensioner slår in).</li>
          <li><strong>Levnadskostnad</strong> (orange streckad linje): din planerade levnadskostnad, inkl. steget ner till period 2.</li>
          <li><strong>Pensioner</strong>: de staplar som byggs upp allteftersom pensionerna startar.</li>
        </ul>`,
      },
      {
        heading: 'Målet',
        html: `<p>Kapitalet ska inte nå noll under din livstid. Målet är att <strong>uttagen täcks av pensioner</strong> senast när kapitalet är nära slut — helst med god marginal.</p>`,
      },
      {
        heading: 'Tips',
        html: `<p>Justera startåldrarna för varje pension i Brygga-simulatorn för att se hur timing påverkar uttaksbehovet.</p>`,
      },
    ],
  },
};
