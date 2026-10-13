import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPanel from '../src/dashboard/ChatPanel.jsx';
import { I18nProvider, useI18n } from '../src/i18n/I18nContext.jsx';
import { MESSAGES } from '../src/i18n/messages.js';
import { deferred, mockFetch } from './fetchMock.js';

const fr = MESSAGES.fr.chat;
const en = MESSAGES.en.chat;

// Sélecteur de langue minimal pour tester le changement de langue.
function LangSwitch() {
  const { setLang } = useI18n();
  return (
    <button type="button" onClick={() => setLang('en')}>
      to-en
    </button>
  );
}

function renderChat() {
  return render(
    <I18nProvider>
      <LangSwitch />
      <ChatPanel />
    </I18nProvider>,
  );
}

const log = () => screen.getByRole('log');
const input = () => screen.getByRole('textbox', { name: fr.inputLabel });

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('<ChatPanel />', () => {
  it('shows suggestions; a suggestion sends the question with the language, then shows the reply', async () => {
    const reply = deferred();
    const fetch = mockFetch({ 'POST /api/chat': () => reply.promise });
    renderChat();

    const suggestions = within(screen.getByRole('list', { name: fr.suggestionsLabel })).getAllByRole('button');
    expect(suggestions.map((b) => b.textContent)).toEqual(fr.suggestions);
    await userEvent.click(suggestions[0]);

    expect(fetch.calls[0].body).toEqual({ messages: [{ role: 'user', content: fr.suggestions[0] }], lang: 'fr' });
    expect(within(log()).getByText(fr.suggestions[0])).toBeInTheDocument();
    expect(within(log()).getByText(fr.thinking)).toBeInTheDocument();
    await userEvent.type(input(), 'suite');
    expect(screen.getByRole('button', { name: fr.send })).toBeDisabled();

    reply.resolve({ reply: 'Lire est à 88 %.', refused: false });
    expect(await within(log()).findByText('Lire est à 88 %.')).toBeInTheDocument();
    expect(within(log()).queryByText(fr.thinking)).not.toBeInTheDocument();
    expect(log()).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: fr.send })).toBeEnabled();
  });

  it('Enter sends, Shift+Enter inserts a new line, empty input cannot be sent', async () => {
    const fetch = mockFetch({ 'POST /api/chat': () => ({ reply: 'ok', refused: false }) });
    renderChat();
    expect(screen.getByRole('button', { name: fr.send })).toBeDisabled();

    await userEvent.type(input(), 'ligne 1{Shift>}{Enter}{/Shift}ligne 2');
    expect(fetch).not.toHaveBeenCalled();
    expect(input()).toHaveValue('ligne 1\nligne 2');

    await userEvent.type(input(), '{Enter}');
    expect(fetch.calls[0].body.messages).toEqual([{ role: 'user', content: 'ligne 1\nligne 2' }]);
    expect(input()).toHaveValue('');
    expect(await within(log()).findByText('ok')).toBeInTheDocument();
  });

  it('sends the conversation history (last 10 messages only)', async () => {
    let n = 0;
    const fetch = mockFetch({ 'POST /api/chat': () => ({ reply: `r${++n}`, refused: false }) });
    renderChat();
    for (let i = 1; i <= 6; i++) {
      await userEvent.type(input(), `q${i}{Enter}`);
      await within(log()).findByText(`r${i}`);
    }
    const last = fetch.calls.at(-1).body.messages;
    expect(last).toHaveLength(10);
    expect(last.at(-1)).toEqual({ role: 'user', content: 'q6' });
    expect(last[0]).toEqual({ role: 'assistant', content: 'r1' });
  });

  it('shows a translated error and retries the same question', async () => {
    let fail = true;
    const fetch = mockFetch({
      'POST /api/chat': () =>
        fail ? { status: 503, body: { error: { message: 'Assistant indisponible' } } } : { reply: 'Voici mon analyse.', refused: false },
    });
    renderChat();
    await userEvent.type(input(), 'Analyse{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(fr.errorTitle);
    expect(alert).toHaveTextContent(fr.errorUnavailable);

    // l'erreur déjà affichée suit le changement de langue
    await userEvent.click(screen.getByRole('button', { name: 'to-en' }));
    expect(screen.getByRole('alert')).toHaveTextContent(en.errorUnavailable);

    fail = false;
    await userEvent.click(screen.getByRole('button', { name: en.retry }));
    expect(await within(log()).findByText('Voici mon analyse.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetch.calls[1].body).toEqual({ messages: [{ role: 'user', content: 'Analyse' }], lang: 'en' });
    expect(within(log()).getAllByText('Analyse')).toHaveLength(1);
  });

  it.each([
    [504, undefined, fr.errorTimeout],
    [502, undefined, fr.errorUpstream],
    [429, 'chat_rate_limited', fr.errorRateLimit],
    [503, 'ai_quota', fr.errorQuota],
    [503, 'ai_not_configured', fr.errorUnavailable],
  ])('maps HTTP %i (%s) to its message', async (status, code, text) => {
    mockFetch({ 'POST /api/chat': () => ({ status, body: { error: { message: 'x', ...(code && { code }) } } }) });
    renderChat();
    await userEvent.type(input(), 'Analyse{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('shows "server unreachable" on a network failure', async () => {
    mockFetch({
      'POST /api/chat': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    renderChat();
    await userEvent.type(input(), 'Analyse{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.fr.errors.unreachable);
  });

  it('renders an off-topic refusal from the UI texts, following the language switch', async () => {
    mockFetch({ 'POST /api/chat': () => ({ reply: 'refus serveur', refused: true }) });
    renderChat();
    await userEvent.type(input(), 'Quelle est la capitale de la France ?{Enter}');
    expect(await within(log()).findByText(fr.refusal)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'to-en' }));
    expect(within(log()).getByText(en.refusal)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: en.inputLabel })).toBeInTheDocument();
  });

  it('"New conversation" clears the messages and ignores a pending answer', async () => {
    const reply = deferred();
    mockFetch({ 'POST /api/chat': () => reply.promise });
    renderChat();
    await userEvent.type(input(), 'Analyse{Enter}');
    await userEvent.click(screen.getByRole('button', { name: fr.clear }));

    expect(within(log()).queryByText('Analyse')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: fr.suggestionsLabel })).toBeInTheDocument();
    expect(input()).toHaveFocus();
    reply.resolve({ reply: 'trop tard', refused: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('trop tard')).not.toBeInTheDocument();
  });
});
