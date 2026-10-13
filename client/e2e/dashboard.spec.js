import { test, expect, openWithLang, todayKey } from './helpers.js';

const pct = (r) => (r === null ? '—' : `${Math.round(r * 100)}%`);
const fullEn = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(
    new Date(y, m - 1, d),
  );
};

test.describe('dashboard', () => {
  test('KPI cards match /api/stats/summary', async ({ page, qa }) => {
    const s = await qa.summary();
    await openWithLang(page, 'en', '/dashboard');
    const kpi = (label) => page.locator('.dv-kpi').filter({ has: page.getByText(label, { exact: true }) });
    await expect(kpi('Active habits')).toContainText(String(s.activeHabits));
    await expect(kpi('Today’s completion')).toContainText(pct(s.todayRate));
    if (s.todayScheduled > 0) await expect(kpi('Today’s completion')).toContainText(`${s.todayCompleted}/${s.todayScheduled} checked`);
    await expect(kpi('Best streak')).toContainText(`${s.bestStreak.value} d`);
    await expect(kpi('Best streak')).toContainText(s.bestStreak.habitName);
    await expect(kpi('30-day rate')).toContainText(pct(s.rate30d));
    await expect(kpi('30-day rate')).toContainText('All habits combined');
  });

  test('heatmap: year navigation limits and empty past year', async ({ page }) => {
    const year = new Date().getFullYear();
    await openWithLang(page, 'en', '/dashboard');
    const prev = page.getByRole('button', { name: 'Previous year' });
    const next = page.getByRole('button', { name: 'Next year' });
    await expect(page.getByRole('heading', { name: `Activity ${year}` })).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(page.getByRole('grid', { name: new RegExp(`^Calendar ${year}:`) })).toBeVisible();

    await prev.click();
    await expect(page.getByRole('heading', { name: `Activity ${year - 1}` })).toBeVisible();
    await expect(next).toBeEnabled();
    await expect(page.getByText(`No habits scheduled in ${year - 1}.`)).toBeVisible();
    await next.click();
    await expect(page.getByRole('heading', { name: `Activity ${year}` })).toBeVisible();
    await expect(page.getByRole('grid')).toBeVisible();

    // lower bound 1970
    for (let y = year; y > 1970; y--) await prev.click();
    await expect(page.getByRole('heading', { name: 'Activity 1970' })).toBeVisible();
    await expect(prev).toBeDisabled();
    await expect(page.getByText('No habits scheduled in 1970.')).toBeVisible();
  });

  test('heatmap: single tab stop, arrows / Home / End / Escape, labels and tooltip', async ({ page }) => {
    const year = new Date().getFullYear();
    await openWithLang(page, 'en', '/dashboard');
    const grid = page.getByRole('grid', { name: new RegExp(`^Calendar ${year}:`) });
    await expect(grid).toBeVisible();
    await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
    // future days are rendered but visibility:hidden (out of the accessibility tree): one cell per day up to today
    const cells = grid.getByRole('gridcell');
    const elapsed = Math.round((new Date(year, new Date().getMonth(), new Date().getDate()) - new Date(year, 0, 1)) / 86400000) + 1;
    await expect(cells).toHaveCount(elapsed);
    const daysInYear = new Date(year, 1, 29).getMonth() === 1 ? 366 : 365;
    await expect(grid.locator('.dv-cell')).toHaveCount(daysInYear);

    // keyboard entry point = today
    const todayCell = grid.getByRole('gridcell', { name: new RegExp(`^${fullEn(todayKey())}: `) });
    await expect(todayCell).toHaveAttribute('tabindex', '0');
    await todayCell.focus();
    const tip = page.locator('.dv-heatmap__tip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(fullEn(todayKey()));

    await page.keyboard.press('ArrowLeft'); // one week back
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const wk = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`;
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', new RegExp(`^${fullEn(wk)}: `));
    await expect(tip).toContainText(fullEn(wk));

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight'); // clamped to today (future days are not reachable)
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', new RegExp(`^${fullEn(todayKey())}: `));

    await page.keyboard.press('Home');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', new RegExp(`^${fullEn(`${year}-01-01`)}: `));
    await page.keyboard.press('ArrowUp'); // clamped at Jan 1
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', new RegExp(`^${fullEn(`${year}-01-01`)}: `));
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', new RegExp(`^${fullEn(`${year}-01-02`)}: `));
    await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);

    await page.keyboard.press('End');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', new RegExp(`^${fullEn(todayKey())}: `));
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();

    // future days are labelled "upcoming", disabled and hidden (unless today is Dec 31)
    if (todayKey() !== `${year}-12-31`) {
      const dec31 = grid.locator(`[aria-label="${fullEn(`${year}-12-31`)}: upcoming"]`);
      await expect(dec31).toHaveAttribute('aria-disabled', 'true');
      await expect(dec31).toBeHidden();
    }

    // mouse hover tooltip
    await page.keyboard.press('Tab'); // leave the grid
    await todayCell.hover();
    await expect(tip).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();
  });

  test('daily, weekday and ranking charts render with "Show data" tables', async ({ page, qa }) => {
    const ranking = await qa.json('/stats/ranking?days=30');
    const daily = await qa.json('/stats/daily?days=30');
    await openWithLang(page, 'en', '/dashboard');

    const dailyChart = page.getByRole('img', { name: 'Daily completion rate over 30 days' });
    await expect(dailyChart.locator('svg.recharts-surface')).toBeVisible();
    await expect(dailyChart.locator('.recharts-line-curve')).toHaveCount(1);
    const weekdayChart = page.getByRole('img', { name: 'Completion rate by day of the week' });
    await expect(weekdayChart.locator('.recharts-bar-rectangle')).toHaveCount(7);
    const rankingChart = page.getByRole('img', { name: 'Habits ranked by completion rate over 30 days' });
    await expect(rankingChart.locator('.recharts-bar-rectangle')).toHaveCount(ranking.length);

    const summaries = page.getByText('Show data', { exact: true });
    await expect(summaries).toHaveCount(3);

    // daily table
    await summaries.nth(0).click();
    const dailyTable = page.getByRole('table', { name: 'Completion over 30 days' });
    await expect(dailyTable).toBeVisible();
    await expect(dailyTable.getByRole('columnheader')).toHaveText(['Date', 'Checked / scheduled', 'Rate']);
    await expect(dailyTable.locator('tbody tr')).toHaveCount(30);
    const last = daily[daily.length - 1];
    await expect(dailyTable.locator('tbody tr').last()).toContainText(fullEn(last.date));
    await expect(dailyTable.locator('tbody tr').last()).toContainText(`${last.completed}/${last.scheduled}`);

    // weekday table
    await summaries.nth(1).click();
    const wdTable = page.getByRole('table', { name: 'Rate by day of the week (last 12 weeks)' });
    await expect(wdTable.getByRole('rowheader')).toHaveText(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

    // ranking table, ordered like the API
    await summaries.nth(2).click();
    const rkTable = page.getByRole('table', { name: 'Habit ranking over 30 days' });
    await expect(rkTable.getByRole('rowheader')).toHaveText(ranking.map((r) => `${r.icon} ${r.name}`));
    await expect(rkTable.getByRole('columnheader')).toHaveText(['Habit', 'Checked / scheduled', 'Rate', 'Current streak']);

    // daily chart tooltip on hover
    const surface = dailyChart.locator('svg.recharts-surface');
    const box = await surface.boundingBox();
    // locator.hover scrolls the chart into view (it is below the fold)
    await surface.hover({ position: { x: box.width - 16, y: box.height / 2 } });
    await expect(dailyChart.locator('.dv-tooltip')).toContainText(fullEn(last.date));
  });

  // QA BUG: Charts.jsx truncate() slices UTF-16 units, the ranking Y-axis label shows a broken "�" glyph.
  test('ranking axis labels never split an emoji (surrogate pair) when truncated', async ({ page, qa }) => {
    // name: 13 chars + emoji at UTF-16 index 13-14 -> truncate(name, 15) keeps half of the pair
    await qa.create({ label: '', name: 'QA-e2e abcdef😀😀😀' });
    await openWithLang(page, 'en', '/dashboard');
    const rankingChart = page.getByRole('img', { name: /Habits ranked/ });
    await expect(rankingChart.locator('.recharts-yAxis text').first()).toBeVisible();
    const texts = await rankingChart.locator('.recharts-yAxis text').allTextContents();
    const lone = texts.filter((t) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(t));
    expect(lone).toEqual([]);
  });

  test('empty state when there is no active habit', async ({ page }) => {
    const year = new Date().getFullYear();
    await page.route('**/api/stats/summary', (r) =>
      r.fulfill({ json: { activeHabits: 0, todayRate: null, todayCompleted: 0, todayScheduled: 0, bestStreak: null, rate30d: null } }),
    );
    await page.route('**/api/stats/heatmap**', (r) => r.fulfill({ json: { year, days: [] } }));
    await page.route('**/api/stats/daily**', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/stats/weekday**', (r) =>
      r.fulfill({ json: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, completed: 0, scheduled: 0, rate: null })) }),
    );
    await page.route('**/api/stats/ranking**', (r) => r.fulfill({ json: [] }));
    await openWithLang(page, 'en', '/dashboard');
    await expect(page.getByText('No active habits.')).toBeVisible();
    await expect(page.getByText('Nothing scheduled today')).toBeVisible();
    await expect(page.getByText('No streak yet')).toBeVisible();
    await expect(page.getByText(`No habits scheduled in ${year}.`)).toBeVisible();
    await expect(page.getByText('No active habits yet.')).toHaveCount(3);
  });

  test('error state per block with Retry', async ({ page }) => {
    await page.route('**/api/stats/summary', (r) => r.fulfill({ status: 500, json: { error: { message: 'Erreur interne du serveur' } } }));
    await page.route('**/api/stats/ranking**', (r) => r.abort());
    await openWithLang(page, 'en', '/dashboard');
    const kpiErr = page.getByRole('alert').filter({ hasText: 'Could not load the indicators.' });
    await expect(kpiErr).toContainText('Erreur interne du serveur');
    const rankErr = page.getByRole('alert').filter({ hasText: 'Could not load this data.' });
    await expect(rankErr).toContainText('Server unreachable');
    // other blocks still render
    await expect(page.getByRole('img', { name: 'Daily completion rate over 30 days' })).toBeVisible();

    await page.unroute('**/api/stats/summary');
    await page.unroute('**/api/stats/ranking**');
    await kpiErr.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('Active habits', { exact: true })).toBeVisible();
    await rankErr.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('img', { name: /Habits ranked/ })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
