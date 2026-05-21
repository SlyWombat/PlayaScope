import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '../components/EChart';
import { scheduleShape } from '../data/aggregate';
import type { FestivalBundle } from '../data/loader';
import { hourOfDay, dayOfBurnLocal } from '../lib/timeBins';
import { useIsMobile } from '../lib/useIsMobile';

interface Props {
  bundles: FestivalBundle[];
  onOpenBurn?: (slug: string) => void;
}

export function ScheduleShape({ bundles, onOpenBurn }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  // Mobile: the 60+ burn-toggle wall is collapsed until tapped (issue #13 P2).
  const [showAllBurns, setShowAllBurns] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusBurn, setFocusBurn] = useState<string | null>(null);

  const rows = useMemo(() => scheduleShape(bundles).filter((r) => r.perDay.some((v) => v > 0)), [bundles]);
  // Top-N is a ranking, so this one stays value-sorted; the per-day series
  // legend itself doesn't have a meaningful "alphabetical" axis to scramble.
  const byCount = useMemo(() => [...rows].sort((a, b) => b.perDay.reduce((s, v) => s + v, 0) - a.perDay.reduce((s, v) => s + v, 0)), [rows]);
  const byTitle = useMemo(() => [...rows].sort((a, b) => a.title.localeCompare(b.title)), [rows]);

  const active = useMemo(() => {
    if (selected.size === 0) return byCount.slice(0, 8);
    return byCount.filter((r) => selected.has(r.festival));
  }, [byCount, selected]);

  const maxDay = useMemo(() => Math.max(...active.map((r) => r.perDay.length), 1), [active]);
  const dayAxis = Array.from({ length: maxDay }, (_, i) => t('schedule.day', { n: i - 1 }));

  // ---- Time-of-day heatmap (issue #2) ----
  const heatmapBurn = useMemo(() => {
    if (focusBurn) {
      const b = bundles.find((b) => b.festival.name === focusBurn);
      if (b) return b;
    }
    // Default to the burn with the most events in the current filter.
    return bundles.slice().sort((a, b) => b.schedule.length - a.schedule.length)[0] ?? null;
  }, [bundles, focusBurn]);

  // Defer heatmap compute so the page paints first, then the heavy 24×N grid
  // arrives a beat later. A bit of perceived-perf magic.
  const [computeKey, setComputeKey] = useState(0);
  const [computing, setComputing] = useState(true);
  useEffect(() => {
    setComputing(true);
    const id = setTimeout(() => {
      setComputeKey((k) => k + 1);
      setComputing(false);
    }, 30);
    return () => clearTimeout(id);
  }, [heatmapBurn?.festival.name]);

  const heatmap = useMemo(() => {
    void computeKey; // force re-derive when we explicitly flip the gate
    if (!heatmapBurn) return null;
    const dur = Math.max(1, Math.ceil((new Date(heatmapBurn.festival.end).getTime() - new Date(heatmapBurn.festival.start).getTime()) / (24 * 3600 * 1000)));
    // grid[hour][day] = count, padded with 1 day before (Day -1) and 1 after.
    const days = dur + 2;
    const grid: number[][] = Array.from({ length: 24 }, () => new Array<number>(days).fill(0));
    const sampleByCell = new Map<string, string[]>(); // "h,d" → sample titles
    let totalByHour: number[] = new Array(24).fill(0);
    for (const ev of heatmapBurn.schedule) {
      const occ = ev.occurrence;
      if (!occ?.start_time) continue;
      const h = hourOfDay(occ.start_time, heatmapBurn.festival.timeZone);
      const d = dayOfBurnLocal(occ.start_time, heatmapBurn.festival.start, heatmapBurn.festival.timeZone);
      const dIdx = Math.max(0, Math.min(days - 1, d + 1));
      grid[h]![dIdx]!++;
      totalByHour[h]!++;
      const k = `${h},${dIdx}`;
      const list = sampleByCell.get(k);
      if (!list) sampleByCell.set(k, [ev.title]);
      else if (list.length < 3 && !list.includes(ev.title)) list.push(ev.title);
    }
    const cells: [number, number, number][] = [];
    let maxVal = 0;
    for (let h = 0; h < 24; h++) {
      for (let d = 0; d < days; d++) {
        const v = grid[h]![d]!;
        cells.push([d, h, v]);
        if (v > maxVal) maxVal = v;
      }
    }
    const peakHour = totalByHour.indexOf(Math.max(...totalByHour));
    return { cells, maxVal, days, peakHour, sampleByCell, totalByHour };
  }, [heatmapBurn]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h2>{t('schedule.title')}</h2>
        <div className="sub">{t('schedule.sub', { count: active.length })}</div>
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
        <h2>{t('schedule.pick')}</h2>
        <div className="sub">{t('schedule.pickSub')}</div>
        {isMobile && (
          <button
            onClick={() => setShowAllBurns((v) => !v)}
            style={{ fontSize: 11, marginTop: 4 }}
          >
            {showAllBurns ? t('schedule.hideBurns') : t('schedule.showBurns', { n: byTitle.length })}
          </button>
        )}
        {(!isMobile || showAllBurns) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {byTitle.map((r) => {
            const on = selected.has(r.festival);
            return (
              <span key={r.festival} style={{ display: 'inline-flex' }}>
                <button
                  className={on ? 'primary' : ''}
                  onClick={(e) => {
                    if (e.shiftKey) { onOpenBurn?.(r.festival); return; }
                    const next = new Set(selected);
                    if (on) next.delete(r.festival);
                    else next.add(r.festival);
                    setSelected(next);
                  }}
                  style={{ fontSize: 11, padding: '4px 8px', borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                >
                  {r.title}
                  <span style={{ color: on ? '#1a1208aa' : 'var(--muted)', marginLeft: 6 }}>
                    {r.perDay.reduce((s, v) => s + v, 0)}
                  </span>
                </button>
                {onOpenBurn && (
                  <button
                    onClick={() => onOpenBurn(r.festival)}
                    title={t('schedule.openBurn')}
                    style={{
                      fontSize: 11,
                      padding: '4px 6px',
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                      borderLeft: 'none',
                      color: 'var(--accent)',
                    }}
                  >
                    →
                  </button>
                )}
              </span>
            );
          })}
        </div>
        )}
      </div>

      {heatmapBurn && (
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ margin: 0 }}>{t('schedule.heatmapTitle', { burn: heatmapBurn.festival.title })}</h2>
            <select
              value={heatmapBurn.festival.name}
              onChange={(e) => setFocusBurn(e.target.value)}
              style={{
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            >
              {byTitle.map((r) => (
                <option key={r.festival} value={r.festival}>{r.title}</option>
              ))}
            </select>
          </div>
          <div className="sub">
            {heatmap
              ? t('schedule.peakHour', {
                  hour: `${String(heatmap.peakHour).padStart(2, '0')}:00`,
                  vibe: t(`schedule.snark.hourVibe.${heatmap.peakHour}`, { defaultValue: '' })
                    || t('schedule.snark.noCommentary'),
                })
              : t('schedule.computing', { n: heatmapBurn.schedule.length.toLocaleString() })}
          </div>
          {!heatmap || computing ? (
            <div className="loading" style={{ minHeight: 320 }}>
              <div className="progress">
                <div className="bar" style={{ width: '40%', animation: 'pulse 1.4s ease-in-out infinite' }} />
              </div>
              <div style={{ fontSize: 11 }}>{t('schedule.rendering', { days: Math.max(1, heatmap?.days ?? 0) })}</div>
            </div>
          ) : (
          <EChart
            className="chart tall"
            option={{
              backgroundColor: 'transparent',
              tooltip: {
                position: 'top',
                formatter: ((params: unknown) => {
                  const p = params as { value?: unknown };
                  if (!Array.isArray(p.value)) return '';
                  const [d, h, v] = p.value as [number, number, number];
                  const samples = heatmap.sampleByCell.get(`${h},${d}`) ?? [];
                  return `Day ${d - 1}, ${String(h).padStart(2, '0')}:00<br/><b>${v}</b> event${v === 1 ? '' : 's'}` +
                    (samples.length ? `<br/><span style="color:#999">${samples.join('<br/>')}</span>` : '');
                }) as never,
              },
              grid: isMobile
                ? { left: 44, right: 14, top: 16, bottom: 64 }
                : { left: 50, right: 60, top: 16, bottom: 40 },
              xAxis: {
                type: 'category',
                data: Array.from({ length: heatmap.days }, (_, i) => t('schedule.day', { n: i - 1 })),
                axisLabel: { color: '#8b93a7' },
              },
              yAxis: {
                type: 'category',
                data: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`),
                axisLabel: { color: '#8b93a7', fontSize: 10 },
              },
              visualMap: {
                min: 0,
                max: heatmap.maxVal || 1,
                calculable: true,
                // Horizontal along the bottom on mobile — a vertical scale on
                // the right ate ~17% of a phone's chart width (issue #13 P1).
                ...(isMobile
                  ? { orient: 'horizontal' as const, bottom: 0, left: 'center' as const }
                  : { orient: 'vertical' as const, right: 0, top: 'middle' as const }),
                inRange: { color: ['#161922', '#ff8a3d'] },
                textStyle: { color: '#8b93a7' },
              },
              series: [
                {
                  type: 'heatmap',
                  data: heatmap.cells,
                  emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 1 } },
                  progressive: 600,
                },
              ],
            }}
          />
          )}
        </div>
      )}
    </div>
  );
}

const PALETTE = [
  '#ff8a3d', '#5ad19a', '#5a9dd1', '#f5c542', '#d15a9d',
  '#9d5ad1', '#42a5f5', '#26c6da', '#d4e157', '#ec407a',
];
