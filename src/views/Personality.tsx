// Personality profile (issue #6). Spotify-Wrapped-style portraits per burn.
//
// For each burn: compute z-score on every event-type category vs the global
// mean. Top 3 positive z-scores become "traits"; lowest z-score becomes the
// "what it does NOT do" callout. Mini radar chart shows the 19-dim profile.
// "Find similar" panel uses cosine similarity over normalized fractions.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { EChart } from '../components/EChart';
import type { FestivalBundle } from '../data/loader';
import { EVENT_TYPE_LABELS, canonicalEventTypeLabel } from '../data/types';
import type { EventTypeLabel } from '../data/types';

interface Props {
  bundles: FestivalBundle[];
  /** Unfiltered set used for the global baseline — z-scores are most meaningful against the full population, not the visible subset. */
  allBundles: FestivalBundle[];
  onOpenBurn?: (slug: string) => void;
}

function fractionsFor(bundle: FestivalBundle): Record<EventTypeLabel, number> {
  const counts = Object.fromEntries(EVENT_TYPE_LABELS.map((l) => [l, 0])) as Record<EventTypeLabel, number>;
  for (const ev of bundle.schedule) {
    const label = canonicalEventTypeLabel(ev.event_type?.label);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  const total = bundle.schedule.length || 1;
  return Object.fromEntries(
    EVENT_TYPE_LABELS.map((l) => [l, counts[l] / total]),
  ) as Record<EventTypeLabel, number>;
}

function cosineSimilarity(a: Record<EventTypeLabel, number>, b: Record<EventTypeLabel, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const l of EVENT_TYPE_LABELS) {
    dot += a[l] * b[l];
    na += a[l] * a[l];
    nb += b[l] * b[l];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export function Personality({ bundles, allBundles, onOpenBurn }: Props) {
  const { t } = useTranslation();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const { globalMean, globalStd, profiles } = useMemo(() => {
    const pop = allBundles.filter((b) => b.schedule.length > 0);
    const profiles = new Map(pop.map((b) => [b.festival.name, fractionsFor(b)] as const));
    const globalMean = Object.fromEntries(EVENT_TYPE_LABELS.map((l) => [l, 0])) as Record<EventTypeLabel, number>;
    for (const f of profiles.values()) for (const l of EVENT_TYPE_LABELS) globalMean[l] += f[l];
    for (const l of EVENT_TYPE_LABELS) globalMean[l] /= pop.length || 1;
    const globalStd = Object.fromEntries(EVENT_TYPE_LABELS.map((l) => [l, 0])) as Record<EventTypeLabel, number>;
    for (const f of profiles.values()) for (const l of EVENT_TYPE_LABELS) {
      const d = f[l] - globalMean[l];
      globalStd[l] += d * d;
    }
    for (const l of EVENT_TYPE_LABELS) globalStd[l] = Math.sqrt(globalStd[l] / (pop.length || 1));
    return { globalMean, globalStd, profiles };
  }, [allBundles]);

  const cards = useMemo(() => {
    // Alphabetical — the card grid isn't a ranking. (Memory: feedback_chart_ordering.)
    const valid = bundles
      .filter((b) => b.schedule.length >= 10)
      .sort((a, b) => a.festival.title.localeCompare(b.festival.title));
    return valid.map((b) => {
      const frac = profiles.get(b.festival.name) ?? fractionsFor(b);
      // Z-score with floor on std to avoid blowing up rare categories.
      const z = Object.fromEntries(EVENT_TYPE_LABELS.map((l) => {
        const s = Math.max(globalStd[l], 0.005);
        return [l, (frac[l] - globalMean[l]) / s];
      })) as Record<EventTypeLabel, number>;

      const ranked = EVENT_TYPE_LABELS.map((l) => ({ label: l, z: z[l], pct: frac[l] }))
        .sort((a, b) => b.z - a.z);
      const topTraits = ranked.slice(0, 3).filter((t) => t.z >= 0.5);
      const lowest = ranked[ranked.length - 1];

      const blurb = generateBlurb(t, topTraits.map((tr) => tr.label), lowest?.label);

      return { bundle: b, frac, z, ranked, topTraits, lowest, blurb };
    });
    // `t` in deps so blurbs re-translate on a language switch.
  }, [bundles, profiles, globalMean, globalStd, t]);

  // "Find similar" — relative to a selected burn (or the first one, default).
  const similarity = useMemo(() => {
    if (!selectedSlug) return null;
    const target = cards.find((c) => c.bundle.festival.name === selectedSlug);
    if (!target) return null;
    const rest = cards
      .filter((c) => c.bundle.festival.name !== selectedSlug)
      .map((c) => ({ card: c, score: cosineSimilarity(c.frac, target.frac) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { target, neighbors: rest };
  }, [cards, selectedSlug]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h2>{t('personality.title')}</h2>
        <div className="sub">
          {t('personality.sub', { n: allBundles.filter((b) => b.schedule.length > 0).length })}
        </div>
      </div>

      {similarity && (
        <div className="panel" style={{ borderColor: 'var(--accent)' }}>
          <h2>{t('personality.similarTo', { burn: similarity.target.bundle.festival.title })}</h2>
          <div className="sub">{t('personality.similarSub')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {similarity.neighbors.map((n) => (
              <button
                key={n.card.bundle.festival.name}
                onClick={() => setSelectedSlug(n.card.bundle.festival.name)}
                style={{ fontSize: 11 }}
              >
                {n.card.bundle.festival.title}{' '}
                <span style={{ color: 'var(--muted)' }}>{(n.score * 100).toFixed(0)}%</span>
              </button>
            ))}
            <button onClick={() => setSelectedSlug(null)} style={{ fontSize: 11 }}>{t('personality.clear')}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
        {cards.map((c) => (
          <div
            key={c.bundle.festival.name}
            className="panel"
            style={{
              cursor: 'pointer',
              borderColor: selectedSlug === c.bundle.festival.name ? 'var(--accent)' : 'var(--border)',
            }}
            onClick={() => setSelectedSlug(c.bundle.festival.name === selectedSlug ? null : c.bundle.festival.name)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <strong
                style={{ fontSize: 15, cursor: 'pointer', color: 'var(--accent)' }}
                onClick={(e) => { e.stopPropagation(); onOpenBurn?.(c.bundle.festival.name); }}
                title={t('personality.openBurn')}
              >
                {c.bundle.festival.title} →
              </strong>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('personality.events', { n: c.bundle.schedule.length })}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {c.topTraits.length > 0 ? c.topTraits.map((tr) => (
                <span key={tr.label} style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'rgba(255,138,61,0.15)',
                  color: 'var(--accent)',
                  fontWeight: 600,
                }}>
                  {t(`personality.traits.${tr.label}`)}
                </span>
              )) : (
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{t('personality.blurbs.average')}</span>
              )}
            </div>
            {c.blurb && (
              <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 6, fontStyle: 'italic' }}>
                {c.blurb}
              </div>
            )}
            {c.lowest && c.lowest.z < -0.5 && (
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {t('personality.notablyLight', {
                  label: c.lowest.label,
                  pct: (c.lowest.pct * 100).toFixed(0),
                  z: c.lowest.z.toFixed(1),
                })}
              </div>
            )}
            <RadarMini frac={c.frac} mean={globalMean} />
          </div>
        ))}
      </div>
    </div>
  );
}

function RadarMini({ frac, mean }: { frac: Record<EventTypeLabel, number>; mean: Record<EventTypeLabel, number> }) {
  const { t } = useTranslation();
  const indicators = EVENT_TYPE_LABELS.map((l) => ({
    name: l.split('/')[0]!.slice(0, 10),
    max: Math.max(...EVENT_TYPE_LABELS.map((m) => Math.max(frac[m], mean[m] * 2))),
  }));
  return (
    <EChart
      style={{ width: '100%', height: 180, marginTop: 8 }}
      option={{
        backgroundColor: 'transparent',
        radar: {
          indicator: indicators,
          radius: '60%',
          axisName: { color: '#8b93a7', fontSize: 8 },
          splitLine: { lineStyle: { color: '#2a2f3f' } },
          splitArea: { areaStyle: { color: ['transparent'] } },
        },
        series: [
          {
            type: 'radar',
            data: [
              {
                value: EVENT_TYPE_LABELS.map((l) => mean[l]),
                name: t('personality.radarGlobal'),
                lineStyle: { color: '#5a9dd1', width: 1, type: 'dashed' },
                itemStyle: { color: '#5a9dd1' },
                areaStyle: { color: 'rgba(90,157,209,0.05)' },
              },
              {
                value: EVENT_TYPE_LABELS.map((l) => frac[l]),
                name: t('personality.radarThis'),
                lineStyle: { color: '#ff8a3d', width: 2 },
                itemStyle: { color: '#ff8a3d' },
                areaStyle: { color: 'rgba(255,138,61,0.25)' },
              },
            ],
          },
        ],
      }}
    />
  );
}

// Blurb text lives in the i18n catalog under `personality.blurbs.*`
// (English-only by policy; fr.json falls back). This only picks the key.
function generateBlurb(t: TFunction, traits: EventTypeLabel[], lowest: EventTypeLabel | undefined): string {
  const set = new Set(traits);
  const has = (l: EventTypeLabel) => set.has(l);
  if (has('Fire/Spectacle') && has('Live Music') && has('Gathering/Party')) {
    return t('personality.blurbs.noSleep');
  }
  if (has('Class/Workshop') && has('Yoga/Movement/Fitness')) {
    return t('personality.blurbs.soundBowl');
  }
  if (has('Mature Audiences') && !has('Class/Workshop')) {
    return t('personality.blurbs.seeThings');
  }
  if (has('Repair')) return t('personality.blurbs.practical');
  if (has('For Kids')) return t('personality.blurbs.kids');
  if (has('Parade')) return t('personality.blurbs.parade');
  if (lowest === 'Fire/Spectacle') return t('personality.blurbs.subtle');
  if (lowest === 'Class/Workshop') return t('personality.blurbs.noLearning');
  return '';
}
