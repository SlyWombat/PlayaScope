// Artist tracker (issue #5). Pulls performer names from music.json
// occurrence.who (the actual field — not music.artist as the original
// types.ts suggested) and indexes appearances across every burn.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FestivalBundle } from '../data/loader';
import { normalizeArtistName } from '../lib/tokenize';
import { formatDateInZone, formatKm, distanceMeters } from '../lib/format';

interface Props {
  bundles: FestivalBundle[];
}

interface Appearance {
  burnSlug: string;
  burnTitle: string;
  startISO: string;
  endISO: string;
  timeZone: string;
  setTitle?: string;
  location?: string;
  camp?: string;
  lat: number;
  long: number;
}

interface ArtistRow {
  /** Display name — picks the most common original-casing observed across appearances. */
  display: string;
  /** Normalized key for indexing. */
  key: string;
  appearances: Appearance[];
}

export function Artists({ bundles }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const PLACEHOLDER_RE = /^(tbd|tba|t\.b\.d\.?|unknown|various|none|none yet|n\/a|to be announced|to be confirmed|various artists|dj tbd)$/i;

  const { index, leaderboard, marathonNote, conflictNote, placeholderNote } = useMemo(() => {
    const map = new Map<string, ArtistRow>();
    const displayCount = new Map<string, Map<string, number>>(); // key -> displayName -> count

    for (const b of bundles) {
      for (const m of b.music) {
        const who = m.occurrence?.who?.trim();
        if (!who) continue;
        const key = normalizeArtistName(who);
        if (!key) continue;
        if (!map.has(key)) {
          map.set(key, { display: who, key, appearances: [] });
          displayCount.set(key, new Map());
        }
        const dcm = displayCount.get(key)!;
        dcm.set(who, (dcm.get(who) ?? 0) + 1);
        map.get(key)!.appearances.push({
          burnSlug: b.festival.name,
          burnTitle: b.festival.title,
          startISO: m.occurrence.start_time,
          endISO: m.occurrence.end_time,
          timeZone: b.festival.timeZone || 'UTC',
          setTitle: m.title ?? undefined,
          location: m.location ?? undefined,
          camp: m.camp ?? undefined,
          // Directory festivals have no coords, but they also have no music,
          // so this path only ever sees dust festivals. NaN keeps the type
          // simple and makes any distance calc harmlessly skip.
          lat: b.festival.lat ?? NaN,
          long: b.festival.long ?? NaN,
        });
      }
    }

    // Pick the most common original-casing display name per artist.
    for (const [k, row] of map) {
      const dcm = displayCount.get(k)!;
      let best = row.display;
      let bestN = 0;
      for (const [name, n] of dcm) {
        if (n > bestN) { best = name; bestN = n; }
      }
      row.display = best;
    }

    // Leaderboard by distinct burn count (a single artist with 30 sets at
    // one burn isn't "touring"; 5 sets at 5 different burns is).
    const rows = [...map.values()].map((r) => {
      const burns = new Set(r.appearances.map((a) => a.burnSlug));
      return { ...r, distinctBurns: burns.size };
    });
    rows.sort((a, b) => b.distinctBurns - a.distinctBurns || b.appearances.length - a.appearances.length);
    const leaderboard = rows.slice(0, 50);

    // Most-traveled artist quip.
    const top = rows[0];
    let marathonNote = '';
    if (top && top.distinctBurns >= 2) {
      const burns = [...new Set(top.appearances.map((a) => a.burnTitle))];
      let maxKm = 0;
      for (let i = 0; i < top.appearances.length; i++) {
        for (let j = i + 1; j < top.appearances.length; j++) {
          const ai = top.appearances[i]!;
          const aj = top.appearances[j]!;
          if (ai.burnSlug === aj.burnSlug) continue;
          const d = distanceMeters({ lat: ai.lat, long: ai.long }, { lat: aj.lat, long: aj.long });
          if (d > maxKm) maxKm = d;
        }
      }
      marathonNote = t('artists.snark.marathon', {
        display: top.display,
        n: burns.length,
        list: burns.join(', '),
        distance: maxKm > 0 ? t('artists.snark.marathonDist', { km: formatKm(maxKm) }) : '',
      });
    }

    // Date-overlap conflict scan — same artist booked at two burns whose
    // date ranges overlap. Either a data error or impressive teleportation.
    const conflicts: string[] = [];
    for (const r of rows) {
      const byBurn = new Map<string, Appearance>();
      for (const a of r.appearances) {
        if (!byBurn.has(a.burnSlug)) byBurn.set(a.burnSlug, a);
      }
      const arr = [...byBurn.values()];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const ai = arr[i]!, aj = arr[j]!;
          const aiStart = new Date(ai.startISO).getTime();
          const ajStart = new Date(aj.startISO).getTime();
          if (Math.abs(aiStart - ajStart) < 24 * 3600 * 1000) {
            conflicts.push(t('artists.snark.conflict', {
              display: r.display, burnA: ai.burnTitle, burnB: aj.burnTitle,
            }));
          }
        }
      }
      if (conflicts.length >= 5) break;
    }
    const conflictNote = conflicts.length > 0 ? conflicts.slice(0, 5) : null;

    // Snark: if a placeholder name (TBD / TBA / etc.) ends up topping the
    // distinct-burn-count, surface that as a fun stat instead of hiding it.
    let placeholderNote: string | null = null;
    const topPlaceholder = rows.find((r) => PLACEHOLDER_RE.test(r.display.trim()));
    if (topPlaceholder) {
      const rank = rows.indexOf(topPlaceholder) + 1;
      if (rank <= 5) {
        placeholderNote = t('artists.snark.placeholder', {
          display: topPlaceholder.display,
          rank,
          burns: topPlaceholder.distinctBurns,
          sets: topPlaceholder.appearances.length,
        });
      }
    }

    return { index: rows, leaderboard, marathonNote, conflictNote, placeholderNote };
    // `t` in deps so the generated notes re-translate on a language switch.
  }, [bundles, t]);

  const queryNorm = normalizeArtistName(query);
  const searchResults = useMemo(() => {
    if (!queryNorm) return null;
    return index
      .filter((r) => r.key.includes(queryNorm) || queryNorm.includes(r.key))
      .slice(0, 20);
  }, [index, queryNorm]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h2>{t('artists.search')}</h2>
        <div className="sub">{t('artists.searchSub', { n: index.length.toLocaleString() })}</div>
        <input
          autoFocus
          placeholder={t('artists.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--panel-2)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            borderRadius: 6,
            padding: '8px 12px',
            fontFamily: 'inherit',
            fontSize: 14,
            marginTop: 4,
          }}
        />
        {searchResults && (
          <div style={{ marginTop: 12 }}>
            {searchResults.length === 0 && <div className="sub">{t('artists.noMatch')}</div>}
            {searchResults.map((r) => (
              <details key={r.key} style={{ marginBottom: 6, background: 'var(--panel-2)', borderRadius: 6, padding: '8px 12px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  {r.display} <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11, marginLeft: 8 }}>
                    {t('artists.burnCount', { count: r.distinctBurns })} · {t('artists.setCount', { count: r.appearances.length })}
                  </span>
                </summary>
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table className="data">
                    <thead>
                      <tr><th>{t('artists.colBurn')}</th><th>{t('artists.colDateTime')}</th><th>{t('artists.colCamp')}</th><th>{t('artists.colSetTitle')}</th></tr>
                    </thead>
                    <tbody>
                      {r.appearances.sort((a, b) => a.startISO.localeCompare(b.startISO)).map((a, i) => (
                        <tr key={i}>
                          <td>{a.burnTitle}</td>
                          <td>{formatDateInZone(a.startISO, a.timeZone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                          <td>{a.camp ?? '—'}</td>
                          <td>{a.setTitle ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {marathonNote && (
        <div className="panel">
          <h2>{t('artists.touring')}</h2>
          <div className="sub">{marathonNote}</div>
        </div>
      )}

      {placeholderNote && (
        <div className="panel" style={{ borderColor: 'var(--warn)' }}>
          <h2>{t('artists.suspicious')}</h2>
          <div className="sub">{placeholderNote}</div>
        </div>
      )}

      <div className="panel">
        <h2>{t('artists.leaderboard')}</h2>
        <div className="sub">{t('artists.leaderboardSub')}</div>
        <div className="table-wrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>{t('artists.colArtist')}</th>
                <th className="num">{t('artists.colBurns')}</th>
                <th className="num">{t('artists.colSets')}</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r, i) => (
                <tr key={r.key} onClick={() => setQuery(r.display)} style={{ cursor: 'pointer' }}>
                  <td style={{ color: 'var(--muted)' }}>{i + 1}</td>
                  <td style={{ fontWeight: i < 3 ? 700 : 500, color: i < 3 ? 'var(--accent)' : 'var(--text)' }}>{r.display}</td>
                  <td className="num">{r.distinctBurns}</td>
                  <td className="num">{r.appearances.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {conflictNote && (
        <div className="panel">
          <h2>{t('artists.collisions')}</h2>
          <div className="sub">{t('artists.collisionsSub')}</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--muted)' }}>
            {conflictNote.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
