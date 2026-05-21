import { useMemo, useState } from 'react';
import { densityByFestival, type DensityRow } from '../data/aggregate';
import type { FestivalBundle } from '../data/loader';
import type { SanctionFlags } from '../data/sanctioned';

interface Props {
  bundles: FestivalBundle[];
  sanction: SanctionFlags | null;
  onOpenBurn?: (slug: string) => void;
}

type SortKey = keyof Pick<DensityRow, 'title' | 'events' | 'camps' | 'art' | 'music' | 'duration' | 'region' | 'timeZone'> | 'sanctioned';

export function DataTable({ bundles, sanction, onOpenBurn }: Props) {
  const rows = useMemo(() => densityByFestival(bundles), [bundles]);
  const sanctionLookup = sanction?.byFestival;
  const [sortKey, setSortKey] = useState<SortKey>('events');
  const [desc, setDesc] = useState(true);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f
      ? rows.filter(
          (r) =>
            r.title.toLowerCase().includes(f) ||
            r.region.toLowerCase().includes(f) ||
            r.festival.toLowerCase().includes(f),
        )
      : rows;
  }, [rows, filter]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      if (sortKey === 'sanctioned') {
        const av = sanctionLookup?.get(a.festival)?.is_sanctioned ? 1 : 0;
        const bv = sanctionLookup?.get(b.festival)?.is_sanctioned ? 1 : 0;
        return desc ? bv - av : av - bv;
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return desc ? bv - av : av - bv;
      return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    });
    return out;
  }, [filtered, sortKey, desc, sanctionLookup]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setDesc(!desc);
    else {
      setSortKey(k);
      setDesc(true);
    }
  };

  const headerCell = (k: SortKey, label: string, numeric = false) => (
    <th
      onClick={() => toggleSort(k)}
      style={{ cursor: 'pointer', textAlign: numeric ? 'right' : 'left', userSelect: 'none' }}
      title="click to sort"
    >
      {label}
      {sortKey === k ? (desc ? ' ▼' : ' ▲') : ''}
    </th>
  );

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>
          All burns <span style={{ color: 'var(--text)' }}>({sorted.length})</span>
        </h2>
        <input
          placeholder="filter title / region / slug…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            flex: 1,
            background: 'var(--panel-2)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            borderRadius: 6,
            padding: '6px 10px',
            fontFamily: 'inherit',
            fontSize: 13,
          }}
        />
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {headerCell('sanctioned', 'BM', true)}
              {headerCell('title', 'Burn')}
              {headerCell('region', 'Region')}
              {headerCell('timeZone', 'Timezone')}
              {headerCell('duration', 'Days', true)}
              {headerCell('events', 'Events', true)}
              {headerCell('camps', 'Camps', true)}
              {headerCell('art', 'Art', true)}
              {headerCell('music', 'Music', true)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const sanctionInfo = sanctionLookup?.get(r.festival);
              const official = sanctionInfo?.is_sanctioned ?? false;
              return (
                <tr
                  key={r.festival}
                  onClick={() => onOpenBurn?.(r.festival)}
                  style={onOpenBurn ? { cursor: 'pointer' } : undefined}
                >
                  <td className="num" title={sanctionInfo?.officialName ?? 'not on official BM list'}>
                    {official ? (
                      <span style={{ color: '#ff8a3d', fontWeight: 700 }}>★</span>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ color: onOpenBurn ? 'var(--accent)' : 'var(--text)' }}>{r.title}</td>
                  <td>{r.region}</td>
                  <td style={{ color: 'var(--muted)' }}>{r.timeZone}</td>
                  <td className="num">{r.duration}</td>
                  <td className="num">{r.events.toLocaleString()}</td>
                  <td className="num">{r.camps.toLocaleString()}</td>
                  <td className="num">{r.art.toLocaleString()}</td>
                  <td className="num">{r.music.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
