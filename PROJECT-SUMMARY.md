# Hodnotenie defektov — project summary (handoff to Claude Code)

## Čo to je
Jednosúborová webová appka (vanilla HTML/CSS/JS, žiadny build krok) na
trénovanie a testovanie operátorov kvality v automotive výrobe: operátor
hodnotí sériu fotiek defektov ako **OK / Hranične OK / NOK**, appka to
porovná so správnymi odpoveďami, ktoré vopred nastaví admin, a zbiera
výsledky do reportov a dashboardu pre manažment. Dáta sú zdieľané medzi
zariadeniami cez Firebase (Firestore), prístup k appke je uzamknutý za
Firebase Authentication (e-mail + heslo).

- **Súbor:** `hodnotenie-defektov.html` (a identická kópia `index.html`
  pre GitHub Pages root) — jeden self-contained HTML súbor (~2 400+ riadkov),
  otvára sa v prehliadači, žiadny build krok. Externé závislosti: Google
  Fonts (IBM Plex Sans/Mono) a Firebase JS SDK (compat, cez `<script src>`
  z `gstatic.com`) — appka teda **vyžaduje internetové pripojenie**
  (predchádzajúca čisto offline IndexedDB verzia bola nahradená).
- **Jazyk UI:** slovenčina (cieľová skupina: QM manažér a operátori
  v automotive výrobe, SK/CZ prostredie).
- **Perzistencia:** Firebase — **Firestore** (dátové kolekcie vrátane
  samotných fotiek ako base64 reťazcov) a **Authentication** (e-mail/heslo
  login, gatuje CELÚ appku vrátane Test módu). Zámerne **bez Firebase
  Storage** — Storage od istého bodu vyžaduje platený Blaze tarif
  (napojenú kartu), čo používateľ nechcel; fotky preto idú priamo do
  Firestore dokumentov ako `data:` URL (base64 JPEG). Dáta sú tak zdieľané
  medzi všetkými zariadeniami/prehliadačmi prihláseného tímu. `firebaseConfig`
  je priamo v HTML (API key je verejný identifikátor projektu, nie tajný
  kľúč — skutočná ochrana je cez Firestore Security Rules, pozri nižšie).

## Dátový model (Firestore kolekcie)
Firestore kolekcie zámerne kopírujú pôvodné IndexedDB object stores 1:1
(cez `idbPut/idbGet/idbGetAll/idbDeleteKey/idbClear` wrapper funkcie v kóde,
ktoré teraz interne volajú Firestore namiesto IndexedDB — zvyšok biznis
logiky appky sa vďaka tomu nemusel meniť):
- `kv` (doc id = `key`) — voľné key-value: `activeBatchId` (`{key, value}`),
  `adminPin` (`{key, hash, salt}` — hash 4-miestneho PIN kódu pre vstup do
  Administrácie, pozri nižšie). Pôvodný `adminAuth` záznam (text heslo)
  z pred-Firebase verzie odpadol — nahradilo ho Firebase Authentication
  pre celú appku plus samostatný `adminPin` len pre Administráciu.
- `areas` (doc id = `id`) — **Sekcie/projekty**: `{id, label, createdAt}`.
  Nadradená kategória nad dávkami (napr. "Dvere W177").
- `batches` (doc id = `id`) — **Dávky**: `{id, label, createdAt, areaId}`.
  Jedna dávka = jedna sada fotiek + správnych odpovedí, ktorá sa dá opakovane
  zadávať viacerým operátorom. Práve jedna dávka je "aktívna" (servuje sa
  operátorom cez `kv.activeBatchId`), zvyšok je archív, ale stále dostupný.
- `photos` (doc id = `id`) — `{id, name, photoData, correctAnswer, order,
  batchId}`. Samotný obrázok (JPEG, resized na 1400px + kompresovaný na
  q=0.82 v prehliadači) je uložený priamo v `photoData` ako base64 `data:`
  URL (žiadny Firebase Storage) — pri tejto kompresii sa bezpečne zmestí
  pod Firestore limit 1 MiB na dokument. `correctAnswer` je `null` kým ju
  admin nedefinuje (`OK`/`HRANICNE`/`NOK`).
- `attempts` (doc id = auto-generovaný Firestore ID, string) — jeden
  dokončený test jedného operátora: `{id, batchId, batchLabel,
  operatorName, startedAt, finishedAt, answers: [{photoId, name, given,
  note, correctAtTime, isCorrect}], totalCount, correctCount, scorePercent,
  archived}`. `batchLabel` a `correctAtTime` sú **snapshoty** v čase testu,
  takže neskoršie premenovanie dávky alebo zmena správnej odpovede nekazí
  historické reporty. `archived: true` = vylúčené zo všetkých
  súhrnov/dashboardu (pozri nižšie).
- `operators` (doc id = `id`) — RFID/NFC karta → meno operátora:
  `{id, badgeId, name, createdAt}`. `badgeId` je jedinečný reťazec z karty
  (čítačka funguje ako klávesnica — "napíše" ho a odošle Enter). Spravuje
  sa v Administrácii → záložka "Operátori".
- `qualityAlerts` (doc id = `id`) — upozornenia viazané na Sekciu:
  `{id, areaId, title, description, imageData, dateFrom, durationDays,
  isActive, createdAt}`. `areaId` odkazuje na `areas`. `imageData` je
  base64 `data:` URL (rovnaký princíp ako `photos.photoData`, žiadny
  Firebase Storage). `dateFrom` + `durationDays` určujú dátumovú platnosť
  (`dateTo` sa nikde needukladá, len sa dopočítava —
  `computeQaDateTo()`). `isActive` je nezávislý manuálny prepínač NAD
  RÁMEC dátumovej platnosti (obe podmienky musia platiť zároveň, aby sa
  alert operátorovi zobrazil — pozri `getPendingQualityAlerts()`).
  Spravuje sa v Administrácii → záložka "Quality Alerty". Náhľad fotky
  v karte alertu (`.qa-card-thumb`, orezaný na výšku 120px) je klikateľný
  → otvorí `#qa-lightbox` (samostatný jednoduchý fullscreen viewer,
  oddelený od hlavného `#lightbox` pre fotky defektov, ktorý je viazaný
  na verdikty/odpovede) s celou nahranou fotkou bez orezania
  (`object-fit:contain`).
- `qualityAlertAcks` (doc id = `id`) — kto videl/potvrdil ktorý Quality
  Alert: `{id, qualityAlertId, operatorName, ackedAt}`. Zapisuje sa pri
  kliknutí na "Rozumiem, pokračovať" na `#screen-quality-alert`. Zámerne
  samostatná kolekcia (nie pole vnútri `qualityAlerts` doc), aby zápisy
  od viacerých operátorov naraz nekolidovali.

  **Zobrazenie "kto videl":** V Administrácii → "Quality Alerty" má každá
  karta alertu riadok políčok — jedno pre každého registrovaného
  operátora (`allOperators`, zoradení podľa mena), zelené s dátumom
  ("Meno (23.9.2026)") ak ho videl, sivé len s menom ak nie. Zoznam
  kariet je teraz **mriežka** (`#qalerts-list{display:grid;
  grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}`), nie
  jeden stĺpec — pri viacerých alertoch sa ich zmestí vedľa seba 2–3
  podľa šírky okna, kompaktnejší prehľad. Párovanie je podľa
  `operatorName` reťazca (nie cudzieho kľúča) — sedí to s tým, že
  `attempts.operatorName` aj `qualityAlertAcks.operatorName` sú tiež
  len reťazce.

  **Roster pre "kto videl" (`qaOperatorRoster`, `buildOperatorRoster()`)**
  — zámerne NIE je len `allOperators` (registrovaní s kartou). Testovať
  môže aj niekto bez karty (ručne zadané meno na štarte testu, napr.
  "TST03"), takže roster je zjednotenie: mená z `operators` **union**
  distinct `attempts.operatorName` naprieč všetkými pokusmi. Počíta sa
  nanovo (fetch `operators` aj `attempts`) vždy pri otvorení záložky
  "Quality Alerty" aj záložky "Dashboard" — nie je to cache z `init()`.

Poznámka k typom: Firestore vracia dátumové polia (`createdAt`,
`startedAt`, `finishedAt`) ako `Timestamp` objekty, nie JS `Date`. Wrapper
`fsConvert()` v dátovej vrstve ich pri čítaní automaticky konvertuje na
`Date` (top-level polia), takže zvyšok kódu (`new Date(x)` volania) funguje
bez zmeny. Ak sa pridá nové top-level dátumové pole, tejto konverzie sa to
automaticky týka tiež; vnorené dátumy (napr. `answers[].evaluatedAt`) sa
nekonvertujú, keďže sa nikde spätne nečítajú.

## Hlavné obrazovky / toky

### Test mode (bez hesla, pre operátorov)
- Ak nie je nastavená aktívna dávka alebo nemá všetky fotky s definovanou
  správnou odpoveďou → empty state s vysvetlením.
- **Štart testu — dve cesty, obe vedú do `beginAttempt(name)`:**
  1. **Sken karty (RFID/NFC).** `#field-badge-scan` je vizuálne skrytý,
     ale vždy zaostrený `<input>` na `#screen-test-start` (čítačka funguje
     ako klávesnica — napíše `badgeId` a pošle Enter). Nájde sa zhoda v
     `operators` → meno sa nastaví automaticky a test sa spustí rovno.
     Nenájde sa → banner "Neznáma karta – over priradenie v
     Administrácii", pole sa nezablokuje, dá sa pokračovať ručne.
  2. **Ručné zadanie mena** (s `<datalist>` autocomplete z histórie mien)
     + tlačidlo "Spustiť test" — nezávislá alternatíva vedľa skenu, nie
     náhrada.
  Zaostrenie `#field-badge-scan` sa nastavuje vždy pri zobrazení
  `#screen-test-start` (`refreshTestModeEntry()`) — ak operátor klikne do
  poľa mena, sken sa dočasne "pozastaví" (čítačka píše len do
  zaostreného poľa), čo je zámerné a jednoduché riešenie.
- **Quality Alert medzikrok.** Hneď po `beginAttempt()`, PRED
  `#screen-test-eval`, appka skontroluje `getPendingQualityAlerts()` —
  Quality Alerty, kde `areaId` sedí so sekciou aktívnej dávky, `isActive
  ​===true` A dnešný dátum spadá do `<dateFrom, dateFrom+durationDays>`.
  Pri zhode sa zobrazí `#screen-quality-alert` (fotka + názov + popis +
  "Rozumiem, pokračovať"); viac alertov sa ukáže postupne za sebou
  (`pendingAlertsQueue`, `showNextQualityAlert()` si volá samo seba, kým
  front nie je prázdny, potom prejde na `#screen-test-eval`). Žiadny
  alert nespĺňa podmienky → žiadny medzikrok, rovno na test. Klik na
  "Rozumiem, pokračovať" zapíše potvrdenie do novej kolekcie
  `qualityAlertAcks` (`{id, qualityAlertId, operatorName, ackedAt}`) —
  `currentQualityAlertShown` drží referenciu na práve zobrazený alert,
  aby continue-handler vedel, ktorý alert a ktorý operátor (z
  `currentAttempt.operatorName`) potvrdiť; zápis je fire-and-forget
  (neblokuje prechod na ďalší alert/test). V Administrácii →
  "Quality Alerty" sa pri každom alerte zobrazuje "Videli (N): meno
  (dátum), …" — zoznam sa pri otvorení záložky vždy **refetchuje
  z Firestore** (nie z cache z `init()`), keďže potvrdenia pribúdajú
  z iných zariadení/relácií operátorov, rovnako ako to robí Reporty pre
  `attempts`.
- **Rozbehnutý test sa MUSÍ dokončiť na jedno sedenie — inak sa zahodí.**
  Ak operátor počas testu (vrátane Quality Alert medzikroku) prepne do
  Administrácie, `switchMode('admin')` rovno vynuluje `currentAttempt`,
  `pendingAlertsQueue` aj `currentQualityAlertShown`. Po návrate do Test
  módu tak appka nezobrazí rozohraný test (ani rozohraný Quality Alert)
  — `refreshTestModeEntry()` vidí `currentAttempt===null` a ukáže znova
  štart (meno/sken). Keďže sa do `attempts` zapisuje výhradne v
  `finishAttempt()` (až po zodpovedaní všetkých fotiek), nedokončený
  pokus sa nikdy predtým ani teraz nezapísal do reportingu — táto úprava
  len odstraňuje možnosť rozohraný test **obnoviť** prepnutím záložiek.
- Hodnotenie fotka po fotke: veľká fotka, 3 tlačidlá (OK/Hranične OK/NOK,
  klávesy 1/2/3), šípky/klávesy ←→, poznámka k fotke, filmový pás
  s farebným stavom, auto-presun na ďalšiu nezodpovedanú fotku.
- Po poslednej fotke **automaticky** skóre + zoznam fotiek (✓/✗, farebný
  rámček), klikateľné → lightbox s **odhalenou správnou odpoveďou** (toto je
  zámerná zmena — pôvodne bola skrytá kvôli opakovanému použitiu tej istej
  dávky viacerými operátormi, ale používateľ si vyžiadal plné odhalenie pre
  okamžitý tréning; pozri komentár v kóde pri `openLightbox`).
- "Nový test (ďalší operátor)" — reset na zadanie mena, tá istá dávka,
  `#field-badge-scan` sa opäť zaostrí cez `refreshTestModeEntry()`.

### Prihlásenie — dve vrstvy
1. **Firebase Authentication (gatuje celú appku).** Pred zobrazením
   čohokoľvek (Test aj Administrácia) appka vyžaduje prihlásenie e-mailom
   a heslom cez Firebase Auth (`#screen-auth-gate`, `auth.onAuthStateChanged`
   v kóde). Účty (typicky 4, pre QM manažéra a operátorov) sa spravujú
   **len vo Firebase Console** (Authentication → Users) — appka samotná
   nemá žiadny "registračný" formulár ani obrazovku na zmenu hesla, to sa
   robí tiež cez konzolu alebo Firebase "reset password" e-mail.
2. **4-miestny PIN (druhá vrstva, len pre vstup do Administrácie).**
   Nad rámec Firebase loginu appka pri vstupe do záložky `nav-admin`
   vyžaduje ešte 4-miestny numerický PIN (`#screen-admin-pin-gate`) —
   spoločný pre všetkých, nie per-účet. Prvý vstup ponúkne "nastaviť PIN
   + potvrdiť", ďalšie vstupy už len "zadať PIN". PIN sa hashuje
   (SHA-256 cez `crypto.subtle`, so soľou, `fallbackHash` ako záloha keď
   `crypto.subtle` nie je k dispozícii — funkcie `randomSalt`/`hashPin`)
   a hash sa ukladá do Firestore `kv` dokumentu s id `adminPin`
   (`{key:'adminPin', hash, salt}` — v tej istej kolekcii `kv`, kde je aj
   `activeBatchId`, ale pod iným kľúčom než malo pôvodné `adminAuth` pred
   Firebase migráciou, aby nedošlo k zámene s Firebase Auth). UI: 4
   samostatné číslicové polia (`input type="tel" inputmode="numeric"`)
   s automatickým presunom na ďalšie pole (`setupPinBoxes()` helper) —
   žiadna vlastná numerická klávesnica na obrazovke, spolieha sa na
   natívnu numerickú klávesnicu mobilu/tabletu z `inputmode="numeric"`.
   Zámerne **spoločný PIN pre všetkých**, nie per-osoba — jednoduchšie
   a spoľahlivejšie riešenie, žiadna správa viacerých PIN kódov.
   **Automatické odomknutie PIN gate pri odchode zo záložky:** prepnutie
   na `nav-test` nastaví `adminPinVerified=false` (v `switchMode()`), takže
   pri návrate do Administrácie appka PIN vyžiada znova. Tlačidlo
   "Zamknúť administráciu" robí to isté ručne bez prepnutia záložky.
   "Zmeniť PIN" (cez `prompt()` dialógy, zámerne jednoduché, nie vlastná
   obrazovka) overí súčasný PIN a uloží nový.

Administrácia (druhá záložka `nav-admin`) je teda dostupná ktorémukoľvek
Firebase účtu, ktorý navyše pozná zdieľaný PIN — žiadne rozlíšenie rolí
admin/operátor na úrovni Firebase účtov, PIN slúži ako spoločná druhá
zábrana pred náhodným/neúmyselným vstupom do Administrácie.

Päť podzáložiek:
1. **Nastavenie testu** — výber/vytvorenie Sekcie a Dávky, upload fotiek
   (sekvenčné načítanie cez `createImageBitmap`/Image + canvas resize na
   1400px + `toBlob` JPEG q=0.82 — **kriticky dôležité pre stabilitu**, pôvodná
   verzia s paralelným base64 loadingom zhadzovala Edge), definovanie
   správnych odpovedí (rovnaké UI ako test, len ukladá `correctAnswer`),
   tlačidlo "Nastaviť ako aktuálnu pre operátorov", danger zone (vymazať
   len túto dávku).
2. **Operátori** — správa `operators` (meno + badgeId): tabuľka so
   všetkými, formulár "+ Nový operátor" (meno + badgeId — badgeId sa dá
   napísať ručne, alebo doň priložiť kartu, keďže čítačka píše do
   zaostreného poľa ako klávesnica), Upraviť/Zmazať pri každom riadku.
   Enter v poli mena/badgeId rovno uloží, ak je vyplnené aj to druhé.
   Kontrola duplicitného `badgeId` pred uložením.
3. **Quality Alerty** — správa `qualityAlerts`: formulár (Sekcia select,
   názov, popis, nepovinná fotka cez rovnaký resize pipeline ako fotky
   defektov — `resizeImageToBlob()`, zdieľané s dávkovým uploadom —,
   dátum vystavenia s predvoleným dneškom, platnosť v dňoch s predvolenou
   hodnotou 30), zoznam existujúcich alertov ako karty (`.qa-card`) s
   klikateľným chipom stavu (zelený "Aktívny" / sivý "Neaktívny" —
   klik okamžite prepne a uloží, bez potvrdzovacieho dialógu), zobrazeným
   intervalom platnosti (dateFrom – dopočítaný dateTo), Upraviť/Zmazať.
4. **Reporty** — tabuľka pokusov (filter dávka/dátum/archív, zoradenie
   default "najhoršie prvé"), CSV export, tlač, archivácia (pozri nižšie),
   detail jedného pokusu s klikateľnými riadkami → lightbox (plné odhalenie
   správnej odpovede, keďže je to admin pohľad), "Prehľad podľa dávok" keď je
   filter "Všetky dávky", "Štatistika podľa fotky" keď je vybraná konkrétna
   dávka.
5. **Dashboard** — filtre Sekcia/Operátor/Od/Do. Layout (3+2+1 riadky, aby sa
   zmestilo na 16:9 bez scrollu stránky, jednotlivé grafy majú CSS
   `resize:vertical` — ťahaním za pravý dolný roh si užívateľ manuálne
   zmenší/zväčší ktorékoľvek okno):
   - Vývoj úspešnosti v čase (čierna čiara = skutočné hodnoty, farebná
     prerušovaná = lineárna regresná trendová línia) + farebná "trend pill"
     so šípkou (▲/▼/▬).
   - Koláčový/donut graf spôsobilosti (3 segmenty + číslo v strede =
     celkový počet operátorov vo filtri).
   - Highlights: max 4 karty "Vyžaduje pozornosť" (najhorší, uprednostnení
     tí s viac testami) + max 2 karty "Vzory" (najlepší podľa `avg+count`).
   - Stĺpcový graf "Porovnanie operátorov" (farebné pásma 0–80/80–90/90–100 %
     na pozadí, vnútorný scroll box).
   - Bodový graf "Počet testov × úspešnosť" — rovnaké pásma, ALE horná
     (90–100 %) zóna je rozdelená zvislou čiarou na "oranžovú" (menej ako 3
     testy = zatiaľ nepotvrdené) a "zelenú" (3+ testov = potvrdené) časť.
   - "Matica spôsobilosti operátorov" — tabuľka so stĺpcom Odporúčanie
     (kombinuje tier + dostatok dát).
   - **Spôsobilostné prahy (fixné, používateľom explicitne zadané):**
     `tierFor(pct) = pct>=90 ? 'ok' : (pct>=80 ? 'warn' : 'nok')`
     100–90 % = Spôsobilý, 90–80 % = Podmienečne spôsobilý, pod 80 % =
     Nespôsobilý. Tento prah sa používa konzistentne vo všetkých grafoch.
   - **"Quality Alerty — prehľad"** — samostatná karta, nezávislá od
     filtrov Sekcia/Operátor/Od/Do vyššie (počíta cez všetky Sekcie).
     Riadky = aktuálne vydané alerty (`getCurrentlyIssuedQualityAlerts()`
     — `isActive` a v dátumovej platnosti, naprieč sekciami, zoradené od
     najstaršieho), so stĺpcom "Dní" (koľko dní je alert v platnosti).
     Stĺpce = registrovaní operátori. Bunka = zelená ✓ s dátumom (videl)
     alebo červená ✕ (ešte nevidel) — `renderQaDashboardMatrix()`, HTML
     string (kvôli dynamickému počtu stĺpcov podľa počtu operátorov,
     rovnaký prístup ako `build*ChartSvg` funkcie). Horizontálne aj
     vertikálne scrollovateľné/resize-ovateľné (`.dash-qa-matrix-wrap`,
     rovnaký vzor ako `.scroll-box`/`.resizable-box`, len s `overflow:auto`
     namiesto `overflow-y:auto`, keďže stĺpcov môže byť veľa). Dáta sa
     refetchujú z Firestore vždy pri otvorení Dashboard záložky.

## Dôležité implementačné detaily / gotchas
- **Fotky ako base64 priamo vo Firestore, zámerne bez Firebase Storage**
  (Storage vyžaduje platený Blaze tarif, čo používateľ odmietol) — upload
  flow: `canvas.toBlob()` (resize na 1400px, JPEG q=0.82) →
  `blobToDataURL()` (`FileReader.readAsDataURL`) → výsledný `data:` URL
  reťazec sa uloží priamo do poľa `photoData` vo Firestore dokumente. Fotky
  sa načítavajú/nahrávajú **sekvenčne** (jedna po druhej cez Promise
  reťaz), nie paralelne — historicky kvôli stabilite v Edge, platí aj tu.
  Ak by v budúcnosti bolo treba viac/väčšie fotky, zváž návrat k Firebase
  Storage (vyžaduje Blaze) alebo iné externé úložisko — base64 vo Firestore
  má strop ~700 kB na fotku (1 MiB limit dokumentu mínus réžia base64
  a ostatných polí).
- **`p.url` je transientná vlastnosť, nie perzistovaná** — objekty fotiek
  v `photosCache`/`editingPhotos`/`activePhotos` majú `.url` (pre `<img
  src>`) nastavené v JS na `photoData`, ale do Firestore sa ukladá len
  `photoData`. Pri pridávaní nového miesta, kde appka číta/zapisuje fotky,
  dbaj na toto rozlíšenie.
- **Cache-referencia bug** (opravené, stále platí): `photosCache[batchId]` a
  `editingPhotos`/`activePhotos` MUSIA byť tá istá referencia poľa, inak sa
  nové fotky nepremietnu tam, kde treba (spôsobovalo "Test zatiaľ nie je
  pripravený" hoci fotky boli nahraté). Pri vytváraní novej dávky:
  `editingPhotos = photosCache[batch.id]` (rovnaká referencia), nikdy
  `editingPhotos = []` ako samostatné pole.
- **Chybové hlásenia namiesto ticha** — `window.addEventListener('unhandledrejection', ...)`
  + `showStorageWarning()` banner pod topbarom, aby zlyhania Firestore
  (offline, zlé Security Rules, príliš veľká fotka nad Firestore limit)
  boli viditeľné, nie tiché "nič sa nedeje".
- **Dátová vrstva (`idbPut`/`idbGet`/`idbGetAll`/`idbDeleteKey`/`idbClear`)**
  — zámerne drží rovnaké mená a signatúry ako pôvodná IndexedDB verzia, len
  interne volá Firestore (`firestore.collection(store)...`). `KEYPATHS`
  mapuje kolekciu → pole použité ako doc id (`kv` → `key`, ostatné → `id`).
  Pri pridávaní novej kolekcie/store pridaj záznam do `KEYPATHS`, inak sa
  bude nesprávne predpokladať `id`.
- **Firestore Security Rules** — appka spolieha na to, že prístup do
  Firestore majú **len prihlásení používatelia** (`request.auth != null`).
  Toto sa nastavuje vo Firebase Console, appka to nevynucuje sama (klient
  by šiel obísť). Bez správnych rules by ktokoľvek so znalosťou
  `firebaseConfig` (verejný v HTML) mohol čítať/mazať dáta.
- **Archivácia** — `attempts.archived` flag, filtrovaný von zo všetkých
  reportov aj dashboardu (`!a.archived`), no dáta ostávajú v DB. Tlačidlá
  "Archivovať zobrazené" / "Obnoviť z archívu" pracujú nad aktuálne
  vyfiltrovaným zoznamom (`attemptsCache`), nie nad celou DB.
- **CSS resize** (`resize:vertical; overflow:auto;`) na `.resizable-box`
  a `.scroll-box` — natívne riešenie bez JS, funguje vo všetkých moderných
  prehliadačoch, žiadna knižnica na grafy (všetky grafy sú ručne generované
  inline SVG stringy — `buildLineChartSvg`, `buildBarChartSvg`,
  `buildScatterChartSvg`, `buildPieChartSvg`).
- **Print CSS** (`@media print`) skrýva toolbar/topbar/dropzone, appka sa dá
  vytlačiť/exportovať ako PDF cez `window.print()` na reportoch aj detaile.
  Na výsledku operátora (`#screen-test-result`) aj v admin detaile pokusu
  (`#admin-attempt-detail`) sa pri tlači **kompaktný zoznam/tabuľka so
  všetkými výsledkami vytlačí ako doteraz** (nemení sa, zelené/červené
  riadky zostávajú) a NAVYŠE sa za ním vytlačí mriežka väčších fotiek
  (`.print-photo-grid`, id `res-print-grid`/`detail-print-grid`, naplnené
  spoločnou funkciou `buildPrintPhotoCard()`) — ale **len pre nesprávne
  vyhodnotené fotky** (`!a.isCorrect`), s nadpisom "Fotky nesprávne
  vyhodnotených defektov (N):". Správne odpovede fotku v tlači nedostávajú
  (stačí zelený riadok v zozname/tabuľke), keďže cieľom je hneď vidieť, čo
  operátor pomýlil, nie zaplniť papier fotkami všetkého. Mriežka je na
  obrazovke skrytá (`display:none`), zobrazí sa len cez `@media print`.

## Známe limity / veci, na ktoré upozorniť používateľa
- Appka teraz **vyžaduje internetové pripojenie** (Firebase SDK + Firestore)
  — predchádzajúca čisto offline IndexedDB verzia bez internetu fungovala,
  táto nie.
- **Žiadny Firebase Storage** (zámerne, kvôli vyhnutiu sa plateného Blaze
  tarifu) — fotky sú base64 priamo vo Firestore dokumentoch, čo limituje
  veľkosť jednej fotky na cca 700 kB po kompresii (bežne stačí, ale pri
  extrémne detailných/veľkých fotkách môže upload zlyhať s chybou
  presiahnutia limitu dokumentu — appka to zobrazí cez `showStorageWarning`
  banner).
- Účty (kto sa môže prihlásiť) sa spravujú výhradne vo Firebase Console —
  appka nemá vlastnú správu používateľov, pozvánky ani reset hesla.
- Všetci prihlásení používatelia majú rovnaké oprávnenia (žiadne role
  admin/operátor na úrovni appky) — spoliehame sa na to, že len 4 dôveryhodní
  ľudia majú prístupové údaje.
- Bezpečnosť dát stojí a padá na Firestore Security Rules nastavených
  v konzole (pozri nižšie) — appka sama žiadne oprávnenia nevynucuje na
  strane klienta.
- Operátorov lightbox odhaľuje správnu odpoveď hneď po teste — ak sa
  tá istá dávka dáva viacerým operátorom postupne, prvý operátor môže
  odpovede prezradiť ďalším. Toto je vedomé rozhodnutie na žiadosť
  používateľa (pôvodne to bolo schválne skryté z opačného dôvodu).

## Firebase projekt (potrebné jednorazové nastavenie v konzole)
Projekt: `digital-quality-plana` (console.firebase.google.com), na
bezplatnom **Spark** tarife (Storage/Blaze sa zámerne nepoužíva). Appka
očakáva zapnuté a nastavené:
- **Authentication** → Sign-in method → Email/Password povolené; 4 účty
  pridané ručne cez Authentication → Users → Add user.
- **Firestore Database** → vytvorená, s Security Rules obmedzujúcimi
  prístup na prihlásených používateľov, napr.:
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} {
        allow read, write: if request.auth != null;
      }
    }
  }
  ```
- `firebaseConfig` je natvrdo v `hodnotenie-defektov.html`/`index.html` —
  pri zmene Firebase projektu (napr. nový projekt, rotácia) treba
  aktualizovať oba súbory (sú zámerne identické kópie pre GitHub Pages).

## Čo by mohlo byť ďalej (spomínané, nezrealizované)
- Uloženie manuálne nastavených veľkostí dashboard okien (resize) natrvalo
  (momentálne sa resetujú pri reloade).
- Rozlíšenie rolí (napr. admin vs. operátor) cez Firebase custom claims
  alebo samostatnú Firestore kolekciu s oprávneniami.
- Ďalšie úpravy vizuálu podľa feedbacku (dashboard prešiel niekoľkými
  iteráciami, momentálne v dobrom stave, ale používateľ evidentne rád ladí
  detaily — očakávaj ďalšie kozmetické požiadavky).

## Ako pokračovať v Claude Code
1. Otvor `hodnotenie-defektov.html` priamo — je to jediný súbor appky,
   žiadny `npm install`, žiadny build. `index.html` je jeho identická kópia
   pre GitHub Pages — pri každej zmene appky ju treba skopírovať znova
   (`cp hodnotenie-defektov.html index.html`).
2. Testovanie: appka teraz vyžaduje živé Firebase spojenie (Auth login),
   takže lokálne otvorenie súboru bez prihlásenia ukáže len login
   obrazovku — na reálne otestovanie funkčnosti treba platné prihlasovacie
   údaje k projektu `digital-quality-plana`.
3. Pri pridávaní novej Firestore kolekcie: pridaj záznam do `KEYPATHS`
   mapy v dátovej vrstve (určuje, ktoré pole slúži ako doc id).
4. Pri pridávaní nových grafov: drž sa vzoru `build*ChartSvg(data) → string`
   funkcií, žiadna externá knižnica, farby cez `tierColor()`/CSS premenné
   (`--ok`, `--warn`, `--nok` v `:root`).
5. Pred väčšími zmenami odporúčam `node --check` na extrahovaný `<script>`
   obsah (syntax check) a manuálnu kontrolu `getElementById` volaní voči
   HTML `id=` atribútom — pri predošlých úpravách to opakovane odhalilo
   preklepy/nedopatrenia.
