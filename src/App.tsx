import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFestivals } from './data/api';
import { loadFestivals, clearCache, type FestivalBundle } from './data/loader';
import type { Festival } from './data/types';
import { attachSanctioned, loadSanctioned, type SanctionFlags } from './data/sanctioned';
import { loadAttendance, type AttendanceRecord } from './data/attendance';
import { Overview } from './views/Overview';
import { TypeMix } from './views/TypeMix';
import { ScheduleShape } from './views/ScheduleShape';
import { GeoMap } from './views/GeoMap';
import { DataTable } from './views/DataTable';
import { Lexicon } from './views/Lexicon';
import { Calendar } from './views/Calendar';
import { Continuity } from './views/Continuity';
import { Artists } from './views/Artists';
import { Personality } from './views/Personality';
import { Moop } from './views/Moop';
import { BurnBattle } from './views/BurnBattle';
import { BurnDetail } from './views/BurnDetail';
import { Countdown } from './components/Countdown';
import { LangSwitcher } from './components/LangSwitcher';
import { NavDrawer } from './components/NavDrawer';
import { regionForFestival, REGION_COLORS } from './lib/region';
import type { RegionLabel } from './lib/region';
import { useIsMobile } from './lib/useIsMobile';

declare const __APP_VERSION__: string;

type Tab =
  | 'overview'
  | 'type-mix'
  | 'personality'
  | 'battle'
  | 'lexicon'
  | 'artists'
  | 'schedule'
  | 'calendar'
  | 'continuity'
  | 'geo'
  | 'moop'
  | 'table';

export type SanctionFilter = 'all' | 'sanctioned' | 'unsanctioned';

// `labelKey` is an i18n catalog key (see src/locales/) — resolved with t().
const TABS: { key: Tab; labelKey: string; group: 'explore' | 'detail' }[] = [
  // First group: high-level summaries you'd open first.
  { key: 'overview', labelKey: 'nav.overview', group: 'explore' },
  { key: 'moop', labelKey: 'nav.moop', group: 'explore' },
  { key: 'geo', labelKey: 'nav.geo', group: 'explore' },
  { key: 'personality', labelKey: 'nav.personality', group: 'explore' },
  { key: 'battle', labelKey: 'nav.battle', group: 'explore' },
  { key: 'type-mix', labelKey: 'nav.typeMix', group: 'explore' },
  // Second group: deeper dives + raw data.
  { key: 'lexicon', labelKey: 'nav.lexicon', group: 'detail' },
  { key: 'artists', labelKey: 'nav.artists', group: 'detail' },
  { key: 'schedule', labelKey: 'nav.schedule', group: 'detail' },
  { key: 'calendar', labelKey: 'nav.calendar', group: 'detail' },
  { key: 'continuity', labelKey: 'nav.continuity', group: 'detail' },
  { key: 'table', labelKey: 'nav.table', group: 'detail' },
];

interface LoadState {
  status: 'idle' | 'loading-registry' | 'loading-bundles' | 'ready' | 'error';
  festivals: Festival[];
  bundles: FestivalBundle[];
  sanction: SanctionFlags | null;
  attendance: Map<string, AttendanceRecord>;
  progress: { done: number; total: number };
  error?: string;
}

/** Read the current `#burn=<slug>` hash, if any. */
function readBurnHash(): string | null {
  const h = window.location.hash.match(/burn=([^&]+)/);
  return h ? decodeURIComponent(h[1]!) : null;
}

export function App() {
  const { t } = useTranslation();
  // A shared `#battle=a,b` link should land directly on the Burn Battle tab.
  const [tab, setTab] = useState<Tab>(() =>
    typeof window !== 'undefined' && /[#&]battle=/.test(window.location.hash) ? 'battle' : 'overview',
  );
  // Default to "Official" so first-time visitors see the curated Burning Man
  // Regional Events list. They can opt into All / Other from the topbar toggle.
  const [filter, setFilter] = useState<SanctionFilter>('sanctioned');
  const [regionFilter, setRegionFilter] = useState<RegionLabel | null>(null);
  // Hide prior-year duplicates by default — most burns repeat annually, no
  // value showing both `soak-2025` and `soak-2026` on every chart.
  const [yearFilter, setYearFilter] = useState<'current' | 'all'>('current');
  const [showUnmatched, setShowUnmatched] = useState(false);
  // Mobile nav drawer (issue #13 P0) — collapses the 12-tab bar on phones.
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Mobile: the sanction-info strip is collapsed to a badge until tapped (#13 P1).
  const [sanctionOpen, setSanctionOpen] = useState(false);
  // Hash-routed drilldown: when set, the BurnDetail view takes over the main area.
  const [burnHash, setBurnHash] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : readBurnHash(),
  );

  // Sync the burn drilldown with the URL hash so back/forward + sharing work.
  useEffect(() => {
    const onHashChange = () => setBurnHash(readBurnHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const openBurn = useCallback((slug: string) => {
    window.location.hash = `burn=${encodeURIComponent(slug)}`;
    setBurnHash(slug);
  }, []);

  const closeBurn = useCallback(() => {
    // Clear the hash without scrolling.
    history.replaceState(null, '', window.location.pathname + window.location.search);
    setBurnHash(null);
  }, []);

  const [state, setState] = useState<LoadState>({
    status: 'idle',
    festivals: [],
    bundles: [],
    sanction: null,
    attendance: new Map(),
    progress: { done: 0, total: 0 },
  });

  const load = useCallback(async (opts: { force?: boolean } = {}) => {
    if (opts.force) clearCache();
    const ac = new AbortController();
    setState((s) => ({ ...s, status: 'loading-registry', error: undefined }));
    try {
      const [all, sanctionedIndex, attendance] = await Promise.all([
        fetchFestivals(ac.signal),
        loadSanctioned(ac.signal),
        loadAttendance(ac.signal),
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
      setState((s) => ({ ...s, status: 'ready', bundles, sanction, attendance }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, status: 'error', error: msg }));
    }
    return () => ac.abort();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const currentYear = new Date().getUTCFullYear();

  const filteredBundles = useMemo(() => {
    let out = state.bundles;
    if (yearFilter === 'current') {
      out = out.filter((b) => {
        const y = new Date(b.festival.start).getUTCFullYear();
        return y === currentYear;
      });
    }
    if (state.sanction && filter !== 'all') {
      out = out.filter((b) => {
        const flag = state.sanction!.byFestival.get(b.festival.name)?.is_sanctioned ?? false;
        return filter === 'sanctioned' ? flag : !flag;
      });
    }
    if (regionFilter) {
      out = out.filter((b) => regionForFestival(b.festival) === regionFilter);
    }
    return out;
  }, [state.bundles, state.sanction, filter, regionFilter, yearFilter, currentYear]);

  const sanctionedCount = useMemo(() => {
    if (!state.sanction) return 0;
    let n = 0;
    for (const v of state.sanction.byFestival.values()) if (v.is_sanctioned) n++;
    return n;
  }, [state.sanction]);

  const stale = state.sanction?.index ? state.sanction.index.ageDays > 7 : false;

  // Meta controls — the filter/refresh/version/language cluster. On desktop it
  // sits in the topbar's .meta strip; on mobile it rides in the nav drawer's
  // footer. Only one branch renders per breakpoint, so no duplicate DOM.
  const metaControls = (
    <>
      <button
        onClick={() => setYearFilter(yearFilter === 'current' ? 'all' : 'current')}
        className={yearFilter === 'current' ? 'primary' : ''}
        style={{ fontSize: 11, padding: '3px 8px' }}
        title={yearFilter === 'current'
          ? t('filter.currentYearTitle', { year: currentYear })
          : t('filter.allYearsTitle')}
      >
        {yearFilter === 'current'
          ? t('filter.currentYearOnly', { year: currentYear })
          : t('filter.allYears')}
      </button>
      {' '}
      <SanctionToggle
        value={filter}
        onChange={setFilter}
        sanctionedCount={sanctionedCount}
        totalCount={state.bundles.length}
        disabled={!state.sanction || state.status !== 'ready'}
      />
      <span style={{ marginLeft: 12 }}>v{__APP_VERSION__.split('.').slice(0, 2).join('.')}</span>
      <span style={{ marginLeft: 6 }}>
        · {state.status === 'ready' ? `${filteredBundles.length}/${state.bundles.length}` : state.status}
      </span>
      <button
        style={{ padding: '2px 8px', fontSize: 11, marginLeft: 10 }}
        disabled={state.status === 'loading-registry' || state.status === 'loading-bundles'}
        onClick={() => void load({ force: true })}
      >
        {t('topbar.refresh')}
      </button>
      <LangSwitcher />
    </>
  );

  return (
    <div className="app">
      <header className="topbar">
        <h1
          onClick={() => { closeBurn(); setTab('overview'); }}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          title={t('nav.home')}
        >
          <img
            src={`${import.meta.env.BASE_URL}playascope.svg`}
            alt=""
            width={28}
            height={28}
            style={{ display: 'block' }}
          />
          <span>playa<span className="accent">scope</span></span>
        </h1>
        {isMobile ? (
          <>
            {/* Row 1 ends here (brand + hamburger); the countdown wraps to its
                own full-width row 2 via `flex: 1 1 100%` — see index.css. */}
            <button
              className="hamburger"
              aria-label={t('nav.menu')}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <Countdown
              bundles={state.bundles}
              sanction={state.sanction}
              filter={filter}
              onJump={(slug) => openBurn(slug)}
            />
          </>
        ) : (
          <>
            <nav className="tab-bar" aria-label={t('nav.primary')}>
              {(['explore', 'detail'] as const).map((group) => (
                <div key={group} className="tab-group" aria-label={group}>
                  {TABS.filter((tb) => tb.group === group).map((tb) => (
                    <button
                      key={tb.key}
                      aria-current={tab === tb.key && !burnHash ? 'page' : undefined}
                      className={tab === tb.key && !burnHash ? 'active' : ''}
                      onClick={() => {
                        // Leaving a BurnDetail drilldown is the user's most-likely
                        // intent when they click a top-level tab. Clear the hash
                        // before switching, otherwise BurnDetail keeps rendering.
                        if (burnHash) closeBurn();
                        setTab(tb.key);
                      }}
                    >
                      {t(tb.labelKey)}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <div className="meta">
              <Countdown
                bundles={state.bundles}
                sanction={state.sanction}
                filter={filter}
                onJump={(slug) => openBurn(slug)}
              />
              {' '}
              {metaControls}
            </div>
          </>
        )}
      </header>

      {isMobile && (
        <NavDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          tabs={TABS}
          activeTab={tab}
          onBurnDetail={!!burnHash}
          onSelectTab={(key) => {
            if (burnHash) closeBurn();
            setTab(key as Tab);
            setDrawerOpen(false);
          }}
          footer={metaControls}
        />
      )}

      {/* Prominent active-filter bar. The region filter in particular is set
          by clicking the Overview pie and is otherwise easy to forget about —
          it silently narrows every view, so it gets a loud, obvious clear. */}
      {regionFilter && (
        <div
          className="region-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(255, 138, 61, 0.12)',
            borderBottom: '1px solid var(--accent)',
            fontSize: 13,
          }}
        >
          <span
            style={{
              width: 10, height: 10, borderRadius: '50%',
              background: REGION_COLORS[regionFilter], display: 'inline-block',
            }}
          />
          <span>
            {t('regionBar.filtered', { region: regionFilter, count: filteredBundles.length })}
          </span>
          <button
            className="primary"
            style={{ marginLeft: 'auto', fontSize: 12, padding: '5px 12px' }}
            onClick={() => setRegionFilter(null)}
          >
            {t('regionBar.clear')}
          </button>
        </div>
      )}

      {/* On mobile the sanction-info strip collapses to a tappable badge
          (issue #13 P1) — it's diagnostic detail, not primary content. */}
      {state.sanction?.index && isMobile && (
        <button
          className="sanction-badge"
          onClick={() => setSanctionOpen((v) => !v)}
          style={{ color: stale ? 'var(--warn)' : 'var(--muted)' }}
        >
          <span
            className="sanction-dot"
            style={{ background: stale ? 'var(--warn)' : 'var(--good)' }}
          />
          {t('sanctionStrip.badge')} {sanctionOpen ? '▲' : '▼'}
        </button>
      )}
      {state.sanction?.index && (!isMobile || sanctionOpen) && (
        <div
          className="sanction-strip"
          style={{
            borderBottom: '1px solid var(--border)',
            background: stale ? 'rgba(245, 197, 66, 0.08)' : 'var(--panel)',
            color: stale ? 'var(--warn)' : 'var(--muted)',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {t('sanctionStrip.summary', {
            count: state.sanction.index.events.length,
            date: new Date(state.sanction.index.scrapedAt).toISOString().slice(0, 10),
            age: Math.round(state.sanction.index.ageDays),
          })}
          {stale && t('sanctionStrip.stale')}
          {state.sanction.unmatched.length > 0 && (
            <>
              {' · '}
              <button
                onClick={() => setShowUnmatched((v) => !v)}
                style={{
                  background: 'none', border: 'none', padding: 0, font: 'inherit',
                  color: 'inherit', textDecoration: 'underline dotted', cursor: 'pointer',
                }}
              >
                {t('sanctionStrip.unmatched', { count: state.sanction.unmatched.length })}
                {' '}{showUnmatched ? '▲' : '▼'}
              </button>
              {showUnmatched && (
                <div style={{ marginTop: 4, color: 'var(--muted)', lineHeight: 1.5 }}>
                  {state.sanction.unmatched.join(' · ')}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <main>
        {state.status === 'error' && (
          <div className="error">{t('load.failed', { error: state.error })}</div>
        )}
        {(state.status === 'loading-registry' || state.status === 'loading-bundles') && (
          <div className="loading">
            <div>
              {state.status === 'loading-registry'
                ? t('load.registry')
                : t('load.bundles', { done: state.progress.done, total: state.progress.total })}
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
            <div style={{ fontSize: 11 }}>{t('load.dataVia')}</div>
          </div>
        )}
        {state.status === 'ready' && burnHash && (
          <BurnDetail
            slug={burnHash}
            allBundles={state.bundles}
            sanction={state.sanction}
            attendance={state.attendance}
            onBack={closeBurn}
          />
        )}
        {state.status === 'ready' && !burnHash && filteredBundles.length > 0 && (
          <>
            {tab === 'overview' && (
              <Overview
                bundles={filteredBundles}
                sanction={state.sanction}
                filter={filter}
                onSelectRegion={setRegionFilter}
                onOpenBurn={openBurn}
              />
            )}
            {tab === 'type-mix' && <TypeMix bundles={filteredBundles} onOpenBurn={openBurn} />}
            {tab === 'personality' && (
              <Personality bundles={filteredBundles} allBundles={state.bundles} onOpenBurn={openBurn} />
            )}
            {tab === 'battle' && (
              <BurnBattle
                allBundles={state.bundles}
                sanction={state.sanction}
                attendance={state.attendance}
                onOpenBurn={openBurn}
              />
            )}
            {tab === 'lexicon' && <Lexicon bundles={filteredBundles} />}
            {tab === 'artists' && <Artists bundles={filteredBundles} />}
            {tab === 'schedule' && <ScheduleShape bundles={filteredBundles} onOpenBurn={openBurn} />}
            {tab === 'calendar' && (
              <Calendar bundles={filteredBundles} sanction={state.sanction} onOpenBurn={openBurn} />
            )}
            {tab === 'continuity' && (
              <Continuity bundles={filteredBundles} allBundles={state.bundles} onOpenBurn={openBurn} />
            )}
            {tab === 'geo' && (
              <GeoMap bundles={filteredBundles} sanction={state.sanction} onOpenBurn={openBurn} />
            )}
            {tab === 'moop' && <Moop bundles={filteredBundles} onOpenBurn={openBurn} />}
            {tab === 'table' && (
              <DataTable
                bundles={filteredBundles}
                sanction={state.sanction}
                attendance={state.attendance}
                onOpenBurn={openBurn}
              />
            )}
          </>
        )}
        {state.status === 'ready' && filteredBundles.length === 0 && (
          <div className="loading">
            <div>{t('empty.noMatch')}</div>
            <button onClick={() => setFilter('all')}>{t('empty.showAll')}</button>
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
  const { t } = useTranslation();
  const OPTIONS: { key: SanctionFilter; label: string; sub: string }[] = [
    { key: 'all', label: t('filter.all'), sub: `${totalCount}` },
    { key: 'sanctioned', label: t('filter.official'), sub: `${sanctionedCount}` },
    { key: 'unsanctioned', label: t('filter.other'), sub: `${Math.max(0, totalCount - sanctionedCount)}` },
  ];
  return (
    <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} title={t('filter.sanctionTitle')}>
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
