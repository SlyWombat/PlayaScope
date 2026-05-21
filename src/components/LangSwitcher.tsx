// Locale switcher — a globe icon (the universal language affordance) plus the
// active language as a compact 2-letter code. Changing it calls
// i18n.changeLanguage(); the browser-language detector persists the choice to
// localStorage (key 'playascope-lang'), so it survives reloads.

import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '../i18n';

// Inline globe (Feather "globe") — deliberately an SVG, not an emoji.
function GlobeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function LangSwitcher() {
  const { i18n, t } = useTranslation();
  // i18n.language can be a region tag ("fr-CA"); match on the base code.
  const active = i18n.language.split('-')[0];

  return (
    <label
      title={t('lang.label')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        marginLeft: 10,
        color: 'var(--muted)',
        cursor: 'pointer',
      }}
    >
      <GlobeIcon />
      <select
        aria-label={t('lang.label')}
        value={SUPPORTED_LOCALES.some((l) => l.code === active) ? active : 'en'}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text)',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'inherit',
          padding: '2px 0',
          cursor: 'pointer',
        }}
      >
        {SUPPORTED_LOCALES.map((l) => (
          // 2-letter code in the control; full name as a tooltip on the option.
          <option key={l.code} value={l.code} title={l.label}>
            {l.code.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
