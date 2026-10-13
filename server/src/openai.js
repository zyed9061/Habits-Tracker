// Minimal OpenAI Chat Completions client (built-in fetch, no SDK).
// The API key only lives on the server (process.env); it is never logged nor
// returned, and upstream payloads are never forwarded to the caller.
import { HttpError } from './validation.js';

export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
export const DEFAULT_MODEL = 'gpt-4';
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Calls Chat Completions and returns the assistant text.
 * Errors are HttpError: 429 (rate limited), 503 (quota / credit exhausted),
 * 502 (other upstream error / invalid answer / network), 504 (timeout).
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} [params.model]
 * @param {{ role: string, content: string }[]} params.messages
 * @param {number} [params.temperature]
 * @param {number} [params.maxTokens]
 * @param {number} [params.timeoutMs]
 * @param {typeof fetch} [params.fetchImpl] injectable for tests
 */
export async function createChatCompletion({
  apiKey,
  model = DEFAULT_MODEL,
  messages,
  temperature = 0.2,
  maxTokens = 500,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) throw new HttpError(504, "Le service d'IA n'a pas répondu à temps");
    console.error(`[chat] OpenAI injoignable (${err?.name ?? 'Error'})`);
    throw new HttpError(502, "Service d'IA injoignable");
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    // Only the status and the error code are logged: OpenAI messages may echo part of the key.
    const code = data?.error?.code;
    console.error(`[chat] OpenAI HTTP ${res.status}${code ? ` (${code})` : ''}`);
    throw upstreamError(res, code);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new HttpError(502, "Réponse invalide du service d'IA");
  }
  return content.trim();
}

// Codes OpenAI signifiant que le compte n'a plus de crédit : réessayer ne sert à rien.
const QUOTA_CODES = new Set(['insufficient_quota', 'credit_balance_exhausted', 'billing_hard_limit_reached']);
const DEFAULT_RETRY_AFTER_S = 20;

// `code` is an OpenAI enum (e.g. insufficient_quota), never free text: safe to interpret.
function upstreamError(res, code) {
  const { status } = res;
  if (status === 401 || status === 403) {
    return new HttpError(502, "Le service d'IA a refusé l'accès (clé API invalide ?)", { code: 'ai_auth' });
  }
  if (status === 429 && QUOTA_CODES.has(code)) {
    return new HttpError(503, 'Crédit du compte OpenAI épuisé (vérifier la facturation)', { code: 'ai_quota' });
  }
  if (status === 429) {
    const retryAfter = Math.ceil(Number(res.headers?.get?.('retry-after'))) || DEFAULT_RETRY_AFTER_S;
    return new HttpError(429, "Limite de requêtes du service d'IA atteinte, réessayez dans un instant", {
      code: 'ai_rate_limited',
      retryAfter,
    });
  }
  return new HttpError(502, `Le service d'IA a renvoyé une erreur (${status})`);
}
