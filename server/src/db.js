import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const DEFAULT_DB_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../data/habits.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS habits (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  color           TEXT    NOT NULL,
  icon            TEXT    NOT NULL,
  frequency_type  TEXT    NOT NULL CHECK (frequency_type IN ('daily', 'weekdays')),
  frequency_days  TEXT    NOT NULL,            -- JSON array of 0..6 (0 = Monday)
  weekly_goal     INTEGER NOT NULL CHECK (weekly_goal BETWEEN 1 AND 7),
  archived        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL             -- YYYY-MM-DD, local
);
CREATE TABLE IF NOT EXISTS checkins (
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date     TEXT    NOT NULL,                   -- YYYY-MM-DD, local
  UNIQUE (habit_id, date)
);
CREATE INDEX IF NOT EXISTS checkins_date ON checkins(date);
`;

/** Creates the tables if needed. Safe to call on an already initialised database. */
export function initSchema(db) {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
}

/** Opens (and initialises) the database. `:memory:` is supported for tests. */
export function openDb(path = process.env.DB_PATH || DEFAULT_DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  initSchema(db);
  return db;
}
