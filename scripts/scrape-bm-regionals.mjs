#!/usr/bin/env node
// Scrapes the official Burning Man events directory and writes the merged
// sanctioned-event list to `public/sanctioned-events.json`. The SPA loads that
// JSON at runtime to flag festivals with `is_sanctioned`.
//
// Sources, merged:
//   1. https://burningman.org/global-events-groups/find-a-burning-man-event/
//      The events directory — the authoritative list of official Regional
//      Events. Parsed from the event cards only.
//   2. public/sanctioned-extra.json — a small CURATED list of burns known to
//      be official regionals but absent from the directory (date already
//      passed this year, or outside the directory's window — e.g. SideBurn).
//
// History: an earlier version also crawled the /connect-with-a-local-group/
// subtree and harvested every <a> on every page. That produced ~650 junk
// "events" — site nav, country names, city links, contact emails, social
// links — which flooded the app's unmatched list. The directory page is the
// real source of truth; anything it misses goes in sanctioned-extra.json.
//
// Usage:
//   node scripts/scrape-bm-regionals.mjs           # write public/sanctioned-events.json
//   node scripts/scrape-bm-regionals.mjs --print   # print to stdout, no write
//   node scripts/scrape-bm-regionals.mjs --json    # raw JSON to stdout

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENTS_URL = 'https://burningman.org/global-events-groups/find-a-burning-man-event/';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, '..');
const OUT_PATH = resolve(APP_DIR, 'public', 'sanctioned-events.json');
const EXTRA_PATH = resolve(APP_DIR, 'public', 'sanctioned-extra.json');

const args = process.argv.slice(2);
const PRINT_ONLY = args.includes('--print');
const RAW_JSON = args.includes('--json');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  });
  if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

const ENTITIES = {
  '&#8217;': "'",
  '&#8216;': "'",
  '&#8211;': '–',
  '&#8212;': '—',
  '&#8230;': '…',
  '&#038;': '&',
  '&amp;': '&',
  '&quot;': '"',
  '&#039;': "'",
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
};

function decodeEntities(s) {
  let out = s;
  for (const [k, v] of Object.entries(ENTITIES)) out = out.split(k).join(v);
  // Catch any remaining numeric entity (&#NNN;).
  out = out.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  return out;
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ');
}

function cleanName(raw) {
  let s = decodeEntities(stripTags(raw)).replace(/\s+/g, ' ').trim();
  s = s.replace(/^This Event is Cancelled\s+\d{4}\s+/i, '').trim();
  return s;
}

// ----- Source 1: events directory -----
// Event names are the <h3> with the bmp-events-list-item__title class.
function parseEventDirectory(html) {
  const open = '__title">';
  const close = '</h3>';
  const out = [];
  let i = 0;
  while ((i = html.indexOf(open, i + 1)) !== -1) {
    const end = html.indexOf(close, i);
    if (end < 0) continue;
    const name = cleanName(html.slice(i + open.length, end));
    if (name) out.push(name);
  }
  return out;
}

// ----- Source 2: curated extras -----
async function readExtras() {
  if (!existsSync(EXTRA_PATH)) return [];
  try {
    const json = JSON.parse(await readFile(EXTRA_PATH, 'utf8'));
    return Array.isArray(json.events) ? json.events.filter((s) => typeof s === 'string' && s.trim()) : [];
  } catch (err) {
    console.error(`  ! could not read ${EXTRA_PATH}: ${err.message}`);
    return [];
  }
}

async function main() {
  console.error('▸ Source 1: events directory');
  const directoryHtml = await fetchHtml(EVENTS_URL);
  const directoryNames = parseEventDirectory(directoryHtml);
  console.error(`  ${directoryNames.length} events on the directory page`);

  console.error('▸ Source 2: curated extras');
  const extraNames = await readExtras();
  console.error(`  ${extraNames.length} curated extra(s)`);

  // Merge — dedupe case-insensitively, directory casing wins.
  const seen = new Set();
  const merged = [];
  for (const n of [...directoryNames, ...extraNames]) {
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(n);
  }

  if (merged.length === 0) {
    throw new Error('Parsed 0 events. The directory markup may have changed — check parseEventDirectory().');
  }

  const payload = {
    sources: { directory: EVENTS_URL, extra: 'public/sanctioned-extra.json' },
    scrapedAt: new Date().toISOString(),
    counts: {
      directory: directoryNames.length,
      extra: extraNames.length,
      merged: merged.length,
    },
    events: merged,
  };

  if (RAW_JSON) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (PRINT_ONLY) {
    console.log(`Source: ${EVENTS_URL} (+ curated extras)`);
    console.log(`Scraped: ${payload.scrapedAt}`);
    console.log(`Count: directory=${directoryNames.length} extra=${extraNames.length} merged=${merged.length}`);
    for (const n of merged) console.log(`  ${n}`);
    return;
  }
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`✓ Wrote ${OUT_PATH}`);
  console.log(`  ${merged.length} sanctioned events (${directoryNames.length} directory + ${extraNames.length} curated)`);
}

main().catch((err) => {
  console.error('Scrape failed:', err.message);
  process.exit(1);
});
