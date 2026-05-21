// Manual adapter — burns hand-entered because no feed carries them.
//
// Black Rock City (the flagship Burning Man) is the case in point: Dust
// serves the regionals; BRC runs on Burning Man IT's own stack. Listed here
// for the Calendar / Geography / Data views; no program feed (dates-only).
//
// To add a one-off burn, append to FESTIVALS below.

export const id = 'manual';
export const programDepth = 'dates-only';

const FESTIVALS = [
  {
    name: 'black-rock-city-2026',
    id: 'black-rock-city-2026',
    uid: 900001,
    title: 'Burning Man',
    year: '2026',
    active: true,
    start: '2026-08-30T00:00:00',
    end: '2026-09-07T23:59:59',
    lat: 40.7864,
    long: -119.2065,
    region: 'Black Rock Desert, Nevada',
    website: 'https://burningman.org/event/',
    imageUrl: '',
    timeZone: 'America/Los_Angeles',
    mapDirection: 0,
    mastodonHandle: '',
    rssFeed: '',
    inboxEmail: 'N',
    pin: '',
    pin_size_multiplier: 2,
    theme: { primaryColor: '#ff8a3d' },
    volunteeripateSubdomain: '',
    volunteeripateIdentifier: '',
    camp_registration: true,
    event_registration: true,
    music_registration: true,
    mv_registration: true,
    unknownDates: false,
  },
  {
    name: 'afrikaburn-2026',
    id: 'afrikaburn-2026',
    uid: 900002,
    title: 'AfrikaBurn',
    year: '2026',
    active: true,
    start: '2026-04-27T00:00:00',
    end: '2026-05-03T23:59:59',
    lat: -32.5,
    long: 19.8,
    region: 'South Africa',
    website: 'https://www.afrikaburn.org/',
    imageUrl: '',
    timeZone: 'Africa/Johannesburg',
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
  },
  {
    name: 'midburn-2026',
    id: 'midburn-2026',
    uid: 900003,
    title: 'Midburn',
    year: '2026',
    active: true,
    start: '2026-11-02T00:00:00',
    end: '2026-11-07T23:59:59',
    lat: 30.87,
    long: 34.79,
    region: 'Israel',
    website: 'https://www.en-midburn.org/',
    imageUrl: '',
    timeZone: 'Asia/Jerusalem',
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
  },
];

export async function listFestivals() {
  return FESTIVALS.map((f) => ({ ...f, source: id, programDepth }));
}

export async function fetchProgram() {
  return { schedule: [], camps: [], art: [], music: [] };
}
