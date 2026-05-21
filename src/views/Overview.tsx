import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '../components/EChart';
import { densityByFestival, globalTypeMix } from '../data/aggregate';
import type { FestivalBundle } from '../data/loader';
import type { SanctionFlags } from '../data/sanctioned';
import type { SanctionFilter } from '../App';
import { regionForFestival, REGION_ORDER, REGION_COLORS } from '../lib/region';
import type { RegionLabel } from '../lib/region';
import { useIsMobile } from '../lib/useIsMobile';

interface Props {
  bundles: FestivalBundle[];
  sanction: SanctionFlags | null;
  filter: SanctionFilter;
  onSelectRegion?: (region: RegionLabel) => void;
  onOpenBurn?: (slug: string) => void;
}

export function Overview({ bundles, sanction, filter, onSelectRegion, onOpenBurn }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const density = useMemo(() => densityByFestival(bundles), [bundles]);
  const topByEvents = useMemo(() => [...density].sort((a, b) => b.events - a.events).slice(0, 12), [density]);
  const typeMix = useMemo(() => globalTypeMix(bundles), [bundles]);

  const totals = useMemo(
    () =>
      density.reduce(
        (acc, r) => {
          acc.events += r.events;
          acc.camps += r.camps;
          acc.art += r.art;
          acc.music += r.music;
          return acc;
        },
        { events: 0, camps: 0, art: 0, music: 0 },
      ),
    [density],
  );

  const sanctionedShown = useMemo(() => {
    if (!sanction) return 0;
    let n = 0;
    for (const b of bundles) {
      if (sanction.byFestival.get(b.festival.name)?.is_sanctioned) n++;
    }
    return n;
  }, [bundles, sanction]);

  const regions = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bundles) {
      const region = regionForFestival(b.festival);
      m.set(region, (m.get(region) ?? 0) + 1);
    }
    return REGION_ORDER.filter((r) => m.has(r)).map((r) => [r, m.get(r) ?? 0] as const);
  }, [bundles]);

  return (
    <div className="grid cols-3" style={{ marginBottom: 16 }}>
      <div className="panel kpi">
        <div className="label">{t('overview.burnsShown')}</div>
        <div className="value">{bundles.length}</div>
        <div className="delta">
          {sanction && filter === 'all'
            ? t('overview.deltaMixed', { official: sanctionedShown, other: bundles.length - sanctionedShown })
            : filter === 'sanctioned'
              ? t('overview.deltaOfficial')
              : filter === 'unsanctioned'
                ? t('overview.deltaOther')
                : t('overview.deltaNoData')}
        </div>
      </div>
      <div className="panel kpi">
        <div className="label">{t('overview.events')}</div>
        <div className="value">{totals.events.toLocaleString()}</div>
        <div className="delta">{t('overview.musicSets', { n: totals.music.toLocaleString() })}</div>
      </div>
      <div className="panel kpi">
        <div className="label">{t('overview.campsArt')}</div>
        <div className="value">
          {totals.camps.toLocaleString()} · {totals.art.toLocaleString()}
        </div>
        <div className="delta">{t('overview.aggregate')}</div>
      </div>

      <div className="panel" style={{ gridColumn: 'span 2' }}>
        <h2>{t('overview.topBurns')}</h2>
        <div className="sub">{t('overview.topBurnsSub')}</div>
        <EChart
          className="chart"
          onEvents={onOpenBurn ? {
            click: (p: { dataIndex: number }) => {
              const idx = topByEvents.length - 1 - p.dataIndex;
              const row = topByEvents[idx];
              if (row) onOpenBurn(row.festival);
            },
          } : undefined}
          option={{
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: isMobile ? 96 : 160, right: 24, top: 12, bottom: 24 },
            xAxis: { type: 'value', axisLine: { lineStyle: { color: '#444' } }, splitLine: { lineStyle: { color: '#222' } } },
            yAxis: {
              type: 'category',
              data: topByEvents
                .map((r) => decoratedTitle(r.title, r.festival, sanction))
                .reverse(),
              axisLine: { lineStyle: { color: '#444' } },
              axisLabel: { color: '#8b93a7', fontSize: 11 },
            },
            series: [
              {
                type: 'bar',
                data: topByEvents
                  .map((r) => ({
                    value: r.events,
                    itemStyle: {
                      color: sanction?.byFestival.get(r.festival)?.is_sanctioned ? '#ff8a3d' : '#5a9dd1',
                    },
                  }))
                  .reverse(),
                barWidth: 14,
              },
            ],
          }}
        />
      </div>

      <div className="panel">
        <h2>{t('overview.byRegion')}</h2>
        <div className="sub">{t('overview.byRegionSub')}</div>
        <EChart
          className="chart"
          onEvents={onSelectRegion ? {
            click: (p: { name: string }) => onSelectRegion(p.name as RegionLabel),
          } : undefined}
          option={{
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item' },
            series: [
              {
                type: 'pie',
                radius: ['45%', '70%'],
                avoidLabelOverlap: true,
                data: regions.map(([name, count]) => ({
                  name,
                  value: count,
                  itemStyle: { color: REGION_COLORS[name] },
                })),
                label: { color: '#e6e9ef' },
                itemStyle: { borderColor: '#161922', borderWidth: 2 },
                cursor: 'pointer',
              },
            ],
          }}
        />
      </div>

      <div className="panel" style={{ gridColumn: 'span 3' }}>
        <h2>{t('overview.typeMix')}</h2>
        <div className="sub">{t('overview.typeMixSub')}</div>
        <EChart
          className="chart"
          option={{
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: isMobile ? 110 : 200, right: 24, top: 12, bottom: 24 },
            xAxis: { type: 'value', axisLine: { lineStyle: { color: '#444' } }, splitLine: { lineStyle: { color: '#222' } } },
            yAxis: {
              type: 'category',
              data: [...typeMix].sort((a, b) => a.count - b.count).map((r) => r.label),
              axisLine: { lineStyle: { color: '#444' } },
            },
            series: [
              {
                type: 'bar',
                data: [...typeMix].sort((a, b) => a.count - b.count).map((r) => r.count),
                itemStyle: { color: '#5ad19a' },
                barWidth: 12,
              },
            ],
          }}
        />
      </div>
    </div>
  );
}

function decoratedTitle(title: string, festival: string, sanction: SanctionFlags | null): string {
  if (!sanction) return title;
  return sanction.byFestival.get(festival)?.is_sanctioned ? `★ ${title}` : title;
}

