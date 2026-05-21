// Time-of-day + day-of-burn helpers used by the heatmap (#2),
// calendar (#3), and countdown (#7).

import { parseLocalToUtc } from '../data/normalize';

/** Hour (0–23) at which an ISO local timestamp lands in the given IANA zone. */
export function hourOfDay(isoLocal: string, _timeZone: string): number {
  // The dust feeds carry wall-clock local time with no zone. The "hour"
  // burners actually experience is the clock-on-the-playa hour, which IS
  // the local time encoded in the string. We can read it directly.
  const m = isoLocal.match(/T(\d{2}):/);
  return m ? Number(m[1]) : 0;
}

/** Day-of-burn (0 = opening day) for an ISO local occurrence string. */
export function dayOfBurnLocal(occLocal: string, festivalStartLocal: string, timeZone: string): number {
  const occ = parseLocalToUtc(occLocal, timeZone);
  const start = parseLocalToUtc(festivalStartLocal, timeZone);
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((occ.getTime() - start.getTime()) / dayMs);
}

/** Whether `now` falls between the festival's UTC-normalized start and end. */
export function isActive(festivalStart: string, festivalEnd: string, timeZone: string, now: Date): boolean {
  const s = parseLocalToUtc(festivalStart, timeZone);
  const e = parseLocalToUtc(festivalEnd, timeZone);
  return now >= s && now <= e;
}

/** Milliseconds until the festival starts (negative if past). */
export function msUntilStart(festivalStart: string, timeZone: string, now: Date): number {
  return parseLocalToUtc(festivalStart, timeZone).getTime() - now.getTime();
}

export function msUntilEnd(festivalEnd: string, timeZone: string, now: Date): number {
  return parseLocalToUtc(festivalEnd, timeZone).getTime() - now.getTime();
}
