# QA Report — Habit Tracker

Propriétaire : qa. Référence : `API_CONTRACT.md` (sections 1 à 9). Date : 2026-10-08, après correction des bugs.

## 1. Résultats des tests

| Suite | Commande | Fichiers | Tests | Résultat |
|---|---|---|---|---|
| Serveur | `cd server && npm test` | 5 | 112 | 112 réussis, 0 échec |
| Client | `cd client && npm test` | 4 | 53 | 53 réussis, 0 échec |

Les deux suites passent aussi avec `TZ=America/Los_Angeles` (UTC-7) et `TZ=Pacific/Kiritimati` (UTC+14). Aucune date n'est donc fabriquée en UTC. La suite client a été lancée 3 fois de suite sans échec intermittent.

### Serveur (`server/tests/`)
- `streaks.test.js` (15) : `computeStreaks` en unitaire.
  - Habitude daily et weekdays (L/M/V).
  - Un week-end ou un jour non prévu ne casse pas la série.
  - Un check-in sur un jour non prévu est ignoré.
  - Aujourd'hui prévu mais non coché : la série part du jour prévu précédent.
  - Un trou casse la série.
  - La meilleure série peut être plus longue que la série en cours.
  - Dimanche = 6 (conversion de `getDay()`).
  - Passage d'année, dates en désordre ou en double, check-ins futurs ignorés.
- `habits.api.test.js` (44) : forme JSON, `trim`, `weeklyGoal` par défaut et plafonné au PATCH, `days` triés, `daily` → 0..6, 23 cas de validation en 400, JSON invalide, tri par id avec ou sans archivées, 404 (id inconnu ou non numérique), PATCH d'une habitude archivée, archive et désarchivage.
- `checkins.api.test.js` (20) : PUT et DELETE idempotents, recalcul au décochage (ven+lun+mer → 3, puis décocher mer → 0 / 2), date future ou invalide → 400, ordre des erreurs (404 → 400 date → 400 archivée), `GET /api/checkins` (bornes incluses, archivées exclues, 400 si paramètres manquants ou `from > to`).
- `stats.api.test.js` (31) : scénario de 5 habitudes, valeurs calculées à la main pour summary, daily, weekday, ranking et heatmap.
  - Taux non arrondis.
  - Classement : `null` en dernier, égalité départagée par l'id.
  - `bestStreak` vaut `null` sans habitude, 0 avec des habitudes sans check-in.
  - Bornes des paramètres → 400.
  - Heatmap d'une année passée complète (2025 → 365 jours, 2024 → 366), année future → `days: []`.
  - Check-in antérieur à `createdAt` exclu des taux.
- `seed.test.js` (2) : 5 habitudes, dont une weekdays et une archivée, environ 120 jours, aucun check-in futur, résultat reproductible.

### Client (`client/tests/`, Vitest, Testing Library, jsdom, `fetch` simulé, horloge fixée au jeu. 2026-10-08)
- `HabitForm.test.jsx` (23) :
  - `validateHabit` (dont l'emoji composé, QA-F2).
  - Erreurs de champ avec `aria-invalid` et `aria-describedby` (QA-F4).
  - Payload weekdays conforme au contrat, objectif plafonné, au moins un jour obligatoire.
  - Mode édition, erreur serveur, bouton Annuler.
- `HabitsPage.test.jsx` (12) :
  - États chargement, vide, erreur avec Réessayer, serveur injoignable.
  - Grille des 7 jours locaux, 0 = lundi.
  - **Mise à jour optimiste**, puis séries renvoyées par le serveur.
  - **Rollback** sur erreur 400 et sur erreur réseau.
  - Changement de jour au `focus` (QA-F1), contraste de la coche (QA-F5).
  - Création, archivage avec `window.confirm` simulé.
- `Dashboard.test.jsx` (12) :
  - `formatRate`, les 4 cartes KPI (valeurs, `null`, squelette de chargement, erreur avec Réessayer).
  - Paramètres des 5 appels de stats, erreur isolée à un seul bloc, état vide.
  - Heatmap au clavier (QA-D1), données vidées au changement d'année (QA-D2), tableaux de données (QA-D4).
  - Navigation entre les années.
- `App.test.jsx` (6) : navigation vers le dashboard chargé en lazy (lien actif), route inconnue, sélecteur de thème (`data-theme` et `localStorage`), édition avec message de confirmation, archivage annulé, désarchivage qui recharge la grille.

## 2. Bugs

| Id | Gravité | Fichier:ligne | Description | Propriétaire | Statut |
|---|---|---|---|---|---|
| QA-F1 | Basse | `client/src/pages/HabitsPage.jsx:10` | « Aujourd'hui » était figé au montage de la page. Il est maintenant recalculé toutes les 60 s, au `focus` et au `visibilitychange`, et la grille se recharge. Reste un écart possible entre l'horloge du client et celle du serveur, faute d'endpoint « aujourd'hui » : le rollback et le message d'erreur couvrent ce cas. | frontend | **Corrigé**, vérifié par test |
| QA-F2 | Basse | `client/src/components/HabitForm.jsx:32` | L'icône était comptée en unités UTF-16 au lieu de points de code, comme le fait le serveur. | frontend | **Corrigé**, vérifié par test (`it.fails` retiré) |
| QA-F3 | Basse (a11y) | `client/src/components/HabitRow.jsx:22` | Saut de titre h1 → h3 : le nom de l'habitude est maintenant un `h2`. | frontend | **Corrigé**, vérifié par test |
| QA-F4 | Basse (a11y) | `client/src/components/HabitForm.jsx` | Les erreurs n'étaient pas reliées à leur champ. `aria-describedby` est maintenant présent sur l'icône, la couleur, les jours et l'objectif. | frontend | **Corrigé**, vérifié par test |
| QA-F5 | Basse (a11y) | `client/src/components/HabitRow.jsx:4`, `styles/app.css:383` | Contraste de la coche ✓ : elle est maintenant noire ou blanche selon la luminance WCAG de la couleur de l'habitude (`--habit-on`). | frontend | **Corrigé**, vérifié par test et par lecture du CSS |
| QA-D1 | Moyenne (a11y) | `client/src/dashboard/Heatmap.jsx` | La heatmap n'était pas accessible au clavier. C'est maintenant une `role=grid` avec un seul arrêt de tabulation, navigation aux flèches, Home/End/Échap, et un `aria-label` par jour. | dataviz | **Corrigé**, vérifié par test |
| QA-D2 | Basse | `client/src/dashboard/useStats.js:15`, `DashboardPage.jsx:79` | L'ancienne heatmap restait affichée pendant le chargement d'une autre année. Les données sont maintenant vidées pendant le chargement et l'année est bornée à 1970 minimum. | dataviz | **Corrigé**, vérifié par test |
| QA-D3 | Basse | `client/src/dashboard/KpiCards.jsx:5` | `<a href>` rechargeait la page : c'est maintenant un `<Link>` dans le routeur. | dataviz | **Corrigé**, vérifié par lecture du code |
| QA-D4 | Basse (a11y) | `client/src/dashboard/Charts.jsx:37` | Les graphiques n'avaient pas d'alternative textuelle : chacun a maintenant un tableau de données repliable (`<details>`, avec `caption`). | dataviz | **Corrigé**, vérifié par test |

**Bugs ouverts : 0.** Aucun bug n'a été trouvé dans `server/`.

## 3. Revue : points conformes
- **Serveur** :
  - Les erreurs ont la forme `{ error: { message } }`, y compris pour un JSON invalide et une route inconnue.
  - Les requêtes SQL sont préparées.
  - Les dates sont validées comme de vraies dates du calendrier.
  - `addDays` est sûr vis-à-vis de l'heure d'été.
  - Les taux ne sont pas arrondis et les habitudes archivées sont exclues des stats.
- **Client** :
  - `api.js` renvoie le `message` du serveur, ou « Serveur injoignable » si la requête échoue.
  - Aucun `toISOString()` dans le code, et `getDay()` est toujours converti en 0 = lundi.
- **Responsive à 375 px (lecture du CSS)** :
  - Sous 760 px, la grille passe à `repeat(7, minmax(0,1fr))` avec des cases de 44 px maximum.
  - Sous 480 px, le formulaire passe sur une colonne.
  - La heatmap défile horizontalement, les KPI sont sur une colonne et le tableau de données a son propre défilement.
- **Thème** : les variables de §6 sont définies sur `:root` et `[data-theme="dark"]`, avec un repli sur `prefers-color-scheme`. `:focus-visible` est stylé.

## 4. Non testé
- Le rendu SVG réel de Recharts : dans jsdom, `ResponsiveContainer` a une largeur nulle. Seuls les états, les appels et les tableaux alternatifs sont testés.
- Le responsive et les contrastes dans un vrai navigateur (pas de test E2E) : vérifiés uniquement en lisant le CSS.
- `server/src/index.js` (`listen`) et le fichier `server/data/habits.db` hors `:memory:`.
- La disparition du message d'erreur d'une ligne après 5 s (il faudrait simuler `setTimeout`).
- Un écart réel d'horloge entre client et serveur, et le passage à l'heure d'été en conditions réelles.
