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
single dashboard for comparing burns at the regional level. Eleven views:

- **Overview** — KPI cards, top burns by event volume, global event-type mix,
  distribution by region (Canada / USA / Mexico broken out).
- **MOOP Report** — a page of data-trivia tiles, snark included.
- **Geography** — Leaflet world map with circle markers scaled to event count,
  plus a duration histogram and a region table.
- **Personality** — Spotify-Wrapped-style portraits: each burn z-scored against
  the global event-type mix into trait tags + a radar chart.
- **Event Mix** — stacked bars and a burn-by-event-type heatmap across the
  19-label Dust taxonomy (Fire/Spectacle, Live Music, Workshops, etc.).
- **Lexicon** — word cloud of the vocabulary in event titles and camp names.
- **Artists** — search any performer across every burn's music sets.
- **Schedule Shape** — events-per-day-of-burn curves + a time-of-day heatmap.
- **Calendar** — Gantt-style timeline of the whole season with month nav.
- **Continuity** — year-over-year trajectories for burns with multiple years.
- **Data** — sortable, filterable table across every burn.

Every burn name is a drilldown into a dedicated burn page. A global
**All / Official / Other** filter segments burns by whether they appear in the
official Burning Man Regional Network (the events directory plus the recognized
regional groups), with fuzzy name matching to handle subtitle drift like
"Apogaea" vs "Apogaea – Mythos & Mechanica". A current-year filter hides
prior-year duplicates by default.

## Run it locally

```bash
git clone https://github.com/SlyWombat/PlayaScope.git
cd PlayaScope
npm install
npm run fetch-data    # one-time: snapshots all source data into public/data/
npm run dev           # opens http://localhost:5174
```

Why `fetch-data` is required: `data.dust.events` and burningman.org send no
`Access-Control-Allow-Origin` headers, so browsers block live fetches.
`scripts/fetch-data.mjs` is a multi-source orchestrator — it runs each adapter
in `scripts/adapters/` (`dust` for the regionals with full programs,
`bm-directory` for officially-listed burns that don't use Dust, `manual` for
Black Rock City), merges their festival lists, and snapshots the result into
`public/data/` at build time. Re-run it whenever you want fresher data.

### Other commands

```bash
npm run build               # production build into dist/
npm run preview             # preview the production bundle
npm run typecheck           # tsc --noEmit
npm run lint                # eslint
npm run test:e2e            # playwright validation across every tab + drilldown
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
- **`https://burningman.org/global-events-groups/`** — the events directory
  and the Regional Network group pages, scraped weekly for the canonical list
  of officially-sanctioned regional events.

PlayaScope is not affiliated with Burning Man Project or with the Dust
maintainers. All festival data belongs to the regional event organizers who
publish it; this app just makes it easier to look across regions at once.

## License

MIT — see [LICENSE](./LICENSE).

Copyright © 2026 [ElectricRV](https://electricrv.ca) / SlyMega.

Original Dust platform © Damian Tarnawsky, also MIT.
