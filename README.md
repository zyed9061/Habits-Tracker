# Habit Tracker

Application web de suivi d'habitudes : création d'habitudes, check-in quotidien sur une grille semaine, séries calculées côté serveur et tableau de bord avec KPI, heatmap annuelle et graphiques.

## Prérequis
Node.js **24** ou plus (la base utilise le module intégré `node:sqlite`, aucune compilation native).

## Installation et lancement
```bash
npm run install:all   # dépendances racine, server/ et client/
npm run seed          # base de démonstration : 5 habitudes, ~120 jours d'historique
npm run dev           # API sur http://localhost:3001 + client sur http://localhost:5173
```
Ouvrir http://localhost:5173.

| Commande (racine) | Effet |
|---|---|
| `npm run dev` | lance l'API et le client en parallèle |
| `npm run seed` | recrée `server/data/habits.db` avec les données de démo |
| `npm test` | tests serveur (Vitest + supertest) puis client (Vitest + Testing Library) |
| `npm run build` | build de production du client dans `client/dist/` |

## Fonctionnalités
- **F1 Habitudes** : créer, modifier, archiver / désarchiver (nom, couleur, icône emoji, fréquence quotidienne ou jours précis, objectif hebdomadaire).
- **F2 Check-in** : grille des 7 derniers jours, mise à jour optimiste avec retour arrière en cas d'erreur.
- **F3 Séries** : série en cours et meilleure série, calculées côté serveur ; un jour non prévu ne casse pas la série.
- **F4 KPI** : habitudes actives, taux du jour, meilleure série, taux sur 30 jours.
- **F5 Visualisations** : heatmap annuelle (navigable au clavier), courbe 30 jours, barres par jour de la semaine, classement par régularité ; chaque graphique a un tableau « Voir les données ».
- **F6 Expérience** : responsive de 375 px au desktop, thème clair / sombre (préférence système, choix mémorisé), états vide, chargement et erreur.

## Architecture
```
package.json        scripts racine (concurrently)
API_CONTRACT.md     contrat d'API : routes, JSON, règles de séries, conventions
QA_REPORT.md        rapport de tests et de bugs
server/             Express 5 + node:sqlite
  src/app.js          createApp(db, { today }) — sans listen, pour les tests
  src/index.js        démarrage sur le port 3001
  src/streaks.js      calcul pur des séries
  src/stats.js        calcul pur des statistiques
  src/chat.js         POST /api/chat : validation, client OpenAI, limite de débit
  src/chatPrompt.js   construction pure du prompt et du contexte de données
  src/seed.js         données de démo déterministes
  tests/              110+ tests API et unitaires
client/             React 18 + Vite + Recharts (proxy /api → 3001)
  src/api.js          appels à l'API
  src/pages, components, styles/theme.css
  src/dashboard/      page Dashboard (KPI, heatmap, graphiques), chargée à la demande
  tests/              tests de composants
```

## Contrat d'API
Résumé ; le détail (formes JSON, codes d'erreur, cas limites) est dans [API_CONTRACT.md](API_CONTRACT.md).

- Dates `YYYY-MM-DD` en heure locale ; jours de la semaine `0 = lundi … 6 = dimanche` ; taux entre 0 et 1 (ou `null`).
- Erreurs : `{ "error": { "message" } }` avec 400 / 404 / 500.

| Route | Rôle |
|---|---|
| `GET/POST /api/habits`, `GET/PATCH /api/habits/:id` | habitudes |
| `POST /api/habits/:id/archive`, `/unarchive` | archivage |
| `GET /api/checkins?from&to` | check-ins d'une période |
| `PUT/DELETE /api/habits/:id/checkins/:date` | cocher / décocher (idempotent) |
| `GET /api/stats/summary` | 4 KPI |
| `GET /api/stats/heatmap?year`, `/daily?days`, `/weekday?weeks`, `/ranking?days` | visualisations |

## Chatbot d'analyse
Un bouton flottant sur le dashboard ouvre un assistant qui commente vos résultats (KPI, 30 jours, jours de la semaine, classement, séries, heatmap) et n'en sort pas : les questions hors sujet reçoivent un refus court. Le serveur appelle l'API OpenAI Chat Completions avec le fetch intégré (aucune dépendance).

Configuration dans `server/.env` (ignoré par git, modèle : `server/.env.example`) :
| Variable | Rôle |
|---|---|
| `OPENAI_API_KEY` | clé OpenAI, lue côté serveur uniquement ; sans elle `POST /api/chat` répond 503 |
| `OPENAI_MODEL` | modèle (défaut `gpt-4`) |

Le fichier est relu à la demande tant que la clé est absente de l'environnement. Les tests n'appellent jamais OpenAI (client simulé). Voir `POST /api/chat` dans [API_CONTRACT.md](API_CONTRACT.md).

## Limites connues
- « Aujourd'hui » est calculé par le navigateur pour la grille et par le serveur pour la validation. Identiques sur une même machine ; en cas de décalage d'horloge, cocher « aujourd'hui » peut renvoyer 400 (la case revient à son état et un message s'affiche).
- Application mono-utilisateur, sans authentification.
- Non testés automatiquement : le tracé SVG de Recharts (jsdom) et le démarrage réel du serveur ; le responsive a été vérifié manuellement à 375 px et en desktop.
