import { test, expect, openWithLang } from './helpers.js';

// QA (chatbot) : scénarios complémentaires à chat.spec.js. /api/chat est toujours
// intercepté (aucun appel OpenAI payant) ; les réponses d'erreur imitent le serveur.
async function mockChat(page, handler) {
  const bodies = [];
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const res = await handler(body, bodies.length);
    if (res === 'abort') return route.abort('connectionrefused');
    const { status = 200, json } = res;
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
  });
  return bodies;
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

const chatRegion = (page) => page.getByRole('region', { name: 'Assistant' });
const bubbles = (chat) => chat.getByRole('log').locator('.dv-chat__msg');

test.describe('assistant — input', () => {
  test('Shift+Enter inserts a new line without sending; the line break is kept in the bubble', async ({ page }) => {
    const bodies = await mockChat(page, () => ({ json: { reply: 'ok', refused: false } }));
    await page.goto('/dashboard');
    const chat = chatRegion(page);
    const input = chat.getByRole('textbox', { name: 'Votre question' });
    await input.click();
    await page.keyboard.type('Ligne 1');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('Ligne 2');
    await expect(input).toHaveValue('Ligne 1\nLigne 2');
    expect(bodies).toHaveLength(0);
    await page.keyboard.press('Enter');
    await expect(chat.getByRole('log')).toContainText('ok');
    expect(bodies[0].messages).toEqual([{ role: 'user', content: 'Ligne 1\nLigne 2' }]);
    const userBubble = bubbles(chat).first();
    expect(await userBubble.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(30);
  });

  test('whitespace-only input cannot be sent (button disabled, Enter ignored)', async ({ page }) => {
    const bodies = await mockChat(page, () => ({ json: { reply: 'ok', refused: false } }));
    await page.goto('/dashboard');
    const chat = chatRegion(page);
    const input = chat.getByRole('textbox', { name: 'Votre question' });
    const send = chat.getByRole('button', { name: 'Envoyer' });
    await expect(send).toBeDisabled();
    await input.fill('   \n\t  ');
    await expect(send).toBeDisabled();
    await input.press('Enter');
    await expect(chat.getByRole('button', { name: 'Analyse mes résultats' })).toBeVisible();
    expect(bodies).toHaveLength(0);
  });

  test('input is capped at 1000 characters and the trimmed text is sent', async ({ page }) => {
    const bodies = await mockChat(page, () => ({ json: { reply: 'ok', refused: false } }));
    await page.goto('/dashboard');
    const chat = chatRegion(page);
    const input = chat.getByRole('textbox', { name: 'Votre question' });
    await input.click();
    await page.keyboard.insertText('a'.repeat(1200));
    await expect(input).toHaveValue('a'.repeat(1000));
    await input.press('Enter');
    await expect(chat.getByRole('log')).toContainText('ok');
    expect(bodies[0].messages[0].content).toHaveLength(1000);

    await input.fill('   padded question   ');
    await input.press('Enter');
    await expect(bubbles(chat)).toHaveCount(4);
    expect(bodies[1].messages.at(-1)).toEqual({ role: 'user', content: 'padded question' });
  });

  test('only the last 10 messages are sent and the last one is from the user', async ({ page }) => {
    const bodies = await mockChat(page, (b, n) => ({ json: { reply: `R${n}`, refused: false } }));
    await page.goto('/dashboard');
    const chat = chatRegion(page);
    const input = chat.getByRole('textbox', { name: 'Votre question' });
    for (let i = 1; i <= 7; i++) {
      await input.fill(`Q${i}`);
      await input.press('Enter');
      await expect(chat.getByRole('log')).toContainText(`R${i}`);
    }
    const last = bodies.at(-1);
    expect(last.messages).toHaveLength(10);
    expect(last.messages.at(-1)).toEqual({ role: 'user', content: 'Q7' });
    expect(last.messages[0]).toEqual({ role: 'assistant', content: 'R2' });
    expect(Object.keys(last).sort()).toEqual(['lang', 'messages']);
  });
});

test.describe('assistant — pending, scroll and reset', () => {
  test('pending bubble, send disabled, auto-scroll to the newest message', async ({ page }) => {
    const gates = [];
    await mockChat(page, async (b, n) => {
      const g = deferred();
      gates[n] = g;
      await g.promise;
      return { json: { reply: `Réponse ${n}\n${'ligne\n'.repeat(8)}fin ${n}`, refused: false } };
    });
    await page.goto('/dashboard');
    const chat = chatRegion(page);
    const log = chat.getByRole('log');
    const input = chat.getByRole('textbox', { name: 'Votre question' });
    for (let i = 1; i <= 4; i++) {
      await input.fill(`Question ${i}`);
      await input.press('Enter');
      await expect(chat.getByText("L'assistant rédige une réponse…")).toBeAttached();
      await input.fill('pendant');
      await expect(chat.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
      await input.press('Enter'); // ignored while pending
      await expect.poll(() => gates.length).toBe(i + 1);
      gates[i].resolve();
      await expect(log).toContainText(`fin ${i}`);
      await input.fill('');
    }
    await expect(bubbles(chat)).toHaveCount(8);
    await expect
      .poll(() => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
      .toBeLessThanOrEqual(2);
    expect(await log.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  });

  test('"Nouvelle conversation" during a pending request resets and ignores the late reply', async ({ page }) => {
    const gate = deferred();
    const bodies = await mockChat(page, async (b, n) => {
      if (n === 1) {
        await gate.promise;
        return { json: { reply: 'RÉPONSE TARDIVE', refused: false } };
      }
      return { json: { reply: 'Nouvelle réponse', refused: false } };
    });
    await page.goto('/dashboard');
    const chat = chatRegion(page);
    const input = chat.getByRole('textbox', { name: 'Votre question' });
    await input.fill('Première question');
    await input.press('Enter');
    await expect(chat.getByText("L'assistant rédige une réponse…")).toBeAttached();
    await chat.getByRole('button', { name: 'Nouvelle conversation' }).click();
    await expect(chat.getByRole('button', { name: 'Analyse mes résultats' })).toBeVisible();
    await expect(input).toBeFocused();
    gate.resolve();
    await input.fill('Deuxième question');
    await input.press('Enter');
    await expect(chat.getByRole('log')).toContainText('Nouvelle réponse');
    await expect(chat.getByRole('log')).not.toContainText('RÉPONSE TARDIVE');
    await expect(chat.getByRole('log')).not.toContainText('Première question');
    expect(bodies[1].messages).toEqual([{ role: 'user', content: 'Deuxième question' }]);
  });
});

test.describe('assistant — errors and retry', () => {
  const cases = [
    { name: '400', res: { status: 400, json: { error: { message: 'messages[0].content doit être un texte non vide' } } }, fr: 'Message refusé par le serveur (vide ou trop long).', en: 'Message rejected by the server (empty or too long).' },
    { name: '502', res: { status: 502, json: { error: { message: "Le service d'IA a renvoyé une erreur (500)" } } }, fr: "Le service d'IA a renvoyé une erreur. Réessayez dans un instant.", en: 'The AI service returned an error. Please try again in a moment.' },
    { name: '503', res: { status: 503, json: { error: { message: 'Assistant indisponible : OPENAI_API_KEY non configurée sur le serveur' } } }, fr: "L'assistant n'est pas configuré sur le serveur (clé OpenAI manquante).", en: 'The assistant is not configured on the server (missing OpenAI key).' },
    { name: '504', res: { status: 504, json: { error: { message: "Le service d'IA n'a pas répondu à temps" } } }, fr: "Le service d'IA a mis trop de temps à répondre.", en: 'The AI service took too long to answer.' },
    { name: 'network', res: 'abort', fr: 'Serveur injoignable', en: 'Server unreachable' },
  ];
  for (const c of cases) {
    test(`${c.name}: translated alert, then Retry resends the same history without duplicates`, async ({ page }) => {
      const bodies = await mockChat(page, (b, n) => (n === 1 ? c.res : { json: { reply: 'Réponse après retry', refused: false } }));
      await page.goto('/dashboard');
      const chat = chatRegion(page);
      await chat.getByRole('button', { name: 'Quelle habitude améliorer ?' }).click();
      const alert = chat.getByRole('alert');
      await expect(alert).toContainText("L'assistant n'a pas pu répondre.");
      await expect(alert).toContainText(c.fr);
      await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
      await expect(alert).toContainText('The assistant could not answer.');
      await expect(alert).toContainText(c.en);
      await chat.getByRole('button', { name: 'Retry' }).click();
      await expect(chat.getByRole('log')).toContainText('Réponse après retry');
      await expect(alert).toBeHidden();
      await expect(bubbles(chat)).toHaveCount(2);
      expect(bodies[1]).toEqual({ messages: [{ role: 'user', content: 'Quelle habitude améliorer ?' }], lang: 'en' });
    });
  }
});

test.describe('assistant — language, theme, a11y, security', () => {
  test('normal replies stay as generated; refusal and empty-state texts follow the language', async ({ page }) => {
    await mockChat(page, (b, n) =>
      n === 1 ? { json: { reply: 'Méditer : 57 % sur 7 jours.', refused: false } } : { json: { reply: 'x', refused: true } },
    );
    await page.goto('/dashboard');
    const chat = chatRegion(page);
    const input = chat.getByRole('textbox', { name: 'Votre question' });
    await input.fill('Analyse');
    await input.press('Enter');
    await expect(chat.getByRole('log')).toContainText('Méditer : 57 % sur 7 jours.');
    await input.fill('Capitale de la France ?');
    await input.press('Enter');
    await expect(chat.getByRole('log')).toContainText('Je peux uniquement analyser vos habitudes');
    await expect(chat.getByRole('log')).not.toContainText(/^x$/);
    await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
    await expect(chat.getByRole('log')).toContainText('I can only analyse your habits');
    await expect(chat.getByRole('log')).toContainText('Méditer : 57 % sur 7 jours.');
    await expect(chat.getByRole('textbox', { name: 'Your question' })).toBeVisible();
    await chat.getByRole('button', { name: 'New conversation' }).click();
    await expect(chat.getByRole('button', { name: 'Which habit should I improve?' })).toBeVisible();
  });

  test('screen-reader attributes: log/live region, labelled input with hint, speaker prefixes', async ({ page }) => {
    await mockChat(page, () => ({ json: { reply: 'Réponse', refused: false } }));
    await page.goto('/dashboard');
    const chat = chatRegion(page);
    const log = chat.getByRole('log', { name: "Conversation avec l'assistant" });
    await expect(log).toHaveAttribute('aria-live', 'polite');
    const input = chat.getByRole('textbox', { name: 'Votre question' });
    await expect(input).toHaveAccessibleDescription('Entrée pour envoyer, Maj+Entrée pour aller à la ligne');
    await chat.getByRole('button', { name: 'Analyse mes résultats' }).click();
    await expect(bubbles(chat).nth(0)).toHaveText('Vous : Analyse mes résultats');
    await expect(bubbles(chat).nth(1)).toHaveText('Assistant : Réponse');
  });

  // QA BUG CB-03: the clicked suggestion chip is unmounted and focus falls back to <body>.
  test('keyboard only: a suggestion sent with Enter does not drop focus to <body>', async ({ page }) => {
    await mockChat(page, () => ({ json: { reply: 'Réponse clavier', refused: false } }));
    await page.goto('/dashboard');
    const chat = chatRegion(page);
    const first = chat.getByRole('button', { name: 'Analyse mes résultats' });
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(chat.getByRole('log')).toContainText('Réponse clavier');
    // After the chip disappears, focus must not fall back to <body>.
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  });

  // QA BUG CB-03: the Retry button is unmounted with the alert and focus falls back to <body>.
  test('keyboard only: focus is kept after Retry', async ({ page }) => {
    await mockChat(page, (b, n) =>
      n === 1 ? { status: 502, json: { error: { message: 'x' } } } : { json: { reply: 'OK', refused: false } },
    );
    await page.goto('/dashboard');
    const chat = chatRegion(page);
    const input = chat.getByRole('textbox', { name: 'Votre question' });
    await input.fill('Question');
    await input.press('Enter');
    const retry = chat.getByRole('button', { name: 'Réessayer' });
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(chat.getByRole('log')).toContainText('OK');
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  });

  // QA BUG CB-03: Send becomes disabled while pending (and stays disabled with an empty draft), Chrome blurs it to <body>.
  test('keyboard only: sending with the Send button keeps focus in the panel', async ({ page }) => {
    await mockChat(page, () => ({ json: { reply: 'Réponse bouton', refused: false } }));
    await page.goto('/dashboard');
    const chat = chatRegion(page);
    await chat.getByRole('textbox', { name: 'Votre question' }).fill('Question');
    await chat.getByRole('button', { name: 'Envoyer' }).focus();
    await page.keyboard.press('Enter');
    await expect(chat.getByRole('log')).toContainText('Réponse bouton');
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  });

  test('dark theme: chat bubbles and input are readable (contrast >= 4.5)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await mockChat(page, () => ({ json: { reply: 'Réponse sombre', refused: false } }));
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const chat = chatRegion(page);
    await chat.getByRole('button', { name: 'Analyse mes résultats' }).click();
    await expect(chat.getByRole('log')).toContainText('Réponse sombre');
    const ratios = await page.evaluate(() => {
      const parse = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => {
        const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (el) => {
        const s = getComputedStyle(el);
        let bgEl = el;
        let bg = s.backgroundColor;
        while (/rgba\(.*, 0\)|transparent/.test(bg) && bgEl.parentElement) {
          bgEl = bgEl.parentElement;
          bg = getComputedStyle(bgEl).backgroundColor;
        }
        const [a, b] = [lum(parse(s.color)), lum(parse(bg))].sort((x, y) => y - x);
        return (a + 0.05) / (b + 0.05);
      };
      return {
        user: ratio(document.querySelector('.dv-chat__msg--user')),
        assistant: ratio(document.querySelector('.dv-chat__msg--assistant')),
        input: ratio(document.querySelector('.dv-chat__input')),
      };
    });
    expect(ratios.user).toBeGreaterThanOrEqual(4.5);
    expect(ratios.assistant).toBeGreaterThanOrEqual(4.5);
    expect(ratios.input).toBeGreaterThanOrEqual(4.5);
  });

  test('375px with a long conversation and an error: no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await mockChat(page, (b, n) =>
      n < 3 ? { json: { reply: `- Conseil ${n} : ${'mot '.repeat(60)}https://exemple.invalid/${'x'.repeat(120)}`, refused: false } } : { status: 504, json: { error: { message: 't' } } },
    );
    await openWithLang(page, 'en', '/dashboard');
    const chat = chatRegion(page);
    const input = chat.getByRole('textbox', { name: 'Your question' });
    for (let i = 1; i <= 3; i++) {
      await input.fill(`${'q'.repeat(150)} ${i}`);
      await input.press('Enter');
      if (i < 3) await expect(chat.getByRole('log')).toContainText(`Conseil ${i}`);
    }
    await expect(chat.getByRole('alert')).toContainText('took too long');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const retry = chat.getByRole('button', { name: 'Retry' });
    await retry.scrollIntoViewIfNeeded();
    await expect(retry).toBeInViewport();
    const box = await retry.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  });

  test('no OpenAI key or key name in any script served to the browser', async ({ page }) => {
    const scripts = [];
    page.on('response', async (res) => {
      const type = res.headers()['content-type'] ?? '';
      if (/javascript|json|html/.test(type)) scripts.push({ url: res.url(), body: await res.text().catch(() => '') });
    });
    await mockChat(page, () => ({ json: { reply: 'ok', refused: false } }));
    await page.goto('/dashboard');
    await chatRegion(page).getByRole('button', { name: 'Analyse mes résultats' }).click();
    await expect(chatRegion(page).getByRole('log')).toContainText('ok');
    expect(scripts.length).toBeGreaterThan(5);
    for (const s of scripts) {
      expect(s.body, s.url).not.toMatch(/sk-(proj-)?[A-Za-z0-9_-]{20,}/);
      expect(s.body, s.url).not.toMatch(/OPENAI_API_KEY/);
    }
    const env = await page.evaluate(() => JSON.stringify(import.meta.env ?? {})).catch(() => '{}');
    expect(env).not.toMatch(/OPENAI|sk-/);
  });
});
