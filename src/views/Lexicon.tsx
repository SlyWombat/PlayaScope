// Lexicon view (issue #1) — the vocabulary burners actually use.
//
// Aggregates words + bigrams + trigrams across event titles and camp names.
// Renders the top tokens as a true word-cloud bubble layout via the
// `echarts-wordcloud` series extension (~30KB gzipped, pulled in alongside
// the existing ECharts dependency).

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import 'echarts-wordcloud';
import { EChart } from '../components/EChart';
import { useIsMobile } from '../lib/useIsMobile';
import type { FestivalBundle } from '../data/loader';
import { tokens, ngrams, bump, topN } from '../lib/tokenize';

type Scope = 'events' | 'camps' | 'both';
type Granularity = 'words' | 'phrases';

interface Props {
  bundles: FestivalBundle[];
}

interface Entry {
  term: string;
  count: number;
  /** Sample event/camp names that contain this term. */
  examples: string[];
}

// Palette for the word cloud — orange-leaning for top terms, fading to a
// cooler grey-blue for the long tail.
const PALETTE = [
  '#ff8a3d', '#ffa56b', '#ffbe93', '#f5c542', '#d4b04a',
  '#9d5ad1', '#5ad19a', '#5a9dd1', '#7da8c4', '#8b93a7',
];

export function Lexicon({ bundles }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [scope, setScope] = useState<Scope>('events');
  const [granularity, setGranularity] = useState<Granularity>('words');

  const data = useMemo(() => {
    const counts = new Map<string, number>();
    const examples = new Map<string, string[]>();
    const recordToken = (term: string, source: string) => {
      bump(counts, term);
      const list = examples.get(term);
      if (!list) examples.set(term, [source]);
      else if (list.length < 3 && !list.includes(source)) list.push(source);
    };
    for (const b of bundles) {
      if (scope === 'events' || scope === 'both') {
        for (const ev of b.schedule) {
          const t = tokens(ev.title);
          if (granularity === 'words') {
            for (const w of t) recordToken(w, ev.title);
          } else {
            for (const p of [...ngrams(t, 2), ...ngrams(t, 3)]) recordToken(p, ev.title);
          }
        }
      }
      if (scope === 'camps' || scope === 'both') {
        for (const c of b.camps) {
          const t = tokens(c.name);
          if (granularity === 'words') {
            for (const w of t) recordToken(w, c.name);
          } else {
            for (const p of [...ngrams(t, 2), ...ngrams(t, 3)]) recordToken(p, c.name);
          }
        }
      }
    }
    const sortedTop: Entry[] = topN(counts, granularity === 'phrases' ? 120 : 100).map(([term, count]) => ({
      term,
      count,
      examples: examples.get(term) ?? [],
    }));
    const totalUnique = counts.size;
    const totalOccurrences = [...counts.values()].reduce((a, b) => a + b, 0);
    return { sortedTop, totalUnique, totalOccurrences };
  }, [bundles, scope, granularity]);

  const cloudData = useMemo(
    () =>
      data.sortedTop.map((e, i) => ({
        name: e.term,
        value: e.count,
        textStyle: { color: PALETTE[Math.min(PALETTE.length - 1, Math.floor(i / 10))] },
      })),
    [data.sortedTop],
  );

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>{t('lexicon.title')}</h2>
            <div className="sub">
              {t('lexicon.sub', {
                unique: data.totalUnique.toLocaleString(),
                units: t(granularity === 'phrases' ? 'lexicon.granPhrases' : 'lexicon.granWords'),
                occurrences: data.totalOccurrences.toLocaleString(),
                scope: t(scope === 'both' ? 'lexicon.scopeBothLong' : scope === 'camps' ? 'lexicon.scopeCamps' : 'lexicon.scopeEvents'),
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{ color: 'var(--muted)', fontSize: 11, alignSelf: 'center', marginRight: 4 }}>{t('lexicon.scopeLabel')}</span>
              <button className={scope === 'events' ? 'primary' : ''} onClick={() => setScope('events')} style={{ fontSize: 11, padding: '3px 8px' }}>{t('lexicon.scopeEvents')}</button>
              <button className={scope === 'camps' ? 'primary' : ''} onClick={() => setScope('camps')} style={{ fontSize: 11, padding: '3px 8px' }}>{t('lexicon.scopeCamps')}</button>
              <button className={scope === 'both' ? 'primary' : ''} onClick={() => setScope('both')} style={{ fontSize: 11, padding: '3px 8px' }}>{t('lexicon.scopeBoth')}</button>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{ color: 'var(--muted)', fontSize: 11, alignSelf: 'center', marginRight: 4 }}>{t('lexicon.unitsLabel')}</span>
              <button className={granularity === 'words' ? 'primary' : ''} onClick={() => setGranularity('words')} style={{ fontSize: 11, padding: '3px 8px' }}>{t('lexicon.unitWords')}</button>
              <button className={granularity === 'phrases' ? 'primary' : ''} onClick={() => setGranularity('phrases')} style={{ fontSize: 11, padding: '3px 8px' }}>{t('lexicon.unitPhrases')}</button>
            </div>
          </div>
        </div>

        <EChart
          style={{ width: '100%', height: isMobile ? 320 : 480 }}
          option={{
            backgroundColor: 'transparent',
            tooltip: {
              formatter: ((params: unknown) => {
                const p = params as { name: string; value: number };
                const entry = data.sortedTop.find((x) => x.term === p.name);
                const examples = entry?.examples.slice(0, 3).join(' · ') ?? '';
                return `<strong>${p.name}</strong> — ${p.value.toLocaleString()}×` +
                  (examples ? `<br/><span style="color:#999;font-size:11px">${examples}</span>` : '');
              }) as never,
            },
            series: [
              {
                type: 'wordCloud',
                shape: 'circle',
                left: 'center',
                top: 'center',
                width: '92%',
                height: '92%',
                sizeRange: isMobile ? [10, 38] : [12, 56],
                rotationRange: [-30, 30],
                rotationStep: 15,
                gridSize: isMobile ? 6 : 8,
                drawOutOfBound: false,
                textStyle: {
                  fontFamily: granularity === 'phrases'
                    ? "'JetBrains Mono', monospace"
                    : "'Inter', sans-serif",
                  fontWeight: 600,
                },
                emphasis: {
                  textStyle: {
                    color: '#ff8a3d',
                    textShadowBlur: 8,
                    textShadowColor: 'rgba(255,138,61,0.4)',
                  },
                },
                data: cloudData,
              },
            ],
          }}
        />
      </div>

      <div className="panel">
        <h2>{t('lexicon.ranked', { n: data.sortedTop.length })}</h2>
        <div className="sub">{t('lexicon.rankedSub')}</div>
        <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>{granularity === 'phrases' ? t('lexicon.colPhrase') : t('lexicon.colWord')}</th>
                <th className="num">{t('lexicon.colCount')}</th>
                <th>{t('lexicon.colExamples')}</th>
              </tr>
            </thead>
            <tbody>
              {data.sortedTop.map((e, i) => (
                <tr key={e.term}>
                  <td style={{ color: 'var(--muted)' }}>{i + 1}</td>
                  <td style={{ color: PALETTE[Math.min(PALETTE.length - 1, Math.floor(i / 10))], fontWeight: 600 }}>
                    {e.term}
                  </td>
                  <td className="num">{e.count.toLocaleString()}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 11 }}>{e.examples.slice(0, 2).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
