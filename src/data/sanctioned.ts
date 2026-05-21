// Sanctioned-event matching (per Approved.md).
//
// We treat the official Burning Man directory as the single source of truth.
// `public/sanctioned-events.json` is regenerated weekly by
// `scripts/scrape-bm-regionals.mjs`. The SPA fetches it at startup and tags
// every festival pulled from dust.events with `is_sanctioned: boolean`.
//
// Burning Man directory names don't always match Dust slugs verbatim — names
// shift year to year ("Apogaea" vs "Apogaea – Mythos & Mechanica") — so we
// normalize aggressively and accept a Levenshtein-distance fallback.

import type { Festival } from './types';

export interface SanctionedSnapshot {
  source: string;
  scrapedAt: string;
  count: number;
  events: string[];
}

export interface SanctionedIndex {
  source: string;
  scrapedAt: string;
  events: string[];
  /** Pre-normalized keys so we don't re-run the normalizer on every match. */
  keys: string[];
  /** Number of days since the snapshot was scraped. */
  ageDays: number;
}

const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '/');

export async function loadSanctioned(signal?: AbortSignal): Promise<SanctionedIndex | null> {
  try {
    const res = await fetch(`${BASE}sanctioned-events.json`, { signal });
    if (!res.ok) return null;
    const snap = (await res.json()) as SanctionedSnapshot;
    const events = Array.isArray(snap.events) ? snap.events : [];
    const ageDays =
      (Date.now() - new Date(snap.scrapedAt).getTime()) / (1000 * 60 * 60 * 24);
    return {
      source: snap.source,
      scrapedAt: snap.scrapedAt,
      events,
      keys: events.map(normalize),
      ageDays,
    };
  } catch {
    return null;
  }
}

// Aggressive normalize: lowercase, drop punctuation, collapse whitespace, and
// strip a small set of editorial suffixes that the BM directory tacks onto
// names (e.g. "(Tentative Date)", "(Tentative Dates)") and obvious year tags.
export function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(tentative dates?\)/gi, '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/[‐-―‘-‟]/g, ' ') // dashes & smart quotes → space
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Drop common subtitle qualifiers — anything after a colon or em-dash is
// usually a year theme ("Apogaea – Mythos & Mechanica" → "apogaea").
export function rootKey(raw: string): string {
  const n = normalize(raw);
  const cut = n.split(/[:–—-]/)[0]?.trim();
  return cut ?? n;
}

// Levenshtein distance, iterative implementation. Good enough for ~50×100
// pairs at startup; we don't need a fancy data structure.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

export interface MatchResult {
  matched: boolean;
  via: 'exact' | 'root' | 'substring' | 'fuzzy' | null;
  officialName?: string;
}

// Match a dust festival against the sanctioned list.
//
// Strategy in order:
//  1. Exact normalized title equality.
//  2. Root-key equality (strip subtitle qualifiers like "– Mythos & Mechanica").
//  3. Substring containment in either direction on the normalized titles.
//  4. Levenshtein distance ≤ 2 on the root key (catches "PortalBurn" vs "POrtalBurn").
export function matchFestival(fest: Festival, index: SanctionedIndex): MatchResult {
  const candidates = [fest.title, fest.name].filter(Boolean);
  for (const c of candidates) {
    const n = normalize(c);
    const r = rootKey(c);
    // 1. Exact normalized.
    const exactIdx = index.keys.indexOf(n);
    if (exactIdx >= 0) return { matched: true, via: 'exact', officialName: index.events[exactIdx] };
    // 2. Root-key equality.
    for (let i = 0; i < index.keys.length; i++) {
      if (rootKey(index.events[i] ?? '') === r && r.length > 2) {
        return { matched: true, via: 'root', officialName: index.events[i] };
      }
    }
    // 3. Substring containment (only if substring is non-trivial).
    if (r.length >= 5) {
      for (let i = 0; i < index.keys.length; i++) {
        const k = index.keys[i] ?? '';
        if (k.length < 4) continue;
        if (k.includes(n) || n.includes(k)) {
          return { matched: true, via: 'substring', officialName: index.events[i] };
        }
      }
    }
    // 4. Levenshtein on root key, threshold depends on length.
    if (r.length >= 4) {
      const maxDist = r.length <= 6 ? 1 : 2;
      for (let i = 0; i < index.events.length; i++) {
        const candRoot = rootKey(index.events[i] ?? '');
        if (!candRoot) continue;
        if (Math.abs(candRoot.length - r.length) > maxDist) continue;
        if (levenshtein(candRoot, r) <= maxDist) {
          return { matched: true, via: 'fuzzy', officialName: index.events[i] };
        }
      }
    }
  }
  return { matched: false, via: null };
}

export interface SanctionFlags {
  byFestival: Map<string, { is_sanctioned: boolean; officialName?: string; via: MatchResult['via'] }>;
  index: SanctionedIndex | null;
  unmatched: string[]; // official names that didn't match any dust festival
}

export function attachSanctioned(festivals: Festival[], index: SanctionedIndex | null): SanctionFlags {
  const byFestival = new Map<string, { is_sanctioned: boolean; officialName?: string; via: MatchResult['via'] }>();
  if (!index) {
    for (const f of festivals) byFestival.set(f.name, { is_sanctioned: false, via: null });
    return { byFestival, index, unmatched: [] };
  }
  const matchedOfficial = new Set<string>();
  for (const f of festivals) {
    // Black Rock City IS Burning Man — definitionally sanctioned. It's a
    // manually-injected festival (not on dust), and its title "Burning Man"
    // won't fuzzy-match the directory entry "Black Rock City 2026", so we
    // flag it directly rather than relying on the scrape — and we claim the
    // matching official names so they don't show up as "unmatched".
    if (f.name.startsWith('black-rock-city')) {
      byFestival.set(f.name, { is_sanctioned: true, officialName: 'Black Rock City', via: 'exact' });
      for (const ev of index.events) {
        if (/black rock city|burning man/i.test(ev)) matchedOfficial.add(ev);
      }
      continue;
    }
    const m = matchFestival(f, index);
    byFestival.set(f.name, { is_sanctioned: m.matched, officialName: m.officialName, via: m.via });
    // "Unmatched" means an official event with no *dust* coverage. A
    // directory-sourced festival matching its own directory-derived name is
    // circular — it doesn't mean dust has the burn — so directory festivals
    // don't claim official names. Dust + manual festivals do.
    if (m.officialName && f.source !== 'bm-directory') matchedOfficial.add(m.officialName);
  }
  const unmatched = index.events.filter((n) => !matchedOfficial.has(n));
  return { byFestival, index, unmatched };
}
