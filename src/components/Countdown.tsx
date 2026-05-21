// Topbar countdown widget (issue #7).
//
// Three states (in descending priority):
//   Active   — any burn happening right now → "Currently on the playa: $X (ends in $H hours) + $N more"
//   Imminent — next burn within 30 days     → "Next: $X in $D days + $N more"
//   Quiet    — nothing in the next 30 days  → easter-egg copy
//
// Tie-breaking rules (per issue #7 edit):
//   1. If sanctioned filter is Official, sanctioned beats unsanctioned.
//   2. Then most events (biggest program).
//   3. Then earliest start (or earliest end for active).
//   4. Then alphabetical.
//
// 60s tick handles upcoming → active → past transitions.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FestivalBundle } from '../data/loader';
import type { SanctionFlags } from '../data/sanctioned';
import type { SanctionFilter } from '../App';
import { isActive, msUntilStart, msUntilEnd } from '../lib/timeBins';
import { formatHours } from '../lib/format';

interface Props {
  bundles: FestivalBundle[];
  sanction: SanctionFlags | null;
  filter: SanctionFilter;
  onJump: (slug: string) => void;
}

interface RankedBurn {
  bundle: FestivalBundle;
  msTo: number; // ms until start (for upcoming) or ms until end (for active)
  isOfficial: boolean;
  isActive: boolean;
}

function compareRank(a: RankedBurn, b: RankedBurn, filter: SanctionFilter): number {
  if (filter === 'sanctioned' || filter === 'all') {
    if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
  }
  const aEvents = a.bundle.schedule.length;
  const bEvents = b.bundle.schedule.length;
  if (aEvents !== bEvents) return bEvents - aEvents;
  if (a.msTo !== b.msTo) return a.msTo - b.msTo;
  return a.bundle.festival.title.localeCompare(b.bundle.festival.title);
}

export function Countdown({ bundles, sanction, filter, onJump }: Props) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date());
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { active, upcoming } = useMemo(() => {
    const active: RankedBurn[] = [];
    const upcoming: RankedBurn[] = [];
    for (const b of bundles) {
      const tz = b.festival.timeZone || 'UTC';
      const isOfficial = sanction?.byFestival.get(b.festival.name)?.is_sanctioned ?? false;
      if (isActive(b.festival.start, b.festival.end, tz, now)) {
        active.push({ bundle: b, msTo: msUntilEnd(b.festival.end, tz, now), isOfficial, isActive: true });
      } else {
        const ms = msUntilStart(b.festival.start, tz, now);
        if (ms > 0) upcoming.push({ bundle: b, msTo: ms, isOfficial, isActive: false });
      }
    }
    active.sort((a, b) => compareRank(a, b, filter));
    upcoming.sort((a, b) => compareRank(a, b, filter));
    return { active, upcoming };
  }, [bundles, sanction, filter, now]);

  const easterEgg = useMemo(() => {
    // Avoiding the BRC week + the April 1 wink-wink.
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    const blackRockCity = (m === 7 && d >= 25) || (m === 8 && d <= 4);
    if (blackRockCity) return t('countdown.snark.eggBrc');
    const local = new Date(now);
    if (local.getMonth() === 3 && local.getDate() === 1) {
      return t('countdown.snark.eggAprilFool');
    }
    return null;
  }, [now, t]);

  if (bundles.length === 0) {
    return <span className="countdown" style={countdownStyle}>—</span>;
  }

  // ACTIVE state takes priority.
  if (active.length > 0) {
    const top = active[0]!;
    const more = active.length - 1;
    return (
      <CountdownChip
        label={t('countdown.onPlaya')}
        burnTitle={top.bundle.festival.title}
        burnSlug={top.bundle.festival.name}
        detail={t('countdown.endsIn', { hours: formatHours(top.msTo) })}
        moreCount={more}
        moreBurns={active.slice(1)}
        moreLabel={(b) => t('countdown.moreActive', { title: b.bundle.festival.title, hours: formatHours(b.msTo) })}
        popoverOpen={popoverOpen}
        setPopoverOpen={setPopoverOpen}
        onJump={onJump}
      />
    );
  }

  // IMMINENT: anything in the next 30 days.
  const upcomingSoon = upcoming.filter((u) => u.msTo <= 30 * 24 * 3600 * 1000);
  if (upcomingSoon.length > 0) {
    const top = upcomingSoon[0]!;
    const days = Math.max(0, Math.floor(top.msTo / (24 * 3600 * 1000)));
    // Cluster: burns starting within 3 days of the top one.
    const cluster = upcomingSoon.filter((u) => Math.abs(u.msTo - top.msTo) < 3 * 24 * 3600 * 1000);
    const more = cluster.length - 1;
    return (
      <CountdownChip
        label={t('countdown.next')}
        burnTitle={top.bundle.festival.title}
        burnSlug={top.bundle.festival.name}
        detail={days === 0 ? t('countdown.today') : days === 1 ? t('countdown.tomorrow') : t('countdown.inDays', { count: days })}
        moreCount={more}
        moreBurns={cluster.slice(1)}
        moreLabel={(b) => {
          const d = Math.floor(b.msTo / (24 * 3600 * 1000));
          return t('countdown.moreUpcoming', {
            title: b.bundle.festival.title,
            when: t('countdown.inDays', { count: d }),
          });
        }}
        popoverOpen={popoverOpen}
        setPopoverOpen={setPopoverOpen}
        onJump={onJump}
      />
    );
  }

  // QUIET — easter eggs, then a polite default.
  const quiet = easterEgg ?? t('countdown.snark.offSeason');
  return (
    <span className="countdown" style={countdownStyle} title={quiet}>
      {quiet}
    </span>
  );
}

const countdownStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  // Wrap rather than nowrap — on a narrow phone the "On a playa now: X ·
  // ends in N hours" text is wider than the viewport, and nowrap forced
  // ~44px of horizontal page overflow on every tab.
  flexWrap: 'wrap',
  gap: 6,
  padding: '2px 8px',
  borderRadius: 6,
  background: 'var(--panel-2)',
  border: '1px solid var(--border)',
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  maxWidth: '100%',
};

interface ChipProps {
  label: string;
  burnTitle: string;
  burnSlug: string;
  detail: string;
  moreCount: number;
  moreBurns: RankedBurn[];
  moreLabel: (b: RankedBurn) => string;
  popoverOpen: boolean;
  setPopoverOpen: (b: boolean) => void;
  onJump: (slug: string) => void;
}

function CountdownChip({
  label, burnTitle, burnSlug, detail, moreCount, moreBurns, moreLabel, popoverOpen, setPopoverOpen, onJump,
}: ChipProps) {
  const { t } = useTranslation();
  return (
    <span className="countdown" style={{ ...countdownStyle, position: 'relative' }}>
      <span style={{ color: 'var(--muted)' }}>{label}:</span>
      <button
        className="countdown-burn"
        onClick={() => onJump(burnSlug)}
        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
        title={t('countdown.openBurn')}
      >
        {burnTitle}
      </button>
      <span style={{ color: 'var(--muted)' }}>· {detail}</span>
      {moreCount > 0 && (
        <>
          <button
            onClick={() => setPopoverOpen(!popoverOpen)}
            style={{ background: 'none', border: 'none', padding: '0 4px', color: 'var(--muted)', textDecoration: 'underline dotted', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
          >
            {t('countdown.more', { n: moreCount })}
          </button>
          {popoverOpen && (
            <div
              style={{
                position: 'absolute',
                top: '110%',
                // Anchor to the right edge of the chip, but never let the box
                // run past the viewport on a narrow screen.
                right: 0,
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: 8,
                minWidth: 240,
                maxWidth: 'calc(100vw - 24px)',
                zIndex: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              {moreBurns.map((b) => (
                <div
                  key={b.bundle.festival.name}
                  onClick={() => { onJump(b.bundle.festival.name); setPopoverOpen(false); }}
                  style={{ padding: '4px 6px', cursor: 'pointer', fontSize: 11, color: 'var(--text)' }}
                >
                  {b.isOfficial && <span style={{ color: 'var(--accent)' }}>★ </span>}
                  {moreLabel(b)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </span>
  );
}
