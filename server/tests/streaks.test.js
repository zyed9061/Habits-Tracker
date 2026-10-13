import { describe, expect, it } from 'vitest';
import { computeStreaks } from '../src/streaks.js';
import { TODAY } from './helpers.js';

// Calendar around TODAY (Thu 2026-10-08), 0 = Monday … 6 = Sunday:
// Mon 09-28 Tue 09-29 Wed 09-30 Thu 10-01 Fri 10-02 Sat 10-03 Sun 10-04
// Mon 10-05 Tue 10-06 Wed 10-07 Thu 10-08 (today)
const DAILY = { type: 'daily', days: [0, 1, 2, 3, 4, 5, 6] };
const MWF = { type: 'weekdays', days: [0, 2, 4] };

describe('computeStreaks (F3)', () => {
  it('returns 0/0 without check-ins', () => {
    expect(computeStreaks(DAILY, [], TODAY)).toEqual({ currentStreak: 0, bestStreak: 0 });
  });

  it('daily habit, today checked: counts consecutive days back from today', () => {
    expect(computeStreaks(DAILY, ['2026-10-06', '2026-10-07', '2026-10-08'], TODAY))
      .toEqual({ currentStreak: 3, bestStreak: 3 });
  });

  it('today scheduled but not yet checked: starts from the previous scheduled day', () => {
    expect(computeStreaks(DAILY, ['2026-10-05', '2026-10-06', '2026-10-07'], TODAY))
      .toEqual({ currentStreak: 3, bestStreak: 3 });
  });

  it('today and yesterday unchecked: current streak is 0, best keeps history', () => {
    expect(computeStreaks(DAILY, ['2026-10-05', '2026-10-06'], TODAY))
      .toEqual({ currentStreak: 0, bestStreak: 2 });
  });

  it('a missed scheduled day breaks the streak', () => {
    // 10-07 missing
    expect(computeStreaks(DAILY, ['2026-10-05', '2026-10-06', '2026-10-08'], TODAY))
      .toEqual({ currentStreak: 1, bestStreak: 2 });
  });

  it('best streak is the longest run in history, not the current one', () => {
    const dates = [
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', // run of 5
      // 10-03 missed
      '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', // run of 4
    ];
    expect(computeStreaks(DAILY, dates, TODAY)).toEqual({ currentStreak: 4, bestStreak: 5 });
  });

  it('weekdays habit: non-scheduled days neither break nor extend the streak', () => {
    // Mon/Wed/Fri; today (Thu) is not scheduled
    const dates = ['2026-09-30', '2026-10-02', '2026-10-05', '2026-10-07'];
    expect(computeStreaks(MWF, dates, TODAY)).toEqual({ currentStreak: 4, bestStreak: 4 });
  });

  it('check-ins on non-scheduled days are ignored', () => {
    const base = ['2026-10-05', '2026-10-07'];
    const extra = ['2026-10-03', '2026-10-04', '2026-10-06', '2026-10-08']; // Sat, Sun, Tue, Thu
    expect(computeStreaks(MWF, [...base, ...extra], TODAY)).toEqual({ currentStreak: 2, bestStreak: 2 });
    expect(computeStreaks(MWF, extra, TODAY)).toEqual({ currentStreak: 0, bestStreak: 0 });
  });

  it('weekdays habit: a missed scheduled day breaks the streak', () => {
    // Fri 10-02 missed
    expect(computeStreaks(MWF, ['2026-09-28', '2026-09-30', '2026-10-05', '2026-10-07'], TODAY))
      .toEqual({ currentStreak: 2, bestStreak: 2 });
  });

  it('weekly habit scheduled today but unchecked keeps the streak from previous weeks', () => {
    const thursdays = { type: 'weekdays', days: [3] };
    expect(computeStreaks(thursdays, ['2026-09-24', '2026-10-01'], TODAY))
      .toEqual({ currentStreak: 2, bestStreak: 2 });
    expect(computeStreaks(thursdays, ['2026-09-24', '2026-10-01', '2026-10-08'], TODAY))
      .toEqual({ currentStreak: 3, bestStreak: 3 });
  });

  it('Sunday is weekday 6 (getDay() conversion)', () => {
    const sundays = { type: 'weekdays', days: [6] };
    expect(computeStreaks(sundays, ['2026-09-27', '2026-10-04'], TODAY))
      .toEqual({ currentStreak: 2, bestStreak: 2 });
    const mondays = { type: 'weekdays', days: [0] };
    expect(computeStreaks(mondays, ['2026-09-28', '2026-10-05'], TODAY))
      .toEqual({ currentStreak: 2, bestStreak: 2 });
    // Sunday dates must not count for a Monday habit
    expect(computeStreaks(mondays, ['2026-09-27', '2026-10-04'], TODAY))
      .toEqual({ currentStreak: 0, bestStreak: 0 });
  });

  it('accepts unsorted dates with duplicates', () => {
    expect(computeStreaks(DAILY, ['2026-10-08', '2026-10-06', '2026-10-07', '2026-10-07'], TODAY))
      .toEqual({ currentStreak: 3, bestStreak: 3 });
  });

  it('streak spans month and year boundaries', () => {
    expect(computeStreaks(DAILY, ['2025-12-30', '2025-12-31', '2026-01-01'], '2026-01-01'))
      .toEqual({ currentStreak: 3, bestStreak: 3 });
  });

  it('ignores check-ins after today', () => {
    expect(computeStreaks(DAILY, ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'], TODAY))
      .toEqual({ currentStreak: 2, bestStreak: 2 });
  });

  it('bestStreak is always >= currentStreak', () => {
    const r = computeStreaks(MWF, ['2026-10-05', '2026-10-07'], TODAY);
    expect(r.bestStreak).toBeGreaterThanOrEqual(r.currentStreak);
  });
});
