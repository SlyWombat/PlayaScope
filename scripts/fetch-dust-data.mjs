#!/usr/bin/env node
// Build-time fetch of every dust.events JSON feed we need.
//
// Why this exists: data.dust.events serves the JSON from a Cloudflare R2
// bucket with no `Access-Control-Allow-Origin` header. Browsers block every
// cross-origin fetch from our SPA, so we can't read it live. Instead we
// snapshot the data at deploy/build time into `public/data/`, where the SPA
// reads it from the same origin it's served from.
//
// Layout produced:
//   public/data/festivals.json                    # filtered to active && !unknownDates
//   public/data/{slug}/schedule.json
//   public/data/{slug}/camps.json
//   public/data/{slug}/art.json
//   public/data/{slug}/music.json
//   public/data/manifest.json                     # { fetchedAt, festivals: [...] }
//
// Run via `npm run fetch-data`. The deploy script runs this automatically.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, '..');
const OUT_DIR = join(APP_DIR, 'public', 'data');

const DATA_ROOT = 'https://data.dust.events';
const CONCURRENCY = 6;
const PER_FEST_FILES = ['schedule.json', 'camps.json', 'art.json', 'music.json'];

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.json();
}

async function getJsonOrEmpty(url) {
  try {
    return await getJson(url);
  } catch (err) {
    if (err.message.includes('HTTP 404')) return [];
    throw err;
  }
}

async function fetchOne(festival) {
  const slug = festival.name;
  const out = { slug, sizes: {} };
  await mkdir(join(OUT_DIR, slug), { recursive: true });
  await Promise.all(
    PER_FEST_FILES.map(async (filename) => {
      const data = await getJsonOrEmpty(`${DATA_ROOT}/${slug}/${filename}`);
      const body = JSON.stringify(data);
      await writeFile(join(OUT_DIR, slug, filename), body);
      out.sizes[filename] = body.length;
    }),
  );
  return out;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`▸ Fetching registry from ${DATA_ROOT}/festivals.json`);
  const allFestivals = await getJson(`${DATA_ROOT}/festivals.json`);
  const active = allFestivals.filter((f) => f.active && !f.unknownDates);
  console.log(`▸ ${active.length} active festivals (${allFestivals.length} total)`);

  await writeFile(
    join(OUT_DIR, 'festivals.json'),
    JSON.stringify(active),
  );

  // Concurrent fan-out with a worker pool.
  const queue = [...active];
  const results = [];
  let done = 0;
  async function worker() {
    for (;;) {
      const fest = queue.shift();
      if (!fest) return;
      try {
        const r = await fetchOne(fest);
        results.push(r);
      } catch (err) {
        console.warn(`  ! ${fest.name}: ${err.message}`);
      }
      done++;
      if (done % 5 === 0 || done === active.length) {
        process.stdout.write(`\r  ${done}/${active.length}`);
      }
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, active.length) }, () => worker());
  await Promise.all(workers);
  process.stdout.write('\n');

  const manifest = {
    source: DATA_ROOT,
    fetchedAt: new Date().toISOString(),
    festivals: results.map((r) => r.slug),
    count: results.length,
  };
  await writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const totalBytes = results.reduce(
    (sum, r) => sum + Object.values(r.sizes).reduce((a, b) => a + b, 0),
    0,
  );
  console.log(
    `✓ Wrote ${results.length} festivals into ${OUT_DIR} ` +
      `(${(totalBytes / 1024 / 1024).toFixed(2)} MB)`,
  );
}

main().catch((err) => {
  console.error('Fetch failed:', err.message);
  process.exit(1);
});
