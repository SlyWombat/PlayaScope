// Per-burn landing page (drilldown target). Reached via hash routing:
// `#burn=<slug>` activates this view regardless of the current tab.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '../components/EChart';
import type { FestivalBundle } from '../data/loader';
import type { SanctionFlags } from '../data/sanctioned';
import { scheduleShape } from '../data/aggregate';
import { EVENT_TYPE_LABELS, canonicalEventTypeLabel } from '../data/types';
import type { EventTypeLabel } from '../data/types';
import { formatDateRangeInZone, formatInt } from '../lib/format';
import { regionForFestival, REGION_COLORS } from '../lib/region';
import { tokens, bump, topN, normalizeArtistName } from '../lib/tokenize';
import { hourOfDay, dayOfBurnLocal } from '../lib/timeBins';
import { useIsMobile } from '../lib/useIsMobile';
import {
  attendanceFor, formatAttendance, type AttendanceRecord,
} from '../data/attendance';

interface Props {
  slug: string;
  allBundles: FestivalBundle[];
  sanction: SanctionFlags | null;
  attendance: Map<string, AttendanceRecord>;
  onBack: () => void;
}

export function BurnDetail({ slug, allBundles, sanction, attendance, onBack }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const bundle = allBundles.find((b) => b.festival.name === slug);

  // Header bits — must guard against unknown slugs.
  if (!bundle) {
    return (
      <div className="panel">
        <button onClick={onBack} style={{ marginBottom: 12 }}>{t('burnDetail.back')}</button>
        <h2>{t('burnDetail.notFound')}</h2>
        <div className="sub">{t('burnDetail.notFoundSub', { slug })}</div>
      </div>
    );
  }

  const f = bundle.festival;
  const region = regionForFestival(f);
  const regionColor = REGION_COLORS[region as keyof typeof REGION_COLORS];
  const sanctionInfo = sanction?.byFestival.get(f.name);

  // Auto-scraped attendance is 'estimated'; only curated figures are 'reported'.
  const attLabel = (a: AttendanceRecord | null) =>
    !a || a.estimate == null ? t('attendance.na') : t(`attendance.${a.confidence}`);

  // Event-type mix for this burn.
  const mix = useMemo(() => {
    const counts = Object.fromEntries(EVENT_TYPE_LABELS.map((l) => [l, 0])) as Record<EventTypeLabel, number>;
    for (const ev of bundle.schedule) {
      counts[canonicalEventTypeLabel(ev.event_type?.label)]++;
    }
    return EVENT_TYPE_LABELS
      .map((l) => ({ label: l, count: counts[l], pct: bundle.schedule.length > 0 ? counts[l] / bundle.schedule.length : 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [bundle]);

  // Schedule shape: per-day curve.
  const perDay = useMemo(() => {
    const row = scheduleShape([bundle])[0]!;
    return row.perDay.map((v, i) => ({ day: i - 1, count: v }));
  }, [bundle]);

  // Time-of-day distribution.
  const byHour = useMemo(() => {
    const arr = new Array(24).fill(0);
    for (const ev of bundle.schedule) {
      const t = ev.occurrence?.start_time;
      if (!t) continue;
      arr[hourOfDay(t, f.timeZone)]++;
    }
    return arr;
  }, [bundle, f.timeZone]);

  // Top event-title words (excluding stopwords).
  const topWords = useMemo(() => {
    const m = new Map<string, number>();
    for (const ev of bundle.schedule) for (const w of tokens(ev.title)) bump(m, w);
    return topN(m, 12);
  }, [bundle]);

  // Top performers playing this burn.
  const topPerformers = useMemo(() => {
    const m = new Map<string, { display: string; sets: number }>();
    for (const ms of bundle.music) {
      const who = ms.occurrence?.who?.trim();
      if (!who || /^(tbd|tba|unknown|various|n\/a|none|none yet|to be announced)$/i.test(who)) continue;
      const k = normalizeArtistName(who);
      if (!k) continue;
      if (!m.has(k)) m.set(k, { display: who, sets: 0 });
      m.get(k)!.sets++;
    }
    return [...m.values()].sort((a, b) => b.sets - a.sets).slice(0, 12);
  }, [bundle]);

  // Day-of-burn × hour heatmap data.
  const heatmapCells = useMemo(() => {
    const dur = Math.max(1, perDay.length);
    const grid: number[][] = Array.from({ length: 24 }, () => new Array<number>(dur).fill(0));
    for (const ev of bundle.schedule) {
      const occ = ev.occurrence;
      if (!occ?.start_time) continue;
      const h = hourOfDay(occ.start_time, f.timeZone);
      const d = dayOfBurnLocal(occ.start_time, f.start, f.timeZone);
      const dIdx = Math.max(0, Math.min(dur - 1, d + 1));
      grid[h]![dIdx]!++;
    }
    const cells: [number, number, number][] = [];
    let maxVal = 0;
    for (let h = 0; h < 24; h++) for (let d = 0; d < dur; d++) {
      const v = grid[h]![d]!;
      cells.push([d, h, v]);
      if (v > maxVal) maxVal = v;
    }
    return { cells, maxVal, days: dur };
  }, [bundle, perDay.length, f.timeZone, f.start]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel" style={{ borderColor: regionColor }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <button onClick={onBack} style={{ marginBottom: 12, fontSize: 11 }}>{t('burnDetail.back')}</button>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>
              {sanctionInfo?.is_sanctioned && <span style={{ color: 'var(--accent)' }}>★ </span>}
              {f.title}
            </h1>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
              {f.region} · {f.timeZone}
            </div>
            <div style={{ marginTop: 6, fontSize: 14 }}>
              {formatDateRangeInZone(f.start, f.end, f.timeZone)}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ ...chipStyle, background: regionColor, color: '#1a1208' }}>{region}</span>
              {sanctionInfo?.is_sanctioned && (
                <span style={{ ...chipStyle, background: 'rgba(255,138,61,0.2)', color: 'var(--accent)' }}>
                  {t('burnDetail.officialBmRegional')}
                </span>
              )}
              {!sanctionInfo?.is_sanctioned && sanction?.index && (
                <span style={{ ...chipStyle, background: 'var(--panel-2)', color: 'var(--muted)' }}>
                  {t('burnDetail.unsanctioned')}
                </span>
              )}
              {f.website && (
                <a
                  href={f.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...chipStyle, background: 'var(--panel-2)', color: 'var(--text)', textDecoration: 'none' }}
                >
                  {t('burnDetail.officialSite')}
                </a>
              )}
            </div>
            {f.programDepth === 'dates-only' && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                {f.source === 'manual'
                  ? t('burnDetail.datesOnlyManual')
                  : t('burnDetail.datesOnlyDirectory')}
              </div>
            )}
            {(() => {
              const att = attendanceFor(f.name, attendance);
              return (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                  {t('burnDetail.attendanceLabel')}{' '}
                  <strong style={{ color: att?.estimate != null ? 'var(--text)' : 'var(--muted)' }}>
                    {formatAttendance(att)}
                  </strong>
                  {att?.estimate != null && (
                    <>
                      {' · '}
                      {att.sourceUrl ? (
                        <a href={att.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                          {attLabel(att)}{att.year ? ` (${att.year})` : ''} ↗
                        </a>
                      ) : (
                        <span>{attLabel(att)}{att.year ? ` (${att.year})` : ''}</span>
                      )}
                      {att.source && <span style={{ display: 'block', marginTop: 2, fontSize: 11 }}>{att.source}</span>}
                    </>
                  )}
                </div>
              );
            })()}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, auto)',
              gap: isMobile ? 12 : 24,
            }}
          >
            <Kpi label={t('burnDetail.kpiEvents')} value={bundle.schedule.length} />
            <Kpi label={t('burnDetail.kpiCamps')} value={bundle.camps.length} />
            <Kpi label={t('burnDetail.kpiArt')} value={bundle.art.length} />
            <Kpi label={t('burnDetail.kpiMusic')} value={bundle.music.length} />
          </div>
        </div>
      </div>

      {bundle.schedule.length === 0 && (
        <div className="panel">
          <div className="sub">{t('burnDetail.noEvents')}</div>
        </div>
      )}

      <div className="grid cols-2">
        <div className="panel">
          <h2>{t('burnDetail.scheduleShape')}</h2>
          <div className="sub">{t('burnDetail.scheduleShapeSub')}</div>
          <EChart
            style={{ width: '100%', height: 220 }}
            option={{
              backgroundColor: 'transparent',
              tooltip: { trigger: 'axis' },
              grid: { left: 36, right: 16, top: 16, bottom: 30 },
              xAxis: { type: 'category', data: perDay.map((d) => t('burnDetail.day', { n: d.day })), axisLine: { lineStyle: { color: '#444' } }, axisLabel: { color: '#8b93a7' } },
              yAxis: { type: 'value', axisLine: { lineStyle: { color: '#444' } }, splitLine: { lineStyle: { color: '#222' } }, axisLabel: { color: '#8b93a7' } },
              series: [{ type: 'bar', data: perDay.map((d) => d.count), itemStyle: { color: '#ff8a3d' } }],
            }}
          />
        </div>
        <div className="panel">
          <h2>{t('burnDetail.timeOfDay')}</h2>
          <div className="sub">{t('burnDetail.timeOfDaySub')}</div>
          <EChart
            style={{ width: '100%', height: 220 }}
            option={{
              backgroundColor: 'transparent',
              tooltip: { trigger: 'axis' },
              grid: { left: 36, right: 16, top: 16, bottom: 30 },
              xAxis: {
                type: 'category',
                data: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')),
                axisLine: { lineStyle: { color: '#444' } },
                axisLabel: { color: '#8b93a7' },
              },
              yAxis: { type: 'value', axisLine: { lineStyle: { color: '#444' } }, splitLine: { lineStyle: { color: '#222' } }, axisLabel: { color: '#8b93a7' } },
              series: [{ type: 'bar', data: byHour, itemStyle: { color: '#5a9dd1' } }],
            }}
          />
        </div>
      </div>

      <div className="panel">
        <h2>{t('burnDetail.heatmap')}</h2>
        <div className="sub">{t('burnDetail.heatmapSub')}</div>
        <EChart
          style={{ width: '100%', height: 320 }}
          option={{
            backgroundColor: 'transparent',
            tooltip: {
              formatter: ((params: unknown) => {
                const p = params as { value?: unknown };
                if (!Array.isArray(p.value)) return '';
                const [d, h, v] = p.value as [number, number, number];
                return `Day ${d - 1}, ${String(h).padStart(2, '0')}:00<br/><b>${v}</b> event${v === 1 ? '' : 's'}`;
              }) as never,
            },
            grid: { left: 50, right: 60, top: 16, bottom: 40 },
            xAxis: {
              type: 'category',
              data: Array.from({ length: heatmapCells.days }, (_, i) => t('burnDetail.day', { n: i - 1 })),
              axisLabel: { color: '#8b93a7' },
            },
            yAxis: {
              type: 'category',
              data: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`),
              axisLabel: { color: '#8b93a7', fontSize: 10 },
            },
            visualMap: {
              min: 0,
              max: heatmapCells.maxVal || 1,
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
                data: heatmapCells.cells,
                emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 1 } },
              },
            ],
          }}
        />
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <h2>{t('burnDetail.whatItDoes')}</h2>
          <div className="sub">{t('burnDetail.whatItDoesSub')}</div>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                {mix.slice(0, 12).map((m) => (
                  <tr key={m.label}>
                    <td>{m.label}</td>
                    <td className="num">{m.count}</td>
                    <td className="num" style={{ color: 'var(--muted)' }}>{(m.pct * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <h2>{t('burnDetail.titleWords')}</h2>
          <div className="sub">{t('burnDetail.titleWordsSub')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 0' }}>
            {topWords.length === 0 && <span className="sub">{t('burnDetail.noEventsYet')}</span>}
            {topWords.map(([w, n]) => (
              <span key={w} style={{
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 12,
              }}>
                <strong>{w}</strong> <span style={{ color: 'var(--muted)', marginLeft: 4 }}>{n}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {topPerformers.length > 0 && (
        <div className="panel">
          <h2>{t('burnDetail.performers')}</h2>
          <div className="sub">{t('burnDetail.performersSub', { n: topPerformers.length })}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {topPerformers.map((p) => (
              <span key={p.display} style={{
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 12,
              }}>
                <strong>{p.display}</strong>
                <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{t('burnDetail.sets', { count: p.sets })}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {bundle.art.length > 0 && (
        <div className="panel">
          <h2>{t('burnDetail.featuredArt', { count: bundle.art.length })}</h2>
          <div className="sub">{t('burnDetail.featuredArtSub', { dates: formatDateRangeInZone(f.start, f.end, f.timeZone) })}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginTop: 8 }}>
            {bundle.art.slice(0, 20).map((a) => {
              const clock = a.location?.hour
                ? `${a.location.hour}:${String(a.location.minute ?? 0).padStart(2, '0')}`
                : null;
              const where = a.location?.string ?? clock ?? null;
              return (
                <div
                  key={a.uid}
                  style={{
                    background: 'var(--panel-2)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 12,
                  }}
                >
                  <strong style={{ display: 'block' }}>{a.name}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                    {a.artist ?? '—'}
                    {a.hometown && <span> · {a.hometown}</span>}
                  </span>
                  {where && (
                    <span style={{ display: 'block', color: 'var(--accent-soft)', fontSize: 11, marginTop: 2 }}>
                      {where}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '4px 10px',
  borderRadius: 12,
  fontWeight: 600,
  cursor: 'default',
};

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{formatInt(value)}</div>
    </div>
  );
}
