# Hodnotenie defektov — pokyny pre Claude Code

## Repozitár
- GitHub: https://github.com/Rogan9312/Digital-Quality-Competency-MSA-Application
- Remote `origin`, pracuje sa priamo na branchi `main` (žiadne feature branche,
  žiadne PR — commitovať a pushovať rovno na `main`).
- Pred úpravami vždy over stav: `git status`, prípadne `git pull origin main`,
  aby lokálny stav sedel so vzdialeným.

## Architektúra (dôležité pred úpravou auth/dát!)
Appka **už nie je** čisto lokálna IndexedDB appka bez backendu — bola
prepracovaná na Firebase (projekt `digital-quality-plana`):
- **Firebase Authentication** (e-mail/heslo) gatuje CELÚ appku (Test aj
  Administráciu) ešte pred zobrazením čohokoľvek — obrazovka `#screen-auth-gate`.
  4 účty sa spravujú vo Firebase Console (Authentication → Users).
- **Cloud Firestore** nahradil IndexedDB ako dátová vrstva (kolekcie `kv`,
  `areas`, `batches`, `photos`, `attempts`). Funkcie `idbPut/idbGet/idbGetAll/
  idbDeleteKey/idbClear` majú zámerne rovnaké mená/signatúry ako predtým, len
  interne volajú Firestore.
- **Bez Firebase Storage** (vyžaduje platený Blaze tarif) — fotky sa ukladajú
  ako base64 `data:` URL priamo vo Firestore dokumente (`photoData` pole).
- Pôvodný interný admin-only textový password gate (`adminAuthHash`,
  `hashPassword`, `#gate-setpass`/`#gate-login`) bol **odstránený** — nahradilo
  ho Firebase Auth prihlásenie na úrovni celej appky. `renderAdminGateOrShell()`
  dnes len prepne na admin shell, žiadnu vlastnú autentifikáciu už nerieši.

Kompletný a aktuálny technický popis (dátový model, gotchas, Firebase Console
nastavenie) je v [`PROJECT-SUMMARY.md`](./PROJECT-SUMMARY.md) — **pred väčšou
zmenou v appke si ho over**, aby si nevychádzal zo zastaraného predstavenia
o architektúre (napr. zo starších zadaní/promptov spred tejto migrácie).

## Automatický git workflow
Pri KAŽDEJ úprave appky (hodnotenie-defektov.html, index.html, README.md,
PROJECT-SUMMARY.md a pod.), o ktorú používateľ požiada, automaticky over a
spravaj:
1. `git add .`
2. `git commit` s krátkym výstižným popisom zmeny **v slovenčine**
3. `git push origin main`

Pred pushom vždy over:
- `node --check` na extrahovaný obsah `<script>` (syntax appky musí prejsť),
- že `index.html` a `hodnotenie-defektov.html` sú identické kópie (appka sa
  po každej zmene appky kopíruje: `cp hodnotenie-defektov.html index.html`),
- že všetky `getElementById('...')` volania v skripte majú zodpovedajúci
  `id="..."` v HTML (žiadne rozbité referencie).

Commit sa robí bez čakania na dodatočné potvrdenie — používateľ toto
explicitne odsúhlasil ako štandardný postup pre tento repozitár.
