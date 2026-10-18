/** Parses a comma-separated origin list (e.g. "https://user.github.io,http://localhost:5173"). */
export function parseOrigins(value = process.env.CORS_ORIGINS) {
  return String(value ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Minimal CORS for a browser frontend hosted on another origin.
 * Only listed origins are echoed back; with no list, no CORS headers are sent (same-origin / dev proxy).
 */
export function corsMiddleware(origins = parseOrigins()) {
  const allowed = new Set(Array.isArray(origins) ? origins : parseOrigins(origins));
  return (req, res, next) => {
    const origin = req.get('origin');
    if (origin && allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
        res.set('Access-Control-Allow-Headers', req.get('access-control-request-headers') || 'Content-Type');
        res.set('Access-Control-Max-Age', '600');
        return res.sendStatus(204);
      }
    }
    return next();
  };
}
