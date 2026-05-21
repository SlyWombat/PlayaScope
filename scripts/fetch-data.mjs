#!/usr/bin/env node
// Build-time data orchestrator (multi-source — issue #11).
//
// Runs every enabled source adapter, merges their festival lists (a burn that
// appears in two sources is deduped — richest source wins), then pulls each
// surviving festival's program from its owning adapter. Writes the unified
// same-origin snapshot the SPA reads:
//
//   public/data/festivals.json          # merged registry (with `source` field)
//   public/data/{slug}/schedule.json    # + camps / art / music (empty if dates-only)
//   public/data/manifest.json
//
// Why a snapshot at all: data.dust.events sends no CORS headers, so the SPA
// cannot fetch it (or burningman.org) live. We snapshot at build time.
//
// Adding a source = drop an adapter in scripts/adapters/ and register it below.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameBurn, festivalYear } from './lib/match.mjs';
import * as dust from './adapters/dust.mjs';
import * as bmDirectory from './adapters/bm-directory.mjs';
import * as manual from './adapters/manual.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'public', 'data');
const PER_FEST_FILES = ['schedule', 'camps', 'art', 'music'];
const CONCURRENCY = 6;

const ADAPTERS = [dust, bmDirectory, manual];
// Merge precedence — when the same burn appears in multiple sources, the
// highest-priority source's record survives WHOLESALE (no field merge).
const PRIORITY = ['dust', 'bm-api', 'bm-directory', 'manual'];
const rank = (source) => {
  const i = PRIORITY.indexOf(source);
  return i === -1 ? PRIORITY.length : i;
};

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // 1. Collect festivals from every adapter. One broken adapter must not kill
  //    the build — log and skip it.
  const adapterById = new Map();
  let pool = [];
  for (const adapter of ADAPTERS) {
    adapterById.set(adapter.id, adapter);
    try {
      const list = await adapter.listFestivals();
      console.log(`▸ ${adapter.id}: ${list.length} festivals`);
      pool = pool.concat(list);
    } catch (err) {
      console.error(`  ! adapter "${adapter.id}" failed — skipping: ${err.message}`);
    }
  }

  // 2. Merge: group by (same burn + same year), keep the highest-priority one.
  // Manual festivals are hand-curated, deliberately-unique entries — never
  // dedupe them: fuzzy matching can wrongly merge e.g. Midburn into SideBurn,
  // or AfrikaBurn into "Afrikaburn Decompression".
  const groups = [];
  const manualFestivals = [];
  for (const fest of pool) {
    if (fest.source === 'manual') {
      manualFestivals.push(fest);
      continue;
    }
    const year = festivalYear(fest);
    let group = groups.find(
      (g) => g.year === year && sameBurn(g.title, fest.title),
    );
    if (!group) {
      group = { title: fest.title, year, members: [] };
      groups.push(group);
    }
    group.members.push(fest);
  }
  let registry = [...manualFestivals];
  let dropped = 0;
  for (const g of groups) {
    g.members.sort((a, b) => rank(a.source) - rank(b.source));
    registry.push(g.members[0]);
    dropped += g.members.length - 1;
  }
  console.log(`▸ Merged: ${registry.length} unique festivals (${dropped} cross-source duplicates dropped)`);

  // Decompressions / afterburn parties and virtual (Second Life) events are
  // not burns — drop them so they don't pollute counts, the map or calendar.
  const NOT_A_BURN = /\bdecompression\b|\bdecomp\b|\bafterburn\b|\bburn ?2\b/i;
  const preFilter = registry.length;
  registry = registry.filter(
    (f) => !NOT_A_BURN.test(f.title) && !/^online$/i.test(f.region ?? ''),
  );
  if (registry.length < preFilter) {
    console.log(`▸ Dropped ${preFilter - registry.length} non-burns (decompressions / virtual)`);
  }

  // 3. Pull each survivor's program from its owning adapter (concurrent pool).
  const queue = [...registry];
  const results = [];
  let done = 0;
  async function worker() {
    for (;;) {
      const fest = queue.shift();
      if (!fest) return;
      const adapter = adapterById.get(fest.source);
      let program = { schedule: [], camps: [], art: [], music: [] };
      try {
        if (adapter?.fetchProgram) program = await adapter.fetchProgram(fest);
      } catch (err) {
        console.error(`  ! ${fest.name} program fetch failed: ${err.message}`);
      }
      await mkdir(join(OUT_DIR, fest.name), { recursive: true });
      let bytes = 0;
      for (const key of PER_FEST_FILES) {
        const body = JSON.stringify(program[key] ?? []);
        await writeFile(join(OUT_DIR, fest.name, `${key}.json`), body);
        bytes += body.length;
      }
      results.push({ slug: fest.name, source: fest.source, bytes });
      done++;
      if (done % 10 === 0 || done === registry.length) {
        process.stdout.write(`\r  program ${done}/${registry.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, registry.length) }, () => worker()));
  process.stdout.write('\n');

  // 4. Write the merged registry + manifest.
  await writeFile(join(OUT_DIR, 'festivals.json'), JSON.stringify(registry));
  const bySource = {};
  for (const r of results) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  await writeFile(
    join(OUT_DIR, 'manifest.json'),
    JSON.stringify(
      { fetchedAt: new Date().toISOString(), count: registry.length, bySource },
      null,
      2,
    ) + '\n',
  );

  const mb = results.reduce((s, r) => s + r.bytes, 0) / 1024 / 1024;
  console.log(
    `✓ Wrote ${registry.length} festivals (${mb.toFixed(2)} MB) — ` +
      Object.entries(bySource).map(([s, n]) => `${s}:${n}`).join(' '),
  );
}

main().catch((err) => {
  console.error('Fetch failed:', err.message);
  process.exit(1);
});
