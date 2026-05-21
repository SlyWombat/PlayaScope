// Map lat/long → human-readable region label.
//
// North America gets split into Canada / USA / Mexico (per the granular-NA
// project rule). Other continents stay continent-level because their burn
// counts are small enough that further splits would just produce N=1 slices.
//
// The bounding boxes are rough — they're a sorting heuristic, not a GIS
// product. If a burn lands on the wrong side of a border, fix the
// COORD_OVERRIDES table in scripts/fetch-dust-data.mjs first, then revisit
// the boxes here.

export type RegionLabel =
  | 'Canada'
  | 'USA'
  | 'Mexico'
  | 'Europe'
  | 'Oceania'
  | 'Africa'
  | 'Asia'
  | 'South America'
  | 'Other';

// Display order for grouped charts (pie slices, table sorts, etc.).
// Keeps NA together at the top, then alphabetical-ish by continent.
export const REGION_ORDER: RegionLabel[] = [
  'Canada',
  'USA',
  'Mexico',
  'Europe',
  'Oceania',
  'Asia',
  'Africa',
  'South America',
  'Other',
];

// Color palette for grouped charts. Picked so CA/US/MX are visually adjacent
// (warm tones) and the other continents are distinguishable cool tones.
export const REGION_COLORS: Record<RegionLabel, string> = {
  Canada: '#ff8a3d',
  USA: '#f5c542',
  Mexico: '#d15a9d',
  Europe: '#5a9dd1',
  Oceania: '#5ad19a',
  Asia: '#9d5ad1',
  Africa: '#26c6da',
  'South America': '#42a5f5',
  Other: '#8b93a7',
};

// The festival's free-text `region` string is the authoritative COUNTRY
// signal — coordinate boxes can't separate southern Ontario from the
// northern US (Windsor ON is south of Detroit MI). When the string clearly
// names a country/province/state, trust it; otherwise fall back to coords.
const CANADA_RE =
  /\b(canada|ontario|qu[ée]bec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|labrador|prince edward|yukon|nunavut|northwest territories)\b/i;
// Mexico, but NOT "New Mexico" (a US state).
const MEXICO_RE = /(^|[^w]\s)mexico\b/i;
const USA_RE = /\b(usa|u\.s\.a|united states|new mexico)\b/i;

export function regionForFestival(f: { lat: number; long: number; region?: string }): RegionLabel {
  const r = f.region ?? '';
  if (CANADA_RE.test(r)) return 'Canada';
  if (USA_RE.test(r)) return 'USA';
  if (MEXICO_RE.test(r)) return 'Mexico';
  return regionForCoords(f.lat, f.long);
}

export function regionForCoords(lat: number, lng: number): RegionLabel {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'Other';

  // North America block first.
  if (lat > 14 && lng > -170 && lng < -50) {
    // Mexico / Central America. The US-Mexico border zigzags from
    // (-117, 32.5) at Tijuana down to (-97, 25.9) at Brownsville. We can't
    // hit it exactly with a rectangle, so we draw the box south of lat 30
    // and east of -118 — that captures every Mexico burn while excluding
    // every US state's known burn locations (FreezerBurn TX at 30.2,
    // Engulf LA at 30.9, Saguaro Man AZ at 32.2 all stay USA). If a future
    // burn lands in south Texas (Brownsville / Laredo) this will need a
    // proper polygon — flag as TODO.
    if (lat < 30 && lng > -118 && lng < -86) return 'Mexico';
    // Canada: anything north of 49° is unambiguous. The eastern provinces
    // dip south, so we add a second window: north of 45.3° AND east of
    // -83° (skips upstate NY and Michigan) AND west of -52° (skips ocean).
    // Northern Maine peaks at 47.4° at -68° — would be misclassified, but
    // no burns currently exist there.
    if (lat >= 49) return 'Canada';
    if (lat > 45.3 && lng > -83 && lng < -52) return 'Canada';
    return 'USA';
  }

  if (lat <= 14 && lat > -56 && lng > -85 && lng < -34) return 'South America';
  if (lat > 35 && lng > -25 && lng < 60) return 'Europe';
  if (lat > -35 && lat < 38 && lng > -20 && lng < 52) return 'Africa';
  if (lat > -10 && lng > 60 && lng < 150) return 'Asia';
  if (lat < -10 && lng > 110 && lng < 180) return 'Oceania';
  return 'Other';
}

// Convenience: ordered iterator that returns only regions actually present.
export function regionsPresent(coords: Array<{ lat: number; long: number }>): RegionLabel[] {
  const set = new Set<RegionLabel>();
  for (const c of coords) set.add(regionForCoords(c.lat, c.long));
  return REGION_ORDER.filter((r) => set.has(r));
}
