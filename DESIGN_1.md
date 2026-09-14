# Task Studio — designretning

Denne fil er kontrakten for alt UI i Task Studio. Følg den frem for egne
antagelser. Er noget ikke beskrevet her, så vælg det der ligner reglerne mest —
og tilføj reglen til filen bagefter.

Skriv aldrig nyt CSS med farver, radius eller skygger direkte i komponenter.
Alt går gennem tokens nedenfor.

**Sproget i appen er engelsk.** De danske eksempler i denne fil er illustrationer
af *form*, ikke strenge der skal skrives af. «I gang» betyder `In progress`,
«02 TILBUD» betyder `02 QUOTES`. Husreglen i CLAUDE.md står ved magt: engelsk
interface, og det du selv skriver i loggen er på det sprog du skriver det.

---

## 0. Grundprincippet

**Struktur tegnes med hairlines, ikke med kort.**

Det der adskiller to ting er én streg på 1 px. Ingen skygger. Ingen afrundede
hjørner. Ingen fyldte kasser der "flyder" på baggrunden. En kolonne er et felt
med ramme; et kort i kolonnen er en *række* i det felt, adskilt af en vandret
hairline — ikke en boks med margin omkring.

Det er denne ene beslutning der gør at en tæt skærm stadig kan være rolig, og
det er derfor der ikke er en `--radius`-token i filen.

**Den anden regel:** *ingen formular til noget der kan udledes.* Hvis en værdi
kan beregnes fra træet eller loggen, må den ikke være et inputfelt.

---

## 1. Tokens

```css
:root {
  /* Flader */
  --paper:        #F4EFE6;  /* sidens bund */
  --inset:        #FBF8F2;  /* indhold inde i en ramme */
  --hover:        #EFE9DE;  /* hover på række/kort */

  /* Tekst */
  --green:        #1E4632;  /* brand, overskrifter, aktiv tilstand */
  --ink:          #15251B;  /* brødtekst */
  --green-soft:   #4E6B59;  /* manchet, sekundær prosa */
  --muted:        #7C8479;  /* labels, metadata, datoer */

  /* Linjer */
  --line:         #CDC5B6;  /* rækkeskel, indre linjer */
  --line-strong:  #A79E8C;  /* feltrammer, sektionsskel */

  /* Kræver et menneske */
  --rust:         #A8431F;

  /* Typografi */
  --f-ui:   "Archivo", "Helvetica Neue", Arial, sans-serif;
  --f-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
```

Fonte hentes fra Google Fonts:
`Archivo:wght@400;500;600`, `IBM+Plex+Mono:wght@400;500`.

**Der findes ingen flere farver.** Ingen blå, ingen gul, ingen grøn "success".
Skal noget signalere fremgang, gør tætheden og placeringen det.

### Semantik — hvornår hvad

| Rolle | Token |
|---|---|
| Sidebaggrund | `--paper` |
| Panel / felt indeni | `--inset` |
| Overskrift, aktiv nav, link | `--green` |
| Brødtekst, tabelindhold | `--ink` |
| Manchet under overskrift | `--green-soft` |
| Label, dato, id, antal | `--muted` |
| Streg mellem rækker | `--line` |
| Ramme om felt, skel mellem sektioner | `--line-strong` |
| Kræver et menneske | `--rust` |

**Rust betyder: her skal et menneske gøre noget, og indtil det sker, sker der
ingenting.** En blocker og en overskredet frist er de tydeligste tilfælde, men
det gælder også det der mangler, «still to find» på budgettet og en vurdering
ingen har lavet. Rust er hverken fejl eller fare; det er den eneste farve der
peger på en person. Bruges den til status, mister den det.

---

## 2. Typografi

**To snit. Tag aldrig et tredje ind, og der er ingen serif i appen.**

| Snit | Bruges til | Aldrig til |
|---|---|---|
| Archivo | Alt: wordmark, sidetitler, identitetsprosa, overskrifter, knapper, tabelindhold, brødtekst | Labels, datoer, tal i kolonner |
| IBM Plex Mono | Versale labels, datoer, id'er, alle tal der står under hinanden, uret, nøgletal, quick-capture | Brødtekst, overskrifter |

Serif'en er fjernet med vilje. Den bar to ting, wordmark og identitetsprosa, og
begge dele kan bæres af størrelse og vægt i stedet. Konsekvensen er at
**kontrasten nu skal komme fra skala, vægt og knibning**, ikke fra to
skriftverdener. Derfor er overskrifterne større end de var, og derfor er mono
det eneste der bryder fladen.

### Skala

```
9,5 px  mikrotrin: mærkat og kolonneoverskrift, intet andet (mono, versal)
11 px   label (mono, versal, letter-spacing .14em)
12 px   metadata, hjælpetekst
13 px   tabelindhold, kortbeskrivelse
15 px   brødtekst (body base)
17 px   sektionsoverskrift
23 px   identitetsprosa, manchet
34 px   sideoverskrift
44 px   nøgletal (mono)
88 px   uret på forsiden (mono, tabular)
```

Ingen mellemtrin. Skal noget ligge mellem to trin, vælg det nærmeste.

### Regler

- `font-variant-numeric: tabular-nums` på **alt** hvor cifre står under hinanden:
  tabeller, nøgletal, uret, datoer, antal.
- Overskrifter: `letter-spacing: -.025em`, `text-wrap: balance`.
- Labels: versal, `letter-spacing: .14em`, `--muted`, altid mono.
- Brødtekst: max 64 tegn bred (`max-width: 64ch`), `line-height: 1.55`.
- Tabelindhold: `line-height: 1.4`. Tætheden ligger i tabellerne, aldrig i prosa.

---

## 3. Rum og mål

Basisenhed **4 px**. Alle mellemrum er et multiplum.

```
Tabelrække        32 px høj   (padding 7px 13px)
Listerække        40 px høj
Kortrække (board) padding 11px 13px, gap 4px
Panel-header      padding 9px 13px
Sektionsafstand   44 px
Sidegutter        32 px (min. 16 px under 768 px)
```

**Rammen går til kant.** Nav, bånd, sektionsskel og alle hairlines løber ud til
gutteren uanset hvor bred skærmen er. Rammen er sidens arkitektur og skal aldrig
se ud som en kasse midt på en flade.

**Arbejdsområdet har et loft på 1600 px.** Over den bredde deles indholdet i
flere kolonner frem for at strække de samme to. En tabelrække der bliver bredere
end 1600 px holder op med at være en række; en kolonne mere er altid det rigtige
svar frem for mere luft mellem de samme celler.

**Løbende brødtekst: `max-width: 64ch`.** Identitetstekst, udledt resumé,
hjælpetekst.

**Ingen tomme mellemkolonner.** En tabel må ikke bruge en blind celle til at
skubbe metadata ud til kanten. Titelkolonnen tager den resterende bredde, og de
faste kolonner sidder samlet i højre side uden hul imellem sig.

### Afstand er ulige

Det er fordelingen der laver rolige sider, ikke mængden. Der er to afstande og
de må ikke blandes:

```
44 px   mellem hovedsektioner, og kun der
16-20 px  inden i en gruppe: overskrift til panel, afsnit til afsnit,
          label til værdi, toolbar til tabel
```

Bruges de 44 px til alt, falder siden fra hinanden i lige store klumper, og så
kan man ikke se hvad der hører sammen. En overskrift står 16 px over det den
overskriver og 44 px under det forrige emne; den afstand alene fortæller hvor et
afsnit begynder.

Layout med `flex`/`grid` og `gap`. Ikke margin på enkeltelementer.

Hvordan de mål opfører sig ved andre skærmbredder står i §11.

---

## 4. Komponenter

### Felt (`.panel`)
Ramme `1px solid var(--line-strong)`, baggrund `--inset`, radius 0, ingen skygge.
Eventuel header adskilt med `border-bottom: 1px solid var(--line-strong)`.

### Board
- Kolonner i `grid`, adskilt med `border-left: 1px solid var(--line)`. Første kolonne ingen.
- Kolonnehoved: navn (13 px, Archivo) + antal (label, mono). **Intet andet.**
- Kort = række med `border-bottom: 1px solid var(--line)`. Ingen margin mellem kort.
- Kortets tre niveauer: titel 13,5 px → én linje kontekst 11,5 px `--muted` → fodlinje med mærkat + dato.
- Hover: `background: var(--hover)`, 120 ms.
- Drag: landingsplads markeres med en indrykket 1 px linje. Kortet løftes ikke, skygges ikke, roteres ikke.

### Mærkat (`.tag`)
Mono 9,5 px versal, `1px solid var(--line-strong)`, padding `2px 5px`, tekst
`--green-soft`. Kun blocker/overskredet bruger `--rust` på både ramme og tekst.

**Status har ingen farve.** Et kort i kolonnen «I gang» *er* i gang.

### Tabel
`border-collapse: collapse`. Kolonneoverskrift: mono 9,5 px versal `--muted`,
`border-bottom: 1px solid var(--line-strong)`. Rækker adskilt af `--line`.
Sidste række ingen streg. Tal højrestillet med tabular-nums.
**Ingen zebra-striber.**

### Handlinger

**En handling må aldrig kræve at man finder den.** Ingen hover-only værktøjer,
ingen nedtonede ikoner der først bliver rigtige når musen er over dem. Det
udelukker tastatur, det udelukker touch, og det gør en række til en gætteleg.

- **Rækken selv er den primære handling.** At åbne noget er det man kommer for,
  og en `Open`-knap på hver eneste linje er den samme oplysning gentaget femten
  gange ned ad siden. Rækken er klikbar i hele sin bredde, markerer sig med
  `--hover`, og er et tabstop.
- **`⋯` er den synlige affordance.** Fuld farve, aldrig nedtonet, altid til
  stede. Den sidder sidst i rækkens faste kolonner. Menuen er en liste af ord på
  `--inset` med `1px solid var(--line-strong)`, ingen skygge, ingen radius.
- **En navngivet handling bruges kun hvor den afviger fra «åbn»:** `Chase` på en
  blocker, `Promote` på en uafklaret node, `Assess` på en uden figur. Når ordet
  står der, er det fordi det siger noget andet end resten af rækken gør.
- Knapper: primær er `--green` flade med `--inset` tekst; sekundær er
  gennemsigtig med `1px solid var(--line-strong)`. Begge uden radius og uden
  skygge. En knap er ikke et kort.

**Værktøjslinjer blandes ikke sammen.** En flade der både filtrerer og handler
skal holde de to adskilt: filtre i mono versal som en række af skift, handlinger
som knapper med ord. De må ikke stå på samme linje i samme sats, fordi
«Blocked» og «New part» så ligner hinanden og kun den ene ændrer noget.

### Dokumentliste
Mappe = tynd streg-SVG med nummeret inde i ikonet (`01`, `02`, …), derefter
mappenavn som mono versal label. Filer som liste: filnavn i normal sats,
format i mono versal 9,5 px `--muted` i parentes efter navnet.

```
02 TILBUD
   Tilbud — Specim linjescanner (PDF)
   Sammenligning af tilbud (XLSX)
```

Nummereringen er projektets faste faserækkefølge — ikke pynt. Den må kun bruges
hvor rækkefølgen faktisk betyder noget.

### Hierarki-diagram
Rene hairlines i `--line-strong`, kun vinkelrette knæk. Ingen pile, ingen
kasser, ingen farvede grene. Samme tegning bruges tre steder: projekthierarki,
mappestruktur, afhængigheder. Node-label: navn i Archivo 12 px + type som mono
versal 9 px `--muted` over.

### Nøgletal
Tal 38 px `--green` tabular, label 12 px `--muted` under. Adskilt med
`border-left: 1px solid var(--line)`. **Ingen søjler, ingen donut, ingen
sparklines** medmindre et forløb over tid er selve pointen.

### Ikoner
Tynde streg-ikoner, 1 px stroke, 20 px kasse, `currentColor`. **Ingen emojis
nogen steder** — hverken som ikon, sektionsmærke eller i tekst.

### Quick-capture (⌘K)
Ét felt i mono. Første tegn bestemmer typen:

```
·  logpost      +  opgave      !  blocker      ?  beslutning
```

Under feltet vises det parsede resultat som mærkater (type, node, dato).
Ingen rullemenu, ingen formular, ingen fire knapper. De fire tegn er samtidig
de fire glyffer der bruges i lister overalt i appen.

---

## 5. Bevægelse

- Hover / fokus: 120 ms
- Panel og popover: 180 ms
- Alt over 300 ms er forbudt
- `prefers-reduced-motion: reduce` slår alt fra

Kvittering sker i selve elementet: en hairline bliver kort grøn, en række
skifter baggrund. **Ingen toasts, ingen flueben-badges, ingen konfetti.**

---

## 6. De to tilstande

Samme designsprog, to tætheder. Skift aldrig sprog mellem dem.

**Læs** — projektets forside. Identitet i serif-prosa i venstre kolonne, resumé
i højre. Luftig sats, lange linjer, meget hvid plads. Resuméet skrives **aldrig**
i hånden; det udledes af træet og loggen.

**Arbejd** — board, log, dokumenter, budget. Tætte rækker, faste kolonner,
alt på ét klik.

Venstre navigationskolonne (projekttræet) er konstant i begge.

---

## 7. AI i UI'et

AI'en skal ikke *ses*. Den er det der binder de to tilstande sammen.

**Tilladt:**
1. Resumé-kolonnen og standup-kapitlerne skrives af AI ud af logstrømmen.
2. ⌘K udleder type, node og dato af sætningen.
3. **Én** linje øverst på et board, i almindelig prosa, `--green-soft`, klikbar:
   *"Tre kort har ikke rørt sig i ni dage. Sensor-leverancen blokerer to andre."*

**Forbudt:** sparkle-ikoner, gradient-kanter, chatpanel i højre side, "AI"-badges,
skrivemaskine-animationer, og enhver knap hvis navn indeholder ordet AI.

---

## 8. Funktionsmodel

**Bindende for UI'et og for hvad der må bygges. Vejledende for skemaet.**

Databasen bliver liggende som den er. Denne sektion beskriver hvad brugeren
møder, ikke hvordan det opbevares, og de to må gerne være forskellige:

- **En spark ser ud som en node** og bruger samme sidetemplate, samme felter og
  samme logstribe. Den bliver i sin egen tabel. MASTER.md forsvarer hvorfor en
  spark ikke er en node med status `idea`, og den begrundelse holder.
  Forfremmelse er én kodesti der kopierer på tværs, ikke en tilstandsændring.
- **Én logstrøm er ét view**, `v_node_log`, der unionerer blocker, beslutning,
  sekvens og work log med en `kind`-kolonne. Read only, tilføjer ingen sandhed,
  kan droppes uden datatab. De fire tabeller røres ikke.
- **Budget og standup ejer stadig ingen data.** Det er allerede sandt.

Simplificeringen der holder UI'et lille:

- **Én node, fire niveauer.** Projekt / subprojekt / developmentprojekt / task er
  samme objekt på forskellig dybde. Samme sidetemplate, samme felter, samme log.
  En spark er samme node i tilstanden *uafklaret*.
- **Én logstrøm, fire slags.** Blocker, beslutning, sekvens og work log er én
  række med en glyf foran. Samme visning, samme indtastning, filtrerbar.
- **Tre verber i hele appen:** *fang* (⌘K), *forfrem* (spark → node, task →
  subprojekt), *flyt* (kolonne → kolonne). Alt andet er visninger.
- **Standup er ikke en funktion** — det er logstrømmen skåret på dato i tre
  kapitler: siden sidst / fremad / sparks.
- **Budget er ikke en side** — det er et felt på noden der ruller op gennem
  træet. Budgetsiden viser rullet; den ejer ingen data.

Ny funktion må kun bygges hvis den er et af de tre verber eller en visning af
data der allerede findes.

---

## 9. Forbudsliste

Overtræd ikke disse, heller ikke "bare denne ene gang":

- `border-radius` ≠ 0
- `box-shadow` overhovedet
- Emojis
- Farvede status-chips
- Zebra-striber i tabeller
- Mere end to niveauer af grå
- Gradienter
- Kort med margin mellem sig
- Formularfelt til en udledbar værdi
- Animation over 300 ms
- En fjerde skrifttype
- En farve der ikke står i afsnit 1

---

## 10. Referencer

Retningen er sammensat af:

- **Frank & Co** — rammegrid, hairlines, tætte pristabeller, creme + flaskegrøn. *Kilden til æstetikken.*
- **Notion project planner** — sidebar-navigation, sektionslabels, rækkedensitet, inline handlinger. *Kilden til strukturen, ikke til stilen.*
- **Kanban- og dokument-dashboards** — kolonneopdeling og filterrække.
- **Bee Studio** — nummererede mapper, format i parentes, hairline-træ-diagrammer.
- **Streg-ikonsæt** — ikonstil, 1 px stroke.
- **Microinteractions-ark** — kun principperne: hurtigt, konsekvent, aldrig påtrængende.
- **Stort tal på ensfarvet bund** — nøgletalsbehandlingen.

---

## 11. Skærmbredder

Designet skrives smalt først og lægges ud derfra. Ikke fordi appen skal bruges
på en telefon, men fordi rækkefølgen tvinger en til at afgøre hvad der er
nødvendigt før man afgør hvad der er plads til.

**De bredder der faktisk bruges:**

| Bredde | Hvem | Hvad der skal holde |
|---|---|---|
| 2560 px | designbordet | At intet trækkes fra hinanden |
| 1440-1920 px | den primære bruger, laptop | Referencebredden. Her skal det være smukt |
| 1024-1366 px | lille laptop, tablet på tværs | Alt skal stadig kunne nås uden at noget klemmes |
| 768-1023 px | tablet på højkant, senere | Tre kolonner bliver til to |
| under 768 px | nødsituation | Én kolonne, intet går tabt, tætheden opgives |

### Rammen går til kant, arbejdet stopper ved 1600

Nav, bånd og hairlines løber ud til gutteren på 32 px uanset bredden.
Arbejdsområdet inden i rammen stopper ved 1600 px, og over den bredde bliver
margenspalten til to spalter frem for at de samme to strækkes. Kun løbende prosa
holder 64ch, jævnfør §3.

Rækken holdes sammen af to ting. Titelkolonnen er den eneste der strækker sig,
og de faste kolonner, tilstand, type, dato, `⋯`, sidder samlet i højre side uden
tom celle imellem sig.

### Ét strukturelt knæk

**`lg`, 1024 px.** Tre kolonner kræver omkring tusind pixels før midterkolonnen
er læsbar.

- **Fra 1024:** etiketkolonne, indhold, margin. Som i dag.
- **768 til 1023:** to kolonner. Margin-kolonnen flytter ned under indholdet som
  en sektion med samme hairline-behandling, ikke som et panel der ser anderledes ud.
- **Under 768:** én kolonne. Lodrette skel bliver vandrette, fordi en venstrestreg
  på en blok i fuld bredde er en streg ned ad siden og ikke et kolonneskel.

`sm`, 640 px, findes kun til talgitre og er ikke strukturel.

### Tæthed følger pegeredskabet, ikke bredden

Et smalt vindue på en laptop er stadig en mus. Derfor `@media (pointer: coarse)`
og ikke en breakpoint:

- Tabelrække 32 px med mus, mindst 44 px med finger
- Inputfelt 13 px med mus, **16 px med finger**, fordi alt derunder får Safari
  til at zoome ind ved fokus og aldrig zoome ud igen
- Ingen tekst under 9,5 px på nogen skærm, og 9,5 kun til mærkat og kolonnehoved

### Tabeller og board

- **Tabeller stables** under `lg`: rækken bliver én kolonne, hver værdi bærer sin
  egen label som ellers stod i kolonnehovedet, og wrapperen bliver `contents` fra
  `lg` så det oprindelige kolonnegitter lægger dem ud urørt.
- **Boardet** har kolonner på mindst 260 px. Er der ikke plads til to, scroller
  boardet vandret **i sin egen beholder**. Siden selv scroller aldrig sidelæns.
- **Hierarki-diagrammet** skaleres som en færdig tegning frem for at blive lagt
  ud igen, så knækkene bliver ved med at møde nodernes midte.

### Hvad der aldrig sker

- Siden scroller sidelæns
- En sidegutter under 16 px ved nogen bredde
- Et fast `min-width` bredere end skærmen
- Et tal der brydes fra sin egen etiket
