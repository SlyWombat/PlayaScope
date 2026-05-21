// Same-origin fetch wrappers around the static dust-data snapshot.
//
// We can't read https://data.dust.events directly from the browser — that
// origin serves no CORS headers, so cross-origin fetches are blocked. Instead
// `scripts/fetch-dust-data.mjs` snapshots the public feeds into
// `public/data/` at build/deploy time, and we read from there.
//
// In dev, run `npm run fetch-data` once (or on demand) to populate the cache.
// In prod, the deploy script does it automatically.

import type { ArtPiece, Camp, DustEvent, Festival, MusicSet } from './types';

const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '/');
const DATA_ROOT = `${BASE}data`;

async function getJson<T>(url: string, signal?: AbortSignal, noCache = false): Promise<T> {
  const res = await fetch(url, { signal, ...(noCache ? { cache: 'no-cache' as const } : {}) });
  if (!res.ok) {
    throw new Error(`GET ${url} → HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function fetchFestivals(signal?: AbortSignal): Promise<Festival[]> {
  // no-cache: the registry must be fresh after a deploy; a browser-cached copy
  // here desyncs the whole dashboard. Per-festival files keep normal caching.
  return getJson<Festival[]>(`${DATA_ROOT}/festivals.json`, signal, true);
}

export async function fetchSchedule(festivalSlug: string, signal?: AbortSignal): Promise<DustEvent[]> {
  return getJson<DustEvent[]>(`${DATA_ROOT}/${festivalSlug}/schedule.json`, signal);
}

export async function fetchCamps(festivalSlug: string, signal?: AbortSignal): Promise<Camp[]> {
  return getJson<Camp[]>(`${DATA_ROOT}/${festivalSlug}/camps.json`, signal);
}

export async function fetchArt(festivalSlug: string, signal?: AbortSignal): Promise<ArtPiece[]> {
  return getJson<ArtPiece[]>(`${DATA_ROOT}/${festivalSlug}/art.json`, signal);
}

export async function fetchMusic(festivalSlug: string, signal?: AbortSignal): Promise<MusicSet[]> {
  return getJson<MusicSet[]>(`${DATA_ROOT}/${festivalSlug}/music.json`, signal);
}

// imageUrl on a festival is a relative path. To resolve it we'd need the
// upstream CDN — but most browsers will still load images cross-origin
// without CORS (since <img> doesn't require it). Keep this pointing at
// the upstream for now.
export function resolveImageUrl(relative: string | undefined): string | undefined {
  if (!relative) return undefined;
  if (relative.startsWith('http')) return relative;
  return `https://data.dust.events/${relative.replace(/^\/+/, '')}`;
}

export async function fetchOrEmpty<T>(loader: (signal?: AbortSignal) => Promise<T[]>, signal?: AbortSignal): Promise<T[]> {
  try {
    return await loader(signal);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('404') || msg.includes('Failed to fetch')) return [];
    throw err;
  }
}
