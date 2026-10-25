# Backend — Hodnotenie defektov (SQL Server API)

REST API medzi appkou a Microsoft SQL Serverom — náhrada za priame volania
Firestore z prehliadača. Appka samotná (`hodnotenie-defektov.html`) na toto
API **ešte nie je prepojená** — to je ďalší krok, ktorý príde po tom, čo bude
API nasadené a overené. Tento backend môžete nasadiť a otestovať nezávisle.

## Dôležité — prečítaj pred nasadením

Server beží **len vo vnútornej firemnej sieti** (nie je dostupný z
verejného internetu). To má praktický dôsledok: appka je dnes hostovaná na
GitHub Pages (verejná adresa `https://rogan9312.github.io/...`), a
prehliadač by jej volania na toto interné API z bezpečnostných dôvodov
pravdepodobne blokoval (tzv. mixed content — https stránka volajúca http
adresu vo vnútornej sieti) alebo by na ne vôbec nedočiahol (ak tablety nie
sú pripojené do firemnej siete/VPN).

**Odporúčanie:** ak chcete appku aj naďalej používať z tabletov vo firemnej
sieti, najjednoduchšie a najspoľahlivejšie je servovať **aj appku samotnú**
(`hodnotenie-defektov.html`) z toho istého Windows Servera (napr. cez IIS
ako statický súbor), nie z GitHub Pages — vtedy appka aj API bežia na tej
istej vnútornej adrese a nie je čo riešiť s CORS/mixed content. Toto je len
odporúčanie na zváženie pred reálnym nasadením, nie niečo, čo už appka
vyžaduje — zatiaľ sa nič nemení (appka stále volá len Firestore).

## 1. Príprava SQL Servera

Spustite `../sql-server-schema.sql` (Query v SQL Server Management Studiu,
alebo `sqlcmd`) — vytvorí databázu `HodnotenieDefektov` so všetkými
tabuľkami. Potom si vytvorte SQL Server login s právami na túto databázu
(`db_datareader` + `db_datawriter` stačí, netreba `sysadmin`).

## 2. Príprava Node.js na serveri

1. Nainštalujte **Node.js LTS** (stiahnuť z nodejs.org, alebo cez firemný
   balíčkovací nástroj, ak existuje) — stačí akákoľvek aktuálna LTS verzia.
2. Skopírujte priečinok `backend/` na server (napr. cez git clone tohto
   repozitára priamo na server, alebo zazipovaním a prenosom).
3. V priečinku `backend/` spustite:
   ```powershell
   npm install
   copy .env.example .env
   ```
4. Otvorte `.env` a vyplňte podľa reálneho prostredia (adresa SQL Servera,
   prihlasovacie údaje, port appky, prípadne `API_KEY` — pozri komentáre
   priamo v `.env.example`).
5. Otestujte ručne pred nastavením ako služby:
   ```powershell
   npm start
   ```
   Z inej konzoly (na tom istom stroji) over:
   ```powershell
   curl http://localhost:4000/api/health
   ```
   Malo by vrátiť `{"ok":true}`. Potom skús napr. `curl http://localhost:4000/api/areas`
   — malo by vrátiť `[]` (prázdna databáza) alebo zoznam, ak schema skript
   bežal správne. Ak vidíš chybu o pripojení na SQL Server, over `.env`
   hodnoty (najčastejšie: zlý server/port, firewall medzi strojmi, alebo
   SQL Server Authentication nie je na inštancii povolená — v SSMS:
   Server Properties → Security → "SQL Server and Windows Authentication mode").

## 3. Nasadenie ako Windows služba (aby bežala aj po reštarte servera)

Odporúčaný spôsob je **NSSM** (Non-Sucking Service Manager) — malý,
bezplatný nástroj špecificky na toto, netreba meniť kód appky:

1. Stiahnite NSSM (nssm.cc) a rozbaľte na server.
2. V príkazovom riadku (ako administrátor):
   ```powershell
   nssm install HodnotenieDefektovAPI
   ```
3. V okne, ktoré sa otvorí:
   - **Path:** cesta k `node.exe` (napr. `C:\Program Files\nodejs\node.exe`)
   - **Startup directory:** cesta k priečinku `backend\` na serveri
   - **Arguments:** `src\server.js`
4. V záložke **Details** nastavte "Startup type" na **Automatic**, nech
   služba beží aj po reštarte servera.
5. Spustite službu: `nssm start HodnotenieDefektovAPI` (alebo cez
   Windows Services — `services.msc`).

Logy (console výstup appky) nájdete nastavené v NSSM záložke **I/O**
(presmerovanie stdout/stderr do súboru) — odporúčam to nastaviť, aby sa
dali chyby neskôr dohľadať.

## 4. Firewall a HTTPS (voliteľné, ale odporúčané)

- Vo Windows Firewalle povoľte prichádzajúce spojenia na port appky
  (default `4000` z `.env`) **len z rozsahu firemnej vnútornej siete**,
  nie odkiaľkoľvek.
- Ak chcete HTTPS aj vo vnútornej sieti (odporúčané, najmä ak appku
  necháte na GitHub Pages — inak prehliadač môže volania na http blokovať),
  najjednoduchšie je dať pred tento Node proces **IIS ako reverse proxy**
  (s interným SSL certifikátom) cez moduly Application Request Routing +
  URL Rewrite — vtedy appka/klienti volajú `https://<interný-názov-servera>/api/...`
  a IIS to preposiela na `http://localhost:4000/api/...`. Toto je
  štandardný postup na Windows Serveri, netreba meniť kód backendu.

## 5. Čo backend API ponúka (zatiaľ bez napojenia appky)

Pre každú "kolekciu" appky (`areas`, `batches`, `photos`, `operators`,
`qualityAlerts`, `qualityAlertAcks`, `attempts`, `kv`) sú 4 endpointy pod
`/api/<kolekcia>`, zrkadliace presne to, čo appka dnes robí na Firestore
cez `idbPut/idbGet/idbGetAll/idbDeleteKey`:

| HTTP                        | Zodpovedá                  |
|------------------------------|-----------------------------|
| `GET /api/<kolekcia>`        | `idbGetAll(store)`          |
| `GET /api/<kolekcia>/:id`    | `idbGet(store, key)`        |
| `POST /api/<kolekcia>`       | `idbPut(store, val)` — upsert, telo = JSON objekt, id v tele je nepovinné (ak chýba, server ho vygeneruje a vráti `{id}`) |
| `DELETE /api/<kolekcia>/:id` | `idbDeleteKey(store, key)`  |

`kv` sa správa trochu inak — namiesto `POST /api/kv` (bez id v URL) je to
`POST /api/kv/:key` (napr. `POST /api/kv/activeBatchId`), keďže appka
dnes volá `idbPut('kv', {key:'activeBatchId', value:...})` a kľúč je
súčasťou URL cesty namiesto tela. Podrobnosti v `src/routes/kv.js`.

JSON tvar objektov (polia, veľké/malé písmená) je zámerne **identický**
s tým, čo appka dnes dostáva z Firestore (napr. `batchId`, `operatorName`,
`scorePercent`, vrátane vnoreného poľa `answers` pri `attempts`) — backend
si prevod na/z SQL stĺpcov (snake_case) rieši sám vo vnútri. Vďaka tomu
by prepojenie appky na toto API malo byť len výmena volaní
`firestore.collection(x)...` za `fetch('/api/x', ...)` v dátovej vrstve
(`idbPut/idbGet/idbGetAll/idbDeleteKey/idbClear` v hodnotenie-defektov.html),
bez zmeny zvyšku appky.

## 6. Čo ešte chýba (ďalšie kroky migrácie)

- **Prepojenie appky na toto API** (zatiaľ nespravené, appka stále volá
  Firestore) — prepísať dátovú vrstvu appky.
- **Riešenie prihlásenia appky** — Firebase Authentication dnes stráži
  celú appku; pri SQL Serveri treba vlastné riešenie (alebo Firebase Auth
  ponechať len na login, dáta presunúť sem).
- **Migrácia existujúcich dát** z Firestore do SQL Servera (exportný/
  importný skript) — zatiaľ nič nepreniesol, táto API čaká na prázdnu/
  novú databázu.
