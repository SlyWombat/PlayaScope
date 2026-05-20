import { test, expect, type Page } from '@playwright/test';

// End-to-end smoke test for the PlayaScope dashboard. We hit the local
// vite dev server which reads the snapshot in public/data/. Run
// `npm run fetch-data` once before invoking these tests.

const READY_TIMEOUT = 120_000;

async function waitForReady(page: Page) {
  // The top-bar meta cell flips from "loading-registry" / "loading-bundles"
  // to the "<N>/<N>" count once everything's loaded.
  await expect(page.locator('.topbar .meta')).toContainText(/\d+\/\d+/, { timeout: READY_TIMEOUT });
}

test.describe('PlayaScope SPA smoke', () => {
  test('Overview tab renders KPIs and charts', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/PlayaScope/);
    await waitForReady(page);

    // KPI cards in the overview.
    await expect(page.locator('.kpi .label', { hasText: 'Burns shown' })).toBeVisible();
    await expect(page.locator('.kpi .label', { hasText: 'Events' })).toBeVisible();
    await expect(page.locator('.kpi .label', { hasText: 'Camps · Art' })).toBeVisible();

    // ECharts injects a <canvas> into each .chart container — at least one.
    const canvases = page.locator('.chart canvas');
    await expect(canvases.first()).toBeVisible();
    expect(await canvases.count()).toBeGreaterThanOrEqual(2);
  });

  test('Sanction filter is wired and toggles the count', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);

    const meta = page.locator('.topbar .meta');
    const initial = (await meta.textContent()) ?? '';
    const allMatch = initial.match(/(\d+)\/(\d+)/);
    expect(allMatch).not.toBeNull();
    const totalShown = Number(allMatch![1]);
    const totalBundles = Number(allMatch![2]);
    expect(totalShown).toBe(totalBundles); // "All" defaults

    // Sanctioned list strip should show 50-ish events scraped from BM.
    await expect(page.locator('text=Sanctioned list:')).toBeVisible();

    // Click "Official" — count should drop.
    await page.getByRole('button', { name: /^Official/ }).click();
    await expect(meta).not.toContainText(`${totalShown}/${totalBundles}`);
    const offText = (await meta.textContent()) ?? '';
    const offMatch = offText.match(/(\d+)\/(\d+)/);
    expect(offMatch).not.toBeNull();
    const officialShown = Number(offMatch![1]);
    expect(officialShown).toBeLessThan(totalShown);
    expect(officialShown).toBeGreaterThan(0); // we should match >0 burns

    // "Other" complements: Official + Other = total (within filtered set).
    await page.getByRole('button', { name: /^Other/ }).click();
    const otherText = (await meta.textContent()) ?? '';
    const otherMatch = otherText.match(/(\d+)\/(\d+)/);
    expect(otherMatch).not.toBeNull();
    const otherShown = Number(otherMatch![1]);
    expect(otherShown + officialShown).toBe(totalBundles);

    await page.getByRole('button', { name: /^All/ }).click();
    await expect(meta).toContainText(`${totalBundles}/${totalBundles}`);
  });

  test('All five tabs render without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });
    await page.goto('/');
    await waitForReady(page);

    for (const tab of ['Event mix', 'Schedule shape', 'Geography', 'Data table', 'Overview']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      // Give each view a moment to mount its charts/map.
      await page.waitForTimeout(400);
      // Confirm at least one panel renders for the tab.
      await expect(page.locator('.panel').first()).toBeVisible();
    }

    // Filter out known-benign noise: leaflet tile 404s from cartocdn, fonts
    // preconnect warnings, and React strict-mode deprecation chatter.
    const fatal = errors.filter(
      (e) =>
        !/cartocdn|fonts\.gstatic|fonts\.googleapis|leaflet.*tile|net::ERR_FAILED.*tile|ResizeObserver loop/i.test(e),
    );
    if (fatal.length) {
      console.log('Captured errors:', fatal);
    }
    expect(fatal, fatal.join('\n')).toEqual([]);
  });

  test('Data table sorts and filters', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);
    await page.getByRole('button', { name: 'Data table', exact: true }).click();

    const rows = page.locator('table.data tbody tr');
    const initialCount = await rows.count();
    expect(initialCount).toBeGreaterThan(0);

    // Filter input narrows the row count.
    await page.getByPlaceholder(/filter/).fill('snrg');
    await expect(rows).not.toHaveCount(initialCount);
    const narrowed = await rows.count();
    expect(narrowed).toBeGreaterThan(0);
    expect(narrowed).toBeLessThan(initialCount);

    // Clear and re-check.
    await page.getByPlaceholder(/filter/).fill('');
    await expect(rows).toHaveCount(initialCount);
  });

  test('Geography tab renders the Leaflet map', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);
    await page.getByRole('button', { name: 'Geography', exact: true }).click();

    // Leaflet's MapContainer attaches .leaflet-container with a known tile layer.
    await expect(page.locator('.leaflet-container')).toBeVisible();
    // CircleMarkers are SVG <path> children inside the marker pane.
    await expect(page.locator('.leaflet-marker-pane, .leaflet-overlay-pane svg path').first()).toBeVisible({ timeout: 10_000 });
  });
});
