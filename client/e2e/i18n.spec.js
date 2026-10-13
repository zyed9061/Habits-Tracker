import { test, expect, openWithLang, cellLabel, daysAgo, API } from './helpers.js';

// Words that must not appear in the other language (habit names are user data and are removed first).
const FRENCH_WORDS = [
  'Habitudes', 'habitude', 'habitudes', 'prévues', 'Série', 'Meilleure', 'Objectif', 'Modifier', 'Archiver', 'Réessayer', 'Chargement',
  'cochées', 'prévu', 'Aucune', 'Jours', 'Taux', 'Voir les données', 'Tableau de bord', 'Complétion', 'Activité',
  'Année', 'Thème', 'Système', 'Clair', 'Sombre', 'Langue', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi',
  'samedi', 'dimanche', 'janv', 'févr', 'avr.', 'juil', 'sept.', 'oct.', 'déc.', 'aujourd', 'Fermer', 'Moins', 'Plus',
  'Classement', 'semaine', 'Navigation principale', 'Mes ',
];
const ENGLISH_WORDS = [
  'Habits', 'habit', 'Streak', 'streak', 'Goal', 'Edit', 'Archive', 'Retry', 'Loading', 'checked', 'scheduled',
  'Show data', 'Completion', 'Activity', 'Previous', 'Next', 'Theme', 'System', 'Light', 'Dark', 'Language',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'today', 'Close', 'Less', 'More',
  'Ranking', 'week', 'Main navigation', 'My ', 'Rate', 'Day', 'upcoming',
];

// Visible text + accessible names/tooltips of the whole page, minus user data and the language selector options.
async function pageStrings(page, habitNames) {
  const raw = await page.evaluate(() => {
    const out = [document.title, document.body.innerText];
    for (const el of document.querySelectorAll('[aria-label], [title]')) {
      if (el.getAttribute('aria-label')) out.push(el.getAttribute('aria-label'));
      if (el.getAttribute('title')) out.push(el.getAttribute('title'));
    }
    for (const el of document.querySelectorAll('svg text')) out.push(el.textContent);
    return out.join('\n');
  });
  let s = raw.replace(/FR · Français|EN · English/g, '');
  for (const n of [...habitNames].sort((a, b) => b.length - a.length)) s = s.split(n).join('<NAME>');
  return s;
}

function leaks(text, words) {
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return words.filter((w) => new RegExp(`(^|[^\\p{L}])${esc(w)}(?![\\p{L}])`, 'u').test(text));
}

async function allHabitNames(request) {
  return (await (await request.get(`${API}/habits?includeArchived=true`)).json()).map((h) => h.name);
}

test.describe('language switch', () => {
  test('French is the default; <html lang> and title follow the language and persist', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page).toHaveTitle('Habitudes');
    await expect(page.getByRole('heading', { level: 1, name: 'Mes habitudes' })).toBeVisible();
    const sel = page.getByRole('combobox', { name: 'Langue' });
    await expect(sel).toHaveValue('fr');

    await sel.selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Habits');
    await expect(page.getByRole('heading', { level: 1, name: 'My habits' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('en');

    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

    await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
    await expect(page.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('no French text left on the habits page in English (incl. aria-labels, tooltips, archived panel, form)', async ({ page, request, qa }) => {
    await qa.create({ label: 'i18n' });
    await openWithLang(page, 'en');
    await expect(page.getByRole('list', { name: 'Active habits' })).toBeVisible();
    await page.getByRole('button', { name: 'Show archived' }).click();
    await expect(page.getByRole('list', { name: 'Archived habits' })).toBeVisible();
    await page.getByRole('button', { name: '+ New habit' }).click();
    await page.getByLabel('Specific days').check();
    const names = await allHabitNames(request);
    expect(leaks(await pageStrings(page, names), FRENCH_WORDS)).toEqual([]);
  });

  test('no English text left on the habits page in French', async ({ page, request, qa }) => {
    await qa.create({ label: 'i18n' });
    await page.goto('/');
    await expect(page.getByRole('list', { name: 'Habitudes actives' })).toBeVisible();
    await page.getByRole('button', { name: 'Voir les archivées' }).click();
    await expect(page.getByRole('list', { name: 'Habitudes archivées' })).toBeVisible();
    await page.getByRole('button', { name: '+ Nouvelle habitude' }).click();
    await page.getByLabel('Jours précis').check();
    const names = await allHabitNames(request);
    expect(leaks(await pageStrings(page, names), ENGLISH_WORDS)).toEqual([]);
  });

  test('no French text left on the dashboard in English (tables, heatmap labels, chart axes)', async ({ page, request }) => {
    await openWithLang(page, 'en', '/dashboard');
    await expect(page.getByRole('grid')).toBeVisible();
    for (const s of await page.getByText('Show data', { exact: true }).all()) await s.click();
    await expect(page.locator('.recharts-yAxis text').first()).toBeVisible();
    const names = await allHabitNames(request);
    expect(leaks(await pageStrings(page, names), FRENCH_WORDS)).toEqual([]);
  });

  test('no English text left on the dashboard in French', async ({ page, request }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('grid')).toBeVisible();
    for (const s of await page.getByText('Voir les données', { exact: true }).all()) await s.click();
    await expect(page.locator('.recharts-yAxis text').first()).toBeVisible();
    const names = await allHabitNames(request);
    // "Dashboard" is used as the French nav label on purpose? It is reported separately (see QA report).
    const text = (await pageStrings(page, names)).replace(/Dashboard/g, '');
    expect(leaks(text, ENGLISH_WORDS)).toEqual([]);
  });

  test('French formats: dates, percentages and "j" unit', async ({ page, qa }) => {
    const h = await qa.create({ label: 'fmt' });
    const s = await qa.summary();
    await page.goto('/');
    await expect(page.getByRole('button', { name: cellLabel(h.name, daysAgo(0), 'fr', { today: true }) })).toBeVisible();
    await expect(page.getByRole('button', { name: cellLabel(h.name, daysAgo(1), 'fr') })).toBeVisible();
    await page.getByRole('link', { name: 'Tableau de bord' }).click();
    await expect(page.getByText(`${s.bestStreak.value} j`, { exact: true })).toBeVisible();
    if (s.rate30d !== null) await expect(page.getByText(`${Math.round(s.rate30d * 100)} %`, { exact: true }).first()).toBeVisible();
    await page.getByText('Voir les données', { exact: true }).first().click();
    const lastRow = page.getByRole('table', { name: 'Complétion sur 30 jours' }).locator('tbody tr').last();
    const now = new Date();
    const fr = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
    await expect(lastRow.getByRole('rowheader')).toHaveText(fr);
  });

  // QA BUG: Charts.jsx pctAxis tickFormatter hard-codes `${v}%`; French UI uses "50 %" everywhere else.
  test('French chart axis ticks use the French percent format', async ({ page }) => {
    await page.goto('/dashboard');
    const ticks = page.getByRole('img', { name: /quotidien/ }).locator('.recharts-yAxis text');
    await expect(ticks.first()).toBeVisible();
    expect(await ticks.allTextContents()).toContain('50 %');
  });

  test('confirm dialog is translated in both languages', async ({ page, qa }) => {
    const h = await qa.create({ label: 'confirm' });
    await page.goto('/');
    let msg = '';
    page.once('dialog', (d) => {
      msg = d.message();
      d.dismiss();
    });
    await page.getByRole('button', { name: `Archiver ${h.name}` }).click();
    expect(msg).toBe(`Archiver « ${h.name} » ? Elle n'apparaîtra plus dans la grille.`);
    await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
    page.once('dialog', (d) => {
      msg = d.message();
      d.dismiss();
    });
    await page.getByRole('button', { name: `Archive ${h.name}` }).click();
    expect(msg).toBe(`Archive “${h.name}”? It will no longer appear in the grid.`);
  });

  test('switching language while the form is open keeps the typed values and translates labels', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Nouvelle habitude' }).click();
    await page.getByLabel('Nom').fill('QA-e2e draft');
    await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
    const f = page.getByRole('form', { name: 'New habit' });
    await expect(f.getByLabel('Name')).toHaveValue('QA-e2e draft');
    await expect(f.getByRole('button', { name: 'Create' })).toBeVisible();
  });

  // QA BUG: HabitForm stores translated error strings in state; they stay in the old language after a switch.
  test('validation errors already shown are translated when the language changes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Nouvelle habitude' }).click();
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText('Le nom est obligatoire.')).toBeVisible();
    await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
    await expect(page.getByText('Name is required.')).toBeVisible();
    await expect(page.getByText('Le nom est obligatoire.')).toBeHidden();
  });

  // QA BUG: HabitsPage stores the translated notice string; it stays in the old language after a switch.
  test('a notice already shown is translated when the language changes', async ({ page, qa }) => {
    const h = await qa.create({ label: 'notice' });
    await page.goto('/');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: `Archiver ${h.name}` }).click();
    await expect(page.getByRole('status')).toHaveText(new RegExp(`« ${h.name} » archivée\\.`));
    await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
    await expect(page.getByRole('status')).toHaveText(new RegExp(`“${h.name}” archived\\.`));
  });

  test('errors on the habits page follow the language switch (load error)', async ({ page }) => {
    await page.route('**/api/habits', (r) => r.abort());
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('Impossible de charger les habitudes : Serveur injoignable');
    await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
    await expect(page.getByRole('alert')).toContainText('Could not load habits: Server unreachable');
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('dashboard error follows the language switch', async ({ page }) => {
    await page.route('**/api/stats/summary', (r) => r.abort());
    await page.goto('/dashboard');
    await expect(page.getByRole('alert')).toContainText('Impossible de charger les indicateurs.');
    await expect(page.getByRole('alert')).toContainText('Serveur injoignable');
    await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
    await expect(page.getByRole('alert')).toContainText('Could not load the indicators.');
    await expect(page.getByRole('alert')).toContainText('Server unreachable');
  });

  // QA BUG: HabitsPage loadArchived useCallback([]) captures the initial t: error shown in the load-time language.
  test('archived-list error uses the current language after a switch', async ({ page }) => {
    await page.goto('/'); // loaded in French
    await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
    await page.route('**/api/habits?includeArchived=true', (r) => r.abort());
    await page.getByRole('button', { name: 'Show archived' }).click();
    await expect(page.locator('#archived-panel').getByRole('alert')).toContainText('Server unreachable');
  });

  test('row check-in error uses the current language', async ({ page, qa }) => {
    const h = await qa.create({ label: 'rowerr' });
    await page.route(`**/api/habits/${h.id}/checkins/**`, (r) => r.abort());
    await page.goto('/');
    await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
    await page.getByRole('button', { name: cellLabel(h.name, daysAgo(1), 'en') }).click();
    await expect(page.getByTestId(`habit-${h.id}`).getByRole('alert')).toHaveText('Could not save: Server unreachable');
  });

  for (const bad of ['de', 'constructor']) {
    test(`an unexpected value in localStorage.lang ("${bad}") falls back to French instead of crashing`, async ({ page }) => {
      // QA BUG: I18nContext readStored uses `v in MESSAGES` (inherited keys pass): lang=constructor blanks the app.
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript((v) => localStorage.setItem('lang', v), bad);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Mes habitudes' })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});
