import { useEffect, useState } from 'react';

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
      <span className="visually-hidden">Thème</span>
      <select aria-label="Thème" value={theme} onChange={(e) => setTheme(e.target.value)}>
        <option value="system">◐ Système</option>
        <option value="light">☀ Clair</option>
        <option value="dark">☾ Sombre</option>
      </select>
    </label>
  );
}
