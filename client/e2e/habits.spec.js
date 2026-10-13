import { test, expect, openWithLang, cellLabel, daysAgo, dateKey, uniqueName, weekdayIndex, API } from './helpers.js';

const form = (page) => page.getByRole('form', { name: /New habit|Edit habit/ });

async function openNewForm(page) {
  await page.getByRole('button', { name: '+ New habit' }).click();
  await expect(form(page)).toBeVisible();
  return form(page);
}

test.describe('habits: create and validate', () => {
  test.beforeEach(async ({ page, qa }) => {
    void qa; // archives leftovers before/after each test
    await openWithLang(page, 'en');
    await expect(page.getByRole('heading', { level: 1, name: 'My habits' })).toBeVisible();
  });

  test('creates a daily habit and shows it in the grid with a notice', async ({ page, request }) => {
    const name = uniqueName('daily');
    const f = await openNewForm(page);
    await expect(f.getByLabel('Name')).toBeFocused();
    await f.getByLabel('Name').fill(`  ${name}  `);
    await f.getByRole('button', { name: 'Icon 💧' }).click();
    await expect(f.getByRole('button', { name: 'Icon 💧' })).toHaveAttribute('aria-pressed', 'true');
    await f.getByRole('button', { name: 'Color #EF4444' }).click();
    await expect(f.getByRole('button', { name: 'Color #EF4444' })).toHaveAttribute('aria-pressed', 'true');
    await expect(f.getByLabel('Color', { exact: true })).toHaveValue('#ef4444');
    await f.getByRole('button', { name: 'Create' }).click();

    await expect(form(page)).toBeHidden();
    await expect(page.getByRole('status')).toHaveText(new RegExp(`“${name}” created\\.`));
    const row = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name }) });
    await expect(row).toBeVisible();
    await expect(row.getByText('Goal 7/wk')).toBeVisible();

    const list = await (await request.get(`${API}/habits`)).json();
    const created = list.find((h) => h.name === name);
    expect(created).toMatchObject({ color: '#EF4444', icon: '💧', frequency: { type: 'daily', days: [0, 1, 2, 3, 4, 5, 6] }, weeklyGoal: 7 });

    // persists after reload
    await page.reload();
    await expect(page.getByRole('heading', { name })).toBeVisible();
  });

  test('creates a weekdays habit; goal follows the number of selected days', async ({ page, request }) => {
    const name = uniqueName('weekdays');
    const f = await openNewForm(page);
    await f.getByLabel('Name').fill(name);
    await f.getByLabel('Specific days').check();
    const days = f.getByRole('group', { name: 'Scheduled days' });
    await expect(days.getByRole('button')).toHaveCount(7);
    for (const d of ['Tuesday', 'Thursday', 'Saturday', 'Sunday']) await days.getByRole('button', { name: d }).click();
    // Mon, Wed, Fri remain
    await expect(days.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true');
    await expect(days.getByRole('button', { name: 'Tuesday' })).toHaveAttribute('aria-pressed', 'false');
    await expect(f.getByLabel('Weekly goal (days)')).toHaveValue('3');
    await f.getByLabel('Weekly goal (days)').fill('2');
    await f.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();

    const created = (await (await request.get(`${API}/habits`)).json()).find((h) => h.name === name);
    expect(created.frequency).toEqual({ type: 'weekdays', days: [0, 2, 4] });
    expect(created.weeklyGoal).toBe(2);
  });

  test('validation: empty name, too long name, emoji counted by code points', async ({ page }) => {
    const f = await openNewForm(page);
    const nameInput = f.getByLabel('Name');

    await f.getByRole('button', { name: 'Create' }).click();
    await expect(f.getByText('Name is required.')).toBeVisible();
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    await expect(nameInput).toHaveAttribute('aria-describedby', 'habit-name-error');

    await nameInput.fill('   ');
    await f.getByRole('button', { name: 'Create' }).click();
    await expect(f.getByText('Name is required.')).toBeVisible();

    await nameInput.fill('a'.repeat(61));
    await f.getByRole('button', { name: 'Create' }).click();
    await expect(f.getByText('60 characters maximum.')).toBeVisible();

    // 60 code points but 61 UTF-16 units: valid
    const name = `QA-e2e ${'b'.repeat(52)}😀`;
    expect([...name].length).toBe(60);
    await nameInput.fill(name);
    await f.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
  });

  test('a 60-emoji name (valid per contract) can be typed in full', async ({ page }) => {
    // QA BUG: name input has maxLength=80 UTF-16 units; 60 emoji = 120 units, input is truncated to 40 emoji.
    const f = await openNewForm(page);
    const value = '😀'.repeat(60);
    await f.getByLabel('Name').fill(value);
    await expect(f.getByLabel('Name')).toHaveValue(value);
  });

  test('validation: icon empty / too long / composed emoji accepted', async ({ page }) => {
    const f = await openNewForm(page);
    await f.getByLabel('Name').fill(uniqueName('icon'));
    const icon = f.getByLabel('Icon', { exact: true });
    await icon.fill('');
    await f.getByRole('button', { name: 'Create' }).click();
    await expect(f.getByText('Pick an emoji.')).toBeVisible();
    await expect(icon).toHaveAttribute('aria-invalid', 'true');

    await icon.fill('123456789');
    await f.getByRole('button', { name: 'Create' }).click();
    await expect(f.getByText('Pick an emoji.')).toBeVisible();

    await icon.fill('👨‍👩‍👧'); // 5 code points, 8 UTF-16 units
    await f.getByRole('button', { name: 'Create' }).click();
    await expect(form(page)).toBeHidden();
  });

  test('validation: weekdays with no day, goal bounds and goal > scheduled days', async ({ page }) => {
    const f = await openNewForm(page);
    await f.getByLabel('Name').fill(uniqueName('goal'));
    const goal = f.getByLabel('Weekly goal (days)');

    await goal.fill('0');
    await f.getByRole('button', { name: 'Create' }).click();
    await expect(f.getByText('Goal must be between 1 and 7.')).toBeVisible();
    await goal.fill('8');
    await f.getByRole('button', { name: 'Create' }).click();
    await expect(f.getByText('Goal must be between 1 and 7.')).toBeVisible();
    await goal.fill('');
    await f.getByRole('button', { name: 'Create' }).click();
    await expect(f.getByText('Goal must be between 1 and 7.')).toBeVisible();
    await expect(goal).toHaveAttribute('aria-describedby', 'habit-goal-error');

    await goal.fill('7');
    await f.getByLabel('Specific days').check();
    const days = f.getByRole('group', { name: 'Scheduled days' });
    for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      await days.getByRole('button', { name: d }).click();
    }
    await f.getByRole('button', { name: 'Create' }).click();
    await expect(f.getByText('Pick at least one day.')).toBeVisible();
    await expect(days).toHaveAttribute('aria-describedby', 'habit-days-error');

    await days.getByRole('button', { name: 'Monday' }).click();
    await days.getByRole('button', { name: 'Friday' }).click();
    await goal.fill('3');
    await f.getByRole('button', { name: 'Create' }).click();
    await expect(f.getByText('Goal cannot exceed the number of scheduled days (2).')).toBeVisible();
    await expect(f.getByText('Pick at least one day.')).toBeHidden();

    // the server never received an invalid request: form still open, nothing created
    await expect(form(page)).toBeVisible();
    await f.getByRole('button', { name: 'Cancel' }).click();
    await expect(form(page)).toBeHidden();
    await expect(page.getByRole('button', { name: '+ New habit' })).toBeVisible();
  });

  test('server-side error is shown in the form and the form stays usable', async ({ page }) => {
    await page.route('**/api/habits', (r) =>
      r.request().method() === 'POST'
        ? r.fulfill({ status: 400, json: { error: { message: 'Boom serveur' } } })
        : r.fallback(),
    );
    const f = await openNewForm(page);
    await f.getByLabel('Name').fill(uniqueName('srv'));
    await f.getByRole('button', { name: 'Create' }).click();
    await expect(f.getByRole('alert')).toHaveText('Boom serveur');
    await expect(f.getByRole('button', { name: 'Create' })).toBeEnabled();
  });
});

test.describe('habits: edit, archive, unarchive, notices', () => {
  test('edit a habit (name, frequency) and cancel an edit', async ({ page, qa }) => {
    const h = await qa.create({ label: 'edit' });
    await openWithLang(page, 'en');
    await page.getByRole('button', { name: `Edit ${h.name}` }).click();
    const f = page.getByRole('form', { name: 'Edit habit' });
    await expect(f.getByLabel('Name')).toHaveValue(h.name);
    await expect(page.getByRole('button', { name: '+ New habit' })).toBeHidden();
    await f.getByRole('button', { name: 'Cancel' }).click();
    await expect(f).toBeHidden();

    await page.getByRole('button', { name: `Edit ${h.name}` }).click();
    const newName = `${h.name} edited`;
    await f.getByLabel('Name').fill(newName);
    await f.getByLabel('Specific days').check();
    await f.getByRole('group', { name: 'Scheduled days' }).getByRole('button', { name: 'Sunday' }).click();
    await expect(f.getByLabel('Weekly goal (days)')).toHaveValue('6');
    await f.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toHaveText(new RegExp(`“${newName}” updated\\.`));
    await expect(page.getByRole('heading', { name: newName })).toBeVisible();
    const sunday = daysAgo((weekdayIndex(new Date()) + 1) % 7); // the last Sunday within the 7-day window
    await expect(
      page.getByRole('button', { name: cellLabel(newName, sunday, 'en', { today: dateKey(sunday) === dateKey(new Date()), scheduled: false }) }),
    ).toHaveAttribute('data-scheduled', 'false');
    expect((await qa.get(h.id)).frequency.days).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('archive: cancel keeps the habit, accept archives it; show/hide archived; unarchive', async ({ page, qa }) => {
    const h = await qa.create({ label: 'archive' });
    await qa.checkIn(h.id, dateKey(daysAgo(1)));
    await openWithLang(page, 'en');
    const heading = page.getByRole('heading', { name: h.name, level: 2 });
    await expect(heading).toBeVisible();

    let message = '';
    page.once('dialog', (d) => {
      message = d.message();
      d.dismiss();
    });
    await page.getByRole('button', { name: `Archive ${h.name}` }).click();
    expect(message).toBe(`Archive “${h.name}”? It will no longer appear in the grid.`);
    await expect(heading).toBeVisible();
    expect((await qa.get(h.id)).archived).toBe(false);

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: `Archive ${h.name}` }).click();
    await expect(heading).toBeHidden();
    const notice = page.getByRole('status').filter({ hasText: 'archived' });
    await expect(notice).toHaveText(new RegExp(`“${h.name}” archived\\.`));

    // close the notice
    await notice.getByRole('button', { name: 'Close message' }).click();
    await expect(notice).toBeHidden();

    const toggle = page.getByRole('button', { name: 'Show archived' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Hide archived' })).toHaveAttribute('aria-expanded', 'true');
    const archivedList = page.getByRole('list', { name: 'Archived habits' });
    await expect(archivedList.getByText(h.name)).toBeVisible();

    await archivedList.getByRole('button', { name: `Unarchive ${h.name}` }).click();
    // unarchive reloads the whole grid, so a "Loading habits…" status can coexist briefly with the notice
    await expect(page.getByRole('status').filter({ hasText: 'unarchived' })).toHaveText(new RegExp(`“${h.name}” unarchived\\.`));
    await expect(archivedList.getByText(h.name)).toBeHidden();
    await expect(heading).toBeVisible();
    // the restored habit gets its check-ins back
    await expect(page.getByRole('button', { name: cellLabel(h.name, daysAgo(1), 'en') })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Hide archived' }).click();
    await expect(page.getByRole('heading', { name: 'Archived habits' })).toBeHidden();
  });
});

test.describe('habits: 7-day grid and streaks', () => {
  test('grid shows the last 7 local days, today highlighted, unscheduled days marked', async ({ page, qa }) => {
    const todayWd = weekdayIndex(new Date());
    // scheduled on every day except today's weekday
    const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== todayWd);
    const h = await qa.create({ label: 'grid', frequency: { type: 'weekdays', days }, weeklyGoal: 1 });
    await openWithLang(page, 'en');
    const group = page.getByRole('group', { name: `Week of ${h.name}` });
    const cells = group.getByRole('button');
    await expect(cells).toHaveCount(7);
    for (let i = 6; i >= 0; i--) {
      const d = daysAgo(i);
      const cell = group.getByRole('button', { name: cellLabel(h.name, d, 'en', { today: i === 0, scheduled: i !== 0 }) });
      await expect(cell).toHaveAttribute('data-date', dateKey(d));
      if (i === 0) await expect(cell).toHaveClass(/is-today/);
      else await expect(cell).not.toHaveClass(/is-today/);
    }
    const today = group.getByRole('button', { name: cellLabel(h.name, daysAgo(0), 'en', { today: true, scheduled: false }) });
    await expect(today).toHaveClass(/is-unscheduled/);

    // checking an unscheduled day is accepted and stored, but does not change streaks
    await today.click();
    await expect(today).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`habit-${h.id}`).getByTestId('current-streak')).toHaveText('🔥 0');
    await page.reload();
    await expect(today).toHaveAttribute('aria-pressed', 'true');
    expect((await qa.get(h.id)).currentStreak).toBe(0);
  });

  test('check / uncheck updates streaks from the server', async ({ page, qa }) => {
    const h = await qa.create({ label: 'streak' });
    await openWithLang(page, 'en');
    const row = page.getByTestId(`habit-${h.id}`);
    const today = row.getByRole('button', { name: cellLabel(h.name, daysAgo(0), 'en', { today: true }) });
    const yesterday = row.getByRole('button', { name: cellLabel(h.name, daysAgo(1), 'en') });
    const current = row.getByTestId('current-streak');
    const best = row.getByTestId('best-streak');

    await expect(current).toHaveText('🔥 0');
    await today.click();
    await expect(today).toHaveAttribute('aria-pressed', 'true');
    await expect(today).toHaveText('✓');
    await expect(current).toHaveText('🔥 1');
    await expect(current).toHaveAttribute('aria-label', 'Current streak: 1');
    await yesterday.click();
    await expect(current).toHaveText('🔥 2');
    await expect(best).toHaveText('🏆 2');
    await today.click();
    await expect(today).toHaveAttribute('aria-pressed', 'false');
    // today unchecked does not break the streak: it starts from yesterday
    await expect(current).toHaveText('🔥 1');
    await expect(best).toHaveText('🏆 1');

    await page.reload();
    await expect(yesterday).toHaveAttribute('aria-pressed', 'true');
    await expect(today).toHaveAttribute('aria-pressed', 'false');
  });

  test('optimistic update: the cell flips before the server answers, then rollback on error', async ({ page, qa }) => {
    const h = await qa.create({ label: 'optimistic' });
    let release;
    const gate = new Promise((r) => (release = r));
    await page.route(`**/api/habits/${h.id}/checkins/**`, async (route) => {
      await gate;
      await route.fallback();
    });
    await openWithLang(page, 'en');
    const row = page.getByTestId(`habit-${h.id}`);
    const cell = row.getByRole('button', { name: cellLabel(h.name, daysAgo(2), 'en') });
    await cell.click();
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await expect(cell).toHaveAttribute('aria-disabled', 'true'); // pending (focus kept)
    release();
    await expect(cell).toHaveAttribute('aria-disabled', 'false');
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await page.unroute(`**/api/habits/${h.id}/checkins/**`);

    // server error -> rollback + row message that disappears after ~5 s
    await page.route(`**/api/habits/${h.id}/checkins/**`, (r) =>
      r.fulfill({ status: 400, json: { error: { message: 'Refusé' } } }),
    );
    const other = row.getByRole('button', { name: cellLabel(h.name, daysAgo(3), 'en') });
    await other.click();
    await expect(other).toHaveAttribute('aria-pressed', 'false');
    const alert = row.getByRole('alert');
    await expect(alert).toHaveText('Could not save: Refusé');
    await expect(alert).toBeHidden({ timeout: 8000 });

    // network failure -> rollback with the translated "unreachable" message
    await page.unroute(`**/api/habits/${h.id}/checkins/**`);
    await page.route(`**/api/habits/${h.id}/checkins/**`, (r) => r.abort());
    await cell.click();
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await expect(row.getByRole('alert')).toHaveText('Could not save: Server unreachable');
  });

  test('keyboard: Space toggles a cell and focus stays on it', async ({ page, qa }) => {
    // QA BUG: the cell is `disabled` while pending, so the focused button loses focus (focus goes to <body>).
    const h = await qa.create({ label: 'kbd' });
    await openWithLang(page, 'en');
    const cell = page.getByRole('button', { name: cellLabel(h.name, daysAgo(0), 'en', { today: true }) });
    await cell.focus();
    await page.keyboard.press('Space');
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await expect(cell).toBeFocused();
  });
});

test.describe('habits: empty, loading error and retry', () => {
  test('empty state offers to create the first habit', async ({ page }) => {
    await page.route('**/api/habits', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: [] }) : r.fallback()));
    await page.route('**/api/checkins?**', (r) => r.fulfill({ json: [] }));
    await openWithLang(page, 'en');
    await expect(page.getByText('No active habits yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Create my first habit' }).click();
    await expect(page.getByRole('form', { name: 'New habit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create my first habit' })).toBeHidden();
  });

  test('API unreachable shows an error with Retry that recovers', async ({ page }) => {
    await page.route('**/api/habits', (r) => r.abort());
    await openWithLang(page, 'en');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Could not load habits: Server unreachable');
    await page.unroute('**/api/habits');
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('list', { name: 'Active habits' })).toBeVisible();
  });

  test('proxy 500 without JSON body (API stopped) is reported as unreachable', async ({ page }) => {
    await page.route('**/api/checkins?**', (r) => r.fulfill({ status: 500, body: '' }));
    await openWithLang(page, 'en');
    await expect(page.getByRole('alert')).toContainText('Could not load habits: Server unreachable');
  });

  test('archived list error shows Retry', async ({ page }) => {
    await page.route('**/api/habits?includeArchived=true', (r) => r.abort());
    await openWithLang(page, 'en');
    await page.getByRole('button', { name: 'Show archived' }).click();
    const alert = page.locator('#archived-panel').getByRole('alert');
    await expect(alert).toContainText('Server unreachable');
    await page.unroute('**/api/habits?includeArchived=true');
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('list', { name: 'Archived habits' })).toBeVisible();
  });
});
