// Reduce raw bundles to comparison-ready aggregates.

import { canonicalEventTypeLabel, EVENT_TYPE_LABELS } from './types';
import type { EventTypeLabel } from './types';
import type { FestivalBundle } from './loader';
import { dayOfBurn, durationDays } from './normalize';

export interface EventTypeMixRow {
  festival: string;
  title: string;
  total: number;
  counts: Record<EventTypeLabel, number>;
  fractions: Record<EventTypeLabel, number>;
}

export function eventTypeMix(bundles: FestivalBundle[]): EventTypeMixRow[] {
  return bundles.map((b) => {
    const counts = Object.fromEntries(EVENT_TYPE_LABELS.map((l) => [l, 0])) as Record<EventTypeLabel, number>;
    for (const ev of b.schedule) {
      const label = canonicalEventTypeLabel(ev.event_type?.label);
      counts[label] = (counts[label] ?? 0) + 1;
    }
    const total = b.schedule.length;
    const fractions = Object.fromEntries(
      Object.entries(counts).map(([k, v]) => [k, total > 0 ? v / total : 0]),
    ) as Record<EventTypeLabel, number>;
    return { festival: b.festival.name, title: b.festival.title, total, counts, fractions };
  });
}

export interface ScheduleShapeRow {
  festival: string;
  title: string;
  duration: number;
  perDay: number[];
}

export function scheduleShape(bundles: FestivalBundle[]): ScheduleShapeRow[] {
  return bundles.map((b) => {
    const dur = durationDays(b.festival.start, b.festival.end, b.festival.timeZone);
    const buckets = new Array<number>(dur + 2).fill(0);
    for (const ev of b.schedule) {
      const occ = ev.occurrence;
      if (!occ?.start_time) continue;
      const d = dayOfBurn(occ.start_time, b.festival.start, b.festival.timeZone);
      const idx = Math.max(0, Math.min(buckets.length - 1, d + 1));
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
    return { festival: b.festival.name, title: b.festival.title, duration: dur, perDay: buckets };
  });
}

export interface DensityRow {
  festival: string;
  title: string;
  events: number;
  camps: number;
  art: number;
  music: number;
  duration: number;
  lat: number | null;
  long: number | null;
  region: string;
  timeZone: string;
}

export function densityByFestival(bundles: FestivalBundle[]): DensityRow[] {
  return bundles.map((b) => ({
    festival: b.festival.name,
    title: b.festival.title,
    events: b.schedule.length,
    camps: b.camps.length,
    art: b.art.length,
    music: b.music.length,
    duration: durationDays(b.festival.start, b.festival.end, b.festival.timeZone),
    lat: b.festival.lat,
    long: b.festival.long,
    region: b.festival.region,
    timeZone: b.festival.timeZone,
  }));
}

// Aggregate event-type counts across every festival (continent-level mix).
export function globalTypeMix(bundles: FestivalBundle[]): { label: EventTypeLabel; count: number }[] {
  const counts = Object.fromEntries(EVENT_TYPE_LABELS.map((l) => [l, 0])) as Record<EventTypeLabel, number>;
  for (const b of bundles) {
    for (const ev of b.schedule) {
      const label = canonicalEventTypeLabel(ev.event_type?.label);
      counts[label] = (counts[label] ?? 0) + 1;
    }
  }
  return EVENT_TYPE_LABELS.map((label) => ({ label, count: counts[label] }));
}
