# Hodnotenie defektov

Jednosúborová webová aplikácia (bez backendu, bez build kroku) na
trénovanie a testovanie operátorov kvality pri vizuálnej kontrole defektov
vo výrobe. Operátor hodnotí sériu fotiek ako **OK / Hranične OK / NOK**,
aplikácia to porovná so správnymi odpoveďami nastavenými administrátorom
a výsledky zbiera do reportov a dashboardu.

## Spustenie

Žiadna inštalácia. Stačí stiahnuť `hodnotenie-defektov.html` a otvoriť ho
v prehliadači (odporúčané Chrome alebo Edge, aktuálna verzia).

Dáta (fotky, správne odpovede, výsledky testov) sa ukladajú lokálne
v prehliadači cez IndexedDB — sú viazané na konkrétny prehliadač
a počítač, nesynchronizujú sa medzi zariadeniami.

## Základný tok

1. **Administrácia** (chránená heslom, nastaví sa pri prvom spustení)
   → nahrať fotky defektov do dávky → definovať správne odpovede
   → nastaviť dávku ako aktuálnu pre operátorov.
2. **Test** (bez hesla) → operátor zadá meno a vyhodnotí fotky → na konci
   vidí svoj výsledok.
3. **Administrácia → Reporty / Dashboard** → sledovanie výsledkov
   jednotlivých operátorov aj vývoja v čase.

Podrobný technický popis architektúry, dátového modelu a implementačných
detailov je v [`PROJECT-SUMMARY.md`](./PROJECT-SUMMARY.md) — určené najmä
ako kontext pre ďalší vývoj (napr. v Claude Code).

## Stav projektu

Funkčný, priebežne dolaďovaný podľa reálneho používania. Známe limity:

- žiadna synchronizácia dát medzi zariadeniami (čisto lokálne úložisko),
- heslo administrátora je len jednoduchá ochrana na strane prehliadača,
  nie skutočné zabezpečenie.
