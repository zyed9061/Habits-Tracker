# Contrat d'API — Habit Tracker

Propriétaire : team lead. Toute modification passe par le lead (message). Les coéquipiers implémentent **exactement** ce contrat.

## 1. Architecture et outillage

| Élément | Valeur |
|---|---|
| Node | 24 (déjà installé) |
| Serveur | Express, port **3001**, toutes les routes sous `/api` |
| Base | SQLite via le module intégré **`node:sqlite`** (`DatabaseSync`) — pas de dépendance native à compiler. Fichier `server/data/habits.db` ; variable `DB_PATH` pour surcharger (`:memory:` en test) |
| Serveur : export | `server/src/app.js` exporte `createApp(db)` (sans `listen`) ; `server/src/index.js` fait le `listen`. Indispensable pour les tests supertest |
| Client | React 18 + Vite, port **5173**, proxy Vite `/api` → `http://localhost:3001` |
| Graphiques | Recharts |
| Tests serveur | Vitest + supertest (devDependencies ajoutées par backend dans `server/package.json`, script `test`) |
| Tests client | Vitest + @testing-library/react + jsdom (devDependencies ajoutées par frontend dans `client/package.json`, script `test`, `environment: 'jsdom'`) |
| Scripts | `server`: `dev`, `start`, `seed`, `test` — `client`: `dev`, `build`, `test` |

## 2. Conventions

- **Dates** : chaîne `YYYY-MM-DD`, en heure **locale** du serveur. « Aujourd'hui » = date locale du serveur. Ne jamais utiliser `toISOString()` pour fabriquer une date (décalage UTC).
- **Jours de la semaine** : `0 = lundi … 6 = dimanche`. Attention : `Date.getDay()` renvoie 0 pour dimanche → convertir avec `(getDay() + 6) % 7`.
- **Taux** : nombre décimal entre `0` et `1` (pas de pourcentage), ou `null` quand aucun jour n'était prévu.
- **JSON** en `camelCase`. Identifiants : entiers.
- **Erreurs** : `{ "error": { "message": "…" } }` avec le code HTTP : `400` validation, `404` introuvable, `500` erreur serveur.
- **Couleur** : hex `#RRGGBB`. **Icône** : un emoji (chaîne de 1 à 8 caractères).

## 3. Modèle

### Habit
```json
{
  "id": 1,
  "name": "Lire 20 minutes",
  "color": "#4F46E5",
  "icon": "📚",
  "frequency": { "type": "daily", "days": [0,1,2,3,4,5,6] },
  "weeklyGoal": 7,
  "archived": false,
  "createdAt": "2026-09-01",
  "currentStreak": 5,
  "bestStreak": 12
}
```
- `frequency.type` : `"daily"` (alors `days` = `[0..6]`) ou `"weekdays"` (`days` = liste triée, sans doublon, non vide, de valeurs 0–6).
- `weeklyGoal` : entier 1–7, ≤ nombre de jours prévus. Défaut = nombre de jours prévus.
- `name` : 1 à 60 caractères après `trim`.

### Règles des séries (F3), calculées côté serveur
- Seuls les **jours prévus** (jour de semaine ∈ `frequency.days`) comptent ; un jour non prévu ne casse ni n'allonge la série.
- Un check-in sur un jour non prévu est accepté et stocké, mais n'entre pas dans les séries.
- `currentStreak` : nombre de jours prévus consécutifs cochés, en remontant depuis aujourd'hui. Si aujourd'hui est prévu mais **pas encore coché**, on part du jour prévu précédent (la journée n'est pas finie, la série n'est pas cassée).
- `bestStreak` : plus longue suite de jours prévus consécutifs cochés dans tout l'historique (≥ `currentStreak`).
- Les jours avant `createdAt` sont ignorés pour les taux, mais un check-in antérieur à `createdAt` (seed) reste valable pour les séries.

## 4. Endpoints

### Habitudes (F1)
| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| GET | `/api/habits?includeArchived=true` | — | `200 Habit[]` (par défaut sans les archivées), triées par `id` |
| GET | `/api/habits/:id` | — | `200 Habit` / `404` |
| POST | `/api/habits` | `{ name, color, icon, frequency, weeklyGoal? }` | `201 Habit` / `400` |
| PATCH | `/api/habits/:id` | sous-ensemble de `{ name, color, icon, frequency, weeklyGoal }` | `200 Habit` / `400` / `404` |
| POST | `/api/habits/:id/archive` | — | `200 Habit` (`archived: true`) |
| POST | `/api/habits/:id/unarchive` | — | `200 Habit` (`archived: false`) |

### Check-ins (F2)
| Méthode | Route | Réponse |
|---|---|---|
| GET | `/api/checkins?from=YYYY-MM-DD&to=YYYY-MM-DD` | `200 [{ "habitId": 1, "date": "2026-10-08" }]` (bornes incluses, habitudes non archivées) |
| PUT | `/api/habits/:id/checkins/:date` | `200 { "habitId", "date", "done": true, "currentStreak", "bestStreak" }` — idempotent |
| DELETE | `/api/habits/:id/checkins/:date` | `200 { "habitId", "date", "done": false, "currentStreak", "bestStreak" }` — idempotent |

`400` si la date est invalide ou **dans le futur** ; `404` si l'habitude n'existe pas ; `400` si l'habitude est archivée.

### Statistiques (F4, F5) — habitudes non archivées uniquement
Un jour compte pour une habitude s'il est prévu **et** ≥ `createdAt`.

| Route | Réponse |
|---|---|
| `GET /api/stats/summary` | `{ "activeHabits": 4, "todayRate": 0.5, "todayCompleted": 2, "todayScheduled": 4, "bestStreak": { "value": 12, "habitId": 1, "habitName": "Lire" } \| null, "rate30d": 0.73 }` |
| `GET /api/stats/heatmap?year=2026` | `{ "year": 2026, "days": [{ "date": "2026-01-01", "completed": 2, "scheduled": 3, "rate": 0.67 }] }` — un élément par jour de l'année jusqu'à aujourd'hui inclus |
| `GET /api/stats/daily?days=30` | `[{ "date", "completed", "scheduled", "rate" }]` — les N derniers jours, aujourd'hui inclus, ordre chronologique (`days` 1–365, défaut 30) |
| `GET /api/stats/weekday?weeks=12` | `[{ "weekday": 0, "completed", "scheduled", "rate" }]` — 7 éléments, lundi→dimanche, sur les N dernières semaines (défaut 12) |
| `GET /api/stats/ranking?days=30` | `[{ "habitId", "name", "color", "icon", "completed", "scheduled", "rate", "currentStreak" }]` — trié par `rate` décroissant (`null` en dernier) |

`rate30d` = Σ cochés prévus / Σ prévus sur les 30 derniers jours (aujourd'hui inclus), toutes habitudes confondues.

### Chatbot d'analyse (dashboard)
`POST /api/chat` — répond uniquement à partir des résultats du dashboard ; le serveur reconstitue lui-même les données (mêmes fonctions que `/api/stats/*` : KPI, 30 jours, jours de la semaine sur 12 semaines, classement 30 jours avec séries en cours / meilleures, totaux de la heatmap de l'année) et appelle l'API OpenAI Chat Completions (`OPENAI_MODEL`, défaut `gpt-4`, température 0,2, délai 20 s).

Requête : `{ "message": "…", "history": [{ "role": "user" | "assistant", "content": "…" }], "lang": "fr" | "en" }`
- `message` obligatoire, non vide, ≤ 500 caractères ; `history` optionnel (rôles `user`/`assistant` uniquement — tout `system` est refusé, contenu ≤ 2000 caractères, seuls les 10 derniers tours sont conservés) ; `lang` optionnel (défaut `fr`), langue de la réponse.
- Réponse 200 : `{ "reply": "…" }` (texte brut). Hors sujet : refus court dans la langue (« I can only analyse your habit results and advise based on them. »).
- Erreurs (forme habituelle `{ error: { message } }`, message générique, jamais la clé ni le corps OpenAI) : 400 validation ou JSON invalide ; 429 plus de 20 requêtes / minute / IP ; 503 `OPENAI_API_KEY` absente ; 502 erreur, délai dépassé ou réponse invalide d'OpenAI.

## 5. Seed
`npm run seed` (dans `server/`) recrée la base avec 5 habitudes variées (au moins une `weekdays`, une archivée) et environ 120 jours d'historique réaliste, pour que heatmap et graphiques soient lisibles.

## 6. Thème partagé (F6)
frontend définit les variables CSS dans `client/src/styles/theme.css`, sur `:root` (clair) et `[data-theme="dark"]` : `--bg`, `--surface`, `--text`, `--text-muted`, `--border`, `--accent`, `--success`, `--danger`, `--radius`. dataviz les utilise ; pas de couleurs en dur hors couleurs des habitudes et échelle de la heatmap.

## 7. Intégration client
- frontend fournit `client/src/api.js` (fonctions fetch typées par ce contrat, erreurs levées avec le `message` serveur). dataviz l'importe en lecture et demande à frontend les fonctions manquantes.
- frontend gère le routage (`/` habitudes + grille, `/dashboard`) et monte `client/src/dashboard/DashboardPage.jsx` (export par défaut) fourni par dataviz.

## 8. Précisions validées après implémentation (backend)
1. Les taux ne sont **pas arrondis** côté serveur (`0.6666…`) ; l'arrondi se fait à l'affichage.
2. `summary.bestStreak` vaut `null` uniquement s'il n'y a aucune habitude active ; sinon le maximum (même 0), égalité départagée par le plus petit `id`.
3. Bornes : `days` 1–365, `weeks` 1–52, `year` 1970–9999 ; hors bornes → 400. Une année future renvoie `days: []`.
4. `GET /api/checkins` : `from` et `to` obligatoires, `from ≤ to`, sinon 400.
5. `PATCH` de `frequency` sans `weeklyGoal` : l'objectif est ramené au plus au nouveau nombre de jours prévus.
6. `days` non triés acceptés puis triés ; doublon → 400 ; avec `type: "daily"`, `days` est remplacé par `[0..6]`.
7. Id non numérique → 404. Modifier une habitude archivée est autorisé.
8. Ordre des erreurs de check-in : habitude introuvable (404), puis date invalide/future (400), puis habitude archivée (400).
9. `createApp(db, { today })` : second argument optionnel ; `today` est une **fonction** renvoyant `'YYYY-MM-DD'` (ex. `{ today: () => '2026-10-08' }`), pour fixer « aujourd'hui » dans les tests. `createApp` crée les tables si besoin. Modules purs testables : `server/src/streaks.js` (`computeStreaks(frequency, checkedDates, today)`), `server/src/stats.js`, `server/src/seed.js` (`seed(db, today)`).
