#!/usr/bin/env node
// Attendance scraper — refreshes public/attendance.json.
//
// No feed carries burn attendance, so this does best-effort automated
// research, weekly, against two machine-readable sources:
//
//   1. Wikipedia — search for the burn, verify the page actually matches
//      (fuzzy title check), pull the plain-text extract, regex out the
//      attendance figure. High-yield, low false-positive.
//   2. The burn's own website — fetch the homepage, scan visible text for
//      "N participants". Best-effort; many burn sites won't say.
//
// What it CANNOT do: read PDF AfterBurn reports, or research the long tail
// of burns that publish nothing. Those live in public/attendance-overrides.json,
// a hand-curated file that ALWAYS wins over a scraped value.
//
// Output public/attendance.json = overrides merged on top of scraped data.
//
// Usage: node scripts/scrape-attendance.mjs   (run `npm run fetch-data` first
// so public/data/festivals.json exists)

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameBurn, burnKey, festivalYear } from './lib/match.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, '..');
const FESTIVALS = join(APP_DIR, 'public', 'data', 'festivals.json');
const OVERRIDES = join(APP_DIR, 'public', 'attendance-overrides.json');
const OUT = join(APP_DIR, 'public', 'attendance.json');

const UA = 'PlayaScope attendance bot (https://github.com/SlyWombat/PlayaScope)';
const CONCURRENCY = 4;
const DELAY_MS = 120;
const args = process.argv.slice(2);
const PRINT_ONLY = args.includes('--print');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pull the largest plausible attendance figure out of a blob of prose.
// Returns a number, or null. This is heuristic — see the two guard rules,
// added after a first pass mistook a year (2026) and a "smaller than Burning
// Man's 80,000" comparison for real figures.
function extractAttendance(text, { isBRC = false } = {}) {
  const t = (text ?? '').replace(/\s+/g, ' ');
  const hits = [];
  const consider = (raw, idx) => {
    const n = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 100 || n > 200000) return;
    // Guard 1: a bare 4-digit number in the year range is almost certainly a
    // year, not attendance (real figures ≥1000 are usually comma-formatted).
    if (!String(raw).includes(',') && n >= 1990 && n <= 2035) return;
    // Guard 2: a figure in a sentence that name-drops Burning Man / Black Rock
    // City is usually a comparison ("smaller than Burning Man's 80,000").
    if (!isBRC) {
      const window = t.slice(Math.max(0, idx - 70), idx + 70);
      if (/burning man|black rock/i.test(window)) return;
    }
    hits.push(n);
  };
  // "5,000 participants" / "over 2,300 attendees" / "3,000 people attended"
  for (const m of t.matchAll(
    /(?:over|about|approximately|around|nearly|some|up to|~)?\s*([\d][\d,]{2,})\s+(?:participants|attendees|burners|people\s+(?:attend|participat))/gi,
  )) consider(m[1], m.index ?? 0);
  // "attendance of 3,000" / "attendance reached 3,000" / "attendance: 3000"
  for (const m of t.matchAll(/attendance[^.\d]{0,40}?([\d][\d,]{2,})/gi)) consider(m[1], m.index ?? 0);
  // "sold N tickets"
  for (const m of t.matchAll(/sold\s+(?:out\s+)?(?:[\w\s]{0,20}?)?([\d][\d,]{2,})\s+tickets/gi)) consider(m[1], m.index ?? 0);
  if (!hits.length) return null;
  return Math.max(...hits);
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: opts.json ? 'application/json' : 'text/html', ...opts.headers },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return opts.json ? res.json() : res.text();
}

// ---- Source 1: Wikipedia ----
async function tryWikipedia(title) {
  const search = await fetchText(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title + ' burning man regional event')}&srlimit=4&format=json&origin=*`,
    { json: true },
  );
  const hits = search?.query?.search ?? [];
  const match = hits.find((h) => sameBurn(h.title, title));
  if (!match) return null;
  const page = await fetchText(
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(match.title)}&format=json&origin=*`,
    { json: true },
  );
  const pages = page?.query?.pages ?? {};
  const extract = Object.values(pages)[0]?.extract ?? '';
  const value = extractAttendance(extract, { isBRC: /black rock|burning man$/i.test(title) });
  if (value == null) return null;
  // Auto-scraped values are confidence 'estimated', NOT 'reported' — the
  // figure was regex-extracted near a keyword, not verified by a human.
  // Promote a good one to attendance-overrides.json to mark it 'reported'.
  return {
    estimate: value,
    confidence: 'estimated',
    source: `Auto-scraped from Wikipedia — ${match.title}`,
    sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(match.title.replace(/ /g, '_'))}`,
  };
}

// ---- Source 2: the burn's own website ----
async function tryWebsite(website) {
  if (!website || !/^https?:\/\//.test(website)) return null;
  const html = await fetchText(website);
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const value = extractAttendance(text);
  if (value == null) return null;
  let host = website;
  try { host = new URL(website).hostname.replace(/^www\./, ''); } catch { /* */ }
  return {
    estimate: value,
    confidence: 'estimated',
    source: `Auto-scraped from ${host}`,
    sourceUrl: website,
  };
}

async function main() {
  if (!existsSync(FESTIVALS)) {
    console.error(`error: ${FESTIVALS} not found — run \`npm run fetch-data\` first.`);
    process.exit(1);
  }
  const festivals = JSON.parse(await readFile(FESTIVALS, 'utf8'));
  const overrides = JSON.parse(await readFile(OVERRIDES, 'utf8')).burns ?? {};

  // One representative festival per burnKey — prefer the most recent year.
  const byKey = new Map();
  for (const f of festivals) {
    const k = burnKey(f.name);
    const prev = byKey.get(k);
    if (!prev || festivalYear(f) > festivalYear(prev)) byKey.set(k, f);
  }

  const scraped = {};
  const queue = [...byKey.entries()].filter(([k]) => !overrides[k]); // overrides win — don't bother scraping
  let done = 0;
  let found = 0;

  async function worker() {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      const [key, fest] = item;
      let rec = null;
      try {
        rec = await tryWikipedia(fest.title);
      } catch { /* ignore, try next source */ }
      if (!rec) {
        try {
          rec = await tryWebsite(fest.website);
        } catch { /* give up on this burn */ }
      }
      if (rec) { scraped[key] = rec; found++; }
      done++;
      process.stderr.write(`\r  scraped ${done}/${byKey.size - Object.keys(overrides).length}, found ${found}   `);
      await sleep(DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  process.stderr.write('\n');

  // Merge: curated overrides win over anything scraped.
  const burns = { ...scraped, ...overrides };
  const payload = {
    _comment: 'GENERATED by scripts/scrape-attendance.mjs — do not hand-edit. Curated figures go in attendance-overrides.json.',
    _generated: new Date().toISOString(),
    _counts: { scraped: Object.keys(scraped).length, overrides: Object.keys(overrides).length, total: Object.keys(burns).length },
    burns,
  };

  if (PRINT_ONLY) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(
    `✓ Wrote ${OUT} — ${Object.keys(burns).length} burns ` +
      `(${Object.keys(scraped).length} auto-scraped, ${Object.keys(overrides).length} curated overrides)`,
  );
}

main().catch((err) => {
  console.error('Attendance scrape failed:', err.message);
  process.exit(1);
});
