# QA Report 2: Habit Tracker (full review after the FR/EN language switch)

Author: QA agent. Date: 2026-10-13 (Tuesday). Scope: every feature of the client (Habits, Dashboard, navigation, theme, language, responsive, accessibility) in a real browser (Chromium via Playwright), plus direct API contract checks. Earlier report: `QA_REPORT.md` (all 9 earlier bugs were re-checked, see section 5).

Environment: dev servers already running (client http://localhost:5173, API http://localhost:3001), dev database `server/data/habits.db`. Application source code was not modified.

## 1. Results

| Suite | Command | Result |
|---|---|---|
| Server unit/API (Vitest + supertest) | `npm --prefix server test` | **115 passed**, 0 failed (5 files) |
| Client unit (Vitest + Testing Library) | `npm --prefix client test` | **63 passed**, 0 failed (5 files) |
| **New** E2E (Playwright, Chromium) | `npm --prefix client run e2e` | **48 passed, 0 failed, 9 fixme** (9 app bugs). The full suite ran twice in a row with the same result, so no flaky tests. |

The `fixme` tests document app bugs: they assert the correct behaviour and will pass once the bug is fixed (remove the `fixme`).

## 2. Bugs found

| ID | Title | Severity | Priority | Location |
|---|---|---|---|---|
| QA2-01 | Keyboard focus is lost after toggling a grid cell | Medium (a11y) | P2 | `client/src/components/HabitRow.jsx:75` |
| QA2-02 | Messages already on screen stay in the old language after a FR/EN switch | Medium (i18n) | P2 | `HabitForm.jsx:88,103`, `HabitsPage.jsx:124,134,138,149,152,160,164` |
| QA2-03 | The archived-list error always uses the language active when the page loaded (stale closure) | Low (i18n) | P2 | `client/src/pages/HabitsPage.jsx:47-55` |
| QA2-04 | `localStorage.lang = "constructor"` (any inherited key) crashes the app to a blank page | Low | P3 | `client/src/i18n/I18nContext.jsx:9` |
| QA2-05 | A valid name of 41 to 60 emoji cannot be entered (input `maxLength` counts UTF-16 units) | Low | P3 | `client/src/components/HabitForm.jsx:14,118` |
| QA2-06 | Ranking chart label cuts an emoji in half and shows a "�" glyph | Low | P3 | `client/src/dashboard/Charts.jsx:169-170,179` |
| QA2-07 | French chart axes show "50%" while the rest of the French UI shows "50 %" | Low (i18n) | P3 | `client/src/dashboard/Charts.jsx:83` |
| QA2-08 | Focus is not returned after the habit form closes (Cancel / Create / Save) | Low (a11y) | P3 | `client/src/pages/HabitsPage.jsx:140,175-179,196` |
| QA2-09 | The French nav says "Dashboard" and "Chargement du dashboard…", but the page title is "Tableau de bord" | Low (i18n wording) | P3 | `client/src/i18n/messages.js:23-24` |

No bug was found in `server/`. All contract checks in section 4 passed.

### QA2-01: Keyboard focus is lost after toggling a grid cell
- **Severity / priority:** Medium (accessibility, WCAG 2.4.3 / 2.1.1) / P2
- **Steps:** 1. Open `/`. 2. Press Tab until a day cell of a habit has focus. 3. Press Space (or Enter).
- **Expected:** the cell toggles and keeps focus, so the user can keep moving through the grid with Tab.
- **Actual:** the cell toggles, but `document.activeElement` becomes `<body>`. The next Tab starts again from the top of the page. I reproduced this by hand in the browser and in the e2e test `habits.spec.js › keyboard: Space toggles a cell and focus stays on it` (fixme).
- **Root cause:** `HabitRow.jsx:75` sets `disabled={pending}` on the button while the request is pending. In Chromium, disabling the focused element removes its focus.
- **Suggested fix:** do not use the `disabled` attribute. Use `aria-disabled={pending}`, ignore clicks while pending (`onClick={() => !pending && onToggle(...)}`), and keep the `.is-pending` styling.

### QA2-02: Messages already on screen stay in the old language after a language switch
- **Severity / priority:** Medium (i18n: the UI mixes languages) / P2
- **Steps (validation):** 1. Open `/` in FR. 2. Click "+ Nouvelle habitude", then "Créer" with an empty name. "Le nom est obligatoire." appears. 3. Switch the language to EN.
- **Expected:** "Name is required."
- **Actual:** the labels switch to English but the error stays "Le nom est obligatoire." (e2e `i18n.spec.js › validation errors already shown…`, fixme).
- **Steps (notice):** archive a habit in FR. The notice reads « X » archivée. Switch to EN: the notice stays in French (e2e `…a notice already shown…`, fixme).
- **Same root cause, also affected:** the server error in the form (`submitError`), row check-in and archive errors (shown for 5 s), and the unarchive error in the archived panel.
- **Root cause:** these components store **already-translated strings** in React state:
  - `HabitForm.jsx:88`: `setErrors(validateHabit(values, t))`
  - `HabitForm.jsx:103`: `setSubmitError(describeError(err, t))`
  - `HabitsPage.jsx:134,138,149,160`: `setNotice(h.created(name))` and the other notices
  - `HabitsPage.jsx:124,152`: `showRowError(id, h.saveFailed(...))`
  - `HabitsPage.jsx:164`: `unarchiveFailed(...)`
- **Suggested fix:** store a key, its parameters and the raw error, then translate at render time. For example, use `setNotice({ key: 'created', name })` and render `h[notice.key](notice.name)`. For row and submit errors, store the `Error` object and call `describeError(err, t)` at render, as the page-level load error already does (it works, see section 3). For the form, store the error codes, or re-run `validateHabit(values, t)` at render when errors are shown.

### QA2-03: The archived-list error uses the language active when the page loaded
- **Severity / priority:** Low / P2 (it is quick to fix together with QA2-02)
- **Steps:** 1. Open `/` with the default language (FR). 2. Switch to EN. 3. Make `GET /api/habits?includeArchived=true` fail (API stopped or request blocked). 4. Click "Show archived".
- **Expected:** "Server unreachable" with "Retry".
- **Actual:** "Serveur injoignable" next to an English "Retry" button. The error happens *after* the switch and is still in French (e2e `…archived-list error uses the current language after a switch`, fixme).
- **Root cause:** `HabitsPage.jsx:47-55`: `loadArchived` is a `useCallback(..., [])` that captures the `t` of the first render (`describeError(err, t)`, line 53).
- **Suggested fix:** store the error object (`error: err`) and translate it at render with `describeError(archived.error, t)`. Alternatively, add `t` to the dependency array, but that only fixes new errors and leaves QA2-02 open.

### QA2-04: An inherited object key in `localStorage.lang` crashes the app
- **Severity / priority:** Low (it needs a tampered or corrupted storage value, but the result is a blank page with no way out except clearing storage) / P3
- **Steps:** in DevTools run `localStorage.setItem('lang','constructor')`, then reload. Values like `toString` and `hasOwnProperty` do the same.
- **Expected:** fallback to French, as with an unknown value such as `de`, which works.
- **Actual:** blank page. Console: `TypeError: Cannot read properties of undefined (reading 'brand') at Layout (App.jsx:17)` (e2e `…unexpected value in localStorage.lang ("constructor")…`, fixme).
- **Root cause:** `I18nContext.jsx:9`: `v in MESSAGES` is also true for inherited properties, so `MESSAGES['constructor']` is `Object` and `t.app` is `undefined`. There is no React error boundary to contain the crash.
- **Suggested fix:** `return Object.hasOwn(MESSAGES, v) ? v : DEFAULT_LANG;`. Optionally add an error boundary around `<Layout>`.

### QA2-05: A valid 41 to 60 emoji name cannot be entered
- **Severity / priority:** Low / P3
- **Steps:** open the new-habit form and paste or type 60 emoji (e.g. 😀 × 60). The contract counts 60 code points as valid, and the server accepts it (checked with a direct API call: 60 emoji → 201, 61 → 400).
- **Expected:** the field accepts the 60 emoji.
- **Actual:** the input stops at 40 emoji (e2e `habits.spec.js › a 60-emoji name… can be typed in full`, fixme).
- **Root cause:** `HabitForm.jsx:14,118`: `maxLength={NAME_INPUT_MAX_LENGTH}` with a value of 80. HTML `maxLength` counts UTF-16 units, and an astral emoji takes 2 units, so 80 units hold only 40 emoji.
- **Suggested fix:** set `NAME_INPUT_MAX_LENGTH = 120` (2 × 60: every code point is at most 2 UTF-16 units, so 60 code points always fit). Or remove `maxLength` and rely on `validateHabit`, which already counts code points.

### QA2-06: The ranking chart label cuts an emoji in half
- **Severity / priority:** Low / P3
- **Steps:** create a habit named `QA-e2e abcdef😀😀😀` and open `/dashboard`.
- **Expected:** a cleanly truncated label such as `QA-e2e abcdef😀…`.
- **Actual:** the label is `QA-e2e abcdef�…`: a lone high surrogate is rendered (e2e `dashboard.spec.js › ranking axis labels never split an emoji`, fixme).
- **Root cause:** `Charts.jsx:169-170`: `truncate()` uses `str.length` and `str.slice()`, which work on UTF-16 units.
- **Suggested fix:** `const cps = [...str]; return cps.length > n ? cps.slice(0, n - 1).join('') + '…' : str;`. Use `Intl.Segmenter` if ZWJ emoji such as 👨‍👩‍👧 must never be split either.

### QA2-07: French chart axes use "50%" instead of "50 %"
- **Severity / priority:** Low (format consistency) / P3
- **Steps:** open `/dashboard` in FR and look at the Y axis of "Complétion sur 30 jours" and "Par jour de la semaine".
- **Expected:** `0 %`, `25 %`, `50 %`… like the KPI cards, tooltips and tables (`t.percent`).
- **Actual:** `0%`, `25%`, `50%`… (e2e `i18n.spec.js › French chart axis ticks use the French percent format`, fixme).
- **Root cause:** `Charts.jsx:83`: the module-level `pctAxis` hard-codes `` tickFormatter={(v) => `${v}%`} ``.
- **Suggested fix:** build the axis inside the components that have `t`, e.g. `const pctAxis = (t) => <YAxis … tickFormatter={(v) => t.percent(v)} />`.

### QA2-08: Focus is not returned after the habit form closes
- **Severity / priority:** Low (a11y, WCAG 2.4.3) / P3
- **Steps:** focus "+ New habit", press Enter. Focus moves to "Name", which is correct. Click "Cancel", or create the habit.
- **Expected:** focus goes back to the button that opened the form (or to the new row or the notice after a creation).
- **Actual:** focus goes to `<body>` (e2e `responsive-a11y.spec.js › closing the habit form returns focus…`, fixme). The same happens after "Edit": the Edit button keeps its place, but focus is still lost.
- **Root cause:** `HabitsPage.jsx:175-179`: the "+ New habit" button is unmounted while `editing` is set. `setEditing(null)` (lines 140 and 196) remounts it, but nothing moves the focus.
- **Suggested fix:** keep the opener in a ref (`openerRef.current = e.currentTarget`) and focus it in an effect when `editing` becomes `null`. For the "+ New habit" button, hide it with `hidden` / CSS instead of unmounting it, or focus the re-rendered button through a ref.

### QA2-09: The French nav label is "Dashboard" but the page title is "Tableau de bord"
- **Severity / priority:** Low (wording, mixed language) / P3
- **Steps:** in FR, look at the nav and at the loading text of the dashboard page.
- **Actual:** the nav link reads "Dashboard" and the lazy-load text reads "Chargement du dashboard…", but the page `<h1>` reads "Tableau de bord".
- **Location:** `client/src/i18n/messages.js:23-24`.
- **Suggested fix:** use `navDashboard: 'Tableau de bord'` and `loadingDashboard: 'Chargement du tableau de bord…'`. If "Dashboard" is a deliberate product name, use it in the `<h1>` too.

## 3. Verified working

| Area | Scenarios (browser, e2e unless noted) | Result |
|---|---|---|
| Habits: create | Daily habit with icon and colour swatches (`aria-pressed`, colour input in sync); name trimmed; notice shown; persisted after reload; weekdays habit (goal follows the number of days, payload `{type:'weekdays', days:[0,2,4]}`, goal 2) | OK |
| Habits: validation | Empty and whitespace name; 61 characters; 60 code points / 61 UTF-16 units accepted; icon empty or 9 characters → "Pick an emoji."; ZWJ family emoji (5 code points) accepted; goal 0 / 8 / empty → range error; weekdays with 0 days → "Pick at least one day."; goal 3 with 2 days → "Goal cannot exceed… (2)"; `aria-invalid` and `aria-describedby` set; nothing sent to the server while invalid; server 400 shown in the form, which stays usable. An invalid colour cannot be entered: `<input type=color>` only produces `#rrggbb` and the client normalises it to upper case. | OK |
| Habits: edit | Prefilled form, "+ New habit" hidden while editing, Cancel, rename plus a switch to weekdays (Sunday removed → goal 6, Sunday cell marked as not scheduled), "updated" notice, API state checked | OK |
| Habits: archive / unarchive | Confirm dialog text (FR « … » / EN “…”); Cancel keeps the habit; Accept removes it plus a notice; notice close button; Show/Hide archived (`aria-expanded`); unarchive brings the habit back with its check-ins; archived-list error plus Retry | OK |
| 7-day grid | 7 local days in order, labels match an independent `Intl` oracle (FR "mardi 13/10", EN "Tuesday 10/13"); today has `is-today` and the "(today)" label; unscheduled day has `is-unscheduled` and ", not scheduled"; checking an unscheduled day is stored but does not change the streak | OK |
| Optimistic update | Cell flips before the response (request held), disabled while pending; rollback on a 400 with "Could not save: <server msg>"; the row message disappears after about 5 s; network error → "Server unreachable" | OK |
| Streaks | 0 → today 1 → yesterday 2 / best 2 → untick today 1 / best 1 (today unticked does not break the streak); state persists after reload | OK |
| Habits states | Empty state plus "Create my first habit"; API unreachable → error plus Retry recovers; proxy 500 without a body → "Server unreachable" | OK |
| Dashboard KPI | 4 cards equal `/api/stats/summary` (active, today %, "x/y checked", best streak "N d" plus habit name, 30-day %); empty values (—, "Nothing scheduled today", "No streak yet"); link "Create your first habit" is client-side (no reload) | OK |
| Heatmap | Next disabled on the current year; previous year → "No habits scheduled in 2025."; lower bound 1970 (Previous disabled); one Tab stop; arrows (±1 day / ±1 week), clamped to Jan 1 and today; Home / End; Escape hides the tooltip; one `aria-label` per day with the full date; future days hidden and `aria-disabled`; hover tooltip | OK |
| Charts | Line (1 curve), weekday bars (7), ranking bars (one per active habit, API order); three "Show data" tables with caption and column headers (30 rows; Monday→Sunday; ranking = API order); tooltip on hover of the daily chart | OK |
| Dashboard states | Empty state with mocked empty stats; error per block (KPI 500 shows the server message, ranking unreachable), other blocks still render; Retry recovers | OK |
| Navigation | Nav links, `aria-current="page"`, Back / Forward, deep link plus refresh of `/dashboard`, unknown route → "Page not found." / "Page introuvable.", no console errors while browsing | OK |
| Theme | System / Light / Dark set `data-theme`, persist (`localStorage.theme`, removed for "system"), body colour changes, "system" follows `prefers-color-scheme`; no flash: with the React bundle **blocked**, the inline script in `index.html` already applies `data-theme`, `lang="en"` and the title | OK |
| Language | French by default; `<html lang>` and `document.title` follow; persists across reload and across pages; unknown value (`de`) falls back to FR; full scan of visible text, `aria-label`, `title` and SVG text in EN (habits + archived + open form, dashboard + all tables) finds no French words, and the FR scan finds no English words (except QA2-09 and QA2-07); dates (FR "mardi 13 octobre 2026", EN "Tuesday, October 13, 2026"), percentages "84 %" / "84%", unit "j" / "d"; confirm dialog translated; form keeps typed values on a switch; load error, dashboard error and row error follow the switch | OK (except QA2-02, QA2-03, QA2-07, QA2-09) |
| Responsive 375 px | FR and EN: no horizontal scroll on Habits (with the form open in weekdays mode) or Dashboard; header selectors visible; grid cells ≥ 24 px and inside the viewport; the heatmap scrolls in its own container and starts on the latest weeks | OK |
| Accessibility basics | Every input, select and button has an accessible name (form open); Tab order nav → language → theme → "+ New habit"; visible focus ring; heatmap grid semantics | OK (except QA2-01, QA2-08) |

## 4. API contract checks (direct calls to http://localhost:3001/api)

All passed:
- **404:** `GET /habits/999999`, `/habits/abc`, `/habits/1.5`; `PATCH`, `POST /archive` and `PUT checkins` on an unknown id; unknown route (`GET /api/nope`, `DELETE /api/habits/1`). Every error has the shape `{error:{message}}`.
- **400 on POST /habits:**
  - missing field, invalid JSON, array body or `text/plain` body
  - blank name; 61 code points (60 emoji → 201)
  - colour `#00000`; icon of 9 code points (5-code-point ZWJ emoji → 201)
  - `days` empty, duplicated or out of range; unknown `type`
  - `weeklyGoal` 0, `"3"` (string), or greater than the number of days
- **PATCH:** a frequency change without a goal caps the goal (1 day → 1); `{}` → 200 with no change; `name:null` → 400; `daily` → `days` replaced by 0..6.
- **Check-ins:** PUT and DELETE are idempotent and return the updated streaks; future date → 400; `2026-13-01` → 400; archived habit → 400; unknown habit with a future date → 404 (error order as in contract §8.8); `GET /checkins` without parameters, with `from > to` or with `2026-02-30` → 400.
- **Stats:** year 1969 → 400; 3000 → `{days:[]}`; `days` 0 / 366 / `abc` → 400; `weeks` 53 → 400; `days=1` → today only; rates are not rounded.
- **Archive / unarchive:** idempotent.

## 5. Items from `QA_REPORT.md` re-verified

| Id | Re-check | Status |
|---|---|---|
| QA-F1 | Grid built from local dates; midnight rollover not reproduced (needs a clock change) | Not re-tested in the browser |
| QA-F2 | Composed emoji icon accepted in the browser | Still fixed |
| QA-F3 | Habit names are `h2` | Still fixed |
| QA-F4 | `aria-describedby` on name, icon, days and goal checked in the browser | Still fixed |
| QA-F5 | `--habit-on` contrast | Not re-measured (code unchanged) |
| QA-D1 | Heatmap keyboard (full e2e scenario) | Still fixed |
| QA-D2 | Data cleared on year change (empty state, no stale grid) | Still fixed |
| QA-D3 | KPI link is a router `<Link>` (no reload, checked with a window marker) | Still fixed |
| QA-D4 | "Show data" tables | Still fixed |

## 6. Observations (not counted as bugs)
- **O1 (UX):** unarchiving reloads the whole grid (`HabitsPage.jsx:162` → `setStatus('loading')`): the list briefly turns into "Loading habits…". A silent background reload would avoid the flicker.
- **O2 (UX):** in the form, switching "Every day" → "Specific days" resets the day selection to all 7 days (`HabitForm.jsx:70`). A previous weekdays selection is lost after a back-and-forth.
- **O3:** `document.title` does not change with the route ("Habits" on every page). The not-found page has no heading and no link home.
- **O4:** icon "abcdefgh" is accepted by the client and the server. This follows the contract's "string of 1 to 8 characters", but the contract also says "an emoji".
- **O5:** `PATCH {weeklyGoal:null}` → 400, while `POST` treats `null` as "default". This is a small inconsistency.
- **O6:** there is no React error boundary: any render error (see QA2-04) gives a blank page.
- **O7:** server error messages are French only. This is a known limitation and is not reported.
- **Test data:** the dev database now contains 76 **archived** habits whose names start with `QA-` (e2e runs and API probes; there is no delete endpoint). The seeded habits 1 to 5 were not modified. `npm run seed` would remove them but recreates the database, so I did not run it.

## 7. Files added or changed (tests and tooling only)
- `client/playwright.config.js`: Chromium, `baseURL` http://localhost:5173, `webServer` (`npm --prefix .. run dev`, `reuseExistingServer: true`), `workers: 1` (shared database).
- `client/e2e/helpers.js`: `qa` fixture that creates habits through the API and archives every `QA-e2e*` habit before and after each test; date and label oracles based on `Intl`.
- `client/e2e/navigation.spec.js` (8), `habits.spec.js` (17), `dashboard.spec.js` (7), `i18n.spec.js` (17), `responsive-a11y.spec.js` (8).
- `client/package.json`: `"e2e": "playwright test"` script and `@playwright/test` devDependency. Vitest only includes `tests/**`, so the two suites do not collide.
- Suggestion: add `client/test-results/` and `client/playwright-report/` to `.gitignore`.

## 8. Commands
```bash
npm --prefix server test          # 115 tests
npm --prefix client test          # 63 tests
npm --prefix client run e2e       # 57 e2e tests (48 pass, 9 fixme); reuses the running dev servers
npx --prefix client playwright test --project chromium -g "heatmap"   # a subset
```

## Corrections (2026-10-13)

Les 9 bugs sont corrigés ; les 9 tests e2e `fixme` ont été réactivés et passent.

| ID | Correction |
|---|---|
| QA2-01 | `HabitRow.jsx` : `aria-disabled` + clic ignoré pendant l'envoi (le bouton garde le focus) ; CSS `:hover`/`:active` alignés. |
| QA2-02 | Notices, erreurs de ligne et d'archives stockées en `{ key, name/err }` et traduites au rendu (`renderMessage` dans `HabitsPage.jsx`) ; `HabitForm.jsx` recalcule les erreurs de validation et l'erreur serveur au rendu. |
| QA2-03 | Erreur de la liste archivée stockée brute, traduite au rendu (nouveau message `archivedLoadFailed`). |
| QA2-04 | `I18nContext.jsx` : `Object.hasOwn(MESSAGES, v)`. |
| QA2-05 | `NAME_INPUT_MAX_LENGTH = NAME_MAX_LENGTH * 2` (60 emoji saisissables). |
| QA2-06 | `truncate` du classement coupe en points de code. |
| QA2-07 | Axe des pourcentages formaté avec `t.percent` (« 50 % » en français). |
| QA2-08 | Le formulaire mémorise le bouton qui l'a ouvert et lui rend le focus à la fermeture (repli : « + Nouvelle habitude »). |
| QA2-09 | Français : lien « Tableau de bord », « Chargement du tableau de bord… ». |

Résultats après corrections : client unitaires 63/63, e2e Playwright 57/57, build OK. Serveur non modifié (115/115 lors de la revue).
