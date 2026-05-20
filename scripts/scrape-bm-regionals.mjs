#!/usr/bin/env node
// Scrapes the official Burning Man Regional Events directory and writes the
// sanctioned-events list to `public/sanctioned-events.json`. The SPA loads
// that JSON at runtime to flag festivals with `is_sanctioned`.
//
// Source of truth:
//   https://burningman.org/global-events-groups/find-a-burning-man-event/
//
// The page is WordPress-generated. Event names live inside elements with
// class `bmp-events-list-item__title`. This parser is intentionally tolerant:
// it strips inline SVG markup, decodes a small set of HTML entities, and
// normalizes whitespace. If the BM team renames the class, run this script
// and verify the count looks reasonable (around 40–60 events as of 2026).
//
// Usage:
//   node scripts/scrape-bm-regionals.mjs           # write public/sanctioned-events.json
//   node scripts/scrape-bm-regionals.mjs --print   # print to stdout, no write
//   node scripts/scrape-bm-regionals.mjs --json    # raw JSON to stdout

import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://burningman.org/global-events-groups/find-a-burning-man-event/';
const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, '..');
const OUT_PATH = resolve(APP_DIR, 'public', 'sanctioned-events.json');

const args = process.argv.slice(2);
const PRINT_ONLY = args.includes('--print');
const RAW_JSON = args.includes('--json');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchHtml() {
  const res = await fetch(SOURCE_URL, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  });
  if (!res.ok) {
    throw new Error(`fetch ${SOURCE_URL} → HTTP ${res.status} ${res.statusText}`);
  }
  return res.text();
}

const ENTITIES = {
  '&#8217;': "'",
  '&#8216;': "'",
  '&#8211;': '–',
  '&#8212;': '—',
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
  return out;
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ');
}

// Look for an event-name marker that "isCancelled" / "Tentative" annotations
// often wrap or precede. Normalize what counts as a canonical name so the
// fuzzy matcher upstream has a clean base.
function cleanName(raw) {
  let s = decodeEntities(stripTags(raw)).replace(/\s+/g, ' ').trim();
  // Drop a leading "This Event is Cancelled 2026 ..." prefix the directory
  // sometimes adds to a card's title (still on the official list, but won't
  // happen this year).
  s = s.replace(/^This Event is Cancelled\s+\d{4}\s+/i, '').trim();
  return s;
}

function parseEventTitles(html) {
  const open = '__title">';
  const close = '</h3>';
  const out = [];
  let i = 0;
  while ((i = html.indexOf(open, i + 1)) !== -1) {
    const end = html.indexOf(close, i);
    if (end < 0) continue;
    const inner = html.slice(i + open.length, end);
    const name = cleanName(inner);
    if (name) out.push(name);
  }
  return out;
}

async function main() {
  const html = await fetchHtml();
  const titles = parseEventTitles(html);
  if (titles.length === 0) {
    throw new Error(
      'Parsed 0 event titles. Burningman.org may have changed the markup — ' +
        'inspect the page and update parseEventTitles().',
    );
  }
  const seen = new Set();
  const unique = [];
  for (const t of titles) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }
  const payload = {
    source: SOURCE_URL,
    scrapedAt: new Date().toISOString(),
    count: unique.length,
    events: unique,
  };
  if (RAW_JSON) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (PRINT_ONLY) {
    console.log(`Source: ${SOURCE_URL}`);
    console.log(`Scraped: ${payload.scrapedAt}`);
    console.log(`Count: ${unique.length}`);
    for (const n of unique) console.log(`  ${n}`);
    return;
  }
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`✓ Wrote ${OUT_PATH}`);
  console.log(`  ${unique.length} sanctioned events`);
}

main().catch((err) => {
  console.error('Scrape failed:', err.message);
  process.exit(1);
});
