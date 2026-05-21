// Locale switcher — sits in the topbar meta strip. Changing the selection
// calls i18n.changeLanguage(); the browser-language detector persists the
// choice to localStorage (key 'playascope-lang'), so it survives reloads.

import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '../i18n';

export function LangSwitcher() {
  const { i18n, t } = useTranslation();
  // i18n.language can be a region tag ("fr-CA"); match on the base code.
  const active = i18n.language.split('-')[0];

  return (
    <select
      aria-label={t('lang.label')}
      title={t('lang.label')}
      value={SUPPORTED_LOCALES.some((l) => l.code === active) ? active : 'en'}
      onChange={(e) => void i18n.changeLanguage(e.target.value)}
      style={{
        marginLeft: 10,
        background: 'var(--panel-2)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
        borderRadius: 6,
        padding: '2px 6px',
        fontSize: 11,
        fontFamily: 'inherit',
      }}
    >
      {SUPPORTED_LOCALES.map((l) => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
