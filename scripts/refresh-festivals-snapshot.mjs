#!/usr/bin/env node
// Pull the latest dust.events festivals registry and overwrite the snapshot
// at the repo root. Useful for offline planning + tracking active counts
// over time. Run with: `npm run refresh-snapshot`.

import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const OUT_PATH = resolve(REPO_ROOT, 'festivals.snapshot.json');

const res = await fetch('https://data.dust.events/festivals.json');
if (!res.ok) {
  console.error(`Fetch failed: HTTP ${res.status}`);
  process.exit(1);
}
const data = await res.json();
await writeFile(OUT_PATH, JSON.stringify(data, null, 0));
const active = Array.isArray(data) ? data.filter((d) => d.active).length : 0;
console.log(`Wrote ${OUT_PATH}`);
console.log(`  total:  ${Array.isArray(data) ? data.length : '?'}`);
console.log(`  active: ${active}`);
