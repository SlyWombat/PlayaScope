import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchFestivals } from './data/api';
import { loadFestivals, clearCache, type FestivalBundle } from './data/loader';
import type { Festival } from './data/types';
import { attachSanctioned, loadSanctioned, type SanctionFlags } from './data/sanctioned';
import { Overview } from './views/Overview';
import { TypeMix } from './views/TypeMix';
import { ScheduleShape } from './views/ScheduleShape';
import { GeoMap } from './views/GeoMap';
import { DataTable } from './views/DataTable';

declare const __APP_VERSION__: string;

type Tab = 'overview' | 'type-mix' | 'schedule' | 'geo' | 'table';
export type SanctionFilter = 'all' | 'sanctioned' | 'unsanctioned';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'type-mix', label: 'Event mix' },
  { key: 'schedule', label: 'Schedule shape' },
  { key: 'geo', label: 'Geography' },
  { key: 'table', label: 'Data table' },
];

interface LoadState {
  status: 'idle' | 'loading-registry' | 'loading-bundles' | 'ready' | 'error';
  festivals: Festival[];
  bundles: FestivalBundle[];
  sanction: SanctionFlags | null;
  progress: { done: number; total: number };
  error?: string;
}

export function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const [filter, setFilter] = useState<SanctionFilter>('all');
  const [state, setState] = useState<LoadState>({
    status: 'idle',
    festivals: [],
    bundles: [],
    sanction: null,
    progress: { done: 0, total: 0 },
  });

  const load = useCallback(async (opts: { force?: boolean } = {}) => {
    if (opts.force) clearCache();
    const ac = new AbortController();
    setState((s) => ({ ...s, status: 'loading-registry', error: undefined }));
    try {
      const [all, sanctionedIndex] = await Promise.all([
        fetchFestivals(ac.signal),
        loadSanctioned(ac.signal),
      ]);
      const active = all.filter((f) => f.active && !f.unknownDates);
      setState((s) => ({
        ...s,
        status: 'loading-bundles',
        festivals: active,
        progress: { done: 0, total: active.length },
      }));
      const bundles = await loadFestivals(active, {
        signal: ac.signal,
        skipCache: opts.force,
        onProgress: (done, total) => {
          setState((s) => ({ ...s, progress: { done, total } }));
        },
      });
      const sanction = attachSanctioned(active, sanctionedIndex);
      setState((s) => ({ ...s, status: 'ready', bundles, sanction }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, status: 'error', error: msg }));
    }
    return () => ac.abort();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredBundles = useMemo(() => {
    if (!state.sanction || filter === 'all') return state.bundles;
    return state.bundles.filter((b) => {
      const flag = state.sanction!.byFestival.get(b.festival.name)?.is_sanctioned ?? false;
      return filter === 'sanctioned' ? flag : !flag;
    });
  }, [state.bundles, state.sanction, filter]);

  const sanctionedCount = useMemo(() => {
    if (!state.sanction) return 0;
    let n = 0;
    for (const v of state.sanction.byFestival.values()) if (v.is_sanctioned) n++;
    return n;
  }, [state.sanction]);

  const stale = state.sanction?.index ? state.sanction.index.ageDays > 7 : false;

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          playa<span className="accent">scope</span>
        </h1>
        <nav className="tabs" style={{ borderBottom: 'none', padding: 0 }}>
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="meta">
          <SanctionToggle
            value={filter}
            onChange={setFilter}
            sanctionedCount={sanctionedCount}
            totalCount={state.bundles.length}
            disabled={!state.sanction || state.status !== 'ready'}
          />
          <span style={{ marginLeft: 12 }}>v{__APP_VERSION__}</span>
          <span style={{ marginLeft: 6 }}>
            · {state.status === 'ready' ? `${filteredBundles.length}/${state.bundles.length}` : state.status}
          </span>
          <button
            style={{ padding: '2px 8px', fontSize: 11, marginLeft: 10 }}
            disabled={state.status === 'loading-registry' || state.status === 'loading-bundles'}
            onClick={() => void load({ force: true })}
          >
            refresh
          </button>
        </div>
      </header>

      {state.sanction?.index && (
        <div
          style={{
            padding: '6px 20px',
            borderBottom: '1px solid var(--border)',
            background: stale ? 'rgba(245, 197, 66, 0.08)' : 'var(--panel)',
            color: stale ? 'var(--warn)' : 'var(--muted)',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          Sanctioned list: {state.sanction.index.events.length} events ·{' '}
          {new Date(state.sanction.index.scrapedAt).toISOString().slice(0, 10)} (
          {Math.round(state.sanction.index.ageDays)}d old)
          {stale && ' · stale — run `npm run scrape-sanctioned`'}
          {state.sanction.unmatched.length > 0 && (
            <>
              {' · '}
              {state.sanction.unmatched.length} on official list with no active dust match
              {' '}
              <span title={state.sanction.unmatched.join('\n')} style={{ cursor: 'help', textDecoration: 'underline dotted' }}>
                (hover)
              </span>
            </>
          )}
        </div>
      )}

      <main>
        {state.status === 'error' && <div className="error">Load failed: {state.error}</div>}
        {(state.status === 'loading-registry' || state.status === 'loading-bundles') && (
          <div className="loading">
            <div>
              {state.status === 'loading-registry'
                ? 'Fetching festivals registry…'
                : `Loading per-festival data… ${state.progress.done} / ${state.progress.total}`}
            </div>
            <div className="progress">
              <div
                className="bar"
                style={{
                  width:
                    state.progress.total > 0
                      ? `${(state.progress.done / state.progress.total) * 100}%`
                      : '15%',
                }}
              />
            </div>
            <div style={{ fontSize: 11 }}>data via data.dust.events</div>
          </div>
        )}
        {state.status === 'ready' && filteredBundles.length > 0 && (
          <>
            {tab === 'overview' && (
              <Overview bundles={filteredBundles} sanction={state.sanction} filter={filter} />
            )}
            {tab === 'type-mix' && <TypeMix bundles={filteredBundles} />}
            {tab === 'schedule' && <ScheduleShape bundles={filteredBundles} />}
            {tab === 'geo' && <GeoMap bundles={filteredBundles} sanction={state.sanction} />}
            {tab === 'table' && <DataTable bundles={filteredBundles} sanction={state.sanction} />}
          </>
        )}
        {state.status === 'ready' && filteredBundles.length === 0 && (
          <div className="loading">
            <div>No burns match the current filter.</div>
            <button onClick={() => setFilter('all')}>show all</button>
          </div>
        )}
      </main>
    </div>
  );
}

interface SanctionToggleProps {
  value: SanctionFilter;
  onChange: (v: SanctionFilter) => void;
  sanctionedCount: number;
  totalCount: number;
  disabled: boolean;
}

function SanctionToggle({ value, onChange, sanctionedCount, totalCount, disabled }: SanctionToggleProps) {
  const OPTIONS: { key: SanctionFilter; label: string; sub: string }[] = [
    { key: 'all', label: 'All', sub: `${totalCount}` },
    { key: 'sanctioned', label: 'Official', sub: `${sanctionedCount}` },
    { key: 'unsanctioned', label: 'Other', sub: `${Math.max(0, totalCount - sanctionedCount)}` },
  ];
  return (
    <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Filter by official Burning Man Regional Event status">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          disabled={disabled}
          className={value === o.key ? 'primary' : ''}
          style={{ fontSize: 11, padding: '3px 8px' }}
          onClick={() => onChange(o.key)}
        >
          {o.label}
          <span style={{ color: value === o.key ? '#1a1208aa' : 'var(--muted)', marginLeft: 4 }}>
            {o.sub}
          </span>
        </button>
      ))}
    </div>
  );
}
