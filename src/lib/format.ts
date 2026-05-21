// Display formatters — metric defaults, ISO 8601 timestamps, browser-local
// relative copy. Every view should funnel through these instead of calling
// `.toFixed()` ad hoc, so unit policy stays consistent across the app.

// km, no decimals if ≥10 km, one decimal under. Input is in metres.
export function formatKm(meters: number): string {
  const km = meters / 1000;
  if (!Number.isFinite(km)) return '—';
  if (km >= 10) return `${Math.round(km)} km`;
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

// Great-circle distance between two lat/long pairs, in metres. Haversine.
export function distanceMeters(a: { lat: number; long: number }, b: { lat: number; long: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.long - a.long);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// "April 15" / "Apr 15, 2026" / "Wed Apr 15 14:00 PDT" — formatted in the
// festival's local IANA zone, since wall-clock times on the playa are what
// burners actually plan around.
export function formatDateInZone(d: Date | string, timeZone: string, opts?: Intl.DateTimeFormatOptions): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    ...opts,
  }).format(date);
}

export function formatDateRangeInZone(startISO: string, endISO: string, timeZone: string): string {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth();
  if (sameMonth) {
    const month = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short' }).format(s);
    const dStart = new Intl.DateTimeFormat('en-US', { timeZone, day: 'numeric' }).format(s);
    const dEnd = new Intl.DateTimeFormat('en-US', { timeZone, day: 'numeric' }).format(e);
    return `${month} ${dStart}–${dEnd}`;
  }
  return `${formatDateInZone(s, timeZone)} – ${formatDateInZone(e, timeZone)}`;
}

// "in 4 days" / "in 12 hours" / "ended 3 days ago" — browser-local relative.
// Pass deltaMs (positive = future, negative = past).
export function formatRelative(deltaMs: number): string {
  const past = deltaMs < 0;
  const abs = Math.abs(deltaMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  let value: number;
  let unit: 'minute' | 'hour' | 'day';
  if (abs < hour) {
    value = Math.max(1, Math.round(abs / minute));
    unit = 'minute';
  } else if (abs < day) {
    value = Math.round(abs / hour);
    unit = 'hour';
  } else {
    value = Math.round(abs / day);
    unit = 'day';
  }
  const plural = value === 1 ? unit : `${unit}s`;
  return past ? `${value} ${plural} ago` : `in ${value} ${plural}`;
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return `${n.toLocaleString()} ${n === 1 ? singular : plural ?? singular + 's'}`;
}

// Hours from a millisecond delta, rounded to the nearest 0.5 for the "ends in
// 4.5 hours" copy used by the countdown widget.
export function formatHours(deltaMs: number): string {
  const h = Math.max(0, Math.round((deltaMs / 3_600_000) * 2) / 2);
  return h === 1 ? '1 hour' : `${h} hours`;
}

// Total event-hours sum — formatted with K/M suffix when large.
export function formatHourCount(hours: number): string {
  if (!Number.isFinite(hours)) return '—';
  if (hours >= 1_000_000) return `${(hours / 1_000_000).toFixed(2)}M hours`;
  if (hours >= 1_000) return `${(hours / 1_000).toFixed(1)}K hours`;
  return `${Math.round(hours).toLocaleString()} hours`;
}

// Compact integer with thousand separators.
export function formatInt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString();
}
