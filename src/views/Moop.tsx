// MOOP Report (issue #8). 17 trivia tiles.
//
// Named after "Matter Out Of Place", the cardinal sin of leave-no-trace.
// Every tile is precomputed in a single useMemo; tooltips explain the math.
//
// Tile language note: avoid academic terms like "entropy" — burners use plain
// words. "Balanced", "varied", "lopsided" beat "Shannon entropy".

import { useMemo } from 'react';
import type { FestivalBundle } from '../data/loader';
import type { DustEvent } from '../data/types';
import { tokens, bump, topN, normalizeArtistName } from '../lib/tokenize';
import { formatHourCount, formatInt, distanceMeters } from '../lib/format';
import { parseLocalToUtc } from '../data/normalize';

interface Props {
  bundles: FestivalBundle[];
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

export function Moop({ bundles, onOpenBurn }: Props) {
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
        title: 'Longest camp name',
        value: `${longestCamp.name.length} characters`,
        detail: `"${longestCamp.name}"`,
        hint: `at ${longestCamp.burn}`,
        how: 'Longest camps[].name across all burns. Click to open the burn.',
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
        title: 'Most-used event-title word',
        value: `"${topWord[0]}"`,
        detail: `${topWord[1].toLocaleString()} occurrences across ${titleSourceCount.toLocaleString()} event titles`,
        how: 'Lowercased event titles, stop-words removed, frequency counted.',
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
        title: 'Most-overused camp name prefix',
        value: `"${topPrefix[0]![0]}"`,
        detail: `${topPrefix[0]![1]}× — runner-ups: ${topPrefix.slice(1).map((p) => `${p[0]} (${p[1]})`).join(', ')}`,
        how: 'First word of each camp name, stop-words excluded.',
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
        title: 'Most varied program',
        value: widest.burn,
        detail: `Spread evenly across event types — variety score ${(widest.v * 100).toFixed(0)}/100`,
        how: 'Even split across all 19 event categories = top score. Click to open the burn.',
        burnSlug: widest.slug,
      });
      out.push({
        title: 'Most one-track program',
        value: narrowest.burn,
        detail: `Programming dominated by a single category — variety score ${(narrowest.v * 100).toFixed(0)}/100`,
        how: 'Lowest spread across event categories (≥5 events).',
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
        title: 'Hardest-working idle program',
        value: `${bestAllDay.n} all-day events`,
        detail: bestAllDay.burn,
        how: 'Count of events with all_day === true.',
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
        title: 'Most "find it yourself" events',
        value: `${mostLocationless.n} events with no location`,
        detail: mostLocationless.burn,
        how: 'No hosting camp, no host art, no other_location.',
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
      title: 'Total programming this season',
      value: formatHourCount(totalHours),
      detail: 'Sum of every scheduled event duration, across every burn in the current filter.',
      how: 'Σ (end_time − start_time).',
    });

    // 8. "If every burn happened today"
    const totalEvents = bundles.reduce((s, b) => s + b.schedule.length, 0);
    const totalCamps = bundles.reduce((s, b) => s + b.camps.length, 0);
    const totalArt = bundles.reduce((s, b) => s + b.art.length, 0);
    out.push({
      title: 'If every burn happened today',
      value: `${formatInt(totalEvents)} events`,
      detail: `${formatInt(totalCamps)} camps · ${formatInt(totalArt)} art pieces. Society would not survive.`,
      how: 'Summed across the current filter.',
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
        title: 'Weirdest event title',
        value: weird[0]!.title.slice(0, 80) + (weird[0]!.title.length > 80 ? '…' : ''),
        detail: `at ${weird[0]!.burn}. Runners-up: ${weird.slice(1, 3).map((w) => `"${w.title.slice(0, 40)}…"`).join(' · ')}`,
        how: 'Title length + 4× punctuation count.',
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
        title: 'Most-traveled performer',
        value: topArtist.display,
        detail: `${topArtist.burns.size} burn${topArtist.burns.size === 1 ? '' : 's'} · ${topArtist.sets} set${topArtist.sets === 1 ? '' : 's'}`,
        how: 'Distinct burns played, placeholder names (TBD/TBA/unknown) excluded.',
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
        title: 'Most-overlapped date',
        value: `${topDayBurns.length} burns at once`,
        detail: `On ${topDay}: ${topDayBurns.slice().sort().join(', ')}.`,
        how: 'Count of festivals whose date range includes each UTC day.',
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
        title: 'After-dark lexicon',
        value: `"${topSpicy[0]![0]}" — ${topSpicy[0]![1]}×`,
        detail:
          `${spicyTitles} event titles got spicy. Also overheard: ` +
          topSpicy.slice(1).map((s) => `${s[0]} (${s[1]})`).join(', ') +
          '. The playa contains multitudes.',
        how: `Event titles matched against an adult-themed word list (${SPICY.length} terms). Bring an open mind.`,
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
        title: 'Spiciest burn',
        value: spiciestBurn.burn,
        detail: `${spiciestBurn.n} Mature Audiences events (${pct.toFixed(0)}% of its program). ${matureTotal} across the whole season. Pace yourself.`,
        how: 'Count of events whose event_type is "Mature Audiences" — a real dust category.',
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
        title: 'Camps with a reputation',
        value: `${spicyCamps.length} camps`,
        detail:
          `Theme camps whose names raise an eyebrow — e.g. ${sample.map((n) => `"${n}"`).join(', ')}` +
          `${spicyCamps.length > 5 ? ', and more' : ''}. You know which neighbourhood to find. Or avoid.`,
        how: `Camp names matched against the same ${SPICY.length}-term adult word list.`,
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
      title: 'Burns named after fire',
      value: `${fire.length} / ${bundles.length}`,
      detail: fire.slice(0, 6).join(', ') + (fire.length > 6 ? '…' : ''),
      how: `Title contains: ${FIRE_WORDS.join(', ')}.`,
    });
    out.push({
      title: 'Burns NOT named after fire',
      value: `${notFire.length} / ${bundles.length}`,
      detail: notFire.slice(0, 6).join(', ') + (notFire.length > 6 ? '…' : ''),
      how: 'Complement of the above.',
    });

    // 17. Longest art walk (snark tile)
    let bestArtBurn: { burn: string; meters: number; count: number; slug: string } | null = null;
    for (const b of bundles) {
      const pts = b.art
        .map((a) => ({ lat: a.location?.gps_latitude, long: a.location?.gps_longitude }))
        .filter((p): p is { lat: number; long: number } => Number.isFinite(p.lat) && Number.isFinite(p.long));
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
        title: 'Longest art walk',
        value: `${km.toFixed(2)} km`,
        detail: `${bestArtBurn.burn} — ${bestArtBurn.count} art pieces, ${steps.toLocaleString()} steps, ${bananas.toLocaleString()} bananas end-to-end`,
        how: 'Shortest path connecting every GPS-located art piece. 1 step ≈ 0.762 m, 1 banana ≈ 0.18 m.',
        burnSlug: bestArtBurn.slug,
      });
    }

    return out;
  }, [bundles]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h2>The MOOP Report</h2>
        <div className="sub">
          <em>Matter Out Of Place.</em> {tiles.length} trivia tiles across {bundles.length} burns in current filter.
          Tiles with an <strong style={{ color: 'var(--accent)' }}>→</strong> arrow open the relevant burn page.
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
          gap: 12,
        }}
      >
        {tiles.map((t, i) => {
          const clickable = t.burnSlug && onOpenBurn;
          return (
            <div
              key={i}
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
