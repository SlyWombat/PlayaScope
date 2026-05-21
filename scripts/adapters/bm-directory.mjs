// Burning Man directory adapter — scrapes the official "Find a Burning Man
// Event" listing. Produces dates-only festivals: every card has a title, a
// date range and (usually) a location string, but no program feed.
//
// This is what surfaces the ~21 official regionals that don't use Dust
// (Lakes of Fire, The Borderland, Burning Japan, …) on the calendar + map.
//
// The directory gives no coordinates, only a place name (state / province /
// country). We pin each burn at that place's centroid (see geo-centroids.mjs)
// so they show on the world map — approximate, but a real geographic position.

import { GEO_CENTROIDS } from '../lib/geo-centroids.mjs';

const DIRECTORY_URL = 'https://burningman.org/global-events-groups/find-a-burning-man-event/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const id = 'bm-directory';
export const programDepth = 'dates-only';

const ENTITIES = {
  '&#8217;': "'", '&#8216;': "'", '&#8211;': '–', '&#8212;': '—',
  '&amp;': '&', '&quot;': '"', '&#039;': "'", '&nbsp;': ' ', '&lt;': '<', '&gt;': '>',
};
function decode(s) {
  let o = s;
  for (const [k, v] of Object.entries(ENTITIES)) o = o.split(k).join(v);
  return o;
}
function clean(html) {
  return decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// "May 18, 2026" → Date (UTC midnight). Returns null on anything unparseable.
function parseDate(s) {
  const m = s.match(/([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const d = new Date(`${m[1]} ${m[2]}, ${m[3]} UTC`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoLocal(d, endOfDay) {
  const p = (n) => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  return `${date}T${endOfDay ? '23:59:59' : '00:00:00'}`;
}

function slugify(title, year) {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base}-${year}`;
}

async function fetchHtml() {
  const res = await fetch(DIRECTORY_URL, {
    headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.5' },
  });
  if (!res.ok) throw new Error(`GET ${DIRECTORY_URL} → HTTP ${res.status}`);
  return res.text();
}

export async function listFestivals() {
  const html = await fetchHtml();
  // Split into per-card chunks: each card runs from one __title to the next.
  const marker = '__title">';
  const starts = [];
  let i = 0;
  while ((i = html.indexOf(marker, i + 1)) !== -1) starts.push(i);

  const out = [];
  let skipped = 0;
  for (let c = 0; c < starts.length; c++) {
    const chunk = html.slice(starts[c], starts[c + 1] ?? starts[c] + 4000);

    const titleEnd = chunk.indexOf('</h3>');
    let title = titleEnd > 0 ? clean(chunk.slice(marker.length, titleEnd)) : '';
    title = title.replace(/^This Event is Cancelled\s+\d{4}\s+/i, '').trim();
    if (!title) { skipped++; continue; }

    // Black Rock City is handled by the manual adapter — skip the directory's
    // own BRC card so the two don't double up.
    if (/black rock city/i.test(title)) continue;

    const dateM = chunk.match(/__date">([\s\S]*?)<\/div>/);
    const dateStr = dateM ? clean(dateM[1].replace(/<svg[\s\S]*?<\/svg>/g, '')) : '';
    const dates = (dateStr.match(/[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}/g) ?? [])
      .map(parseDate)
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());
    // Lossy-date rule: no clean date → skip rather than guess.
    if (dates.length === 0) { skipped++; continue; }
    const start = dates[0];
    const end = dates[dates.length - 1];

    const locM = chunk.match(/__location">([\s\S]*?)<\/div>/);
    const region = locM ? clean(locM[1].replace(/<svg[\s\S]*?<\/svg>/g, '')) : '';

    // Geocode the place name to a centroid so the burn can be mapped.
    const centroid = GEO_CENTROIDS[region] ?? null;

    const year = start.getUTCFullYear();
    out.push({
      name: slugify(title, year),
      id: slugify(title, year),
      uid: 800000 + c,
      title,
      year: String(year),
      active: true,
      start: isoLocal(start, false),
      end: isoLocal(end, true),
      lat: centroid ? centroid[0] : null,
      long: centroid ? centroid[1] : null,
      region,
      website: '',
      imageUrl: '',
      timeZone: 'UTC',
      mapDirection: 0,
      mastodonHandle: '',
      rssFeed: '',
      inboxEmail: 'N',
      pin: '',
      pin_size_multiplier: 1,
      theme: { primaryColor: '#5a9dd1' },
      volunteeripateSubdomain: '',
      volunteeripateIdentifier: '',
      camp_registration: false,
      event_registration: false,
      music_registration: false,
      mv_registration: false,
      unknownDates: false,
      source: id,
      programDepth,
    });
  }
  if (skipped) console.error(`  (bm-directory: skipped ${skipped} cards with no parseable date)`);
  return out;
}

export async function fetchProgram() {
  return { schedule: [], camps: [], art: [], music: [] };
}
