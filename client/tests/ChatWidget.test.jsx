import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ChatWidget from '../src/components/ChatWidget.jsx';
import { setLang } from '../src/i18n/index.js';
import { deferred, mockFetch } from './fetchMock.js';

beforeEach(() => {
  localStorage.clear();
  setLang('en');
});
afterEach(() => {
  cleanup();
  setLang('fr');
});

const openPanel = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Open the analysis assistant' }));
  return screen.getByRole('dialog', { name: 'Results assistant' });
};

describe('ChatWidget', () => {
  it('opens, focuses the input, and closes with Escape returning focus to the button', async () => {
    mockFetch({});
    const user = userEvent.setup();
    render(<ChatWidget />);
    const fab = screen.getByRole('button', { name: 'Open the analysis assistant' });
    expect(fab).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await openPanel(user);
    expect(fab).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Your question')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fab).toHaveFocus();
  });

  it('closes with the close button', async () => {
    mockFetch({});
    const user = userEvent.setup();
    render(<ChatWidget />);
    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends a message with lang and history, shows typing, then the reply', async () => {
    const gate = deferred();
    const fetch = mockFetch({ 'POST /api/chat': () => gate.promise });
    const user = userEvent.setup();
    render(<ChatWidget />);
    await openPanel(user);

    await user.type(screen.getByLabelText('Your question'), 'How is my week?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(fetch.calls[0].body).toEqual({ message: 'How is my week?', history: [], lang: 'en' });
    expect(await screen.findByText('The assistant is analysing your results…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    gate.resolve({ reply: 'Your 30-day rate is 65%.' });
    expect(await screen.findByText(/Your 30-day rate is 65%/)).toBeInTheDocument();
    expect(screen.queryByText('The assistant is analysing your results…')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Your question'), 'And Mondays?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(fetch.calls).toHaveLength(2));
    expect(fetch.calls[1].body.history).toEqual([
      { role: 'user', content: 'How is my week?' },
      { role: 'assistant', content: 'Your 30-day rate is 65%.' },
    ]);
  });

  it('sends a starter question when clicked, and hides starters afterwards', async () => {
    const fetch = mockFetch({ 'POST /api/chat': () => ({ reply: 'ok' }) });
    const user = userEvent.setup();
    render(<ChatWidget />);
    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Which habit needs attention?' }));
    expect(fetch.calls[0].body.message).toBe('Which habit needs attention?');
    await screen.findByText('ok');
    expect(screen.queryByRole('group', { name: 'Suggested questions' })).not.toBeInTheDocument();
  });

  it('shows the server error in an alert and retries', async () => {
    let n = 0;
    const fetch = mockFetch({
      'POST /api/chat': () => (++n === 1 ? { status: 502, body: { error: { message: 'Service down' } } } : { reply: 'Back online' }),
    });
    const user = userEvent.setup();
    render(<ChatWidget />);
    await openPanel(user);
    await user.type(screen.getByLabelText('Your question'), 'Hello?{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Service down');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/Back online/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetch.calls).toHaveLength(2);
    expect(fetch.calls[1].body.message).toBe('Hello?');
  });

  it('renders replies as plain text, never as HTML', async () => {
    mockFetch({ 'POST /api/chat': () => ({ reply: '<img src=x onerror=alert(1)> **bold**' }) });
    const user = userEvent.setup();
    const { container } = render(<ChatWidget />);
    await openPanel(user);
    await user.type(screen.getByLabelText('Your question'), 'x{Enter}');
    expect(await screen.findByText(/onerror=alert/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('strong')).toBeNull();
  });

  it('blocks empty sends and caps the input length', async () => {
    const fetch = mockFetch({});
    const user = userEvent.setup();
    render(<ChatWidget />);
    await openPanel(user);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.type(screen.getByLabelText('Your question'), '   ');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByLabelText('Your question')).toHaveAttribute('maxlength', '500');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the conversation when closed and reopened, and clears it on demand', async () => {
    mockFetch({ 'POST /api/chat': () => ({ reply: 'Kept' }) });
    const user = userEvent.setup();
    render(<ChatWidget />);
    await openPanel(user);
    await user.type(screen.getByLabelText('Your question'), 'q{Enter}');
    await screen.findByText(/Kept/);
    await user.keyboard('{Escape}');
    await openPanel(user);
    expect(screen.getByText(/Kept/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByText(/Kept/)).not.toBeInTheDocument();
  });

  it('translates the UI and sends the current language', async () => {
    const fetch = mockFetch({ 'POST /api/chat': () => ({ reply: 'Oui' }) });
    setLang('fr');
    const user = userEvent.setup();
    render(<ChatWidget />);
    await user.click(screen.getByRole('button', { name: "Ouvrir l'assistant d'analyse" }));
    expect(screen.getByRole('dialog', { name: 'Assistant résultats' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comment je me débrouille ce mois-ci ?' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Votre question'), 'Bilan{Enter}');
    expect(fetch.calls[0].body.lang).toBe('fr');
  });
});
