// Year-over-year continuity (issue #4). Groups burns by slug-prefix
// (apogaea-2025, apogaea-2026 → "apogaea") and shows multi-year trajectories.
//
// Note: the dataset's active filter drops most prior-year burns, so we
// receive an `allBundles` prop (unfiltered) to find historical years even
// when the user is filtering to "Official" or "Other".

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '../components/EChart';
import { useIsMobile } from '../lib/useIsMobile';
import type { FestivalBundle } from '../data/loader';
import { groupByBurn, yearFromSlug, withMultipleYears } from '../lib/groupByBurn';

interface Props {
  /** Currently visible burns (after sanction filter). */
  bundles: FestivalBundle[];
  /** Full set, so we can still pair `-2025` with `-2026` even when one year is filtered out. */
  allBundles: FestivalBundle[];
  onOpenBurn?: (slug: string) => void;
}

interface YearStats {
  year: number;
  events: number;
  camps: number;
  art: number;
  music: number;
  title: string;
  slug: string;
}

function yearFromBundle(b: FestivalBundle): number {
  const y = yearFromSlug(b.festival.name);
  if (y) return y;
  return new Date(b.festival.start).getUTCFullYear();
}

export function Continuity({ bundles, allBundles, onOpenBurn }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const grouped = useMemo(() => {
    const visible = new Set(bundles.map((b) => b.festival.name));
    // Only show groups where ≥1 of the years is currently visible (respect filter)
    // but build trend lines from the full set.
    const all = withMultipleYears(groupByBurn(allBundles));
    return all
      .filter((g) => g.years.some((b) => visible.has(b.festival.name)))
      .map((g) => {
        const years: YearStats[] = g.years.map((b) => ({
          year: yearFromBundle(b),
          events: b.schedule.length,
          camps: b.camps.length,
          art: b.art.length,
          music: b.music.length,
          title: b.festival.title,
          slug: b.festival.name,
        })).sort((a, b) => a.year - b.year);
        const first = years[0]!;
        const last = years[years.length - 1]!;
        const pctChange = first.events > 0 ? ((last.events - first.events) / first.events) * 100 : null;
        return { key: g.key, display: last.title, years, pctChange };
      });
  }, [bundles, allBundles]);

  const alpha = useMemo(() => [...grouped].sort((a, b) => a.display.localeCompare(b.display)), [grouped]);

  const debut = useMemo(() => {
    // Burns whose only year in the dataset is the most recent year present.
    const allGroups = groupByBurn(allBundles);
    const maxYear = Math.max(...allBundles.map((b) => yearFromBundle(b)));
    return allGroups
      .filter((g) => g.years.length === 1 && yearFromBundle(g.years[0]!) === maxYear)
      .map((g) => g.years[0]!)
      .sort((a, b) => a.festival.title.localeCompare(b.festival.title));
  }, [allBundles]);

  const growers = useMemo(() =>
    [...grouped].filter((b) => b.pctChange !== null).sort((a, b) => (b.pctChange ?? 0) - (a.pctChange ?? 0)).slice(0, 10),
  [grouped]);
  const shrinkers = useMemo(() =>
    [...grouped].filter((b) => b.pctChange !== null).sort((a, b) => (a.pctChange ?? 0) - (b.pctChange ?? 0)).slice(0, 10),
  [grouped]);

  if (alpha.length === 0) {
    return (
      <div className="panel">
        <h2>{t('continuity.title')}</h2>
        <div className="sub">{t('continuity.emptySub', { total: allBundles.length, multi: grouped.length })}</div>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h2>{t('continuity.trajectories')}</h2>
        <div className="sub">{t('continuity.trajectoriesSub', { n: alpha.length })}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
        {alpha.map((b) => (
          <div key={b.key} className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              {onOpenBurn ? (
                <button
                  onClick={() => onOpenBurn(b.years[b.years.length - 1]!.slug)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', padding: 0, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
                >
                  {b.display} →
                </button>
              ) : (
                <strong>{b.display}</strong>
              )}
              {b.pctChange !== null && (
                <span style={{
                  fontSize: 12,
                  color: b.pctChange >= 0 ? 'var(--good)' : '#ff8a8a',
                  fontWeight: 700,
                }}>
                  {b.pctChange >= 0 ? '+' : ''}{b.pctChange.toFixed(0)}%
                </span>
              )}
            </div>
            <EChart
              style={{ width: '100%', height: isMobile ? 240 : 180 }}
              option={{
                backgroundColor: 'transparent',
                tooltip: { trigger: 'axis' },
                grid: { left: 40, right: 12, top: 32, bottom: 24 },
                legend: { top: 0, textStyle: { color: '#8b93a7', fontSize: 10 } },
                xAxis: {
                  type: 'category',
                  data: b.years.map((y) => String(y.year)),
                  axisLine: { lineStyle: { color: '#444' } },
                  axisLabel: { color: '#8b93a7' },
                },
                yAxis: {
                  type: 'value',
                  axisLine: { lineStyle: { color: '#444' } },
                  splitLine: { lineStyle: { color: '#222' } },
                  axisLabel: { color: '#8b93a7' },
                },
                series: [
                  { name: t('continuity.seriesEvents'), type: 'line', data: b.years.map((y) => y.events), itemStyle: { color: '#ff8a3d' }, smooth: true },
                  { name: t('continuity.seriesCamps'),  type: 'line', data: b.years.map((y) => y.camps),  itemStyle: { color: '#5ad19a' }, smooth: true },
                  { name: t('continuity.seriesArt'),    type: 'line', data: b.years.map((y) => y.art),    itemStyle: { color: '#5a9dd1' }, smooth: true },
                  { name: t('continuity.seriesMusic'),  type: 'line', data: b.years.map((y) => y.music),  itemStyle: { color: '#d15a9d' }, smooth: true },
                ],
              }}
            />
          </div>
        ))}
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <h2>{t('continuity.growers')}</h2>
          <div className="sub">{t('continuity.byPctChange')}</div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{t('continuity.colBurn')}</th><th className="num">{t('continuity.colDelta')}</th></tr></thead>
              <tbody>
                {growers.map((g) => (
                  <tr key={g.key}>
                    <td>{g.display}</td>
                    <td className="num" style={{ color: 'var(--good)' }}>+{g.pctChange!.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <h2>{t('continuity.shrinkers')}</h2>
          <div className="sub">{t('continuity.byPctChange')}</div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{t('continuity.colBurn')}</th><th className="num">{t('continuity.colDelta')}</th></tr></thead>
              <tbody>
                {shrinkers.map((g) => (
                  <tr key={g.key}>
                    <td>{g.display}</td>
                    <td className="num" style={{ color: g.pctChange! < 0 ? '#ff8a8a' : 'var(--muted)' }}>
                      {g.pctChange! >= 0 ? '+' : ''}{g.pctChange!.toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {debut.length > 0 && (
        <div className="panel">
          <h2>{t('continuity.debut')}</h2>
          <div className="sub">{t('continuity.debutSub')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {debut.map((b) => (
              <span key={b.festival.name} style={{
                fontSize: 11,
                padding: '4px 8px',
                background: 'var(--panel-2)',
                borderRadius: 6,
                border: '1px solid var(--border)',
              }}>
                {b.festival.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
