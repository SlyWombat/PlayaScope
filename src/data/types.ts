// Canonical types for the dust.events public JSON feeds.
//
// Source of truth: damiant/dust:src/app/data/models.ts
// Endpoint root: https://data.dust.events/
//
// Timestamps in these feeds are ISO strings WITHOUT a timezone offset
// ("2026-04-15T00:00:00"). Always pair them with the festival's `timeZone`
// (IANA name like "America/Los_Angeles") before comparing across burns.

export interface FestivalTheme {
  primaryColor?: string;
}

export interface Festival {
  name: string;
  id: string;
  uid: number;
  title: string;
  year: string;
  active: boolean;
  start: string;
  end: string;
  lat: number;
  long: number;
  region: string;
  website: string;
  imageUrl: string;
  timeZone: string;
  mapDirection: number;
  mastodonHandle: string;
  rssFeed: string;
  inboxEmail: string;
  pin: string;
  pin_size_multiplier: number;
  theme: FestivalTheme;
  volunteeripateSubdomain: string;
  volunteeripateIdentifier: string;
  camp_registration: boolean;
  event_registration: boolean;
  music_registration: boolean;
  mv_registration: boolean;
  unknownDates?: boolean;
}

export interface EventType {
  id: number | string;
  label: string;
  abbr?: string;
}

export interface OccurrenceSet {
  start_time: string;
  end_time: string;
}

export interface DustEvent {
  uid: string;
  slug: string;
  title: string;
  description?: string;
  year: string;
  event_type: EventType;
  occurrence_set: OccurrenceSet[];
  hosted_by_camp?: string;
  located_at_art?: string;
  other_location?: string;
  all_day?: boolean;
  check_location?: boolean;
  contact?: string;
  url?: string;
  imageUrl?: string;
}

export interface CampLocation {
  string?: string;
  frontage?: string;
  intersection?: string;
  intersection_type?: string;
  dimensions?: string;
}

export interface Camp {
  uid: string;
  name: string;
  description?: string;
  hometown?: string;
  year: string;
  location?: CampLocation;
  location_string?: string;
  contact_email?: string;
  url?: string;
  imageUrl?: string;
  camp_type?: string;
}

export interface ArtLocation {
  gps_latitude?: number;
  gps_longitude?: number;
  hour?: number;
  minute?: number;
  string?: string;
}

export interface ArtPiece {
  uid: string;
  name: string;
  artist?: string;
  description?: string;
  art_type?: string;
  category?: string;
  year: string;
  location?: ArtLocation;
  hometown?: string;
  images?: { thumbnail_url?: string; gallery_url?: string }[];
  donation_link?: string;
  guided_tours?: number;
  url?: string;
}

export interface MusicSet {
  uid: string;
  title?: string;
  artist?: string;
  description?: string;
  year: string;
  occurrence_set?: OccurrenceSet[];
  hosted_by_camp?: string;
}

// The fixed 19-label taxonomy used across burns for event_type.label.
// Anything outside this list should be bucketed into "Miscellaneous" for
// cross-burn comparison.
export const EVENT_TYPE_LABELS = [
  'Arts & Crafts',
  'Class/Workshop',
  'Diversity & Inclusion',
  'Fire/Spectacle',
  'Food & Drink',
  'For Kids',
  'Games',
  'Gathering/Party',
  'Live Music',
  'Mature Audiences',
  'Miscellaneous',
  'Parade',
  'Performance',
  'Repair',
  'Ritual/Ceremony',
  'Self Care',
  'Sustainability/Greening Your Burn',
  'Yoga/Movement/Fitness',
] as const;

export type EventTypeLabel = (typeof EVENT_TYPE_LABELS)[number];

export function canonicalEventTypeLabel(raw: string | undefined): EventTypeLabel {
  if (!raw) return 'Miscellaneous';
  const hit = EVENT_TYPE_LABELS.find((l) => l === raw);
  return hit ?? 'Miscellaneous';
}
