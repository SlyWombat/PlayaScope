import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Small (i) button in the topbar — opens a blurb about the app, credits the
// Dust data source, and links the GitHub repo. Closes on outside-click / Esc.
export function InfoPopover() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="info-popover">
      <button
        type="button"
        className="info-btn"
        aria-label={t('info.title')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {open && (
        <div className="info-panel" role="dialog" aria-label={t('info.title')}>
          <h3>{t('info.title')}</h3>
          <p>{t('info.blurb')}</p>
          <p>
            {t('info.dataCredit')}{' '}
            <a href="https://dust.events/" target="_blank" rel="noopener noreferrer">dust.events</a>
          </p>
          <a
            className="info-github"
            href="https://github.com/SlyWombat/PlayaScope"
            target="_blank"
            rel="noopener noreferrer"
          >
            ★ {t('info.github')}
          </a>
        </div>
      )}
    </div>
  );
}
