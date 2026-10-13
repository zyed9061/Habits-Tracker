export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (message) => new HttpError(400, message);
export const notFound = (message) => new HttpError(404, message);

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const NAME_MAX = 60;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function validateName(name) {
  if (typeof name !== 'string') throw badRequest('name doit être une chaîne de caractères');
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > NAME_MAX) {
    throw badRequest(`name doit contenir entre 1 et ${NAME_MAX} caractères`);
  }
  return trimmed;
}

function validateColor(color) {
  if (typeof color !== 'string' || !COLOR_RE.test(color)) {
    throw badRequest('color doit être une couleur hexadécimale #RRGGBB');
  }
  return color;
}

function validateIcon(icon) {
  if (typeof icon !== 'string' || icon.trim() === '') {
    throw badRequest('icon doit être un emoji (chaîne non vide)');
  }
  if ([...icon].length > 8) throw badRequest('icon doit contenir au plus 8 caractères');
  return icon;
}

function validateFrequency(frequency) {
  if (!isPlainObject(frequency)) {
    throw badRequest('frequency doit être un objet { type, days }');
  }
  if (frequency.type === 'daily') return { type: 'daily', days: [...ALL_DAYS] };
  if (frequency.type !== 'weekdays') {
    throw badRequest('frequency.type doit valoir "daily" ou "weekdays"');
  }
  const { days } = frequency;
  if (!Array.isArray(days) || days.length === 0) {
    throw badRequest('frequency.days doit être une liste non vide de jours (0 = lundi … 6 = dimanche)');
  }
  if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    throw badRequest('frequency.days ne doit contenir que des entiers de 0 à 6');
  }
  if (new Set(days).size !== days.length) {
    throw badRequest('frequency.days ne doit pas contenir de doublons');
  }
  return { type: 'weekdays', days: [...days].sort((a, b) => a - b) };
}

function validateWeeklyGoal(goal, scheduledDays) {
  if (!Number.isInteger(goal) || goal < 1 || goal > 7) {
    throw badRequest('weeklyGoal doit être un entier entre 1 et 7');
  }
  if (goal > scheduledDays) {
    throw badRequest(`weeklyGoal (${goal}) ne peut dépasser le nombre de jours prévus (${scheduledDays})`);
  }
  return goal;
}

/** Validates a POST body. Returns normalised `{ name, color, icon, frequency, weeklyGoal }`. */
export function validateNewHabit(body) {
  if (!isPlainObject(body)) throw badRequest('Le corps de la requête doit être un objet JSON');
  for (const field of ['name', 'color', 'icon', 'frequency']) {
    if (body[field] === undefined) throw badRequest(`${field} est obligatoire`);
  }
  const frequency = validateFrequency(body.frequency);
  return {
    name: validateName(body.name),
    color: validateColor(body.color),
    icon: validateIcon(body.icon),
    frequency,
    weeklyGoal:
      body.weeklyGoal === undefined || body.weeklyGoal === null
        ? frequency.days.length
        : validateWeeklyGoal(body.weeklyGoal, frequency.days.length),
  };
}

/**
 * Validates a PATCH body against the current habit and returns the full merged
 * habit fields. When the frequency changes without an explicit weeklyGoal, the
 * existing goal is capped to the new number of scheduled days.
 */
export function validateHabitPatch(body, current) {
  if (!isPlainObject(body)) throw badRequest('Le corps de la requête doit être un objet JSON');
  const next = {
    name: body.name !== undefined ? validateName(body.name) : current.name,
    color: body.color !== undefined ? validateColor(body.color) : current.color,
    icon: body.icon !== undefined ? validateIcon(body.icon) : current.icon,
    frequency: body.frequency !== undefined ? validateFrequency(body.frequency) : current.frequency,
  };
  next.weeklyGoal =
    body.weeklyGoal !== undefined
      ? validateWeeklyGoal(body.weeklyGoal, next.frequency.days.length)
      : Math.min(current.weeklyGoal, next.frequency.days.length);
  return next;
}

/** Parses an optional integer query parameter within [min, max]. */
export function intQuery(value, name, { min, max, fallback }) {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw badRequest(`${name} doit être un entier entre ${min} et ${max}`);
  }
  const n = Number(value);
  if (n < min || n > max) throw badRequest(`${name} doit être un entier entre ${min} et ${max}`);
  return n;
}
