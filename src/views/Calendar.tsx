// Travel planner / Calendar view (issue #3). Horizontal Gantt of every
// active burn for the year. ECharts has no first-class Gantt, so we use a
// `custom` series with a renderItem callback drawing the date-range bars.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '../components/EChart';
import type { FestivalBundle } from '../data/loader';
import type { SanctionFlags } from '../data/sanctioned';
import { regionForFestival, REGION_COLORS, REGION_ORDER } from '../lib/region';
import { useIsMobile } from '../lib/useIsMobile';
import { parseLocalToUtc } from '../data/normalize';
import { formatDateInZone, formatDateRangeInZone } from '../lib/format';

interface Props {
  bundles: FestivalBundle[];
  sanction: SanctionFlags | null;
  onOpenBurn?: (slug: string) => void;
}

const MONTH_MS = 30 * 24 * 3600 * 1000;

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

interface Row {
  bundle: FestivalBundle;
  startMs: number;
  endMs: number;
  region: string;
}

export function Calendar({ bundles, sanction, onOpenBurn }: Props) {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const [regionFilter, setRegionFilter] = useState<Set<string>>(new Set());
  // Windowed view: 3 months wide, anchored on a movable start.
  const [windowStart, setWindowStart] = useState<Date>(() => {
    // Default to the month before today so today is roughly centered in a 3mo window.
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  });
  const [showFullYear, setShowFullYear] = useState(false);

  const rows = useMemo<Row[]>(() => {
    return bundles.map((b) => {
      const tz = b.festival.timeZone || 'UTC';
      return {
        bundle: b,
        startMs: parseLocalToUtc(b.festival.start, tz).getTime(),
        endMs: parseLocalToUtc(b.festival.end, tz).getTime(),
        region: regionForFestival(b.festival),
      };
    });
  }, [bundles]);

  // Alphabetical Y-axis (not a ranking).
  const visible = useMemo(() => {
    const filtered = regionFilter.size === 0 ? rows : rows.filter((r) => regionFilter.has(r.region));
    return [...filtered].sort((a, b) => a.bundle.festival.title.localeCompare(b.bundle.festival.title));
  }, [rows, regionFilter]);

  const regionsPresent = useMemo(() => {
    const s = new Set(rows.map((r) => r.region));
    return REGION_ORDER.filter((r) => s.has(r));
  }, [rows]);

  const { minMs, maxMs } = useMemo(() => {
    if (showFullYear) {
      if (visible.length === 0) return { minMs: Date.now(), maxMs: Date.now() + 365 * 24 * 3600 * 1000 };
      let lo = Infinity, hi = -Infinity;
      for (const r of visible) {
        lo = Math.min(lo, r.startMs);
        hi = Math.max(hi, r.endMs);
      }
      return { minMs: lo - 10 * 24 * 3600 * 1000, maxMs: hi + 10 * 24 * 3600 * 1000 };
    }
    // 3-month window starting at windowStart.
    const start = windowStart.getTime();
    return { minMs: start, maxMs: start + 3 * MONTH_MS };
  }, [visible, windowStart, showFullYear]);

  // Burns intersecting the visible window — show only these on the timeline
  // so the labels don't get crushed by 60+ rows when we're showing 3 months.
  const inWindow = useMemo(() => {
    if (showFullYear) return visible;
    return visible.filter((r) => r.endMs >= minMs && r.startMs <= maxMs);
  }, [visible, minMs, maxMs, showFullYear]);

  // Snark stats: dry spell + most-overlapped day.
  const stats = useMemo(() => {
    if (visible.length === 0) return null;
    const sorted = [...visible].sort((a, b) => a.startMs - b.startMs);
    // Longest gap between consecutive (end_i, start_{i+1}) when end_i < start_{i+1}.
    let longestGapDays = 0, gapFrom = '', gapTo = '';
    for (let i = 0; i < sorted.length - 1; i++) {
      const endI = sorted[i]!.endMs;
      const startJ = sorted[i + 1]!.startMs;
      if (startJ > endI) {
        const days = Math.floor((startJ - endI) / (24 * 3600 * 1000));
        if (days > longestGapDays) {
          longestGapDays = days;
          gapFrom = formatDateInZone(new Date(endI), 'UTC');
          gapTo = formatDateInZone(new Date(startJ), 'UTC');
        }
      }
    }
    // Most-overlapped day across visible.
    const dayCounts = new Map<string, number>();
    for (const r of visible) {
      const d = new Date(r.startMs);
      while (d.getTime() <= r.endMs) {
        const k = d.toISOString().slice(0, 10);
        dayCounts.set(k, (dayCounts.get(k) ?? 0) + 1);
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
    let topDay = '', topCount = 0;
    for (const [k, v] of dayCounts) if (v > topCount) { topCount = v; topDay = k; }
    return { longestGapDays, gapFrom, gapTo, topDay, topCount };
  }, [visible]);

  const seriesData = useMemo(() => {
    return inWindow.map((r, i) => ({
      name: r.bundle.festival.title,
      value: [
        i,
        r.startMs,
        r.endMs,
        r.region,
        sanction?.byFestival.get(r.bundle.festival.name)?.is_sanctioned ? 1 : 0,
        r.bundle.festival.name,
        r.bundle.schedule.length,
      ],
      itemStyle: { color: REGION_COLORS[r.region as keyof typeof REGION_COLORS] ?? '#888' },
    }));
  }, [inWindow, sanction]);

  const today = Date.now();

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>{t('calendar.title')}</h2>
            <div className="sub">
              {t('calendar.sub', {
                shown: inWindow.length,
                total: visible.length,
                regions: [...new Set(inWindow.map((r) => r.region))].length,
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              {!showFullYear && (
                <>
                  <button onClick={() => setWindowStart(new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() - 1, 1)))} style={{ fontSize: 12 }}>‹</button>
                  <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", minWidth: 160, textAlign: 'center' }}>
                    {new Intl.DateTimeFormat(i18n.language, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(windowStart)} – {new Intl.DateTimeFormat(i18n.language, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(windowStart.getTime() + 3 * MONTH_MS - 24 * 3600 * 1000))}
                  </span>
                  <button onClick={() => setWindowStart(new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + 1, 1)))} style={{ fontSize: 12 }}>›</button>
                  <button onClick={() => {
                    const now = new Date();
                    setWindowStart(startOfMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))));
                  }} style={{ fontSize: 11, marginLeft: 6 }}>{t('calendar.navToday')}</button>
                </>
              )}
              <button onClick={() => setShowFullYear(!showFullYear)} style={{ fontSize: 11, marginLeft: 12 }} className={showFullYear ? 'primary' : ''}>
                {showFullYear ? t('calendar.showWindow') : t('calendar.showYear')}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <span style={{ color: 'var(--muted)', fontSize: 11, alignSelf: 'center', marginRight: 4 }}>{t('calendar.regionsLabel')}</span>
            {regionsPresent.map((r) => {
              const on = regionFilter.has(r);
              return (
                <button
                  key={r}
                  className={on ? 'primary' : ''}
                  style={{
                    fontSize: 11, padding: '3px 8px',
                    borderColor: REGION_COLORS[r],
                  }}
                  onClick={() => {
                    const next = new Set(regionFilter);
                    if (on) next.delete(r); else next.add(r);
                    setRegionFilter(next);
                  }}
                >
                  {r}
                </button>
              );
            })}
            {regionFilter.size > 0 && (
              <button style={{ fontSize: 11 }} onClick={() => setRegionFilter(new Set())}>{t('calendar.clear')}</button>
            )}
          </div>
        </div>
        <EChart
          style={{ width: '100%', height: Math.max(380, inWindow.length * 22 + 80) }}
          onEvents={onOpenBurn ? {
            click: (p: { value?: unknown }) => {
              if (!Array.isArray(p.value)) return;
              const slug = p.value[5] as string;
              if (slug) onOpenBurn(slug);
            },
          } : undefined}
          option={{
            backgroundColor: 'transparent',
            tooltip: {
              formatter: ((params: unknown) => {
                const p = params as { name: string; value: unknown[] };
                const [, s, e, region, official, , events] = p.value as [number, number, number, string, number, string, number];
                return `<strong>${official ? '★ ' : ''}${p.name}</strong><br/>` +
                  `${formatDateRangeInZone(new Date(s).toISOString(), new Date(e).toISOString(), 'UTC')}<br/>` +
                  `${region} · ${events} events`;
              }) as never,
            },
            grid: { left: isMobile ? 92 : 200, right: 24, top: 24, bottom: 40 },
            xAxis: {
              type: 'time',
              min: minMs,
              max: maxMs,
              axisLine: { lineStyle: { color: '#444' } },
              axisLabel: { color: '#8b93a7' },
              splitLine: { lineStyle: { color: '#222' } },
            },
            yAxis: {
              type: 'category',
              data: inWindow.map((r) => r.bundle.festival.title),
              axisLabel: { color: '#8b93a7', fontSize: 10 },
              axisLine: { show: false },
              splitLine: { show: false },
            },
            series: [
              {
                type: 'custom',
                renderItem: ((_params: unknown, api: { value: (i: number) => number | string; coord: (a: number[]) => number[]; size: (a: number[]) => number[] }) => {
                  const cat = api.value(0) as number;
                  const start = api.coord([api.value(1) as number, cat]);
                  const end = api.coord([api.value(2) as number, cat]);
                  const heightCat = api.size([0, 1])[1] ?? 14;
                  const h = Math.max(6, heightCat * 0.55);
                  const official = api.value(4) === 1;
                  return {
                    type: 'group',
                    children: [
                      {
                        type: 'rect',
                        shape: { x: start[0]!, y: start[1]! - h / 2, width: Math.max(2, end[0]! - start[0]!), height: h },
                        style: { fill: official ? '#ff8a3d' : '#5a9dd1', stroke: '#161922' },
                      },
                      ...(official ? [{
                        type: 'text' as const,
                        style: {
                          text: '★',
                          x: start[0]! - 8,
                          y: start[1]! + 3,
                          textAlign: 'right' as const,
                          fill: '#ff8a3d',
                          font: '11px Inter',
                        },
                      }] : []),
                    ],
                  };
                }) as never,
                encode: { x: [1, 2], y: 0 },
                data: seriesData,
                markLine: {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: '#fff', width: 1.5, type: 'dashed' },
                  label: { color: '#fff', formatter: t('calendar.todayLine'), position: 'insideEndTop' },
                  data: [{ xAxis: today }],
                },
              },
            ],
          }}
        />
      </div>

      {stats && (
        <div className="panel">
          <h2>{t('calendar.snark')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, fontSize: 12 }}>
            {stats.longestGapDays > 0 && (
              <div>
                <div style={{ color: 'var(--muted)', fontSize: 11 }}>{t('calendar.drySpell')}</div>
                <div style={{ fontSize: 18, color: 'var(--accent)', fontWeight: 700 }}>{t('calendar.days', { n: stats.longestGapDays })}</div>
                <div>{stats.gapFrom} → {stats.gapTo}</div>
              </div>
            )}
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>{t('calendar.overlapDay')}</div>
              <div style={{ fontSize: 18, color: 'var(--accent)', fontWeight: 700 }}>{t('calendar.burns', { n: stats.topCount })}</div>
              <div>{stats.topDay}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
