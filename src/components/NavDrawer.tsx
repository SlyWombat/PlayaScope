// Mobile navigation drawer (GitHub issue #13, P0).
//
// On phones the 12-tab pill bar + meta strip ate ~200px of vertical space
// before any content. This collapses all of it behind a hamburger: the tabs
// live here as a slide-in list, and the meta controls (filters, refresh,
// version, language) ride along in the footer. Desktop keeps the pill bar —
// App.tsx only renders this when useIsMobile() is true.

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface TabItem {
  key: string;
  labelKey: string;
  group: 'explore' | 'detail';
}

interface Props {
  open: boolean;
  onClose: () => void;
  tabs: TabItem[];
  activeTab: string;
  /** True when a burn-detail drilldown is showing — then no tab is "current". */
  onBurnDetail: boolean;
  onSelectTab: (key: string) => void;
  /** Meta controls (filters / refresh / version / language) for the footer. */
  footer: React.ReactNode;
}

const GROUPS: { id: 'explore' | 'detail'; labelKey: string }[] = [
  { id: 'explore', labelKey: 'nav.groupExplore' },
  { id: 'detail', labelKey: 'nav.groupDetail' },
];

export function NavDrawer({ open, onClose, tabs, activeTab, onBurnDetail, onSelectTab, footer }: Props) {
  const { t } = useTranslation();

  // While open: lock body scroll and let Escape close the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`nav-drawer-backdrop${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`nav-drawer${open ? ' open' : ''}`}
        aria-label={t('nav.primary')}
        aria-hidden={!open}
      >
        <div className="nav-drawer-head">
          <span>playa<span className="accent">scope</span></span>
          <button onClick={onClose} className="nav-drawer-close" aria-label={t('nav.close')}>✕</button>
        </div>
        <nav className="nav-drawer-nav">
          {GROUPS.map((g) => (
            <div key={g.id} className="nav-drawer-group">
              <div className="nav-drawer-group-label">{t(g.labelKey)}</div>
              {tabs.filter((tb) => tb.group === g.id).map((tb) => {
                const current = activeTab === tb.key && !onBurnDetail;
                return (
                  <button
                    key={tb.key}
                    className={`nav-drawer-item${current ? ' active' : ''}`}
                    aria-current={current ? 'page' : undefined}
                    onClick={() => onSelectTab(tb.key)}
                  >
                    {t(tb.labelKey)}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="nav-drawer-footer">{footer}</div>
      </aside>
    </>
  );
}
