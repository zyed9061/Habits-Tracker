import { test, expect, openWithLang } from './helpers.js';

test.describe('navigation', () => {
  test('nav links switch pages, highlight the active tab and keep history', async ({ page }) => {
    await openWithLang(page, 'en');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    const habitsLink = nav.getByRole('link', { name: 'Habits' });
    const dashLink = nav.getByRole('link', { name: 'Dashboard' });

    await expect(page.getByRole('heading', { level: 1, name: 'My habits' })).toBeVisible();
    await expect(habitsLink).toHaveAttribute('aria-current', 'page');
    await expect(dashLink).not.toHaveAttribute('aria-current', 'page');

    await dashLink.click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(dashLink).toHaveAttribute('aria-current', 'page');
    await expect(habitsLink).not.toHaveAttribute('aria-current', 'page');

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My habits' })).toBeVisible();
    await expect(habitsLink).toHaveAttribute('aria-current', 'page');

    await page.goForward();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  });

  test('direct load and refresh of /dashboard work (deep link)', async ({ page }) => {
    await openWithLang(page, 'en', '/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Active habits')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  });

  test('unknown route shows a not-found message and the nav still works', async ({ page }) => {
    await openWithLang(page, 'en', '/does-not-exist');
    await expect(page.getByText('Page not found.')).toBeVisible();
    await page.getByRole('link', { name: 'Habits', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'My habits' })).toBeVisible();
  });

  test('not-found page links back to the habits page (translated)', async ({ page }) => {
    await openWithLang(page, 'en', '/does-not-exist');
    await page.getByRole('link', { name: 'Back to habits' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'My habits' })).toBeVisible();
    await page.goto('/nope');
    await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
    await expect(page.getByRole('link', { name: 'Retour aux habitudes' })).toBeVisible();
  });

  test('unknown route in French', async ({ page }) => {
    await page.goto('/nope/deeper');
    await expect(page.getByText('Page introuvable.')).toBeVisible();
  });

  test('the dashboard KPI empty-state link navigates without a full reload', async ({ page }) => {
    const empty = { activeHabits: 0, todayRate: null, todayCompleted: 0, todayScheduled: 0, bestStreak: null, rate30d: null };
    await page.route('**/api/stats/summary', (r) => r.fulfill({ json: empty }));
    await openWithLang(page, 'en', '/dashboard');
    await page.evaluate(() => (window.__qaNoReload = true));
    await page.getByRole('link', { name: 'Create your first habit' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => window.__qaNoReload)).toBe(true);
  });
});

test.describe('theme', () => {
  test('system / light / dark apply data-theme and persist across reload', async ({ page }) => {
    await openWithLang(page, 'en');
    const select = page.getByRole('combobox', { name: 'Theme' });
    await expect(select).toHaveValue('system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);

    await select.selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveValue('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('combobox', { name: 'Theme' }).selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('combobox', { name: 'Theme' }).selectOption('system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
  });

  test('dark theme actually changes the page colours', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openWithLang(page, 'en');
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await bg();
    await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
    await expect.poll(bg).not.toBe(light);
    // "system" follows prefers-color-scheme
    await page.getByRole('combobox', { name: 'Theme' }).selectOption('system');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(bg).not.toBe(light);
  });

  test('no flash: stored theme and language are applied before the React bundle runs', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'dark');
      localStorage.setItem('lang', 'en');
    });
    // Block the app bundle: only the inline script in index.html can set these.
    await page.route('**/src/main.jsx', (r) => r.abort());
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Habits');
  });
});
