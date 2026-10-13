import { test, expect, openWithLang } from './helpers.js';

const noHorizontalOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('mobile 375px', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  for (const lang of ['fr', 'en']) {
    test(`habits page fits without horizontal scroll (${lang})`, async ({ page, qa }) => {
      await qa.create({ label: 'mobile with a fairly long habit name to wrap' });
      await openWithLang(page, lang);
      await expect(page.getByRole('list').first()).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      // header controls are reachable
      await expect(page.getByRole('combobox').first()).toBeInViewport();
      await expect(page.getByRole('combobox').nth(1)).toBeInViewport();
      // the 7 cells of a row are visible and at least 24px (touch target)
      const cell = page.getByRole('group').first().getByRole('button').last();
      const box = await cell.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
      // the form fits too
      await page.getByRole('button', { name: lang === 'en' ? '+ New habit' : '+ Nouvelle habitude' }).click();
      await page.getByLabel(lang === 'en' ? 'Specific days' : 'Jours précis').check();
      expect(await noHorizontalOverflow(page)).toBe(true);
    });

    test(`dashboard fits without horizontal scroll (${lang})`, async ({ page }) => {
      await openWithLang(page, lang, '/dashboard');
      await expect(page.getByRole('grid')).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      // heatmap scrolls inside its own container and starts on the most recent weeks
      const scroller = page.locator('.dv-heatmap__scroll');
      const { scrollLeft, scrollWidth, clientWidth } = await scroller.evaluate((el) => ({
        scrollLeft: el.scrollLeft,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(scrollWidth).toBeGreaterThan(clientWidth);
      expect(scrollLeft + clientWidth).toBeGreaterThanOrEqual(scrollWidth - 2);
    });
  }
});

test.describe('accessibility basics', () => {
  test('every form control has an accessible name and Tab reaches the main actions', async ({ page }) => {
    await openWithLang(page, 'en');
    await page.getByRole('button', { name: '+ New habit' }).click();
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('input, select, button, [role="gridcell"]')]
        .filter((el) => {
          const label = el.labels?.[0]?.textContent?.trim() || el.getAttribute('aria-label') || el.textContent.trim();
          return !label;
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);

    // keyboard: from the top of a freshly loaded page, Tab goes through nav, selectors, then the page actions
    await page.reload();
    await expect(page.getByRole('list', { name: 'Active habits' })).toBeVisible();
    const order = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.trim()));
    }
    expect(order.slice(0, 5)).toEqual(['Habits', 'Dashboard', 'Language', 'Theme', '+ New habit']);
  });

  test('focus is visible on keyboard focus', async ({ page }) => {
    await openWithLang(page, 'en');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow };
    });
    expect(outline.style !== 'none' && outline.width > 0 || outline.shadow !== 'none').toBe(true);
  });

  // QA BUG: after Cancel/Create the form unmounts and focus falls back to <body> (HabitsPage.jsx, no focus management).
  test('closing the habit form returns focus to the button that opened it', async ({ page }) => {
    await openWithLang(page, 'en');
    const open = page.getByRole('button', { name: '+ New habit' });
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Name')).toBeFocused();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: '+ New habit' })).toBeFocused();
  });

  test('no console errors while browsing both pages', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await openWithLang(page, 'en');
    await expect(page.getByRole('list', { name: 'Active habits' })).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByRole('grid')).toBeVisible();
    await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
    await page.getByRole('link', { name: 'Habitudes' }).click();
    await expect(page.getByRole('list', { name: 'Habitudes actives' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
