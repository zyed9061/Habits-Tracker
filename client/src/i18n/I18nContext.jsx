import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LANG, MESSAGES } from './messages.js';

export const STORAGE_KEY = 'lang';

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return Object.hasOwn(MESSAGES, v) ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

// Sans fournisseur (composant rendu isolément), l'interface reste en langue par défaut.
const I18nContext = createContext({ lang: DEFAULT_LANG, t: MESSAGES[DEFAULT_LANG], setLang: () => {} });

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(readStored);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = MESSAGES[lang].app.title;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // stockage indisponible : le choix vaut pour la session
    }
  }, [lang]);

  const value = useMemo(() => ({ lang, t: MESSAGES[lang], setLang }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

// Message d'erreur API dans la langue courante : les erreurs produites par le
// client (réseau, statut sans corps) portent un `code` ; les autres gardent le
// message renvoyé par le serveur.
export function describeError(err, t) {
  if (err?.code === 'unreachable') return t.errors.unreachable;
  if (err?.code === 'http') return t.errors.http(err.status);
  return err?.message ?? '';
}
