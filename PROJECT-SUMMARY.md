# Hodnotenie defektov — project summary (handoff to Claude Code)

## Čo to je
Jednosúborová webová appka (vanilla HTML/CSS/JS, žiadny build krok) na
trénovanie a testovanie operátorov kvality v automotive výrobe: operátor
hodnotí sériu fotiek defektov ako **OK / Hranične OK / NOK**, appka to
porovná so správnymi odpoveďami, ktoré vopred nastaví admin, a zbiera
výsledky do reportov a dashboardu pre manažment. Dáta sú zdieľané medzi
zariadeniami cez Firebase (Firestore + Storage), prístup k appke je
uzamknutý za Firebase Authentication (e-mail + heslo).

- **Súbor:** `hodnotenie-defektov.html` (a identická kópia `index.html`
  pre GitHub Pages root) — jeden self-contained HTML súbor (~2 400+ riadkov),
  otvára sa v prehliadači, žiadny build krok. Externé závislosti: Google
  Fonts (IBM Plex Sans/Mono) a Firebase JS SDK (compat, cez `<script src>`
  z `gstatic.com`) — appka teda **vyžaduje internetové pripojenie**
  (predchádzajúca čisto offline IndexedDB verzia bola nahradená).
- **Jazyk UI:** slovenčina (cieľová skupina: QM manažér a operátori
  v automotive výrobe, SK/CZ prostredie).
- **Perzistencia:** Firebase — **Firestore** (dátové kolekcie), **Storage**
  (fotky defektov ako súbory, nie base64/blob v DB) a **Authentication**
  (e-mail/heslo login, gatuje CELÚ appku vrátane Test módu). Dáta sú tak
  zdieľané medzi všetkými zariadeniami/prehliadačmi prihláseného tímu.
  `firebaseConfig` je priamo v HTML (API key je verejný identifikátor
  projektu, nie tajný kľúč — skutočná ochrana je cez Firestore/Storage
  Security Rules, pozri nižšie).

## Dátový model (Firestore kolekcie)
Firestore kolekcie zámerne kopírujú pôvodné IndexedDB object stores 1:1
(cez `idbPut/idbGet/idbGetAll/idbDeleteKey/idbClear` wrapper funkcie v kóde,
ktoré teraz interne volajú Firestore namiesto IndexedDB — zvyšok biznis
logiky appky sa vďaka tomu nemusel meniť):
- `kv` (doc id = `key`) — voľné key-value: `activeBatchId` (`{key, value}`).
  (`adminAuth` záznam z pôvodnej appky odpadol — heslo admina nahradilo
  Firebase Authentication.)
- `areas` (doc id = `id`) — **Sekcie/projekty**: `{id, label, createdAt}`.
  Nadradená kategória nad dávkami (napr. "Dvere W177").
- `batches` (doc id = `id`) — **Dávky**: `{id, label, createdAt, areaId}`.
  Jedna dávka = jedna sada fotiek + správnych odpovedí, ktorá sa dá opakovane
  zadávať viacerým operátorom. Práve jedna dávka je "aktívna" (servuje sa
  operátorom cez `kv.activeBatchId`), zvyšok je archív, ale stále dostupný.
- `photos` (doc id = `id`) — `{id, name, photoURL, correctAnswer, order,
  batchId}`. Samotný obrázok (JPEG, resized + kompresovaný v prehliadači)
  je nahraný do **Firebase Storage** na cestu `photos/{batchId}/{id}.jpg`;
  `photoURL` je jeho verejná download URL. `correctAnswer` je `null` kým ju
  admin nedefinuje (`OK`/`HRANICNE`/`NOK`).
- `attempts` (doc id = auto-generovaný Firestore ID, string) — jeden
  dokončený test jedného operátora: `{id, batchId, batchLabel,
  operatorName, startedAt, finishedAt, answers: [{photoId, name, given,
  note, correctAtTime, isCorrect}], totalCount, correctCount, scorePercent,
  archived}`. `batchLabel` a `correctAtTime` sú **snapshoty** v čase testu,
  takže neskoršie premenovanie dávky alebo zmena správnej odpovede nekazí
  historické reporty. `archived: true` = vylúčené zo všetkých
  súhrnov/dashboardu (pozri nižšie).

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
- Zadanie mena operátora (s `<datalist>` autocomplete z histórie mien).
- Hodnotenie fotka po fotke: veľká fotka, 3 tlačidlá (OK/Hranične OK/NOK,
  klávesy 1/2/3), šípky/klávesy ←→, poznámka k fotke, filmový pás
  s farebným stavom, auto-presun na ďalšiu nezodpovedanú fotku.
- Po poslednej fotke **automaticky** skóre + zoznam fotiek (✓/✗, farebný
  rámček), klikateľné → lightbox s **odhalenou správnou odpoveďou** (toto je
  zámerná zmena — pôvodne bola skrytá kvôli opakovanému použitiu tej istej
  dávky viacerými operátormi, ale používateľ si vyžiadal plné odhalenie pre
  okamžitý tréning; pozri komentár v kóde pri `openLightbox`).
- "Nový test (ďalší operátor)" — reset na zadanie mena, tá istá dávka.

### Prihlásenie (Firebase Authentication, gatuje celú appku)
Pred zobrazením čohokoľvek (Test aj Administrácia) appka vyžaduje
prihlásenie e-mailom a heslom cez Firebase Auth (`#screen-auth-gate`,
`auth.onAuthStateChanged` v kóde). Účty (typicky 4, pre QM manažéra a
operátorov) sa spravujú **len vo Firebase Console** (Authentication →
Users) — appka samotná nemá žiadny "registračný" formulár ani obrazovku
na zmenu hesla, to sa robí tiež cez konzolu alebo Firebase "reset password"
e-mail. Toto nahradilo pôvodný interný admin-only password gate (SHA-256
hash v IndexedDB) — ten bol odstránený, keďže by bol duplicitný voči
skutočnému Firebase login-u.

Administrácia (druhá záložka `nav-admin`) je teraz dostupná ktorémukoľvek
prihlásenému účtu bez ďalšieho hesla — všetci 4 používatelia majú rovnaké
oprávnenia (žiadne rozlíšenie rolí admin/operátor na úrovni appky).

Tri podzáložky:
1. **Nastavenie testu** — výber/vytvorenie Sekcie a Dávky, upload fotiek
   (sekvenčné načítanie cez `createImageBitmap`/Image + canvas resize na
   1400px + `toBlob` JPEG q=0.82 — **kriticky dôležité pre stabilitu**, pôvodná
   verzia s paralelným base64 loadingom zhadzovala Edge), definovanie
   správnych odpovedí (rovnaké UI ako test, len ukladá `correctAnswer`),
   tlačidlo "Nastaviť ako aktuálnu pre operátorov", danger zone (vymazať
   len túto dávku).
2. **Reporty** — tabuľka pokusov (filter dávka/dátum/archív, zoradenie
   default "najhoršie prvé"), CSV export, tlač, archivácia (pozri nižšie),
   detail jedného pokusu s klikateľnými riadkami → lightbox (plné odhalenie
   správnej odpovede, keďže je to admin pohľad), "Prehľad podľa dávok" keď je
   filter "Všetky dávky", "Štatistika podľa fotky" keď je vybraná konkrétna
   dávka.
3. **Dashboard** — filtre Sekcia/Operátor/Od/Do. Layout (3+2+1 riadky, aby sa
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

## Dôležité implementačné detaily / gotchas
- **Fotky idú do Firebase Storage, nie base64 do DB** — upload flow:
  `canvas.toBlob()` (resize na 1400px, JPEG q=0.82, rovnako ako predtým) →
  `storageRef.put(blob)` → `getDownloadURL()` → `photoURL` sa uloží do
  Firestore doc. Fotky sa načítavajú/nahrávajú **sekvenčne** (jedna po
  druhej cez Promise reťaz), nie paralelne — dôvod (Edge crash pri
  paralelnom base64 loadingu) je historický z pôvodnej IndexedDB verzie,
  ale sekvenčný upload zostal zachovaný.
- **`p.url` je transientná vlastnosť, nie perzistovaná** — objekty fotiek
  v `photosCache`/`editingPhotos`/`activePhotos` majú `.url` (pre `<img
  src>`) nastavené v JS na `photoURL`, ale do Firestore sa ukladá len
  `photoURL`. Pri pridávaní nového miesta, kde appka číta/zapisuje fotky,
  dbaj na toto rozlíšenie.
- **Cache-referencia bug** (opravené, stále platí): `photosCache[batchId]` a
  `editingPhotos`/`activePhotos` MUSIA byť tá istá referencia poľa, inak sa
  nové fotky nepremietnu tam, kde treba (spôsobovalo "Test zatiaľ nie je
  pripravený" hoci fotky boli nahraté). Pri vytváraní novej dávky:
  `editingPhotos = photosCache[batch.id]` (rovnaká referencia), nikdy
  `editingPhotos = []` ako samostatné pole.
- **Chybové hlásenia namiesto ticha** — `window.addEventListener('unhandledrejection', ...)`
  + `showStorageWarning()` banner pod topbarom, aby zlyhania Firestore/
  Storage (offline, zlé Security Rules, vypršaný "test mode" na
  Firestore databáze) boli viditeľné, nie tiché "nič sa nedeje".
- **Dátová vrstva (`idbPut`/`idbGet`/`idbGetAll`/`idbDeleteKey`/`idbClear`)**
  — zámerne drží rovnaké mená a signatúry ako pôvodná IndexedDB verzia, len
  interne volá Firestore (`firestore.collection(store)...`). `KEYPATHS`
  mapuje kolekciu → pole použité ako doc id (`kv` → `key`, ostatné → `id`).
  Pri pridávaní novej kolekcie/store pridaj záznam do `KEYPATHS`, inak sa
  bude nesprávne predpokladať `id`.
- **Firestore Security Rules** — appka spolieha na to, že prístup do
  Firestore aj Storage majú **len prihlásení používatelia** (`request.auth
  != null`). Toto sa nastavuje vo Firebase Console, appka to nevynucuje
  sama (klient by šiel obísť). Bez správnych rules by ktokoľvek so
  znalosťou `firebaseConfig` (verejný v HTML) mohol čítať/mazať dáta.
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

## Známe limity / veci, na ktoré upozorniť používateľa
- Appka teraz **vyžaduje internetové pripojenie** (Firebase SDK + Firestore/
  Storage) — predchádzajúca čisto offline IndexedDB verzia bez internetu
  fungovala, táto nie.
- Účty (kto sa môže prihlásiť) sa spravujú výhradne vo Firebase Console —
  appka nemá vlastnú správu používateľov, pozvánky ani reset hesla.
- Všetci prihlásení používatelia majú rovnaké oprávnenia (žiadne role
  admin/operátor na úrovni appky) — spoliehame sa na to, že len 4 dôveryhodní
  ľudia majú prístupové údaje.
- Bezpečnosť dát stojí a padá na Firestore/Storage Security Rules
  nastavených v konzole (pozri nižšie) — appka sama žiadne oprávnenia
  nevynucuje na strane klienta.
- Operátorov lightbox odhaľuje správnu odpoveď hneď po teste — ak sa
  tá istá dávka dáva viacerým operátorom postupne, prvý operátor môže
  odpovede prezradiť ďalším. Toto je vedomé rozhodnutie na žiadosť
  používateľa (pôvodne to bolo schválne skryté z opačného dôvodu).

## Firebase projekt (potrebné jednorazové nastavenie v konzole)
Projekt: `digital-quality-plana` (console.firebase.google.com). Appka
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
- **Storage** → vytvorené, s obdobnými Security Rules:
  ```
  rules_version = '2';
  service firebase.storage {
    match /b/{bucket}/o {
      match /{allPaths=**} {
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
