# QA report — Dashboard chatbot ("Assistant")

Branch `feat/habits-chatbot`, tested 2026-10-13 against the running dev servers (client :5173, API :3001).
Scope: `POST /api/chat` (`server/src/chat.js`, `server/src/openai.js`, `server/src/app.js`), `client/src/dashboard/ChatPanel.jsx`.
No application source was modified. Only test file added: `client/e2e/chat-qa.spec.js`.

## 1. Verdict

| Suite | Result |
|---|---|
| `npm --prefix server test` | **142 passed** / 142 (6 files, incl. 27 chat tests) |
| `npm --prefix client test` | **73 passed** / 73 (6 files, incl. 9 ChatPanel tests) |
| `npm --prefix client run e2e` (before QA spec) | **61 passed** / 61 |
| `npx playwright test` (with new `chat-qa.spec.js`) | **77 passed, 0 failed, 3 skipped (`test.fixme`, app bug CB-03)** |
| API contract probes (34 requests, no OpenAI cost) | all as specified except CB-02 |
| Live gpt-4 | **Not verifiable**: 12 live attempts overall (1 lead + 11 QA), every one that reached OpenAI answered 429 (see §1b) |

## 1b. Live gpt-4 behaviour — blocked by OpenAI 429

**Environment note (not an app bug):** in this sandbox outbound HTTPS goes through a TLS-intercepting proxy; plain Node `fetch` intermittently fails with `SELF_SIGNED_CERT_IN_CHAIN` (server answers 502 "Service d'IA injoignable"). The team lead started a second API instance on :3002 with `node --use-system-ca --env-file-if-exists=.env`, which fixed TLS. Outside this sandbox no flag is needed.

| # | Scenario (target) | Result |
|---|---|---|
| — | 3 attempts on :3001 before the TLS fix | 502 "Service d'IA injoignable" in < 0.4 s (fetch threw, nothing sent to OpenAI) |
| 1 | L1 "Analyse mes résultats" on :3001 | 502 "Limite de requêtes du service d'IA atteinte…" (OpenAI 429) |
| 2–11 | L1, L2 (FR on-topic), L3 (EN on-topic), L4 (off-topic recipe FR), L5 (health question framed as habit, EN) on :3002 — each 30 s apart, each retried once after 60 s | **10 × 429**, same message |
| — | L6 mixed, L7 injection + prompt/key reveal, L8 forged assistant history, L10 unknown habit "Yoga/Piano", L12 injection via habit name | **not run** (budget of 12 live calls exhausted) |

Live calls used: 11 by QA + 1 by the team lead = **12 / 12**. 429 responses are not billed.

Interpretation: a per-minute limit would have reset during the 60–90 s gaps, so every request being refused points to an account-level limit that one request cannot fit in (gpt-4 TPM smaller than ~1.8k prompt + 500 `max_tokens`, requests-per-day exhausted, or no gpt-4 access on the tier). The server logs only `[chat] OpenAI HTTP 429 (<code>)` — check the API console for the code: `rate_limit_exceeded` vs `insufficient_quota`. Actions for the owner: check the limits page of the OpenAI project for gpt-4 (or set `OPENAI_MODEL` to a model the tier allows, e.g. a gpt-4o/gpt-4.1 family model, if the "gpt-4" requirement allows it), then re-run the live scenarios with `node live.mjs`-style direct calls (list above).

Consequently **scope compliance, number accuracy, answer language/format, injection resistance and the "no data for unknown habit" behaviour are NOT verified live**. What is verified offline: the prompt content (`buildSystemPrompt`), the server-side refusal replacement (`finalizeReply`, see CB-05), that `system` roles cannot be injected, and that the DATA block numbers equal `/api/stats/*` (rebuilt read-only with `buildHabitContext`: 4 habits; 30-day rate 84 %; today 2/3 = 67 %; best streak Sport 33; 30-day rates Boire 2 L d'eau 97 %, Lire 20 minutes 87 %, Sport 85 %, Méditer 70 %; 7-day Méditer 57 %, Lire 71 %; weekdays Fri 89 % best, Sat 67 % worst). Live UX of the 429 path is confirmed: generic French message, no upstream text, no key.


## 2. Bugs

| ID | Title | Sev. | Prio | Where |
|---|---|---|---|---|
| CB-01 | API listens on all interfaces, `/api/chat` has no auth / rate limit: any LAN host can spend the OpenAI credit | Medium | P2 | `server/src/index.js:7` |
| CB-02 | Bodies > 100 kB → 413 with raw English message; contract-valid requests can hit it | Low | P3 | `server/src/app.js:27`, `:183` |
| CB-03 | Keyboard focus lost to `<body>` after sending with a suggestion, the Send button or Retry | Medium | P2 | `client/src/dashboard/ChatPanel.jsx:117`, `:144`, `:172` |
| CB-04 | Invisible-only messages (zero-width chars) pass validation and trigger a paid call | Low | P3 | `server/src/chat.js:47` |
| CB-05 | Off-topic guard regex: misses `[OFF-TOPIC]` / `OFFTOPIC`, and refuses any legit reply containing "off topic" | Low | P3 | `server/src/chat.js:179` |
| CB-06 | Streak unit mislabelled as `days` in the model context (it counts scheduled days, e.g. Sport = Mon/Wed/Fri) | Low | P3 | `server/src/chat.js:103` |
| CB-07 | OpenAI 429 / quota mapped to HTTP 502 and shown as a generic "réessayez dans un instant" error, even when retrying can never succeed | Low | P3 | `server/src/openai.js:73-74`, `client/src/dashboard/ChatPanel.jsx:13` |

### CB-01 — `/api/chat` reachable from the whole LAN, no rate limit (Medium, P2)
- **Steps:** `netstat -ano | grep :3001` → `0.0.0.0:3001 LISTENING`. From any machine on the network: `POST http://<pc-ip>:3001/api/chat {"messages":[{"role":"user","content":"Analyse mes résultats"}]}` in a loop.
- **Expected:** a paid endpoint is only reachable locally and is throttled.
- **Actual:** bound to all interfaces (`createApp(db).listen(PORT)` without host), no authentication, no per-client or global limit. Each request costs ~1.8k prompt tokens + up to 500 completion tokens of gpt-4, and the same exposure lets anyone read the habit data through the other routes. Browser CSRF is *not* possible (no CORS: preflight → 404; `text/plain`/form bodies → 400), so the risk is LAN/other processes only.
- **Fix:** `listen(PORT, process.env.HOST ?? '127.0.0.1')`; add a small in-memory limiter on `/api/chat` (e.g. 10 req/min per IP + a daily cap, 429 with a French message), and document both in `API_CONTRACT.md` §9.

### CB-02 — 413 with English message for large bodies (Low, P3)
- **Steps:** POST `/api/chat` with 75 assistant messages of 4000 chars (≈300 kB), or a contract-valid body of 50 messages (25 × 4000 + 25 × 1000 chars ≈ 125 kB).
- **Expected:** a 400 (or documented 413) with a French `error.message`, and every request that respects the contract (≤ 50 messages, ≤ 4000/1000 chars) accepted.
- **Actual:** `413 {"error":{"message":"request entity too large"}}` — `express.json()` default 100 kB limit (`app.js:27`), message forwarded verbatim by the 4xx branch of the error handler (`app.js:183`). Not reachable from the UI (it sends 10 messages max), only from direct API calls.
- **Fix:** either `express.json({ limit: '300kb' })` or lower `MAX_MESSAGES` (only the last 10 are used anyway) so the contract fits in 100 kB; map `entity.too.large` to `"Corps de la requête trop volumineux"`; add 413 to the contract table.

### CB-03 — Focus lost after sending / retrying (Medium, P2, accessibility WCAG 2.4.3)
- **Steps (keyboard only):** 1) Tab to the suggestion "Analyse mes résultats", press Enter → after the answer `document.activeElement` is `<body>`. 2) Type a question, Tab to "Envoyer", Enter → same. 3) Get an error, Tab to "Réessayer", Enter → same.
- **Expected:** focus stays in the panel (typically on the textarea) so the user can type the follow-up.
- **Actual:** focus falls back to `<body>`; the next Tab starts again from the top of the page (after a long dashboard). Causes: the chips are unmounted as soon as a message exists (`ChatPanel.jsx:117`), the Retry button is unmounted by `setError(null)` in `ask` (`:45`, button `:144`), the Send button becomes `disabled` while pending and stays disabled with an empty draft (`:172`) — Chrome blurs a focused element when it becomes disabled.
- **Fix:** in `send()` and the Retry handler call `inputRef.current?.focus()` before triggering the request (as `clear()` already does); optionally use `aria-disabled` instead of `disabled` on Send. Tests ready: the 3 `test.fixme` in `client/e2e/chat-qa.spec.js` (remove `.fixme` once fixed).

### CB-04 — Invisible-only content accepted (Low, P3)
- **Steps:** `{"messages":[{"role":"user","content":"​​"}]}` (probed with a trailing assistant message to avoid the paid call: the error returned is "Le dernier message doit venir de l'utilisateur", i.e. the zero-width content passed the non-empty check).
- **Expected:** 400 "texte non vide".
- **Actual:** `String.prototype.trim()` does not remove U+200B/U+2060/U+FEFF-like format characters, so an empty-looking question reaches gpt-4 (`chat.js:47`).
- **Fix:** reject when `!/[\p{L}\p{N}\p{S}\p{P}]/u.test(content)` or strip `\p{Cf}` before the emptiness check.

### CB-05 — Off-topic guard regex is too narrow and too broad (Low, P3)
- **Evidence (`finalizeReply`, `chat.js:179`):** `[OFF_TOPIC]` → refused ✔, `[off topic]` → refused ✔, `` `[OFF_TOPIC]` `` → refused ✔; but `[OFF-TOPIC]` → **not refused** (raw token shown to the user), `OFFTOPIC` → **not refused**; and a legitimate answer quoting a habit named "Off topic" (`Votre habitude « Off topic » est à 80 %.`) → **refused**.
- **Fix:** `/OFF[\s_-]?TOPIC/i` for detection, and preferably only when the token is the whole reply or its first line (`/^\W*OFF[\s_-]?TOPIC\W*$/im`), so habit names cannot trigger it; add the variants to `server/tests/chat.test.js`.

### CB-06 — Streaks labelled as `days` (Low, P3)
- **Evidence:** context `summary.bestStreak = { days: 33, habit: "Sport" }` (`chat.js:103`) while Sport is scheduled Mon/Wed/Fri: streaks count consecutive *scheduled* days (`streaks.js` header), i.e. 33 sessions ≈ 11 weeks, not 33 calendar days. The prompt never explains the unit, so the model can say "33 jours consécutifs".
- **Fix:** rename to `scheduledDaysInARow` (and per-habit `currentStreak`/`bestStreak` likewise) or add one line to the prompt: "streaks count consecutive scheduled days of that habit, not calendar days".

### CB-07 — Rate limit / quota not distinguishable for the user (Low, P3)
- **Steps:** observed live: every call returned `502 {"error":{"message":"Limite de requêtes du service d'IA atteinte, réessayez dans un instant"}}`; in the UI this becomes "Le service d'IA a renvoyé une erreur. Réessayez dans un instant." (the server's specific message is discarded because `errorText` maps any 502 to `errorUpstream`).
- **Expected:** the user (or admin) can tell "too many requests, wait N s" from "quota exhausted / model not available on this plan" — retrying the latter never works.
- **Actual:** same 502 + same UI text for both; no `Retry-After`; server log lacks the rate-limit headers needed to diagnose.
- **Fix:** return `429` (with `Retry-After` from OpenAI's `retry-after`/`x-ratelimit-reset-*` headers) for `rate_limit_exceeded` and `503` for `insufficient_quota`; add `chat.errorRateLimit` / `chat.errorQuota` texts in `messages.js`; log `x-ratelimit-limit-tokens` / `-requests` (no secrets in them).

## 3. What works (verified)

**API contract (direct requests to :3001, no OpenAI cost)** — 400 for: non-JSON, truncated JSON, `text/plain` body, empty body, array/null/string body, missing/non-array/empty `messages`, 51 messages, roles `system`/`tool`/missing, `null`/string message, empty / whitespace / number / array `content`, user 1001 chars (also 1001 emoji → counted in code points), assistant 4001 chars, last message from assistant, `lang` `de`/`FR`/`123`/`["fr"]`, an invalid message outside the last 10 (whole history is validated). GET/PUT/DELETE `/api/chat` → 404 JSON. Extra fields are ignored; the client only sends `{messages, lang}`.

**Security**
- Key not in any tracked/untracked repo file (regex `sk-…` over the repo excluding `node_modules` and `server/.env`: 0 hits; git history: 0 hits); `server/.env` is git-ignored (`.gitignore:7`); `server/.env.example` has an empty value.
- Not in the browser: e2e test scans every JS/HTML/JSON response of the dashboard + a chat exchange for `sk-…` and `OPENAI_API_KEY`: none; `import.meta.env` has no OpenAI entry; the client never mentions OpenAI.
- Vite dev server refuses `server/.env` (`/@fs/…/server/.env`, `?raw`, `?raw??`, `?import&raw??`, `?url`, `?import&?raw` → 403; `/../server/.env` and `/server/.env` → SPA `index.html`, no secret). Vite 6.4.4 (patched for the 2025 `?raw??` fs bypasses).
- Upstream errors: only generic French messages are returned (`Service d'IA injoignable`, `Limite de requêtes du service d'IA atteinte…`, observed live), no OpenAI payload, the server logs only status + error code.
- Forged `system` messages rejected; figures come from the DB (`buildHabitContext`), verified identical to `/api/stats/summary`, `/ranking`, `/weekday`.

**UI (Playwright, `/api/chat` mocked)** — panel at the bottom of the Dashboard with heading, subtitle, 3 suggestions (FR/EN); suggestion click sends `{messages:[…], lang}`; Enter sends, Shift+Enter inserts a newline (kept in the bubble, `pre-wrap`); whitespace-only cannot be sent; textarea capped at 1000 chars and content trimmed; only the last 10 messages are sent, the last being the user's; pending "…" bubble with SR text, Send disabled and Enter ignored while pending; auto-scroll to the newest message; "Nouvelle conversation" during a pending request resets, focuses the input and ignores the late reply (next request has no old history); 400/502/503/504/network errors show a translated `role=alert` that re-translates on FR↔EN switch, Retry resends the same history once (exactly 1 user + 1 assistant bubble after success) with the current language; refusal shown with the UI text and re-translated, normal replies kept as generated; `role=log` + `aria-live=polite` + label, textarea labelled with the hint as description, visually-hidden "Vous :/Assistant :" prefixes; dark theme contrast ≥ 4.5 for both bubbles and the input; 375 px with long replies/URLs and an error: no horizontal scroll, Retry reachable.

## 4. Tests added

`client/e2e/chat-qa.spec.js` — 19 tests (16 pass + 3 `test.fixme` for CB-03): input (Shift+Enter, whitespace, 1000 chars, 10-message window), pending/auto-scroll, reset during pending, error matrix 400/502/503/504/network × FR→EN × Retry, language behaviour of replies/refusals, SR attributes, keyboard focus (fixme), dark-theme contrast, 375 px, key-leak scan of served scripts. No fixed sleeps; `/api/chat` always intercepted (no OpenAI cost).

Run: `npm --prefix client run e2e` (all) or `npx playwright test e2e/chat-qa.spec.js` from `client/`.

## 5. Known limitations confirmed (from the designer's list)
No auth/rate limit (→ CB-01); scope relies on the model + token; clients can forge assistant history (only `system` is blocked); 429 is shown with the generic 502 UI text; plain-text replies; archived habits and yearly heatmap excluded from the context; conversation not persisted (lost on reload/navigation).

## 6. Corrections (2026-10-13, team lead)

Les 7 bugs sont corrigés ; les 3 tests e2e `fixme` de `chat-qa.spec.js` sont réactivés et passent.

| ID | Correction |
|---|---|
| CB-01 | `server/src/index.js` : écoute sur `127.0.0.1` par défaut (`HOST` pour l'ouvrir). `app.js` : limiteur en mémoire sur `/api/chat` (10 questions/min par client, 429 `chat_rate_limited` + `Retry-After`, requêtes invalides non comptées). Proxy Vite et helpers e2e pointés sur `127.0.0.1`. |
| CB-02 | `express.json({ limit: '300kb' })` (un corps conforme au contrat passe) ; `entity.too.large` → 413 « Corps de la requête trop volumineux ». |
| CB-03 | `ChatPanel.jsx` : le focus est rendu au champ de saisie avant l'envoi (suggestion, Envoyer, Réessayer). |
| CB-04 | `chat.js` : caractères de format `\p{Cf}` retirés avant le test « non vide ». |
| CB-05 | Détection du jeton : entre crochets n'importe où (`[OFF_TOPIC]`, `[off-topic]`…) ou seul sur une ligne (`OFFTOPIC`) ; une habitude nommée « Off topic » n'est plus refusée. |
| CB-06 | Contexte : `bestStreak.scheduledDaysInARow` + règle 7 du prompt (les séries comptent des jours *prévus*, pas des jours calendaires). |
| CB-07 | `openai.js` : 429 `rate_limit_exceeded` → 429 `ai_rate_limited` (+ `Retry-After`) ; `insufficient_quota` / `credit_balance_exhausted` / `billing_hard_limit_reached` → 503 `ai_quota`. Client : `error.code` exposé (`err.serverCode`) et textes dédiés `chat.errorRateLimit` / `chat.errorQuota` (FR/EN). |

Cause des 429 observés en direct : le log serveur indique `credit_balance_exhausted` sur les 10 appels — le compte OpenAI n'a plus de crédit (ce n'était pas une limite de débit).

Résultats après corrections : serveur 150/150, client unitaires 76/76, e2e 80/80, build OK. `API_CONTRACT.md` §9 mis à jour (413, 429, codes, écoute locale).
