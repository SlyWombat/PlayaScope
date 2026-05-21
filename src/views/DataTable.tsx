import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { densityByFestival, type DensityRow } from '../data/aggregate';
import type { FestivalBundle } from '../data/loader';
import type { SanctionFlags } from '../data/sanctioned';
import {
  attendanceFor, formatAttendance, attendanceValue,
  type AttendanceRecord,
} from '../data/attendance';

interface Props {
  bundles: FestivalBundle[];
  sanction: SanctionFlags | null;
  attendance: Map<string, AttendanceRecord>;
  onOpenBurn?: (slug: string) => void;
}

type SortKey = keyof Pick<DensityRow, 'title' | 'events' | 'camps' | 'art' | 'music' | 'duration' | 'region' | 'timeZone'> | 'sanctioned' | 'attendees';

export function DataTable({ bundles, sanction, attendance, onOpenBurn }: Props) {
  const { t } = useTranslation();
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
      if (sortKey === 'attendees') {
        const av = attendanceValue(attendanceFor(a.festival, attendance));
        const bv = attendanceValue(attendanceFor(b.festival, attendance));
        return desc ? bv - av : av - bv;
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return desc ? bv - av : av - bv;
      return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    });
    return out;
  }, [filtered, sortKey, desc, sanctionLookup, attendance]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setDesc(!desc);
    else {
      setSortKey(k);
      setDesc(true);
    }
  };

  // Auto-scraped attendance is 'estimated'; only curated figures are 'reported'.
  const attLabel = (att: AttendanceRecord | null) =>
    !att || att.estimate == null ? t('attendance.na') : t(`attendance.${att.confidence}`);

  const headerCell = (k: SortKey, label: string, numeric = false) => (
    <th
      onClick={() => toggleSort(k)}
      style={{ cursor: 'pointer', textAlign: numeric ? 'right' : 'left', userSelect: 'none' }}
      title={t('data.sortHint')}
    >
      {label}
      {sortKey === k ? (desc ? ' ▼' : ' ▲') : ''}
    </th>
  );

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>
          {t('data.allBurns')} <span style={{ color: 'var(--text)' }}>({sorted.length})</span>
        </h2>
        <input
          placeholder={t('data.filterPlaceholder')}
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
              {headerCell('sanctioned', t('data.colBm'), true)}
              {headerCell('title', t('data.colBurn'))}
              {headerCell('region', t('data.colRegion'))}
              {headerCell('timeZone', t('data.colTimezone'))}
              {headerCell('duration', t('data.colDays'), true)}
              {headerCell('events', t('data.colEvents'), true)}
              {headerCell('camps', t('data.colCamps'), true)}
              {headerCell('art', t('data.colArt'), true)}
              {headerCell('music', t('data.colMusic'), true)}
              {headerCell('attendees', t('data.colAttendees'), true)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const sanctionInfo = sanctionLookup?.get(r.festival);
              const official = sanctionInfo?.is_sanctioned ?? false;
              const att = attendanceFor(r.festival, attendance);
              return (
                <tr
                  key={r.festival}
                  onClick={() => onOpenBurn?.(r.festival)}
                  style={onOpenBurn ? { cursor: 'pointer' } : undefined}
                >
                  <td className="num" title={sanctionInfo?.officialName ?? t('data.notOfficial')}>
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
                  <td
                    className="num"
                    title={att ? `${attLabel(att)}${att.source ? ' — ' + att.source : ''}` : t('data.noAttendance')}
                    style={{ color: att ? 'var(--text)' : 'var(--muted)' }}
                  >
                    {formatAttendance(att)}
                    {att && att.confidence !== 'reported' && (
                      <span style={{ color: 'var(--muted)', fontSize: 9, marginLeft: 3 }}>{t('data.estMarker')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
