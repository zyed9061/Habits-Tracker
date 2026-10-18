import { useEffect, useId, useRef, useState } from 'react';
import { sendChat } from '../api.js';
import { useI18n } from '../i18n/index.js';
import './chat.css';

export const MAX_LENGTH = 500;
const MAX_HISTORY = 10;
const STARTERS = ['chat.starter1', 'chat.starter2', 'chat.starter3'];

// Bouton flottant + panneau non modal. Les réponses sont rendues comme du texte brut (jamais en HTML).
// La conversation vit dans l'état du composant : elle survit à la fermeture du panneau, pas au rechargement.
export default function ChatWidget() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { role: 'user' | 'assistant', content }
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const fabRef = useRef(null);
  const inputRef = useRef(null);
  const logRef = useRef(null);
  const panelId = useId();
  const titleId = useId();
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (wasOpen.current) fabRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, pending, error, open]);

  const close = () => setOpen(false);

  async function ask(text, base = messages) {
    const message = text.trim();
    if (!message || pending) return;
    const history = base.slice(-MAX_HISTORY);
    setMessages([...base, { role: 'user', content: message }]);
    setDraft('');
    setError(null);
    setPending(true);
    try {
      const { reply } = await sendChat({ message, history, lang });
      setMessages((m) => [...m, { role: 'assistant', content: String(reply) }]);
    } catch (err) {
      setError({ text: err.message || t('chat.error'), retry: { message, base } });
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  const onSubmit = (e) => {
    e.preventDefault();
    ask(draft);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  const reset = () => {
    setMessages([]);
    setError(null);
    setDraft('');
    inputRef.current?.focus();
  };

  return (
    <div className="chat" onKeyDown={onKeyDown}>
      {open && (
        <section id={panelId} className="chat__panel" role="dialog" aria-modal="false" aria-labelledby={titleId}>
          <header className="chat__head">
            <h2 id={titleId} className="chat__title">
              {t('chat.title')}
            </h2>
            <button type="button" className="btn btn--ghost btn--sm" onClick={reset} disabled={pending || !messages.length}>
              {t('chat.clear')}
            </button>
            <button type="button" className="chat__close" onClick={close} aria-label={t('chat.close')}>
              ×
            </button>
          </header>

          <div className="chat__log" ref={logRef} role="log" aria-live="polite" aria-label={t('chat.logLabel')}>
            {!messages.length && <p className="chat__intro">{t('chat.intro')}</p>}
            {messages.map((m, i) => (
              <p key={i} className={`chat__msg chat__msg--${m.role}`}>
                <span className="chat__who">{m.role === 'user' ? t('chat.you') : t('chat.bot')}</span>
                {m.content}
              </p>
            ))}
            {pending && (
              <p className="chat__msg chat__msg--assistant chat__typing" role="status">
                <span className="chat__dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="chat__sr">{t('chat.typing')}</span>
              </p>
            )}
            {error && (
              <div className="chat__error" role="alert">
                <span>{error.text}</span>
                <button type="button" className="btn btn--sm" onClick={() => ask(error.retry.message, error.retry.base)}>
                  {t('chat.retry')}
                </button>
              </div>
            )}
          </div>

          {!messages.length && !pending && (
            <div className="chat__starters" role="group" aria-label={t('chat.startersLabel')}>
              {STARTERS.map((key) => (
                <button key={key} type="button" className="chat__chip" onClick={() => ask(t(key))}>
                  {t(key)}
                </button>
              ))}
            </div>
          )}

          <form className="chat__form" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              type="text"
              className="chat__input"
              value={draft}
              maxLength={MAX_LENGTH}
              placeholder={t('chat.placeholder')}
              aria-label={t('chat.inputLabel')}
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="btn btn--primary" disabled={pending || !draft.trim()}>
              {t('chat.send')}
            </button>
          </form>
        </section>
      )}

      <button
        ref={fabRef}
        type="button"
        className="chat__fab"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t('chat.open')}
        title={t('chat.open')}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.8 8.8 0 0 1-3.6-.8L3 21l1.9-5.4A8.4 8.4 0 1 1 21 11.5z"
          />
        </svg>
      </button>
    </div>
  );
}
