import { test, expect, type Page } from '@playwright/test';

// End-to-end smoke test for the PlayaScope dashboard. We hit the local
// vite dev server and let the SPA do its real fan-out fetch against
// data.dust.events. Pulling ~60 active festivals' worth of JSON takes a
// while, so the readiness wait is generous.

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

    // The default filter is "Official". Capture the count, then flip to All
    // to learn the universe total.
    const initial = (await meta.textContent()) ?? '';
    const officialMatch = initial.match(/(\d+)\/(\d+)/);
    expect(officialMatch).not.toBeNull();
    const officialShown = Number(officialMatch![1]);
    const totalBundles = Number(officialMatch![2]);
    expect(officialShown).toBeGreaterThan(0);
    expect(officialShown).toBeLessThan(totalBundles);

    await expect(page.locator('text=Sanctioned list:')).toBeVisible();

    // Click "All" — count should rise to total.
    await page.getByRole('button', { name: /^All/ }).click();
    await expect(meta).toContainText(`${totalBundles}/${totalBundles}`);

    // "Other" complements: Official + Other = total.
    await page.getByRole('button', { name: /^Other/ }).click();
    const otherText = (await meta.textContent()) ?? '';
    const otherMatch = otherText.match(/(\d+)\/(\d+)/);
    expect(otherMatch).not.toBeNull();
    const otherShown = Number(otherMatch![1]);
    expect(otherShown + officialShown).toBe(totalBundles);

    // Back to Official as the canonical default.
    await page.getByRole('button', { name: /^Official/ }).click();
    await expect(meta).toContainText(`${officialShown}/${totalBundles}`);
  });

  test('All tabs render without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });
    await page.goto('/');
    await waitForReady(page);

    // Cover all 11 tabs after the planning-session expansion.
    // Use `force: true` because the topbar nav uses flex-wrap and previous tab
    // mounts (especially Geography → Leaflet) cause layout shifts that can
    // make Playwright's actionability check race against the layout settle.
    // The button is always there + resolvable; we just don't need its strict
    // stability check.
    for (const tab of [
      'Overview', 'MOOP Report', 'Geography', 'Personality', 'Event Mix',
      'Lexicon', 'Artists', 'Schedule Shape', 'Calendar', 'Continuity', 'Data',
    ]) {
      await page.getByRole('button', { name: tab, exact: true }).click({ force: true });
      await page.waitForTimeout(600);
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
    // Default filter is "Official"; switch to All so the table has every burn,
    // making the row-count delta from a free-text filter more dramatic.
    await page.getByRole('button', { name: /^All/ }).click();
    await page.getByRole('button', { name: 'Data', exact: true }).click();

    const rows = page.locator('table.data tbody tr');
    const initialCount = await rows.count();
    expect(initialCount).toBeGreaterThan(0);

    // Filter input narrows the row count. SOAK is on every active dataset.
    await page.getByPlaceholder(/filter/).fill('soak');
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
