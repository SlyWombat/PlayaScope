// Slug-prefix grouping for YoY continuity (#4) and Countdown dedupe (#7).
//
// Most festivals follow the convention `{name}-{YYYY}`. A few use bare names
// (e.g. `arctic-burn`). We strip a trailing 4-digit year if present.

import type { FestivalBundle } from '../data/loader';

const YEAR_SUFFIX = /-(\d{4})$/;

export function burnKey(slug: string): string {
  return slug.replace(YEAR_SUFFIX, '');
}

export function yearFromSlug(slug: string): number | null {
  const m = slug.match(YEAR_SUFFIX);
  return m ? Number(m[1]) : null;
}

export interface GroupedBundles {
  key: string;
  /** Bundles sorted by ascending year (or by start date if year not in slug). */
  years: FestivalBundle[];
}

export function groupByBurn(bundles: FestivalBundle[]): GroupedBundles[] {
  const map = new Map<string, FestivalBundle[]>();
  for (const b of bundles) {
    const k = burnKey(b.festival.name);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(b);
  }
  const out: GroupedBundles[] = [];
  for (const [key, group] of map) {
    group.sort((a, b) => {
      const ya = yearFromSlug(a.festival.name) ?? new Date(a.festival.start).getUTCFullYear();
      const yb = yearFromSlug(b.festival.name) ?? new Date(b.festival.start).getUTCFullYear();
      return ya - yb;
    });
    out.push({ key, years: group });
  }
  return out;
}

/** Burns that have ≥2 distinct years in the dataset. */
export function withMultipleYears(grouped: GroupedBundles[]): GroupedBundles[] {
  return grouped.filter((g) => g.years.length >= 2);
}
