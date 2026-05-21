// Burn Battle — pick two burns, see them head to head.
//
// Closes the "cross-regional comparison" gap: every other view is either
// all-burns-aggregated or one-burn. This is the A-vs-B scorecard, with an
// auto-generated snarky verdict.

import { useMemo, useState } from 'react';
import { EChart } from '../components/EChart';
import type { FestivalBundle } from '../data/loader';
import type { SanctionFlags } from '../data/sanctioned';
import { EVENT_TYPE_LABELS, canonicalEventTypeLabel } from '../data/types';
import type { EventTypeLabel } from '../data/types';
import { durationDays } from '../data/normalize';
import { scheduleShape } from '../data/aggregate';
import { regionForFestival } from '../lib/region';
import { formatInt } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';

interface Props {
  allBundles: FestivalBundle[];
  sanction: SanctionFlags | null;
  onOpenBurn?: (slug: string) => void;
}

const A_COLOR = '#ff8a3d';
const B_COLOR = '#5a9dd1';

interface Stats {
  events: number;
  camps: number;
  art: number;
  music: number;
  duration: number;
  perDay: number;
  region: string;
  sanctioned: boolean;
  fractions: Record<EventTypeLabel, number>;
  topTrait: EventTypeLabel | null;
}

function statsFor(b: FestivalBundle, sanction: SanctionFlags | null): Stats {
  const duration = durationDays(b.festival.start, b.festival.end, b.festival.timeZone);
  const counts = Object.fromEntries(EVENT_TYPE_LABELS.map((l) => [l, 0])) as Record<EventTypeLabel, number>;
  for (const ev of b.schedule) counts[canonicalEventTypeLabel(ev.event_type?.label)]++;
  const total = b.schedule.length || 1;
  const fractions = Object.fromEntries(
    EVENT_TYPE_LABELS.map((l) => [l, counts[l] / total]),
  ) as Record<EventTypeLabel, number>;
  let topTrait: EventTypeLabel | null = null;
  let topN = 0;
  for (const l of EVENT_TYPE_LABELS) {
    if (counts[l] > topN) { topN = counts[l]; topTrait = l; }
  }
  return {
    events: b.schedule.length,
    camps: b.camps.length,
    art: b.art.length,
    music: b.music.length,
    duration,
    perDay: b.schedule.length / Math.max(1, duration),
    region: regionForFestival(b.festival),
    sanctioned: sanction?.byFestival.get(b.festival.name)?.is_sanctioned ?? false,
    fractions,
    topTrait,
  };
}

export function BurnBattle({ allBundles, sanction, onOpenBurn }: Props) {
  const isMobile = useIsMobile();
  // Alphabetical for the pickers; not a ranking.
  const sorted = useMemo(
    () => [...allBundles].sort((a, b) => a.festival.title.localeCompare(b.festival.title)),
    [allBundles],
  );
  // Default to the two biggest burns — makes for a livelier first battle.
  const byEvents = useMemo(
    () => [...allBundles].sort((a, b) => b.schedule.length - a.schedule.length),
    [allBundles],
  );
  const [slugA, setSlugA] = useState(() => byEvents[0]?.festival.name ?? '');
  const [slugB, setSlugB] = useState(() => byEvents[1]?.festival.name ?? '');

  const bundleA = allBundles.find((b) => b.festival.name === slugA);
  const bundleB = allBundles.find((b) => b.festival.name === slugB);

  const battle = useMemo(() => {
    if (!bundleA || !bundleB) return null;
    const a = statsFor(bundleA, sanction);
    const b = statsFor(bundleB, sanction);
    return { a, b };
  }, [bundleA, bundleB, sanction]);

  if (!bundleA || !bundleB || !battle) {
    return (
      <div className="panel">
        <h2>Burn Battle</h2>
        <div className="sub">Need at least two burns to stage a battle.</div>
      </div>
    );
  }

  const { a, b } = battle;
  const titleA = bundleA.festival.title;
  const titleB = bundleB.festival.title;

  // Scorecard rows. `winner`: 1 = A, -1 = B, 0 = tie/neutral.
  const rows: Array<{ label: string; av: string; bv: string; winner: number; note?: string }> = [
    metric('Events', a.events, b.events),
    metric('Theme camps', a.camps, b.camps),
    metric('Art installations', a.art, b.art),
    metric('Music sets', a.music, b.music),
    { label: 'Duration', av: `${a.duration} days`, bv: `${b.duration} days`, winner: cmp(a.duration, b.duration) },
    {
      label: 'Events per day',
      av: a.perDay.toFixed(1),
      bv: b.perDay.toFixed(1),
      winner: cmp(a.perDay, b.perDay),
      note: 'intensity',
    },
    { label: 'Region', av: a.region, bv: b.region, winner: 0 },
    {
      label: 'Official BM regional',
      av: a.sanctioned ? 'Yes ★' : 'No',
      bv: b.sanctioned ? 'Yes ★' : 'No',
      winner: a.sanctioned === b.sanctioned ? 0 : a.sanctioned ? 1 : -1,
    },
    {
      label: 'Signature vibe',
      av: a.topTrait ?? '—',
      bv: b.topTrait ?? '—',
      winner: 0,
    },
  ];

  const aWins = rows.filter((r) => r.winner === 1).length;
  const bWins = rows.filter((r) => r.winner === -1).length;
  const verdict = aWins > bWins ? titleA : bWins > aWins ? titleB : null;

  const snark = buildSnark(titleA, titleB, a, b);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h2>Burn Battle</h2>
        <div className="sub">Pick two burns. Bigger number takes the round. Verdict is automatic and unkind.</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <BurnPicker label="A" color={A_COLOR} value={slugA} options={sorted} onChange={setSlugA} />
          <span style={{ fontWeight: 700, color: 'var(--muted)' }}>vs</span>
          <BurnPicker label="B" color={B_COLOR} value={slugB} options={sorted} onChange={setSlugB} />
          <button
            style={{ fontSize: 11 }}
            onClick={() => { setSlugA(slugB); setSlugB(slugA); }}
            title="Swap sides"
          >
            ⇄ swap
          </button>
        </div>
      </div>

      {slugA === slugB ? (
        <div className="panel">
          <div className="sub">A burn can't battle itself. Pick two different burns.</div>
        </div>
      ) : (
        <>
          <div className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>Scorecard</h2>
              <div style={{ fontSize: 13 }}>
                {verdict ? (
                  <>Verdict: <strong style={{ color: verdict === titleA ? A_COLOR : B_COLOR }}>{verdict}</strong> takes it, {Math.max(aWins, bWins)}–{Math.min(aWins, bWins)}.</>
                ) : (
                  <>Verdict: <strong>dead heat</strong>, {aWins}–{bWins}.</>
                )}
              </div>
            </div>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="num" style={{ color: A_COLOR }}>
                      {onOpenBurn ? (
                        <button onClick={() => onOpenBurn(slugA)} style={linkBtn(A_COLOR)}>{titleA} →</button>
                      ) : titleA}
                    </th>
                    <th className="num" style={{ color: B_COLOR }}>
                      {onOpenBurn ? (
                        <button onClick={() => onOpenBurn(slugB)} style={linkBtn(B_COLOR)}>{titleB} →</button>
                      ) : titleB}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <td>
                        {r.label}
                        {r.note && <span style={{ color: 'var(--muted)', fontSize: 10 }}> · {r.note}</span>}
                      </td>
                      <td className="num" style={cellStyle(r.winner === 1)}>{r.av}</td>
                      <td className="num" style={cellStyle(r.winner === -1)}>{r.bv}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <h2>The tale of the tape</h2>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.7, fontSize: 13 }}>
              {snark.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>

          <div className="grid cols-2">
            <div className="panel">
              <h2>Event-type fingerprint</h2>
              <div className="sub">How each burn's program splits across the 19 categories.</div>
              <EChart
                style={{ width: '100%', height: isMobile ? 300 : 360 }}
                option={{
                  backgroundColor: 'transparent',
                  legend: { top: 0, textStyle: { color: '#8b93a7', fontSize: 11 } },
                  radar: {
                    indicator: EVENT_TYPE_LABELS.map((l) => ({
                      name: l.split('/')[0]!.slice(0, 10),
                      max: Math.max(
                        0.05,
                        ...EVENT_TYPE_LABELS.map((m) => Math.max(a.fractions[m], b.fractions[m])),
                      ),
                    })),
                    radius: '62%',
                    axisName: { color: '#8b93a7', fontSize: 9 },
                    splitLine: { lineStyle: { color: '#2a2f3f' } },
                    splitArea: { areaStyle: { color: ['transparent'] } },
                  },
                  series: [{
                    type: 'radar',
                    data: [
                      {
                        value: EVENT_TYPE_LABELS.map((l) => a.fractions[l]),
                        name: titleA,
                        lineStyle: { color: A_COLOR, width: 2 },
                        itemStyle: { color: A_COLOR },
                        areaStyle: { color: 'rgba(255,138,61,0.18)' },
                      },
                      {
                        value: EVENT_TYPE_LABELS.map((l) => b.fractions[l]),
                        name: titleB,
                        lineStyle: { color: B_COLOR, width: 2 },
                        itemStyle: { color: B_COLOR },
                        areaStyle: { color: 'rgba(90,157,209,0.18)' },
                      },
                    ],
                  }],
                }}
              />
            </div>
            <div className="panel">
              <h2>Schedule shape</h2>
              <div className="sub">Events per day of burn — Day 0 is opening day.</div>
              <ScheduleVs bundleA={bundleA} bundleB={bundleB} titleA={titleA} titleB={titleB} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function metric(label: string, av: number, bv: number) {
  return { label, av: formatInt(av), bv: formatInt(bv), winner: cmp(av, bv) };
}

function cmp(a: number, b: number): number {
  return a > b ? 1 : a < b ? -1 : 0;
}

function cellStyle(win: boolean): React.CSSProperties {
  return win
    ? { background: 'rgba(255,138,61,0.12)', fontWeight: 700, color: 'var(--text)' }
    : {};
}

function linkBtn(color: string): React.CSSProperties {
  return {
    background: 'none', border: 'none', padding: 0, font: 'inherit',
    color, fontWeight: 700, cursor: 'pointer',
  };
}

function BurnPicker({
  label, color, value, options, onChange,
}: {
  label: string;
  color: string;
  value: string;
  options: FestivalBundle[];
  onChange: (slug: string) => void;
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 22, height: 22, borderRadius: '50%', background: color, color: '#1a1208',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 12,
      }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: 'var(--panel-2)', border: `1px solid ${color}`, color: 'var(--text)',
          borderRadius: 6, padding: '6px 10px', fontSize: 13, fontFamily: 'inherit',
        }}
      >
        {options.map((o) => (
          <option key={o.festival.name} value={o.festival.name}>{o.festival.title}</option>
        ))}
      </select>
    </label>
  );
}

function ScheduleVs({
  bundleA, bundleB, titleA, titleB,
}: {
  bundleA: FestivalBundle;
  bundleB: FestivalBundle;
  titleA: string;
  titleB: string;
}) {
  const isMobile = useIsMobile();
  const rowA = scheduleShape([bundleA])[0]!;
  const rowB = scheduleShape([bundleB])[0]!;
  const maxLen = Math.max(rowA.perDay.length, rowB.perDay.length, 1);
  const days = Array.from({ length: maxLen }, (_, i) => `Day ${i - 1}`);
  return (
    <EChart
      style={{ width: '100%', height: isMobile ? 300 : 360 }}
      option={{
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: { top: 0, textStyle: { color: '#8b93a7', fontSize: 11 } },
        grid: { left: 44, right: 16, top: 36, bottom: 30 },
        xAxis: {
          type: 'category', data: days,
          axisLine: { lineStyle: { color: '#444' } }, axisLabel: { color: '#8b93a7' },
        },
        yAxis: {
          type: 'value',
          axisLine: { lineStyle: { color: '#444' } },
          splitLine: { lineStyle: { color: '#222' } },
          axisLabel: { color: '#8b93a7' },
        },
        series: [
          { name: titleA, type: 'line', smooth: true, data: rowA.perDay, itemStyle: { color: A_COLOR }, lineStyle: { width: 2 } },
          { name: titleB, type: 'line', smooth: true, data: rowB.perDay, itemStyle: { color: B_COLOR }, lineStyle: { width: 2 } },
        ],
      }}
    />
  );
}

function buildSnark(titleA: string, titleB: string, a: Stats, b: Stats): string[] {
  const lines: string[] = [];
  const ratio = (x: number, y: number) => (y > 0 ? x / y : x > 0 ? Infinity : 1);

  // Events.
  if (a.events > 0 && b.events > 0) {
    const r = ratio(Math.max(a.events, b.events), Math.min(a.events, b.events));
    const big = a.events > b.events ? titleA : titleB;
    const small = a.events > b.events ? titleB : titleA;
    if (r >= 2) lines.push(`${big} runs ${r.toFixed(1)}× the events of ${small}. One of you will not sleep; the other will be bored by Tuesday.`);
    else lines.push(`${big} edges out ${small} on raw event count — but it's close enough to call it a draw if you squint.`);
  }

  // Art.
  if (a.art !== b.art) {
    const big = a.art > b.art ? titleA : titleB;
    const ax = Math.max(a.art, b.art), bx = Math.min(a.art, b.art);
    lines.push(`${big} has ${ax} art installations to the other's ${bx}. Bring a wide-angle lens to one and your imagination to the other.`);
  }

  // Music.
  if (a.music + b.music > 0) {
    const big = a.music > b.music ? titleA : titleB;
    if (Math.abs(a.music - b.music) > 20) lines.push(`${big} is the louder night out — ${Math.max(a.music, b.music)} music sets vs ${Math.min(a.music, b.music)}. Pack earplugs accordingly.`);
  }

  // Duration / intensity.
  if (a.duration !== b.duration) {
    const longer = a.duration > b.duration ? titleA : titleB;
    lines.push(`${longer} runs longer (${Math.max(a.duration, b.duration)} days vs ${Math.min(a.duration, b.duration)}) — endurance event vs weekend warm-up.`);
  } else {
    const denser = a.perDay > b.perDay ? titleA : b.perDay > a.perDay ? titleB : null;
    if (denser) lines.push(`Same number of days, but ${denser} crams more into each one. Choose your pace.`);
  }

  // Region.
  if (a.region === b.region) lines.push(`Civil war: both burns are in ${a.region}. Loyalties will be tested.`);
  else lines.push(`${a.region} vs ${b.region} — this battle requires a passport.`);

  // Sanctioned.
  if (a.sanctioned && b.sanctioned) lines.push('Both are official Burning Man regionals. The Org blesses this matchup.');
  else if (!a.sanctioned && !b.sanctioned) lines.push('Neither is on the official BM list. Two rebels enter.');
  else {
    const official = a.sanctioned ? titleA : titleB;
    const other = a.sanctioned ? titleB : titleA;
    lines.push(`${official} carries the official BM regional badge; ${other} is doing its own thing. Respect either way.`);
  }

  // Vibe clash.
  if (a.topTrait && b.topTrait && a.topTrait !== b.topTrait) {
    lines.push(`Vibe clash: ${titleA} leans ${a.topTrait}, ${titleB} leans ${b.topTrait}. You already know which one is your scene.`);
  } else if (a.topTrait && a.topTrait === b.topTrait) {
    lines.push(`Both burns are ${a.topTrait}-forward. Twins separated at birth.`);
  }

  return lines;
}
