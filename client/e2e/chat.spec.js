import { test, expect, openWithLang } from './helpers.js';

// L'assistant appelle OpenAI côté serveur : ici /api/chat est toujours intercepté
// (aucun appel payant). Le vrai serveur est couvert par server/tests/chat.test.js.
async function mockChat(page, handler) {
  const bodies = [];
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const { status = 200, json } = await handler(body, bodies.length);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
  });
  return bodies;
}

const noHorizontalOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('dashboard assistant', () => {
  test('suggestion → reply, then a typed follow-up sends the history (fr)', async ({ page }) => {
    const bodies = await mockChat(page, (body, n) => ({ json: { reply: `Réponse ${n}`, refused: false } }));
    await page.goto('/dashboard');
    const chat = page.getByRole('region', { name: 'Assistant' });
    await chat.getByRole('button', { name: 'Analyse mes résultats' }).click();
    const log = chat.getByRole('log', { name: "Conversation avec l'assistant" });
    await expect(log).toContainText('Réponse 1');
    expect(bodies[0]).toEqual({ messages: [{ role: 'user', content: 'Analyse mes résultats' }], lang: 'fr' });

    const input = chat.getByRole('textbox', { name: 'Votre question' });
    await input.fill('Et le sport ?');
    await input.press('Enter');
    await expect(log).toContainText('Réponse 2');
    expect(bodies[1].messages).toEqual([
      { role: 'user', content: 'Analyse mes résultats' },
      { role: 'assistant', content: 'Réponse 1' },
      { role: 'user', content: 'Et le sport ?' },
    ]);
    await expect(input).toHaveValue('');
  });

  test('pending indicator, refusal and error follow the language', async ({ page }) => {
    let release;
    const gate = new Promise((r) => (release = r));
    await mockChat(page, async (body, n) => {
      if (n === 1) {
        await gate;
        return { json: { reply: 'I can only…', refused: true } };
      }
      return { status: 503, json: { error: { message: 'Assistant indisponible' } } };
    });
    await openWithLang(page, 'en', '/dashboard');
    const chat = page.getByRole('region', { name: 'Assistant' });
    const input = chat.getByRole('textbox', { name: 'Your question' });
    await input.fill('What is the capital of France?');
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat.getByText('The assistant is writing an answer…')).toBeAttached();
    await input.fill('again');
    await expect(chat.getByRole('button', { name: 'Send' })).toBeDisabled();
    release();
    await expect(chat.getByText(/I can only analyse your habits/)).toBeVisible();

    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat.getByRole('alert')).toContainText('The assistant is not configured on the server');
    await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
    await expect(chat.getByText(/Je peux uniquement analyser vos habitudes/)).toBeVisible();
    await expect(chat.getByRole('alert')).toContainText("L'assistant n'est pas configuré sur le serveur");
    await expect(chat.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  });

  test('fits a 375px screen without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await mockChat(page, () => ({
      json: { reply: 'Une réponse assez longue pour passer sur plusieurs lignes, avec un-mot-tres-long-sans-espace-aucun-qui-doit-se-couper.', refused: false },
    }));
    await page.goto('/dashboard');
    const chat = page.getByRole('region', { name: 'Assistant' });
    await chat.getByRole('button', { name: 'Conseils pour ma régularité' }).click();
    await expect(chat.getByRole('log')).toContainText('Une réponse assez longue');
    expect(await noHorizontalOverflow(page)).toBe(true);
    await expect(chat.getByRole('button', { name: 'Envoyer' })).toBeInViewport();
  });
});
