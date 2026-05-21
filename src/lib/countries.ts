// Country resolution + population — for the "burners per capita" MOOP tile.
//
// A festival's `region` field is inconsistent: "City, State", "City, Country",
// a bare country, or sometimes just a town. We parse what we can from the
// string, then fall back to a coarse coordinate bounding-box.

export const COUNTRY_POPULATION: Record<string, number> = {
  'United States': 335_000_000,
  'Canada': 40_000_000,
  'Mexico': 130_000_000,
  'South Africa': 60_000_000,
  'Israel': 9_800_000,
  // "Middle East" — the market Midburn serves (see COUNTRY_OVERRIDE): the sum
  // of Israel, Yemen, Saudi Arabia, Jordan, UAE, Kuwait and Bahrain.
  'Middle East': 109_500_000,
  'Sweden': 10_500_000,
  'New Zealand': 5_200_000,
  'Australia': 26_000_000,
  'United Kingdom': 67_000_000,
  'Netherlands': 17_800_000,
  'Germany': 84_000_000,
  'Spain': 47_000_000,
  'Japan': 125_000_000,
  'France': 68_000_000,
  'Ireland': 5_100_000,
  'Switzerland': 8_800_000,
  'Austria': 9_100_000,
  'Belgium': 11_700_000,
  'Norway': 5_500_000,
  'Denmark': 5_900_000,
  'Finland': 5_600_000,
  'Italy': 59_000_000,
  'Russia': 144_000_000,
  'Romania': 19_000_000,
  'Lithuania': 2_800_000,
  'Latvia': 1_900_000,
  'Estonia': 1_300_000,
  'Poland': 38_000_000,
  'Czech Republic': 10_500_000,
  'Argentina': 46_000_000,
  'Brazil': 215_000_000,
};

// Country name / alias → canonical name. Checked as a substring of the region.
const COUNTRY_ALIASES: [string, string][] = [
  ['united states', 'United States'], ['u.s.a', 'United States'], ['usa', 'United States'],
  ['canada', 'Canada'], ['mexico', 'Mexico'], ['south africa', 'South Africa'],
  ['israel', 'Israel'], ['sweden', 'Sweden'], ['new zealand', 'New Zealand'],
  ['australia', 'Australia'], ['united kingdom', 'United Kingdom'], ['scotland', 'United Kingdom'],
  ['england', 'United Kingdom'], ['wales', 'United Kingdom'], ['netherlands', 'Netherlands'],
  ['germany', 'Germany'], ['spain', 'Spain'], ['japan', 'Japan'], ['france', 'France'],
  ['ireland', 'Ireland'], ['switzerland', 'Switzerland'], ['austria', 'Austria'],
  ['belgium', 'Belgium'], ['norway', 'Norway'], ['denmark', 'Denmark'],
  ['finland', 'Finland'], ['italy', 'Italy'], ['russia', 'Russia'],
  ['romania', 'Romania'], ['lithuania', 'Lithuania'], ['latvia', 'Latvia'],
  ['estonia', 'Estonia'], ['poland', 'Poland'], ['czech republic', 'Czech Republic'],
  ['czechia', 'Czech Republic'], ['argentina', 'Argentina'], ['brazil', 'Brazil'],
];

const US_STATES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
  'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
  'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
  'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
  'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina',
  'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island',
  'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
  'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming',
];
const US_ABBR = new Set([
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in',
  'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv',
  'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn',
  'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy', 'dc',
]);
const CA_PROVINCES = [
  'alberta', 'british columbia', 'manitoba', 'new brunswick', 'newfoundland',
  'nova scotia', 'ontario', 'prince edward', 'quebec', 'québec', 'saskatchewan',
  'yukon', 'nunavut',
];
const CA_ABBR = new Set(['ab', 'bc', 'mb', 'nb', 'nl', 'ns', 'on', 'pe', 'qc', 'sk', 'yt', 'nt', 'nu']);

// [country, latMin, latMax, longMin, longMax] — coarse, only used as a fallback
// when the region string yields nothing (e.g. a bare town name).
const COORD_BOXES: [string, number, number, number, number][] = [
  ['Netherlands', 50.7, 53.6, 3.3, 7.3],
  ['United Kingdom', 49.8, 60.9, -8.2, 1.8],
  ['Sweden', 55.3, 69.1, 10.9, 24.2],
  ['Germany', 47.2, 55.1, 5.8, 15.1],
  ['Spain', 35.9, 43.8, -9.4, 3.4],
  ['France', 41.3, 51.1, -5.2, 8.3],
  ['New Zealand', -47.3, -34.0, 166.3, 178.6],
  ['Australia', -43.7, -10.0, 112.9, 153.7],
  ['South Africa', -34.9, -22.1, 16.4, 32.9],
  ['Israel', 29.4, 33.4, 34.2, 35.9],
  ['Japan', 30.0, 45.6, 128.9, 145.9],
  // Contiguous US — last resort for a US burn whose region string carries no
  // state name (e.g. "Southeast"). Region-string matching runs first, and
  // Canada/Mexico match their own names, so the overlap risk is negligible.
  ['United States', 24.5, 49.0, -125.0, -66.9],
];

// Per-burn "market" override, keyed by burnKey — for a burn whose audience
// isn't its host country. Midburn draws the wider Middle East, so the
// per-capita MOOP tile measures it against that population. Deliberately NOT
// applied inside countryForFestival (which stays purely geographic) — the
// caller opts in.
export const COUNTRY_OVERRIDE: Record<string, string> = {
  midburn: 'Middle East',
};

interface CountryFest {
  region?: string;
  lat?: number | null;
  long?: number | null;
}

/** Best-effort geographic country for a festival, or null if undetermined. */
export function countryForFestival(f: CountryFest): string | null {
  const r = (f.region ?? '').toLowerCase();
  for (const [alias, country] of COUNTRY_ALIASES) {
    if (r.includes(alias)) return country;
  }
  if (US_STATES.some((s) => r.includes(s))) return 'United States';
  if (CA_PROVINCES.some((s) => r.includes(s))) return 'Canada';
  const tokens = r.split(/[,/]/).map((s) => s.trim());
  if (tokens.some((tk) => US_ABBR.has(tk))) return 'United States';
  if (tokens.some((tk) => CA_ABBR.has(tk))) return 'Canada';
  const { lat, long } = f;
  if (typeof lat === 'number' && typeof long === 'number') {
    for (const [country, laMin, laMax, loMin, loMax] of COORD_BOXES) {
      if (lat >= laMin && lat <= laMax && long >= loMin && long <= loMax) return country;
    }
  }
  return null;
}
