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
];

export async function listFestivals() {
  return FESTIVALS.map((f) => ({ ...f, source: id, programDepth }));
}

export async function fetchProgram() {
  return { schedule: [], camps: [], art: [], music: [] };
}
