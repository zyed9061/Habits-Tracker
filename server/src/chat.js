// Dashboard chatbot: input validation, OpenAI client (built-in fetch), rate limiting and the Express router.
import { Router } from 'express';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LANG, LANGS, buildDataContext, buildMessages } from './chatPrompt.js';
import { HttpError } from './validation.js';

export const MAX_MESSAGE_LENGTH = 500;
export const MAX_HISTORY = 10;
export const MAX_HISTORY_CONTENT = 2000;
export const TIMEOUT_MS = 20_000;
export const RATE_LIMIT = { windowMs: 60_000, max: 20 };

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url));

const MESSAGES = {
  fr: {
    unavailable: "Le chatbot n'est pas configuré sur le serveur.",
    upstream: "Le service d'analyse est indisponible, réessayez plus tard.",
    rate: 'Trop de messages, patientez un instant.',
  },
  en: {
    unavailable: 'The chatbot is not configured on the server.',
    upstream: 'The analysis service is unavailable, please try again later.',
    rate: 'Too many messages, please wait a moment.',
  },
};
const msg = (lang, key) => (MESSAGES[lang] ?? MESSAGES[DEFAULT_LANG])[key];

/** Thrown by the OpenAI client; its message is internal and never sent to the browser. */
export class UpstreamError extends Error {}

/** Reads the config at request time, loading server/.env on demand so a new key needs no restart. */
export function readEnvConfig(env = process.env) {
  if (!env.OPENAI_API_KEY && env === process.env) {
    try {
      loadEnvFile(ENV_PATH); // does not override variables already set
    } catch {
      // no .env file: keep what the environment provides
    }
  }
  return { apiKey: env.OPENAI_API_KEY || '', model: env.OPENAI_MODEL || 'gpt-4' };
}

/** Validates the request body; returns clean values or throws a 400 HttpError. */
export function validateChatBody(body) {
  const bad = (m) => new HttpError(400, m);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Corps de requête invalide');
  const { message, history, lang } = body;
  if (typeof message !== 'string' || message.trim() === '') throw bad('message est obligatoire');
  if (message.length > MAX_MESSAGE_LENGTH) throw bad(`message est limité à ${MAX_MESSAGE_LENGTH} caractères`);
  if (lang !== undefined && !LANGS.includes(lang)) throw bad('lang doit valoir fr ou en');

  let turns = [];
  if (history !== undefined) {
    if (!Array.isArray(history)) throw bad('history doit être un tableau');
    turns = history.slice(-MAX_HISTORY).map((turn) => {
      if (!turn || typeof turn !== 'object') throw bad('history contient un élément invalide');
      if (turn.role !== 'user' && turn.role !== 'assistant') {
        throw bad("history n'accepte que les rôles user et assistant");
      }
      if (typeof turn.content !== 'string' || turn.content.trim() === '' || turn.content.length > MAX_HISTORY_CONTENT) {
        throw bad('history contient un contenu invalide');
      }
      return { role: turn.role, content: turn.content };
    });
  }
  return { message: message.trim(), history: turns, lang: lang ?? DEFAULT_LANG };
}

/** OpenAI Chat Completions client. `fetchImpl` is injectable for tests. */
export function createOpenAIClient({ apiKey, model, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  return {
    async complete(messages) {
      let res;
      try {
        res = await fetchImpl(OPENAI_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 400 }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new UpstreamError(err?.name === 'TimeoutError' ? 'timeout' : 'network');
      }
      if (!res.ok) throw new UpstreamError(`status ${res.status}`);
      let data;
      try {
        data = await res.json();
      } catch {
        throw new UpstreamError('invalid json');
      }
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || text.trim() === '') throw new UpstreamError('empty reply');
      return text.trim();
    },
  };
}

/** In-memory sliding-window limiter, per key (client IP). Returns true when the call is allowed. */
export function createRateLimiter({ windowMs = RATE_LIMIT.windowMs, max = RATE_LIMIT.max, now = Date.now } = {}) {
  const hits = new Map();
  return (key) => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    const allowed = recent.length < max;
    if (allowed) recent.push(t);
    hits.set(key, recent);
    if (hits.size > 1000) {
      for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k);
    }
    return allowed;
  };
}

/**
 * @param {{ getData: () => object, getConfig?: () => {apiKey:string, model:string},
 *   createClient?: (config:object) => {complete:(messages:object[]) => Promise<string>},
 *   allow?: (key:string) => boolean }} deps
 */
export function createChatRouter({
  getData,
  getConfig = readEnvConfig,
  createClient = createOpenAIClient,
  allow = createRateLimiter(),
}) {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const { message, history, lang } = validateChatBody(req.body);
      if (!allow(req.ip ?? 'unknown')) throw new HttpError(429, msg(lang, 'rate'));

      const config = getConfig();
      if (!config.apiKey) throw new HttpError(503, msg(lang, 'unavailable'));

      const context = buildDataContext(getData(), lang);
      let reply;
      try {
        reply = await createClient(config).complete(buildMessages({ context, lang, history, message }));
      } catch (err) {
        // Only a short internal reason is logged: never the key nor the upstream body.
        console.error(`[chat] upstream failure: ${err instanceof UpstreamError ? err.message : 'unexpected'}`);
        throw new HttpError(502, msg(lang, 'upstream'));
      }
      res.json({ reply });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
