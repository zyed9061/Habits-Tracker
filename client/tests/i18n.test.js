import { afterEach, describe, expect, it } from 'vitest';
import { validateHabit } from '../src/components/HabitForm.jsx';
import { formatLongDate as dashLongDate, formatRate, formatShortDate } from '../src/dashboard/format.js';
import { formatLongDate } from '../src/dates.js';
import { getLang, setLang, t, translate } from '../src/i18n/index.js';
import { MESSAGES } from '../src/i18n/messages.js';

afterEach(() => {
  setLang('fr');
  localStorage.clear();
});

const paramNames = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translate()', () => {
  it('falls back from a missing English key to French, then to the key itself', () => {
    const key = 'test.onlyFrench';
    MESSAGES.fr[key] = 'Seulement {x}';
    try {
      expect(translate('en', key, { x: 'fr' })).toBe('Seulement fr');
      expect(translate('en', 'test.unknown.key')).toBe('test.unknown.key');
    } finally {
      delete MESSAGES.fr[key];
    }
  });

  it('replaces params and blanks missing ones', () => {
    expect(translate('fr', 'habits.created', { name: 'Lire' })).toBe('« Lire » créée.');
    expect(translate('en', 'habits.created', {})).toBe('“” created.');
  });
});

describe('catalog parity', () => {
  it('has identical key sets in fr and en', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.fr).sort());
  });

  it('uses identical {param} names for every key', () => {
    for (const key of Object.keys(MESSAGES.fr)) {
      expect(paramNames(MESSAGES.en[key]), key).toEqual(paramNames(MESSAGES.fr[key]));
    }
  });
});

describe('locale-aware formatting', () => {
  it('formatRate: narrow no-break space before % in French, none in English, null -> dash', () => {
    expect(formatRate(0.73)).toBe('73\u202F%');
    expect(formatRate(null)).toBe('—');
    setLang('en');
    expect(formatRate(0.73)).toBe('73%');
    expect(formatRate(null)).toBe('—');
  });

  it('formats short and long dates in both languages', () => {
    expect(formatShortDate('2026-10-08')).toBe('8 oct.');
    expect(dashLongDate('2026-10-08')).toBe('jeudi 8 octobre 2026');
    expect(formatLongDate(new Date(2026, 9, 8))).toBe('jeudi 8/10');
    setLang('en');
    expect(formatShortDate('2026-10-08')).toBe('Oct 8');
    expect(dashLongDate('2026-10-08')).toBe('Thursday, October 8, 2026');
    expect(formatLongDate(new Date(2026, 9, 8))).toBe('Thursday 10/8');
  });
});

describe('validateHabit with an explicit translator', () => {
  const values = { name: '', color: '#4F46E5', icon: '✅', type: 'daily', days: [0, 1, 2, 3, 4, 5, 6], weeklyGoal: 7 };

  it('uses the given translator instead of the current language', () => {
    const en = (key, params) => translate('en', key, params);
    expect(validateHabit(values, en).name).toBe('Name is required.');
    expect(validateHabit({ ...values, name: 'x'.repeat(61) }, en).name).toBe('60 characters maximum.');
    expect(validateHabit(values).name).toBe('Le nom est obligatoire.');
  });
});

describe('setLang()', () => {
  it('ignores invalid codes', () => {
    setLang('de');
    setLang(undefined);
    expect(getLang()).toBe('fr');
    expect(localStorage.getItem('lang')).toBeNull();
  });

  it('persists a valid language to localStorage and updates t()', () => {
    setLang('en');
    expect(getLang()).toBe('en');
    expect(localStorage.getItem('lang')).toBe('en');
    expect(t('app.nav.habits')).toBe('Habits');
  });
});
