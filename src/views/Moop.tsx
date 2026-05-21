// MOOP Report (issue #8). 17 trivia tiles.
//
// Named after "Matter Out Of Place", the cardinal sin of leave-no-trace.
// Every tile is precomputed in a single useMemo; tooltips explain the math.
//
// Tile language note: avoid academic terms like "entropy" — burners use plain
// words. "Balanced", "varied", "lopsided" beat "Shannon entropy".

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FestivalBundle } from '../data/loader';
import type { DustEvent } from '../data/types';
import { tokens, bump, topN, normalizeArtistName } from '../lib/tokenize';
import { formatHourCount, formatInt, distanceMeters } from '../lib/format';
import { parseLocalToUtc } from '../data/normalize';
import { attendanceFor, attendanceValue, type AttendanceRecord } from '../data/attendance';
import { countryForFestival, COUNTRY_POPULATION, COUNTRY_OVERRIDE } from '../lib/countries';
import { burnKey } from '../lib/groupByBurn';

interface Props {
  bundles: FestivalBundle[];
  attendance: Map<string, AttendanceRecord>;
  onOpenBurn?: (slug: string) => void;
}

interface Tile {
  title: string;
  value: string;
  hint?: string;
  detail?: string;
  how?: string;
  /** When set, clicking the tile jumps to this burn's page. */
  burnSlug?: string;
}

const FIRE_WORDS = ['burn', 'ember', 'flame', 'spark', 'fire', 'ignite', 'pyre', 'ash', 'phoenix', 'inferno'];

// Drop "TBD", "TBA", placeholder strings before they end up on the leaderboard.
// (Note: Artists view keeps them in for the snark angle; MOOP is "factual trivia.")
const PLACEHOLDER_RE = /^(tbd|tba|t\.b\.d\.?|unknown|various|none|none yet|n\/a|to be announced|to be confirmed|various artists|dj tbd)$/i;

function variety(fractions: number[]): number {
  // Shannon entropy under the hood, but exposed to the UI as "variety" — a
  // 0–1 normalized index (1 = perfectly even spread, 0 = single category).
  let h = 0;
  for (const f of fractions) if (f > 0) h -= f * Math.log2(f);
  const maxH = Math.log2(Math.max(fractions.length, 2));
  return maxH > 0 ? h / maxH : 0;
}

export function Moop({ bundles, attendance, onOpenBurn }: Props) {
  const { t } = useTranslation();
  const tiles = useMemo<Tile[]>(() => {
    const out: Tile[] = [];

    // 1. Longest camp name
    let longestCamp: { name: string; burn: string; slug: string } | null = null;
    for (const b of bundles) {
      for (const c of b.camps) {
        if (!longestCamp || c.name.length > longestCamp.name.length) {
          longestCamp = { name: c.name, burn: b.festival.title, slug: b.festival.name };
        }
      }
    }
    if (longestCamp) {
      out.push({
        title: t('moop.tiles.longestCamp.title'),
        value: t('moop.tiles.longestCamp.value', { n: longestCamp.name.length }),
        detail: `"${longestCamp.name}"`,
        hint: t('moop.tiles.longestCamp.hint', { burn: longestCamp.burn }),
        how: t('moop.tiles.longestCamp.how'),
        burnSlug: longestCamp.slug,
      });
    }

    // 2. Most common event-title word
    const wordCounts = new Map<string, number>();
    let titleSourceCount = 0;
    for (const b of bundles) for (const ev of b.schedule) {
      titleSourceCount++;
      for (const w of tokens(ev.title)) bump(wordCounts, w);
    }
    const topWord = topN(wordCounts, 1)[0];
    if (topWord) {
      out.push({
        title: t('moop.tiles.topWord.title'),
        value: `"${topWord[0]}"`,
        detail: t('moop.tiles.topWord.detail', {
          n: topWord[1].toLocaleString(), titles: titleSourceCount.toLocaleString(),
        }),
        how: t('moop.tiles.topWord.how'),
      });
    }

    // 3. Most-overused camp-name prefix
    const prefixCounts = new Map<string, number>();
    for (const b of bundles) for (const c of b.camps) {
      const first = tokens(c.name)[0];
      if (first) bump(prefixCounts, first);
    }
    const topPrefix = topN(prefixCounts, 3);
    if (topPrefix.length) {
      out.push({
        title: t('moop.tiles.topPrefix.title'),
        value: `"${topPrefix[0]![0]}"`,
        detail: t('moop.tiles.topPrefix.detail', {
          n: topPrefix[0]![1],
          runners: topPrefix.slice(1).map((p) => `${p[0]} (${p[1]})`).join(', '),
        }),
        how: t('moop.tiles.topPrefix.how'),
      });
    }

    // 4. Variety: most-varied vs most-one-track burn
    let widest: { burn: string; v: number; slug: string } | null = null;
    let narrowest: { burn: string; v: number; slug: string } | null = null;
    for (const b of bundles) {
      if (b.schedule.length < 5) continue;
      const typeCounts = new Map<string, number>();
      for (const ev of b.schedule) bump(typeCounts, ev.event_type?.label ?? 'Miscellaneous');
      const total = b.schedule.length;
      const fractions = [...typeCounts.values()].map((c) => c / total);
      const v = variety(fractions);
      if (!widest || v > widest.v) widest = { burn: b.festival.title, v, slug: b.festival.name };
      if (!narrowest || v < narrowest.v) narrowest = { burn: b.festival.title, v, slug: b.festival.name };
    }
    if (widest && narrowest) {
      out.push({
        title: t('moop.tiles.varied.title'),
        value: widest.burn,
        detail: t('moop.tiles.varied.detail', { score: (widest.v * 100).toFixed(0) }),
        how: t('moop.tiles.varied.how'),
        burnSlug: widest.slug,
      });
      out.push({
        title: t('moop.tiles.oneTrack.title'),
        value: narrowest.burn,
        detail: t('moop.tiles.oneTrack.detail', { score: (narrowest.v * 100).toFixed(0) }),
        how: t('moop.tiles.oneTrack.how'),
        burnSlug: narrowest.slug,
      });
    }

    // 5. Most all-day events
    let bestAllDay: { burn: string; n: number; slug: string } | null = null;
    for (const b of bundles) {
      const n = b.schedule.filter((e) => e.all_day).length;
      if (!bestAllDay || n > bestAllDay.n) bestAllDay = { burn: b.festival.title, n, slug: b.festival.name };
    }
    if (bestAllDay && bestAllDay.n > 0) {
      out.push({
        title: t('moop.tiles.allDay.title'),
        value: t('moop.tiles.allDay.value', { n: bestAllDay.n }),
        detail: bestAllDay.burn,
        how: t('moop.tiles.allDay.how'),
        burnSlug: bestAllDay.slug,
      });
    }

    // 6. Events without a location
    let mostLocationless: { burn: string; n: number; slug: string } | null = null;
    const isLocationless = (e: DustEvent) => !e.hosted_by_camp && !e.located_at_art && !e.other_location && !e.otherLocation && !e.camp && !e.art && !e.location;
    for (const b of bundles) {
      const n = b.schedule.filter(isLocationless).length;
      if (!mostLocationless || n > mostLocationless.n) mostLocationless = { burn: b.festival.title, n, slug: b.festival.name };
    }
    if (mostLocationless && mostLocationless.n > 0) {
      out.push({
        title: t('moop.tiles.locationless.title'),
        value: t('moop.tiles.locationless.value', { n: mostLocationless.n }),
        detail: mostLocationless.burn,
        how: t('moop.tiles.locationless.how'),
        burnSlug: mostLocationless.slug,
      });
    }

    // 7. Total event-hours
    let totalHours = 0;
    for (const b of bundles) for (const ev of b.schedule) {
      const occ = ev.occurrence;
      if (!occ?.start_time || !occ?.end_time) continue;
      const ms = parseLocalToUtc(occ.end_time, b.festival.timeZone).getTime() -
        parseLocalToUtc(occ.start_time, b.festival.timeZone).getTime();
      if (ms > 0 && ms < 7 * 24 * 3600 * 1000) totalHours += ms / 3_600_000;
    }
    out.push({
      title: t('moop.tiles.totalHours.title'),
      value: formatHourCount(totalHours),
      detail: t('moop.tiles.totalHours.detail'),
      how: t('moop.tiles.totalHours.how'),
    });

    // 8. "If every burn happened today"
    const totalEvents = bundles.reduce((s, b) => s + b.schedule.length, 0);
    const totalCamps = bundles.reduce((s, b) => s + b.camps.length, 0);
    const totalArt = bundles.reduce((s, b) => s + b.art.length, 0);
    out.push({
      title: t('moop.tiles.ifToday.title'),
      value: t('moop.tiles.ifToday.value', { n: formatInt(totalEvents) }),
      detail: t('moop.tiles.ifToday.detail', { camps: formatInt(totalCamps), art: formatInt(totalArt) }),
      how: t('moop.tiles.ifToday.how'),
    });

    // 9. Weirdest event titles
    const weird = bundles.flatMap((b) => b.schedule.map((e) => ({ title: e.title ?? '', burn: b.festival.title, slug: b.festival.name })))
      .filter((x) => x.title.length > 0)
      .map((x) => ({
        ...x,
        score: x.title.length + (x.title.match(/[^\w\s]/g)?.length ?? 0) * 4,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    if (weird.length) {
      out.push({
        title: t('moop.tiles.weirdest.title'),
        value: weird[0]!.title.slice(0, 80) + (weird[0]!.title.length > 80 ? '…' : ''),
        detail: t('moop.tiles.weirdest.detail', {
          burn: weird[0]!.burn,
          runners: weird.slice(1, 3).map((w) => `"${w.title.slice(0, 40)}…"`).join(' · '),
        }),
        how: t('moop.tiles.weirdest.how'),
        burnSlug: weird[0]!.slug,
      });
    }

    // 10. Most-traveled performer — placeholder-filtered.
    const artistMap = new Map<string, { display: string; burns: Set<string>; sets: number }>();
    for (const b of bundles) for (const m of b.music) {
      const who = m.occurrence?.who?.trim();
      if (!who || PLACEHOLDER_RE.test(who)) continue;
      const k = normalizeArtistName(who);
      if (!k || k.length < 2) continue;
      if (!artistMap.has(k)) artistMap.set(k, { display: who, burns: new Set(), sets: 0 });
      const r = artistMap.get(k)!;
      r.burns.add(b.festival.name);
      r.sets++;
    }
    const topArtist = [...artistMap.values()].sort((a, b) => b.burns.size - a.burns.size || b.sets - a.sets)[0];
    if (topArtist && topArtist.burns.size >= 1) {
      out.push({
        title: t('moop.tiles.traveled.title'),
        value: topArtist.display,
        detail: t('moop.tiles.traveled.detail', {
          burns: t('moop.tiles.traveled.burns', { count: topArtist.burns.size }),
          sets: t('moop.tiles.traveled.sets', { count: topArtist.sets }),
        }),
        how: t('moop.tiles.traveled.how'),
      });
    }

    // Most overlapping date — date with the most simultaneous burns. Track
    // the burn titles per day so the tile can name them on hover.
    const dayBurns = new Map<string, string[]>();
    for (const b of bundles) {
      const tz = b.festival.timeZone || 'UTC';
      const s = parseLocalToUtc(b.festival.start, tz);
      const e = parseLocalToUtc(b.festival.end, tz);
      const d = new Date(s);
      while (d <= e) {
        const k = d.toISOString().slice(0, 10);
        const list = dayBurns.get(k);
        if (list) list.push(b.festival.title);
        else dayBurns.set(k, [b.festival.title]);
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
    let topDay = '';
    let topDayBurns: string[] = [];
    for (const [day, names] of dayBurns) {
      if (names.length > topDayBurns.length) { topDay = day; topDayBurns = names; }
    }
    if (topDay) {
      out.push({
        title: t('moop.tiles.overlap.title'),
        value: t('moop.tiles.overlap.value', { n: topDayBurns.length }),
        detail: t('moop.tiles.overlap.detail', {
          date: topDay, burns: topDayBurns.slice().sort().join(', '),
        }),
        how: t('moop.tiles.overlap.how'),
      });
    }

    // After-dark lexicon — scan event titles for adult-themed vocabulary.
    // Burn culture is body-positive and the "Mature Audiences" event category
    // is real; this is the screenshot-bait tile for the camp group chat.
    // Deliberately excludes ambiguous short stems like "play" (matches
    // "playa"!) and "lap" (matches "overlap").
    const SPICY = [
      'naked', 'nude', 'nudity', 'orgasm', 'orgasmic', 'kink', 'kinky', 'bdsm',
      'rope', 'shibari', 'bondage', 'spank', 'tantra', 'tantric', 'sensual',
      'sexy', 'seduction', 'pleasure', 'polyamory', 'cuddle', 'snuggle',
      'burlesque', 'striptease', 'fetish', 'consent', 'twerk', 'aphrodisiac',
    ];
    const spicyCounts = new Map<string, number>();
    let spicyTitles = 0;
    for (const b of bundles) for (const ev of b.schedule) {
      const lc = (ev.title ?? '').toLowerCase();
      let hit = false;
      for (const w of SPICY) {
        // word-boundary-ish match so "display" doesn't count as "play".
        if (new RegExp(`\\b${w}`, 'i').test(lc)) { bump(spicyCounts, w); hit = true; }
      }
      if (hit) spicyTitles++;
    }
    const topSpicy = topN(spicyCounts, 5);
    if (topSpicy.length) {
      out.push({
        title: t('moop.tiles.afterDark.title'),
        value: `"${topSpicy[0]![0]}" — ${topSpicy[0]![1]}×`,
        detail: t('moop.tiles.afterDark.detail', {
          n: spicyTitles,
          runners: topSpicy.slice(1).map((s) => `${s[0]} (${s[1]})`).join(', '),
        }),
        how: t('moop.tiles.afterDark.how', { terms: SPICY.length }),
      });
    }

    // NSFW #2 — Spiciest burn: most "Mature Audiences" programming. This is a
    // real dust event-type category, so the data is honest, the snark free.
    let spiciestBurn: { burn: string; n: number; total: number; slug: string } | null = null;
    let matureTotal = 0;
    for (const b of bundles) {
      const n = b.schedule.filter((e) => e.event_type?.label === 'Mature Audiences').length;
      matureTotal += n;
      if (!spiciestBurn || n > spiciestBurn.n) {
        spiciestBurn = { burn: b.festival.title, n, total: b.schedule.length, slug: b.festival.name };
      }
    }
    if (spiciestBurn && spiciestBurn.n > 0) {
      const pct = spiciestBurn.total > 0 ? (spiciestBurn.n / spiciestBurn.total) * 100 : 0;
      out.push({
        title: t('moop.tiles.spiciest.title'),
        value: spiciestBurn.burn,
        detail: t('moop.tiles.spiciest.detail', {
          n: spiciestBurn.n, pct: pct.toFixed(0), total: matureTotal,
        }),
        how: t('moop.tiles.spiciest.how'),
        burnSlug: spiciestBurn.slug,
      });
    }

    // NSFW #3 — Camps with a reputation: theme-camp names that match the
    // adult-themed word list. Burner camp names are an art form.
    const spicyCamps: string[] = [];
    for (const b of bundles) for (const c of b.camps) {
      const lc = (c.name ?? '').toLowerCase();
      if (SPICY.some((w) => new RegExp(`\\b${w}`, 'i').test(lc))) spicyCamps.push(c.name);
    }
    if (spicyCamps.length) {
      const sample = spicyCamps.slice().sort().slice(0, 5);
      out.push({
        title: t('moop.tiles.reputation.title'),
        value: t('moop.tiles.reputation.value', { n: spicyCamps.length }),
        detail: t(spicyCamps.length > 5 ? 'moop.tiles.reputation.detailMore' : 'moop.tiles.reputation.detail', {
          sample: sample.map((n) => `"${n}"`).join(', '),
        }),
        how: t('moop.tiles.reputation.how', { terms: SPICY.length }),
      });
    }

    // 15 / 16. Fire-named vs not.
    // Substring match on the lowercased title catches glued names like
    // "PortalBurn", "SideBurn", "Frostburn", "Sunburn", "Firefly".
    const fire: string[] = [];
    const notFire: string[] = [];
    for (const b of bundles) {
      const lc = b.festival.title.toLowerCase();
      if (FIRE_WORDS.some((w) => lc.includes(w))) fire.push(b.festival.title);
      else notFire.push(b.festival.title);
    }
    out.push({
      title: t('moop.tiles.fire.title'),
      value: t('moop.tiles.fire.value', { n: fire.length, total: bundles.length }),
      detail: fire.slice(0, 6).join(', ') + (fire.length > 6 ? '…' : ''),
      how: t('moop.tiles.fire.how', { words: FIRE_WORDS.join(', ') }),
    });
    out.push({
      title: t('moop.tiles.notFire.title'),
      value: t('moop.tiles.notFire.value', { n: notFire.length, total: bundles.length }),
      detail: notFire.slice(0, 6).join(', ') + (notFire.length > 6 ? '…' : ''),
      how: t('moop.tiles.notFire.how'),
    });

    // 17. Longest art walk (snark tile)
    let bestArtBurn: { burn: string; meters: number; count: number; slug: string } | null = null;
    for (const b of bundles) {
      const pts = b.art
        .map((a) => {
          // Art coordinates arrive as a JSON-string pin: '{"lat":N,"lng":N}'.
          if (!a.pin) return null;
          try {
            const p = JSON.parse(a.pin) as { lat?: number; lng?: number };
            if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
            return { lat: p.lat as number, long: p.lng as number };
          } catch {
            return null;
          }
        })
        .filter((p): p is { lat: number; long: number } => p != null);
      if (pts.length < 3) continue;
      const visited = new Set<number>();
      let current = 0;
      visited.add(0);
      let total = 0;
      while (visited.size < pts.length) {
        let bestNext = -1;
        let bestD = Infinity;
        for (let i = 0; i < pts.length; i++) {
          if (visited.has(i)) continue;
          const d = distanceMeters(pts[current]!, pts[i]!);
          if (d < bestD) { bestD = d; bestNext = i; }
        }
        if (bestNext < 0) break;
        total += bestD;
        visited.add(bestNext);
        current = bestNext;
      }
      if (!bestArtBurn || total > bestArtBurn.meters) {
        bestArtBurn = { burn: b.festival.title, meters: total, count: pts.length, slug: b.festival.name };
      }
    }
    if (bestArtBurn) {
      const km = bestArtBurn.meters / 1000;
      const steps = Math.round(bestArtBurn.meters / 0.762);
      const bananas = Math.round(bestArtBurn.meters / 0.18);
      out.push({
        title: t('moop.tiles.artWalk.title'),
        value: t('moop.tiles.artWalk.value', { km: km.toFixed(2) }),
        detail: t('moop.tiles.artWalk.detail', {
          burn: bestArtBurn.burn, count: bestArtBurn.count,
          steps: steps.toLocaleString(), bananas: bananas.toLocaleString(),
        }),
        how: t('moop.tiles.artWalk.how'),
        burnSlug: bestArtBurn.slug,
      });
    }

    // Burners per capita — top 5 countries by home-burn attendance ÷ national
    // population. Black Rock City is excluded: it's an international
    // pilgrimage, not a country's own regional event.
    const byCountry = new Map<string, number>();
    for (const b of bundles) {
      if (b.festival.name.startsWith('black-rock-city')) continue;
      // Market override (Midburn -> Middle East) opts in here; the geographic
      // resolver is the fallback.
      const country = COUNTRY_OVERRIDE[burnKey(b.festival.name)] ?? countryForFestival(b.festival);
      if (!country) continue;
      const att = attendanceValue(attendanceFor(b.festival.name, attendance));
      if (att <= 0) continue;
      byCountry.set(country, (byCountry.get(country) ?? 0) + att);
    }
    const perCapita = [...byCountry.entries()]
      .map(([country, total]) => {
        const pop = COUNTRY_POPULATION[country];
        return pop ? { country, ratio: Math.round(pop / total) } : null;
      })
      .filter((x): x is { country: string; ratio: number } => x != null)
      .sort((a, b) => a.ratio - b.ratio)
      .slice(0, 5);
    if (perCapita.length) {
      const top = perCapita[0]!;
      out.push({
        title: t('moop.tiles.perCapita.title'),
        value: t('moop.tiles.perCapita.value', {
          country: top.country,
          ratio: top.ratio.toLocaleString(),
        }),
        detail: t('moop.tiles.perCapita.detail', {
          country: top.country,
          ratio: top.ratio.toLocaleString(),
          list: perCapita.map((p) => `${p.country} (1:${p.ratio.toLocaleString()})`).join(' · '),
        }),
        how: t('moop.tiles.perCapita.how'),
      });
    }

    // Shuffle (Fisher-Yates) so the MOOP page lands in a fresh order on every
    // visit — makes the trivia feel larger and more varied than it is.
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
    // `t` in deps so tile copy re-translates on a language switch.
  }, [bundles, attendance, t]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h2>{t('moop.title')}</h2>
        <div className="sub">
          <em>{t('moop.tagline')}</em>{' '}
          {t('moop.sub', { tiles: tiles.length, burns: bundles.length })}
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
          gap: 12,
        }}
      >
        {tiles.map((t) => {
          const clickable = t.burnSlug && onOpenBurn;
          return (
            <div
              key={t.title}
              className="panel"
              onClick={() => clickable && onOpenBurn!(t.burnSlug!)}
              style={{
                cursor: clickable ? 'pointer' : 'default',
                borderColor: 'var(--border)',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => { if (clickable) e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onMouseLeave={(e) => { if (clickable) e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h2 style={{ fontSize: 11, marginBottom: 4 }}>{t.title}</h2>
                {clickable && <span style={{ color: 'var(--accent)', fontSize: 14 }}>→</span>}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', lineHeight: 1.2, marginBottom: 6 }}>
                {t.value}
              </div>
              {t.detail && <div style={{ fontSize: 12, color: 'var(--text)' }}>{t.detail}</div>}
              {t.hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t.hint}</div>}
              {t.how && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                  {t.how}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
