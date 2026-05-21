import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '../components/EChart';
import { eventTypeMix } from '../data/aggregate';
import { EVENT_TYPE_LABELS } from '../data/types';
import type { FestivalBundle } from '../data/loader';
import { useIsMobile } from '../lib/useIsMobile';

interface Props {
  bundles: FestivalBundle[];
  onOpenBurn?: (slug: string) => void;
}

type Mode = 'fractions' | 'counts';

export function TypeMix({ bundles, onOpenBurn }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<Mode>('fractions');
  const rows = useMemo(() => eventTypeMix(bundles).filter((r) => r.total > 0), [bundles]);
  // Alphabetical by title — this chart isn't a ranking, so a stable A→Z
  // axis is more useful than a value-sorted one that scrambles on every
  // filter toggle. See memory feedback_chart_ordering.
  const sorted = useMemo(() => [...rows].sort((a, b) => a.title.localeCompare(b.title)), [rows]);

  const series = useMemo(
    () =>
      EVENT_TYPE_LABELS.map((label, i) => ({
        name: label,
        type: 'bar' as const,
        stack: 'mix',
        emphasis: { focus: 'series' as const },
        data: sorted.map((r) => (mode === 'fractions' ? r.fractions[label] : r.counts[label])),
        itemStyle: { color: TYPE_COLORS[i % TYPE_COLORS.length] },
      })),
    [sorted, mode],
  );

  const heatmapData = useMemo(() => {
    const out: [number, number, number][] = [];
    sorted.forEach((row, x) => {
      EVENT_TYPE_LABELS.forEach((label, y) => {
        out.push([x, y, mode === 'fractions' ? row.fractions[label] : row.counts[label]]);
      });
    });
    return out;
  }, [sorted, mode]);

  const heatmapMax = useMemo(() => {
    let m = 0;
    for (const row of sorted) {
      for (const label of EVENT_TYPE_LABELS) {
        const v = mode === 'fractions' ? row.fractions[label] : row.counts[label];
        if (v > m) m = v;
      }
    }
    return m || 1;
  }, [sorted, mode]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2>{t('typeMix.title')}</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={mode === 'fractions' ? 'primary' : ''} onClick={() => setMode('fractions')}>
              {t('typeMix.modeFractions')}
            </button>
            <button className={mode === 'counts' ? 'primary' : ''} onClick={() => setMode('counts')}>
              {t('typeMix.modeCounts')}
            </button>
          </div>
        </div>
        <div className="sub">{t('typeMix.sub', { n: sorted.length })}</div>
        <EChart
          className="chart tall"
          onEvents={onOpenBurn ? {
            click: (p: { dataIndex: number; componentType: string }) => {
              if (p.componentType !== 'series') return;
              const burn = sorted[p.dataIndex];
              if (burn) onOpenBurn(burn.festival);
            },
          } : undefined}
          option={{
            backgroundColor: 'transparent',
            tooltip: {
              trigger: 'axis',
              axisPointer: { type: 'shadow' },
              valueFormatter: (raw) => {
                const v = typeof raw === 'number' ? raw : Number(raw);
                return mode === 'fractions' ? `${(v * 100).toFixed(1)}%` : v.toLocaleString();
              },
            },
            legend: { type: 'scroll', textStyle: { color: '#8b93a7' }, top: 0 },
            grid: { left: isMobile ? 44 : 60, right: 24, top: 40, bottom: isMobile ? 60 : 100 },
            // On mobile a 60+ burn x-axis is illegible; a dataZoom slider lets
            // the user scrub through ~10 burns at a time at a readable size.
            dataZoom: isMobile
              ? [{ type: 'slider', startValue: 0, endValue: Math.min(9, sorted.length - 1), bottom: 8, height: 18 }]
              : undefined,
            xAxis: {
              type: 'category',
              data: sorted.map((r) => r.title),
              axisLabel: { rotate: 60, color: '#8b93a7', interval: 0, fontSize: 10 },
              axisLine: { lineStyle: { color: '#444' } },
            },
            yAxis: {
              type: 'value',
              // Fractions stack to 1.0 — cap the axis at 100% so it doesn't
              // auto-scale to a meaningless 120% (issue #15).
              max: mode === 'fractions' ? 1 : undefined,
              axisLabel:
                mode === 'fractions'
                  ? { formatter: (v: number) => `${Math.round(v * 100)}%` }
                  : undefined,
              axisLine: { lineStyle: { color: '#444' } },
              splitLine: { lineStyle: { color: '#222' } },
            },
            series,
          }}
        />
      </div>

      <div className="panel">
        <h2>{t('typeMix.heatmap')}</h2>
        <div className="sub">{t('typeMix.heatmapSub')}</div>
        <EChart
          className="chart tall"
          option={{
            backgroundColor: 'transparent',
            tooltip: {
              position: 'top',
              formatter: ((params: unknown) => {
                const p = params as { value?: unknown };
                const v = Array.isArray(p.value) ? (p.value as [number, number, number]) : null;
                if (!v) return '';
                const [x, y, val] = v;
                const burn = sorted[x];
                const label = EVENT_TYPE_LABELS[y];
                if (!burn || !label) return '';
                const txt = mode === 'fractions' ? `${(val * 100).toFixed(1)}%` : val.toLocaleString();
                return `${burn.title}<br/>${label}<br/><b>${txt}</b>`;
              }) as never,
            },
            grid: { left: isMobile ? 120 : 220, right: isMobile ? 24 : 60, top: 16, bottom: isMobile ? 60 : 100 },
            dataZoom: isMobile
              ? [{ type: 'slider', startValue: 0, endValue: Math.min(9, sorted.length - 1), bottom: 8, height: 18 }]
              : undefined,
            xAxis: {
              type: 'category',
              data: sorted.map((r) => r.title),
              axisLabel: { rotate: 60, color: '#8b93a7', interval: 0, fontSize: 10 },
              splitArea: { show: false },
            },
            yAxis: {
              type: 'category',
              data: [...EVENT_TYPE_LABELS],
              axisLabel: { color: '#8b93a7', fontSize: 11 },
              splitArea: { show: false },
            },
            visualMap: {
              min: 0,
              max: heatmapMax,
              calculable: true,
              orient: 'vertical',
              right: 0,
              top: 'middle',
              inRange: { color: ['#161922', '#ff8a3d'] },
              textStyle: { color: '#8b93a7' },
            },
            series: [
              {
                type: 'heatmap',
                data: heatmapData,
                emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 1 } },
                progressive: 1000,
              },
            ],
          }}
        />
      </div>
    </div>
  );
}

const TYPE_COLORS = [
  '#ff8a3d', '#5ad19a', '#5a9dd1', '#d15a9d', '#f5c542',
  '#9d5ad1', '#42a5f5', '#26a69a', '#ef5350', '#ab47bc',
  '#66bb6a', '#ffa726', '#7e57c2', '#26c6da', '#d4e157',
  '#8d6e63', '#78909c', '#ec407a', '#5c6bc0',
];
