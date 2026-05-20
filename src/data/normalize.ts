// Date/time normalization for cross-festival comparison.
//
// dust.events publishes ISO timestamps WITHOUT a timezone offset
// ("2026-04-15T00:00:00"). To compare across burns we have to apply each
// festival's IANA timezone to anchor those wall-clock times to a real instant.

// Convert "2026-04-15T00:00:00" + "America/Los_Angeles" → real UTC Date.
//
// Strategy: parse the local fields, build a candidate UTC Date assuming UTC,
// then ask Intl what that instant looks like in the target zone and bump by
// the offset between the two. One bisection pass handles DST seams.
export function parseLocalToUtc(local: string, timeZone: string): Date {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?/);
  if (!m) return new Date(local);
  const [, y, mo, d, h, mi, s] = m;
  const Y = Number(y), Mo = Number(mo) - 1, D = Number(d);
  const H = Number(h), Mi = Number(mi), S = s ? Number(s) : 0;

  // Iterate once: build candidate as if UTC, find its representation in the
  // target zone, shift by the delta. The result lands within a few ms.
  let utcMs = Date.UTC(Y, Mo, D, H, Mi, Math.floor(S), Math.round((S % 1) * 1000));
  for (let pass = 0; pass < 2; pass++) {
    const partsInZone = getDateTimePartsInZone(new Date(utcMs), timeZone);
    const wallMs = Date.UTC(
      partsInZone.year,
      partsInZone.month - 1,
      partsInZone.day,
      partsInZone.hour,
      partsInZone.minute,
      partsInZone.second,
    );
    const targetWallMs = Date.UTC(Y, Mo, D, H, Mi, Math.floor(S));
    const delta = targetWallMs - wallMs;
    if (delta === 0) break;
    utcMs += delta;
  }
  return new Date(utcMs);
}

interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getDateTimePartsInZone(date: Date, timeZone: string): ZoneParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const out: ZoneParts = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of fmt.formatToParts(date)) {
    if (part.type === 'year') out.year = Number(part.value);
    else if (part.type === 'month') out.month = Number(part.value);
    else if (part.type === 'day') out.day = Number(part.value);
    else if (part.type === 'hour') out.hour = part.value === '24' ? 0 : Number(part.value);
    else if (part.type === 'minute') out.minute = Number(part.value);
    else if (part.type === 'second') out.second = Number(part.value);
  }
  return out;
}

// Day-of-burn offset (0 = opening day in the festival's local zone).
export function dayOfBurn(occurrenceLocal: string, festivalStartLocal: string, timeZone: string): number {
  const occ = parseLocalToUtc(occurrenceLocal, timeZone);
  const start = parseLocalToUtc(festivalStartLocal, timeZone);
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((occ.getTime() - start.getTime()) / dayMs);
}

// Burn duration in whole days (rounded up) based on local-time start/end.
export function durationDays(startLocal: string, endLocal: string, timeZone: string): number {
  const s = parseLocalToUtc(startLocal, timeZone);
  const e = parseLocalToUtc(endLocal, timeZone);
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / dayMs));
}
