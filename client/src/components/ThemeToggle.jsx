import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.js';

const STORAGE_KEY = 'theme';

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

// Choix « système » = pas d'attribut data-theme, theme.css suit prefers-color-scheme.
export default function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState(readStored);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // stockage indisponible : le choix vaut pour la session
    }
  }, [theme]);

  return (
    <label className="theme-toggle">
      <span className="visually-hidden">{t('theme.label')}</span>
      <select aria-label={t('theme.label')} value={theme} onChange={(e) => setTheme(e.target.value)}>
        <option value="system">{t('theme.system')}</option>
        <option value="light">{t('theme.light')}</option>
        <option value="dark">{t('theme.dark')}</option>
      </select>
    </label>
  );
}
