# Hodnotenie defektov

Jednosúborová webová aplikácia (bez build kroku) na trénovanie a testovanie
operátorov kvality pri vizuálnej kontrole defektov vo výrobe. Operátor
hodnotí sériu fotiek ako **OK / Hranične OK / NOK**, aplikácia to porovná
so správnymi odpoveďami nastavenými administrátorom a výsledky zbiera do
reportov a dashboardu.

## Spustenie

Žiadna inštalácia. Stačí otvoriť `hodnotenie-defektov.html` (alebo appku
nasadenú na GitHub Pages) v prehliadači (odporúčané Chrome alebo Edge,
aktuálna verzia) — vyžaduje sa internetové pripojenie.

Aplikácia je uzamknutá za prihlásením (Firebase Authentication, e-mail +
heslo) — bez platného účtu sa neotvorí ani Test, ani Administrácia. Účty
spravuje administrátor vo Firebase Console projektu.

Dáta (fotky, správne odpovede, výsledky testov) sa ukladajú v Cloud
Firestore (Firebase), takže sú **zdieľané medzi všetkými zariadeniami**
prihlásených používateľov, nie viazané na jeden prehliadač/počítač.

## Základný tok

1. **Prihlásenie** (e-mail + heslo, účet pridá administrátor vo Firebase
   Console).
2. **Administrácia** → nahrať fotky defektov do dávky → definovať správne
   odpovede → nastaviť dávku ako aktuálnu pre operátorov.
3. **Test** → operátor zadá meno a vyhodnotí fotky → na konci vidí svoj
   výsledok.
4. **Administrácia → Reporty / Dashboard** → sledovanie výsledkov
   jednotlivých operátorov aj vývoja v čase.

Podrobný technický popis architektúry, dátového modelu a implementačných
detailov je v [`PROJECT-SUMMARY.md`](./PROJECT-SUMMARY.md) — určené najmä
ako kontext pre ďalší vývoj (napr. v Claude Code).

## Stav projektu

Funkčný, priebežne dolaďovaný podľa reálneho používania. Známe limity:

- appka vyžaduje internetové pripojenie (Firebase),
- prístup majú len účty pridané vo Firebase Console — appka nemá vlastnú
  registráciu ani reset hesla,
- žiadne rozlíšenie rolí — všetci prihlásení majú rovnaké oprávnenia.
