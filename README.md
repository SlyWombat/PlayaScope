<div align="center">

<img src="public/playascope-wordmark.svg" alt="PlayaScope" width="320" />

**Interactive cross-regional burn comparisons.**

Built on the open [Dust](https://dust.events) events platform's public data.
Compare event mix, schedule shape, geographic spread, and camp/art density
across every active regional Burning Man-style burn worldwide.

</div>

---

## What it does

PlayaScope pulls the public JSON feeds from `data.dust.events` and gives you a
single dashboard for comparing burns at the regional level:

- **Overview** — KPI cards, top burns by event volume, global event-type mix,
  distribution by continent.
- **Event mix** — stacked bars and a burn-by-event-type heatmap across the
  19-label Dust taxonomy (Fire/Spectacle, Live Music, Workshops, etc.).
- **Schedule shape** — events-per-day-of-burn curves so you can see when the
  programming peaks at each regional.
- **Geography** — Leaflet world map with circle markers scaled to event count,
  plus a duration histogram and a region table.
- **Data table** — sortable, filterable across every burn.

A global **All / Official / Other** filter in the top bar segments burns by
whether they appear on the
[official Burning Man Regional Events directory](https://burningman.org/global-events-groups/find-a-burning-man-event/),
with fuzzy name matching to handle subtitle drift like "Apogaea" vs
"Apogaea – Mythos & Mechanica".

## Run it locally

```bash
git clone https://github.com/SlyWombat/PlayaScope.git
cd PlayaScope
npm install
npm run fetch-data    # one-time: snapshots ~12 MB of dust.events JSON into public/data/
npm run dev           # opens http://localhost:5174
```

Why `fetch-data` is required: the upstream CDN at `data.dust.events` doesn't
send `Access-Control-Allow-Origin` headers, so browsers block live fetches.
We snapshot everything into `public/data/` at build time and read it
same-origin. Re-run `npm run fetch-data` whenever you want fresher data.

### Other commands

```bash
npm run build               # production build into dist/
npm run preview             # preview the production bundle
npm run typecheck           # tsc --noEmit
npm run lint                # eslint
npm run test:e2e            # playwright smoke tests across all five tabs
npm run scrape-sanctioned   # refresh public/sanctioned-events.json from burningman.org
npm run refresh-snapshot    # update festivals.snapshot.json from upstream
```

A GitHub Actions workflow (`.github/workflows/scrape-sanctioned.yml`) refreshes
the sanctioned-events list every Monday and commits it back.

## Tech stack

- React 19 + TypeScript + Vite
- [ECharts](https://echarts.apache.org/) — bar / stacked / heatmap / pie / line
- [React Leaflet](https://react-leaflet.js.org/) + OpenStreetMap (CARTO dark
  tiles) — the geographic map
- [Zod](https://zod.dev/) — runtime schema validation
- [Playwright](https://playwright.dev/) — end-to-end smoke tests

No backend; PlayaScope is a static single-page app. Drop the `dist/` output
on any static host.

## Data sources

- **`https://data.dust.events/`** — public JSON feeds maintained by the
  [Dust](https://github.com/damiant/dust) project (MIT). Festival registry,
  schedules, theme camps, art installations, music sets.
- **`https://burningman.org/global-events-groups/find-a-burning-man-event/`** —
  scraped weekly for the canonical list of officially-sanctioned regional events.

PlayaScope is not affiliated with Burning Man Project or with the Dust
maintainers. All festival data belongs to the regional event organizers who
publish it; this app just makes it easier to look across regions at once.

## License

MIT — see [LICENSE](./LICENSE).

Copyright © 2026 [ElectricRV](https://electricrv.ca) / SlyMega.

Original Dust platform © Damian Tarnawsky, also MIT.
