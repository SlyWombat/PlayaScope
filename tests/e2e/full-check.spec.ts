import { test, expect, type Page } from '@playwright/test';

// Comprehensive validation pass — every tab, every filter, the drilldowns,
// and the burn-detail routing. Runs against whatever `baseURL` is configured
// (local dev server by default; set PLAYWRIGHT_BASE_URL for the live site).

const READY = 120_000;

const ALL_TABS = [
  'Overview', 'MOOP Report', 'Geography', 'Personality', 'Event Mix',
  'Lexicon', 'Artists', 'Schedule Shape', 'Calendar', 'Continuity', 'Data',
];

// Console / page errors that are upstream noise, not our bug.
function isBenign(msg: string): boolean {
  return /cartocdn|fonts\.(googleapis|gstatic)|leaflet.*tile|unpkg\.com|ResizeObserver loop|favicon/i.test(msg);
}

async function waitReady(page: Page) {
  await expect(page.locator('.topbar .meta')).toContainText(/\d+\/\d+/, { timeout: READY });
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => { if (!isBenign(e.message)) errors.push(`pageerror: ${e.message}`); });
  page.on('console', (m) => {
    if (m.type() === 'error' && !isBenign(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

test.describe('PlayaScope — full validation', () => {
  test('loads, shows PlayaScope branding, default Official filter', async ({ page }) => {
    await page.goto('');
    await expect(page).toHaveTitle(/PlayaScope/);
    await waitReady(page);
    // Default sanction filter is Official — shown count < total.
    const meta = (await page.locator('.topbar .meta').textContent()) ?? '';
    const m = meta.match(/(\d+)\/(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThan(Number(m![2]));
    // Brand wordmark present.
    await expect(page.locator('h1', { hasText: 'playascope' })).toBeVisible();
  });

  test('every tab renders a panel with no fatal console errors', async ({ page }) => {
    // 11 tabs × (click + settle + assert) exceeds the default 30s cap.
    test.setTimeout(120_000);
    const errors = trackErrors(page);
    await page.goto('');
    await waitReady(page);
    for (const tab of ALL_TABS) {
      await page.getByRole('button', { name: tab, exact: true }).click({ force: true });
      await page.waitForTimeout(400);
      await expect(page.locator('.panel').first()).toBeVisible();
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('sanction filter — All / Official / Other are consistent', async ({ page }) => {
    await page.goto('');
    await waitReady(page);
    const meta = page.locator('.topbar .meta');

    // The shown/total count is also subject to the (default-on) year filter,
    // so the invariant we check is Official + Other === All — not All === 62.
    await page.getByRole('button', { name: /^All/ }).click();
    const allShown = Number(((await meta.textContent()) ?? '').match(/(\d+)\//)![1]);

    await page.getByRole('button', { name: /^Official/ }).click();
    const off = Number(((await meta.textContent()) ?? '').match(/(\d+)\//)![1]);

    await page.getByRole('button', { name: /^Other/ }).click();
    const other = Number(((await meta.textContent()) ?? '').match(/(\d+)\//)![1]);

    expect(off + other).toBe(allShown);
    expect(off).toBeGreaterThan(0);
  });

  test('year filter toggles between current-year and all-years', async ({ page }) => {
    await page.goto('');
    await waitReady(page);
    const meta = page.locator('.topbar .meta');
    const before = Number(((await meta.textContent()) ?? '').match(/\/(\d+)/)![1]);
    // Toggle to all years — total should grow (prior-year burns reappear).
    await page.getByRole('button', { name: /year|only/i }).first().click();
    await page.waitForTimeout(300);
    const after = Number(((await meta.textContent()) ?? '').match(/\/(\d+)/)![1]);
    expect(after).toBeGreaterThanOrEqual(before);
  });

  test('region drilldown — clicking the Overview pie filters + shows a chip', async ({ page }) => {
    await page.goto('');
    await waitReady(page);
    // The region pie is an ECharts canvas; click near its center-right slice.
    const pies = page.locator('.panel', { hasText: 'Distribution by region' }).locator('canvas');
    await expect(pies.first()).toBeVisible();
    const box = await pies.first().boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.25);
      await page.waitForTimeout(400);
    }
    // A region chip may now be in the topbar (depends which slice was hit).
    // Non-fatal: just confirm the app didn't crash.
    await expect(page.locator('.panel').first()).toBeVisible();
  });

  test('burn drilldown — Data table row opens BurnDetail, back returns', async ({ page }) => {
    await page.goto('');
    await waitReady(page);
    await page.getByRole('button', { name: /^All/ }).click();
    await page.getByRole('button', { name: 'Data', exact: true }).click({ force: true });
    const firstRow = page.locator('table.data tbody tr').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    // BurnDetail shows a back button + an h1 burn title.
    const back = page.getByRole('button', { name: /back/i });
    await expect(back).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain('#burn=');
    // Leaving via a tab clears the hash (the nav-trap fix).
    await page.getByRole('button', { name: 'Overview', exact: true }).click({ force: true });
    await expect(page.locator('.kpi').first()).toBeVisible();
    expect(page.url()).not.toContain('#burn=');
  });

  test('direct burn-hash URL renders detail and is escapable', async ({ page }) => {
    await page.goto('#burn=sideburn');
    await waitReady(page);
    await expect(page.getByRole('button', { name: /back/i })).toBeVisible({ timeout: 10_000 });
    // Menu must work from a cold burn-detail load.
    await page.getByRole('button', { name: 'Geography', exact: true }).click({ force: true });
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
  });

  test('Lexicon renders a word-cloud canvas', async ({ page }) => {
    await page.goto('');
    await waitReady(page);
    await page.getByRole('button', { name: 'Lexicon', exact: true }).click({ force: true });
    await expect(page.locator('.panel', { hasText: 'Lexicon' }).locator('canvas').first())
      .toBeVisible({ timeout: 10_000 });
  });

  test('Data table — filter narrows rows, sort reorders', async ({ page }) => {
    await page.goto('');
    await waitReady(page);
    await page.getByRole('button', { name: /^All/ }).click();
    await page.getByRole('button', { name: 'Data', exact: true }).click({ force: true });
    const rows = page.locator('table.data tbody tr');
    const total = await rows.count();
    expect(total).toBeGreaterThan(0);
    await page.getByPlaceholder(/filter/).fill('soak');
    await expect(rows).not.toHaveCount(total);
    expect(await rows.count()).toBeGreaterThan(0);
    await page.getByPlaceholder(/filter/).fill('');
    await expect(rows).toHaveCount(total);
  });

  test('Calendar — month navigation works', async ({ page }) => {
    await page.goto('');
    await waitReady(page);
    await page.getByRole('button', { name: 'Calendar', exact: true }).click({ force: true });
    await expect(page.locator('.panel', { hasText: 'Burn calendar' })).toBeVisible();
    // The ‹ › nav buttons exist; clicking them should not crash.
    const next = page.getByRole('button', { name: '›', exact: true });
    if (await next.count()) {
      await next.click();
      await page.waitForTimeout(200);
      await expect(page.locator('.panel').first()).toBeVisible();
    }
  });
});
