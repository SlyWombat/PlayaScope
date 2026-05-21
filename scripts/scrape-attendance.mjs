#!/usr/bin/env node
// Attendance scraper — refreshes public/attendance.json.
//
// No feed carries burn attendance, so this does best-effort automated
// research, weekly. For each burn it runs several INDEPENDENT attempts in
// order and stops at the first hit. A burn that resists every attempt is
// left NA — and listed at the end so the gap is visible:
//
//   1. Wikipedia — search, verify the page matches, regex the figure.
//   2. The burn's website — homepage AND likely sub-pages (/about,
//      /afterburn, /history, …) where participant counts and AfterBurn
//      reports tend to live.
//   3. Web search — a DuckDuckGo query for "<burn> attendance".
//   4. Web search — a second query aimed at AfterBurn / census reports.
//
// So every NA burn gets at least 3 distinct attempts (Wikipedia + two web
// searches) even when it has no website at all.
//
// Curated, human-verified figures live in public/attendance-overrides.json
// and ALWAYS win over anything scraped here.
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
// Search engines serve a bot UA differently (or not at all); use a normal one.
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CONCURRENCY = 4;
const DELAY_MS = 150;
const args = process.argv.slice(2);
const PRINT_ONLY = args.includes('--print');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Strip a blob of HTML to plain visible text.
function htmlToText(html) {
  return (html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');
}

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
  // "drew / attracted / welcomed / hosted ~3,000" — common in burn write-ups.
  for (const m of t.matchAll(
    /(?:drew|attracted|welcomed|hosted|grew to|grown to)\s+(?:over|about|nearly|around|some|up to|~)?\s*([\d][\d,]{2,})/gi,
  )) consider(m[1], m.index ?? 0);
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

// ---- Attempt 1: Wikipedia ----
async function tryWikipedia(fest) {
  const title = fest.title;
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

// ---- Attempt 2: the burn's own website (homepage + likely sub-pages) ----
const SUBPATHS = ['', '/about', '/about-us', '/history', '/afterburn', '/the-event', '/faq', '/press'];
async function tryWebsite(fest) {
  const website = fest.website;
  if (!website || !/^https?:\/\//.test(website)) return null;
  let origin, host;
  try {
    const u = new URL(website);
    origin = u.origin;
    host = u.hostname.replace(/^www\./, '');
  } catch { return null; }
  for (const path of SUBPATHS) {
    const url = path === '' ? website : origin + path;
    try {
      const value = extractAttendance(htmlToText(await fetchText(url)));
      if (value != null) {
        return {
          estimate: value,
          confidence: 'estimated',
          source: `Auto-scraped from ${host}${path}`,
          sourceUrl: url,
        };
      }
    } catch { /* page missing or unreachable — try the next */ }
    await sleep(DELAY_MS);
  }
  return null;
}

// ---- Attempts 3 & 4: web search (Bing — no API key; DuckDuckGo's endpoints
// are unreachable from the build/scrape network). ----
async function webSearch(query, label) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url, { headers: { 'User-Agent': UA_BROWSER } });
  // Only the organic result blocks — skip Bing's chrome, ads and panels.
  const blocks = [...html.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/gi)]
    .map((m) => htmlToText(m[0]))
    .join(' . ');
  const value = extractAttendance(blocks);
  if (value == null) return null;
  return {
    estimate: value,
    confidence: 'estimated',
    source: `Auto-scraped from web search (${label})`,
    sourceUrl: url,
  };
}
const tryWebSearchAttendance = (fest) =>
  webSearch(`${fest.title} burn attendance participants`, 'attendance');
const tryWebSearchAfterburn = (fest) =>
  webSearch(`${fest.title} afterburn report participants`, 'afterburn report');

// Attempts run in order; the first hit wins. Wikipedia + the two web searches
// need no website, so every burn gets at least 3 distinct attempts.
const ATTEMPTS = [tryWikipedia, tryWebsite, tryWebSearchAttendance, tryWebSearchAfterburn];

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
  const stillNA = [];
  const queue = [...byKey.entries()].filter(([k]) => !overrides[k]); // overrides win — don't bother scraping
  const total = queue.length;
  let done = 0;
  let found = 0;

  async function worker() {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      const [key, fest] = item;
      let rec = null;
      for (const attempt of ATTEMPTS) {
        try {
          rec = await attempt(fest);
        } catch { rec = null; }
        if (rec) break;
      }
      if (rec) { scraped[key] = rec; found++; }
      else { stillNA.push(fest.title); }
      done++;
      process.stderr.write(`\r  scraped ${done}/${total}, found ${found}   `);
      await sleep(DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  process.stderr.write('\n');
  if (stillNA.length) {
    console.error(`  still NA after all attempts (${stillNA.length}): ${stillNA.sort().join(', ')}`);
  }

  // Merge: curated overrides win over anything scraped.
  const burns = { ...scraped, ...overrides };
  const payload = {
    _comment: 'GENERATED by scripts/scrape-attendance.mjs — do not hand-edit. Curated figures go in attendance-overrides.json.',
    _generated: new Date().toISOString(),
    _counts: { scraped: Object.keys(scraped).length, overrides: Object.keys(overrides).length, total: Object.keys(burns).length, stillNA: stillNA.length },
    burns,
  };

  if (PRINT_ONLY) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(
    `✓ Wrote ${OUT} — ${Object.keys(burns).length} burns ` +
      `(${Object.keys(scraped).length} auto-scraped, ${Object.keys(overrides).length} curated overrides, ${stillNA.length} still NA)`,
  );
}

main().catch((err) => {
  console.error('Attendance scrape failed:', err.message);
  process.exit(1);
});
