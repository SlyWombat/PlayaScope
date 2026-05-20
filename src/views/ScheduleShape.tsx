import { useMemo, useState } from 'react';
import { EChart } from '../components/EChart';
import { scheduleShape } from '../data/aggregate';
import type { FestivalBundle } from '../data/loader';

interface Props {
  bundles: FestivalBundle[];
}

export function ScheduleShape({ bundles }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rows = useMemo(() => scheduleShape(bundles).filter((r) => r.perDay.some((v) => v > 0)), [bundles]);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.perDay.reduce((s, v) => s + v, 0) - a.perDay.reduce((s, v) => s + v, 0)), [rows]);

  const active = useMemo(() => {
    if (selected.size === 0) return sorted.slice(0, 8);
    return sorted.filter((r) => selected.has(r.festival));
  }, [sorted, selected]);

  const maxDay = useMemo(() => Math.max(...active.map((r) => r.perDay.length), 1), [active]);
  const dayAxis = Array.from({ length: maxDay }, (_, i) => `Day ${i - 1}`);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h2>Schedule shape — events per day of burn</h2>
        <div className="sub">
          X axis is days from the festival's local start (Day -1 = pre-burn, Day 0 = opening). Y axis is event count per day.
          Showing {active.length} burn{active.length === 1 ? '' : 's'}.
        </div>
        <EChart
          className="chart tall"
          option={{
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis' },
            legend: { type: 'scroll', textStyle: { color: '#8b93a7' }, top: 0 },
            grid: { left: 60, right: 24, top: 40, bottom: 40 },
            xAxis: {
              type: 'category',
              data: dayAxis,
              axisLine: { lineStyle: { color: '#444' } },
              axisLabel: { color: '#8b93a7' },
            },
            yAxis: {
              type: 'value',
              axisLine: { lineStyle: { color: '#444' } },
              splitLine: { lineStyle: { color: '#222' } },
              axisLabel: { color: '#8b93a7' },
            },
            series: active.map((r, i) => ({
              name: r.title,
              type: 'line',
              smooth: true,
              symbol: 'circle',
              symbolSize: 6,
              data: r.perDay,
              itemStyle: { color: PALETTE[i % PALETTE.length] },
              lineStyle: { width: 2 },
              emphasis: { focus: 'series' as const },
            })),
          }}
        />
      </div>

      <div className="panel">
        <h2>Pick burns to compare</h2>
        <div className="sub">Click to toggle. Empty selection = top 8 by event volume.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {sorted.map((r) => {
            const on = selected.has(r.festival);
            return (
              <button
                key={r.festival}
                className={on ? 'primary' : ''}
                onClick={() => {
                  const next = new Set(selected);
                  if (on) next.delete(r.festival);
                  else next.add(r.festival);
                  setSelected(next);
                }}
                style={{ fontSize: 11, padding: '4px 8px' }}
              >
                {r.title}
                <span style={{ color: on ? '#1a1208aa' : 'var(--muted)', marginLeft: 6 }}>
                  {r.perDay.reduce((s, v) => s + v, 0)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const PALETTE = [
  '#ff8a3d', '#5ad19a', '#5a9dd1', '#f5c542', '#d15a9d',
  '#9d5ad1', '#42a5f5', '#26c6da', '#d4e157', '#ec407a',
];
