// SQLite access. Converts snake_case rows into contract-shaped objects.
import { initSchema } from './db.js';

function toHabit(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    frequency: { type: row.frequency_type, days: JSON.parse(row.frequency_days) },
    weeklyGoal: row.weekly_goal,
    archived: row.archived === 1,
    createdAt: row.created_at,
  };
}

export function createRepository(db) {
  initSchema(db);

  const stmt = {
    listAll: db.prepare('SELECT * FROM habits ORDER BY id'),
    listActive: db.prepare('SELECT * FROM habits WHERE archived = 0 ORDER BY id'),
    get: db.prepare('SELECT * FROM habits WHERE id = ?'),
    insert: db.prepare(`
      INSERT INTO habits (name, color, icon, frequency_type, frequency_days, weekly_goal, archived, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)`),
    update: db.prepare(`
      UPDATE habits SET name = ?, color = ?, icon = ?, frequency_type = ?, frequency_days = ?, weekly_goal = ?
      WHERE id = ?`),
    setArchived: db.prepare('UPDATE habits SET archived = ? WHERE id = ?'),
    habitCheckins: db.prepare('SELECT date FROM checkins WHERE habit_id = ? ORDER BY date'),
    activeCheckins: db.prepare(`
      SELECT c.habit_id AS habitId, c.date FROM checkins c
      JOIN habits h ON h.id = c.habit_id WHERE h.archived = 0 ORDER BY c.date, c.habit_id`),
    allCheckins: db.prepare('SELECT habit_id AS habitId, date FROM checkins ORDER BY date, habit_id'),
    activeCheckinsBetween: db.prepare(`
      SELECT c.habit_id AS habitId, c.date FROM checkins c
      JOIN habits h ON h.id = c.habit_id
      WHERE h.archived = 0 AND c.date BETWEEN ? AND ? ORDER BY c.date, c.habit_id`),
    addCheckin: db.prepare('INSERT OR IGNORE INTO checkins (habit_id, date) VALUES (?, ?)'),
    removeCheckin: db.prepare('DELETE FROM checkins WHERE habit_id = ? AND date = ?'),
  };

  return {
    listHabits({ includeArchived = false } = {}) {
      return (includeArchived ? stmt.listAll : stmt.listActive).all().map(toHabit);
    },
    getHabit(id) {
      const row = stmt.get.get(id);
      return row ? toHabit(row) : null;
    },
    createHabit({ name, color, icon, frequency, weeklyGoal }, createdAt) {
      const { lastInsertRowid } = stmt.insert.run(
        name, color, icon, frequency.type, JSON.stringify(frequency.days), weeklyGoal, createdAt,
      );
      return this.getHabit(Number(lastInsertRowid));
    },
    updateHabit(id, { name, color, icon, frequency, weeklyGoal }) {
      stmt.update.run(name, color, icon, frequency.type, JSON.stringify(frequency.days), weeklyGoal, id);
      return this.getHabit(id);
    },
    setArchived(id, archived) {
      stmt.setArchived.run(archived ? 1 : 0, id);
      return this.getHabit(id);
    },
    habitCheckinDates(id) {
      return stmt.habitCheckins.all(id).map((r) => r.date);
    },
    /** All check-ins as { habitId, date }; restricted to non-archived habits by default. */
    checkins({ includeArchived = false } = {}) {
      return (includeArchived ? stmt.allCheckins : stmt.activeCheckins).all().map((r) => ({ ...r }));
    },
    activeCheckinsBetween(from, to) {
      return stmt.activeCheckinsBetween.all(from, to).map((r) => ({ ...r }));
    },
    addCheckin(id, date) {
      stmt.addCheckin.run(id, date);
    },
    removeCheckin(id, date) {
      stmt.removeCheckin.run(id, date);
    },
  };
}
