import { createApp } from './app.js';
import { openDb } from './db.js';

const PORT = Number(process.env.PORT) || 3001;
// Écoute locale par défaut : l'API (dont /api/chat, payant) n'est pas exposée au
// réseau. HOST=0.0.0.0 pour l'ouvrir volontairement.
const HOST = process.env.HOST || '127.0.0.1';

const db = openDb();
createApp(db).listen(PORT, HOST, () => {
  console.log(`API habit-tracker sur http://${HOST}:${PORT}/api`);
});
