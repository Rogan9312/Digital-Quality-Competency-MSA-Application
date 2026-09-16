# Hodnotenie defektov — project summary (handoff to Claude Code)

## Čo to je
Jednosúborová webová appka (vanilla HTML/CSS/JS, žiadny build krok, žiadny
backend) na trénovanie a testovanie operátorov kvality v automotive výrobe:
operátor hodnotí sériu fotiek defektov ako **OK / Hranične OK / NOK**,
appka to porovná so správnymi odpoveďami, ktoré vopred nastaví admin
(heslom chránené), a zbiera výsledky do reportov a dashboardu pre
manažment.

- **Súbor:** `hodnotenie-defektov.html` — jeden self-contained HTML súbor
  (~2 400 riadkov, ~130 kB), otvára sa priamo v prehliadači (Edge/Chrome),
  offline, žiadne externé závislosti okrem Google Fonts (IBM Plex Sans/Mono)
  cez `<link>` v `<head>` — ak nie je internet, padne späť na systémové fonty.
- **Jazyk UI:** slovenčina (cieľová skupina: QM manažér a operátori
  v automotive výrobe, SK/CZ prostredie).
- **Perzistencia:** IndexedDB v prehliadači (`qc-defekt-test-db`,
  `DB_VERSION = 3`). Žiadny server, žiadna synchronizácia medzi zariadeniami.
  Fotky sa ukladajú ako `Blob` (nie base64) kvôli pamäti.

## Dátový model (IndexedDB object stores)
- `kv` (keyPath `key`) — voľné key-value: `adminAuth` (`{hash, salt}`),
  `activeBatchId` (`{value}`), legacy `testMeta` (len z migrácie v1).
- `areas` (keyPath `id`) — **Sekcie/projekty**: `{id, label, createdAt}`.
  Nadradená kategória nad dávkami (napr. "Dvere W177").
- `batches` (keyPath `id`) — **Dávky**: `{id, label, createdAt, areaId}`.
  Jedna dávka = jedna sada fotiek + správnych odpovedí, ktorá sa dá opakovane
  zadávať viacerým operátorom. Práve jedna dávka je "aktívna" (servuje sa
  operátorom cez `kv.activeBatchId`), zvyšok je archív, ale stále dostupný.
- `photos` (keyPath `id`) — `{id, name, blob, correctAnswer, order, batchId}`.
  `correctAnswer` je `null` kým ju admin nedefinuje (`OK`/`HRANICNE`/`NOK`).
- `attempts` (keyPath `id`, autoIncrement) — jeden dokončený test jedného
  operátora: `{id, batchId, batchLabel, operatorName, startedAt, finishedAt,
  answers: [{photoId, name, given, note, correctAtTime, isCorrect}],
  totalCount, correctCount, scorePercent, archived}`. `batchLabel` a
  `correctAtTime` sú **snapshoty** v čase testu, takže neskoršie premenovanie
  dávky alebo zmena správnej odpovede nekazí historické reporty.
  `archived: true` = vylúčené zo všetkých súhrnov/dashboardu (pozri nižšie).

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

### Administrácia (heslom chránená)
Heslo je len jednoduchý deterrent (SHA-256 cez `crypto.subtle`, fallback
na neslabý hash ak `crypto.subtle` nie je k dispozícii) — **nie je to
reálne zabezpečenie**, ktokoľvek so znalosťou dev tools ho obíde. Autentifikácia
je len v pamäti (netrvá cez reload), hash hesla je perzistentný v `kv`.

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
- **Fotky ako Blob URL, nie base64** — pri uploade sa NIKDY nemá vrátiť
  k base64 dataURL, spôsobovalo to pádenie prehliadača pri ~30 fotkách
  (pamäťový problém + Edge crash pri drag&drop). Fotky sa načítavajú
  **sekvenčne** (jedna po druhej cez Promise reťaz), nie paralelne.
- **Cache-referencia bug** (opravené): `photosCache[batchId]` a
  `editingPhotos`/`activePhotos` MUSIA byť tá istá referencia poľa, inak sa
  nové fotky nepremietnu tam, kde treba (spôsobovalo "Test zatiaľ nie je
  pripravený" hoci fotky boli nahraté). Pri vytváraní novej dávky:
  `editingPhotos = photosCache[batch.id]` (rovnaká referencia), nikdy
  `editingPhotos = []` ako samostatné pole.
- **Chybové hlásenia namiesto ticha** — `window.addEventListener('unhandledrejection', ...)`
  + `showStorageWarning()` banner pod topbarom, aby zlyhania IndexedDB
  (blokovaná firemnou politikou, InPrivate režim, iná otvorená karta so
  starou verziou DB) boli viditeľné, nie tiché "nič sa nedeje".
- **Migrácia schémy** — `DB_VERSION` sa zvyšuje pri zmene štruktúry;
  `ensureBatchesExist()` v `init()` rieši one-time migráciu z v1 (flat,
  jedna dávka bez konceptu batch/area) do v3 (batches + areas). Pri ďalších
  zmenách schémy pridať podobnú migračnú vetvu, nie len bump verzie.
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
- Dáta sú viazané na **jeden prehliadač na jednom počítači** — žiadna
  synchronizácia medzi stanicami. Ak by bolo treba multi-device, treba
  server + DB (zásadná zmena architektúry, zatiaľ nerobené).
- Heslo admina je len UI deterrent, nie bezpečnosť.
- Operátorov lightbox teraz odhaľuje správnu odpoveď hneď po teste — ak sa
  tá istá dávka dáva viacerým operátorom postupne, prvý operátor môže
  odpovede prezradiť ďalším. Toto je vedomé rozhodnutie na žiadosť
  používateľa (pôvodne to bolo schválne skryté z opačného dôvodu).

## Čo by mohlo byť ďalej (spomínané, nezrealizované)
- Uloženie manuálne nastavených veľkostí dashboard okien (resize) natrvalo
  (momentálne sa resetujú pri reloade).
- Prípadná multi-device synchronizácia (vyžaduje backend).
- Ďalšie úpravy vizuálu podľa feedbacku (dashboard prešiel niekoľkými
  iteráciami, momentálne v dobrom stave, ale používateľ evidentne rád ladí
  detaily — očakávaj ďalšie kozmetické požiadavky).

## Ako pokračovať v Claude Code
1. Otvor `hodnotenie-defektov.html` priamo — je to jediný súbor, žiadny
   `npm install`, žiadny build.
2. Testovanie: otvor v prehliadači, DevTools Console pre chyby (appka teraz
   loguje aj bannerom, aj do console).
3. Pri zmene dátovej schémy: zvýš `DB_VERSION`, pridaj migráciu do
   `ensureBatchesExist()` alebo novú migračnú funkciu volanú z `init()`.
4. Pri pridávaní nových grafov: drž sa vzoru `build*ChartSvg(data) → string`
   funkcií, žiadna externá knižnica, farby cez `tierColor()`/CSS premenné
   (`--ok`, `--warn`, `--nok` v `:root`).
5. Pred väčšími zmenami odporúčam `node --check` na extrahovaný `<script>`
   obsah (syntax check) a manuálnu kontrolu `getElementById` volaní voči
   HTML `id=` atribútom — pri predošlých úpravách to opakovane odhalilo
   preklepy/nedopatrenia.
