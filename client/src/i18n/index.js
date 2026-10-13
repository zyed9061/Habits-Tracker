import { useSyncExternalStore } from 'react';
import { MESSAGES, MONTHS, WEEKDAYS } from './messages.js';

// Langue courante : petit store hors React, lu par les composants (useI18n) et par les modules purs (api, dates).
export const LANGS = ['en', 'fr'];
export const DEFAULT_LANG = 'fr';
const STORAGE_KEY = 'lang';

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return LANGS.includes(v) ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

let current = readStored();
const listeners = new Set();

function applyToDocument(lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.title = translate(lang, 'app.title');
}

export const getLang = () => current;

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // stockage indisponible : le choix vaut pour la session
  }
  applyToDocument(lang);
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// Remplace {nom} par params.nom ; retombe sur le français, puis sur la clé, si la traduction manque.
export function translate(lang, key, params) {
  const text = MESSAGES[lang]?.[key] ?? MESSAGES[DEFAULT_LANG][key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? '')) : text;
}

export const t = (key, params) => translate(current, key, params);

export const weekdayShort = (i) => WEEKDAYS[current].short[i];
export const weekdayLong = (i) => WEEKDAYS[current].long[i];
export const monthShort = (i) => MONTHS[current].short[i];
export const monthLong = (i) => MONTHS[current].long[i];

// Hook : re-rend le composant au changement de langue.
export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLang, () => DEFAULT_LANG);
  return { lang, t: (key, params) => translate(lang, key, params), setLang };
}

applyToDocument(current);
