#!/usr/bin/env node
// Scrapes the official Burning Man sanctioned-event sources and writes the
// merged list to `public/sanctioned-events.json`. The SPA loads that JSON at
// runtime to flag festivals with `is_sanctioned`.
//
// Two sources, merged:
//   1. https://burningman.org/global-events-groups/find-a-burning-man-event/
//      The events directory — upcoming/recurring official Regional Events.
//   2. https://burningman.org/global-events-groups/burning-man-regional-network/
//      connect-with-a-local-group/
//      The Regional Network — every officially-recognized regional GROUP and
//      the events those groups produce. Catches sanctioned events like
//      SideBurn (Flame Ontario) that aren't on the events directory because
//      they're not in the next-6-months window.
//
// The downstream matcher in src/data/sanctioned.ts handles fuzzy matching
// against Dust slugs, so we can be permissive: dump every linked phrase from
// regional group pages, false candidates harmlessly fail to match anything.
//
// Usage:
//   node scripts/scrape-bm-regionals.mjs           # write public/sanctioned-events.json
//   node scripts/scrape-bm-regionals.mjs --print   # print to stdout, no write
//   node scripts/scrape-bm-regionals.mjs --json    # raw JSON to stdout

import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENTS_URL = 'https://burningman.org/global-events-groups/find-a-burning-man-event/';
const NETWORK_ROOT = 'https://burningman.org/global-events-groups/burning-man-regional-network/connect-with-a-local-group/';
const NETWORK_PATH = '/global-events-groups/burning-man-regional-network/connect-with-a-local-group/';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, '..');
const OUT_PATH = resolve(APP_DIR, 'public', 'sanctioned-events.json');

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

function cleanName(raw) {
  let s = decodeEntities(stripTags(raw)).replace(/\s+/g, ' ').trim();
  s = s.replace(/^This Event is Cancelled\s+\d{4}\s+/i, '').trim();
  return s;
}

// ----- Source 1: events directory -----
function parseEventDirectory(html) {
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

// ----- Source 2: regional network crawl -----
//
// Walk the /connect-with-a-local-group/ subtree. Every page that's under that
// path is fair game; we follow only same-domain links inside that subtree.
// On each page, harvest every <a> link text — that's where event names live
// when groups link to their events (e.g. SideBurn).

const MAX_PAGES = 200;          // safety
const CONCURRENCY = 4;
const REQUEST_DELAY_MS = 80;    // small courtesy gap between requests

function extractLinksAndNames(html) {
  const links = new Set();
  const names = [];

  // Internal links (under the regional-network subtree) for further crawl.
  const linkRe = /href="(https?:\/\/burningman\.org[^"]*)"/g;
  let m;
  while ((m = linkRe.exec(html))) {
    const url = m[1];
    if (url.includes(NETWORK_PATH)) {
      links.add(url.split('#')[0].split('?')[0]);
    }
  }

  // Every <a>...</a> text: candidate event names. Skip nav-ish stuff.
  const aRe = /<a[^>]*>([^<]+)<\/a>/g;
  while ((m = aRe.exec(html))) {
    const raw = cleanName(m[1]);
    if (!raw) continue;
    // Skip nav links and other obviously non-event phrases.
    if (raw.length < 3) continue;
    if (raw.length > 80) continue;
    if (/^(home|menu|search|donate|join|sign in|log in|subscribe|read more|click here|contact|email|website|facebook|instagram|twitter|x\b|here|more|learn more|view all|next|previous|find|connect|see all|view|details|register|tickets?)$/i.test(raw)) continue;
    if (/^https?:\/\//.test(raw)) continue; // raw URL as link text
    names.push(raw);
  }

  // Plus any bold/emphasized phrase that looks like a proper-noun event name
  // (Title Case, 2+ words). Captures plain-text mentions like "Decompression"
  // that aren't wrapped in <a>.
  const strongRe = /<(?:strong|em|h[1-6])[^>]*>([^<]+)<\/(?:strong|em|h[1-6])>/g;
  while ((m = strongRe.exec(html))) {
    const raw = cleanName(m[1]);
    if (!raw || raw.length < 3 || raw.length > 80) continue;
    // Heuristic: starts with capital letter, has at least one space or burn-like keyword.
    if (!/^[A-Z]/.test(raw)) continue;
    if (/(burn|burning|fire|spectacle|flame|ember|spark|playa|decomp|regional|MOOP)/i.test(raw)) {
      names.push(raw);
    }
  }

  return { links: [...links], names };
}

async function crawlRegionalNetwork() {
  const visited = new Set();
  const queue = [NETWORK_ROOT];
  const allNames = new Set();
  let pageCount = 0;

  // Simple worker pool.
  async function worker() {
    while (queue.length > 0 && pageCount < MAX_PAGES) {
      const url = queue.shift();
      if (!url || visited.has(url)) continue;
      visited.add(url);
      pageCount++;
      try {
        const html = await fetchHtml(url);
        const { links, names } = extractLinksAndNames(html);
        for (const n of names) allNames.add(n);
        for (const l of links) if (!visited.has(l)) queue.push(l);
        process.stderr.write(`\r  crawled ${pageCount} pages, ${allNames.size} candidate names, queue ${queue.length}     `);
      } catch (err) {
        process.stderr.write(`\n  ! ${url}: ${err.message}\n`);
      }
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  process.stderr.write('\n');
  return { names: [...allNames], pageCount };
}

async function main() {
  console.error(`▸ Source 1: events directory`);
  const directoryHtml = await fetchHtml(EVENTS_URL);
  const directoryNames = parseEventDirectory(directoryHtml);
  console.error(`  ${directoryNames.length} events on the directory page`);

  console.error(`▸ Source 2: crawling regional network`);
  const { names: networkNames, pageCount } = await crawlRegionalNetwork();
  console.error(`  ${pageCount} pages crawled, ${networkNames.length} candidate phrases`);

  // Merge — dedupe case-insensitively, prefer the casing from the events
  // directory when there's a conflict (it's the more authoritative source).
  const seen = new Set();
  const merged = [];
  for (const n of directoryNames) {
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(n);
  }
  for (const n of networkNames) {
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(n);
  }

  if (merged.length === 0) {
    throw new Error('Parsed 0 candidate names. Both sources may have changed markup.');
  }

  const payload = {
    sources: {
      directory: EVENTS_URL,
      network: NETWORK_ROOT,
    },
    scrapedAt: new Date().toISOString(),
    counts: {
      directory: directoryNames.length,
      network: networkNames.length,
      merged: merged.length,
    },
    events: merged,
  };

  if (RAW_JSON) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (PRINT_ONLY) {
    console.log(`Sources: ${EVENTS_URL} + ${NETWORK_ROOT}`);
    console.log(`Scraped: ${payload.scrapedAt}`);
    console.log(`Count: directory=${directoryNames.length} network=${networkNames.length} merged=${merged.length}`);
    for (const n of merged) console.log(`  ${n}`);
    return;
  }
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`✓ Wrote ${OUT_PATH}`);
  console.log(`  ${merged.length} merged sanctioned candidates (${directoryNames.length} directory + ${networkNames.length} network)`);
}

main().catch((err) => {
  console.error('Scrape failed:', err.message);
  process.exit(1);
});
