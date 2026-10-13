import { useEffect, useId, useRef, useState } from 'react';
import { sendChat } from '../api.js';
import { describeError, useI18n } from '../i18n/I18nContext.jsx';
import { CHAT_HISTORY, CHAT_MAX_LENGTH } from './constants.js';

// Message d'erreur traduit au rendu (suit le changement de langue) : les statuts
// propres à l'assistant ont un texte dédié, le reste passe par describeError.
function errorText(err, t) {
  const c = t.chat;
  if (err?.code) return describeError(err, t);
  if (err?.serverCode === 'ai_quota') return c.errorQuota;
  if (err?.status === 429) return c.errorRateLimit;
  if (err?.status === 503) return c.errorUnavailable;
  if (err?.status === 504) return c.errorTimeout;
  if (err?.status === 502) return c.errorUpstream;
  if (err?.status === 400) return c.errorInvalid;
  return describeError(err, t);
}

// Assistant du tableau de bord : analyse les résultats (calculés par le serveur)
// et donne des conseils. Les réponses hors sujet sont marquées `refused` par le
// serveur et affichées avec le texte traduit de l'interface.
export default function ChatPanel() {
  const { t, lang } = useI18n();
  const c = t.chat;
  const ids = useId();
  const [messages, setMessages] = useState([]); // { id, role, content, refused? }
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const reqId = useRef(0);
  const nextId = useRef(0);
  const logRef = useRef(null);
  const inputRef = useRef(null);

  // Une réponse arrivée après démontage ou « Nouvelle conversation » est ignorée.
  useEffect(() => () => void reqId.current++, []);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, pending, error]);

  async function ask(history) {
    const id = ++reqId.current;
    setPending(true);
    setError(null);
    try {
      const payload = history.slice(-CHAT_HISTORY).map(({ role, content }) => ({ role, content }));
      const { reply, refused } = await sendChat(payload, lang);
      if (id !== reqId.current) return;
      setMessages((list) => [...list, { id: ++nextId.current, role: 'assistant', content: reply, refused: !!refused }]);
    } catch (err) {
      if (id === reqId.current) setError(err);
    } finally {
      if (id === reqId.current) setPending(false);
    }
  }

  // Le bouton cliqué (suggestion, Envoyer, Réessayer) disparaît ou se désactive
  // pendant l'envoi : le focus est rendu au champ de saisie pour ne pas tomber sur <body>.
  function focusInput() {
    inputRef.current?.focus();
  }

  function retry() {
    focusInput();
    ask(messages);
  }

  function send(text) {
    const content = text.trim();
    if (!content || pending) return;
    focusInput();
    const next = [...messages, { id: ++nextId.current, role: 'user', content }];
    setMessages(next);
    setDraft('');
    ask(next);
  }

  function onKeyDown(e) {
    // Entrée envoie, Maj+Entrée va à la ligne (et pas pendant une composition IME).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  }

  function clear() {
    reqId.current++;
    setMessages([]);
    setError(null);
    setPending(false);
    inputRef.current?.focus();
  }

  const titleId = `${ids}-title`;
  const hintId = `${ids}-hint`;
  const inputId = `${ids}-input`;

  return (
    <section className="dv-panel dv-chat" aria-labelledby={titleId}>
      <header className="dv-panel__head dv-chat__head">
        <div>
          <h2 id={titleId} className="dv-panel__title">
            {c.title}
          </h2>
          <p className="dv-panel__subtitle">{c.subtitle}</p>
        </div>
        {messages.length > 0 && (
          <button type="button" className="dv-btn dv-btn--quiet" onClick={clear}>
            {c.clear}
          </button>
        )}
      </header>

      <div
        ref={logRef}
        className="dv-chat__log"
        role="log"
        aria-live="polite"
        aria-label={c.conversation}
        tabIndex={0}
      >
        {messages.length === 0 && !pending ? (
          <div className="dv-chat__empty">
            <p>{c.intro}</p>
            <ul className="dv-chat__suggestions" aria-label={c.suggestionsLabel}>
              {c.suggestions.map((s) => (
                <li key={s}>
                  <button type="button" className="dv-chat__chip" onClick={() => send(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`dv-chat__msg dv-chat__msg--${m.role}`}>
              <span className="visually-hidden">{m.role === 'user' ? c.youSaid : c.assistantSaid} </span>
              {m.refused ? c.refusal : m.content}
            </div>
          ))
        )}
        {pending && (
          <div className="dv-chat__msg dv-chat__msg--assistant dv-chat__typing">
            <span aria-hidden="true">…</span>
            <span className="visually-hidden">{c.thinking}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="dv-chat__error" role="alert">
          <p>{c.errorTitle}</p>
          <p className="dv-state__detail">{errorText(error, t)}</p>
          <button type="button" className="dv-btn" onClick={retry} disabled={pending}>
            {c.retry}
          </button>
        </div>
      )}

      <form
        className="dv-chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <label htmlFor={inputId} className="visually-hidden">
          {c.inputLabel}
        </label>
        <textarea
          ref={inputRef}
          id={inputId}
          className="dv-chat__input"
          rows={2}
          maxLength={CHAT_MAX_LENGTH}
          value={draft}
          placeholder={c.placeholder}
          aria-describedby={hintId}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="dv-btn dv-btn--primary" disabled={pending || !draft.trim()}>
          {c.send}
        </button>
      </form>
      <p id={hintId} className="dv-chat__note">
        {c.hint}
      </p>
      <p className="dv-chat__note">{c.disclaimer}</p>
    </section>
  );
}
