// Dust adapter — data.dust.events, the ~62 regionals that use the open Dust
// platform. This is the richest source: full schedule / camps / art / music.

const DATA_ROOT = 'https://data.dust.events';
const PER_FEST_FILES = ['schedule.json', 'camps.json', 'art.json', 'music.json'];

// Known upstream coord bugs — longitude sign flips that drop a burn on the
// wrong continent. Verified against each burn's official site.
const COORD_OVERRIDES = {
  'sideburn': { lat: 44.356739, long: -76.845419 },
  'youtopia-2025': { lat: 32.65452, long: -116.18326 },
  'burn-after-meeting': { lat: 40.441, long: -80.006 },
};

export const id = 'dust';
export const programDepth = 'full';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.json();
}

export async function listFestivals() {
  const all = await getJson(`${DATA_ROOT}/festivals.json`);
  return all
    .filter((f) => f.active && !f.unknownDates)
    .map((f) => {
      const fix = COORD_OVERRIDES[f.name];
      return {
        ...f,
        lat: fix ? fix.lat : f.lat,
        long: fix ? fix.long : f.long,
        source: id,
        programDepth,
      };
    });
}

export async function fetchProgram(festival) {
  const slug = festival.name;
  const out = {};
  await Promise.all(
    PER_FEST_FILES.map(async (filename) => {
      const key = filename.replace('.json', '');
      try {
        out[key] = await getJson(`${DATA_ROOT}/${slug}/${filename}`);
      } catch (err) {
        if (err.message.includes('HTTP 404')) out[key] = [];
        else throw err;
      }
    }),
  );
  return { schedule: out.schedule ?? [], camps: out.camps ?? [], art: out.art ?? [], music: out.music ?? [] };
}
