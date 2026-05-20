// Orchestrates parallel fan-out fetches across active festivals.
//
// Strategy: small concurrency window (don't hammer the CDN), per-festival
// sessionStorage cache keyed by slug+endpoint, tolerant of per-festival
// failures (one bad feed shouldn't blow up the whole dashboard).

import { fetchArt, fetchCamps, fetchMusic, fetchSchedule, fetchOrEmpty } from './api';
import type { ArtPiece, Camp, DustEvent, Festival, MusicSet } from './types';

const CONCURRENCY = 6;
const CACHE_PREFIX = 'dust-cache:v1:';

export interface FestivalBundle {
  festival: Festival;
  schedule: DustEvent[];
  camps: Camp[];
  art: ArtPiece[];
  music: MusicSet[];
}

interface LoadOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, festival: Festival) => void;
  skipCache?: boolean;
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, value: T): Promise<void> {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded — silently skip. The dashboard still works, just slower.
  }
}

async function loadOne(festival: Festival, opts: LoadOptions): Promise<FestivalBundle> {
  const slug = festival.name;
  const cacheKey = `${CACHE_PREFIX}${slug}`;
  if (!opts.skipCache) {
    const hit = await readCache<Omit<FestivalBundle, 'festival'>>(cacheKey);
    if (hit) return { festival, ...hit };
  }
  const [schedule, camps, art, music] = await Promise.all([
    fetchOrEmpty<DustEvent>((s) => fetchSchedule(slug, s), opts.signal),
    fetchOrEmpty<Camp>((s) => fetchCamps(slug, s), opts.signal),
    fetchOrEmpty<ArtPiece>((s) => fetchArt(slug, s), opts.signal),
    fetchOrEmpty<MusicSet>((s) => fetchMusic(slug, s), opts.signal),
  ]);
  const payload = { schedule, camps, art, music };
  await writeCache(cacheKey, payload);
  return { festival, ...payload };
}

export async function loadFestivals(
  festivals: Festival[],
  opts: LoadOptions = {},
): Promise<FestivalBundle[]> {
  const out: FestivalBundle[] = new Array(festivals.length);
  let cursor = 0;
  let done = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= festivals.length) return;
      const fest = festivals[i];
      if (!fest) return;
      try {
        out[i] = await loadOne(fest, opts);
      } catch (err) {
        // Record an empty bundle so the index aligns with the input array.
        out[i] = { festival: fest, schedule: [], camps: [], art: [], music: [] };
        console.warn(`[loader] ${fest.name} failed:`, err);
      }
      done++;
      opts.onProgress?.(done, festivals.length, fest);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, festivals.length) }, () => worker());
  await Promise.all(workers);
  return out.filter(Boolean);
}

export function clearCache(): void {
  const toRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) toRemove.push(k);
  }
  for (const k of toRemove) sessionStorage.removeItem(k);
}
