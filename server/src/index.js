import { createApp } from './app.js';
import { openDb } from './db.js';

const PORT = Number(process.env.PORT) || 3001;

const db = openDb();
createApp(db).listen(PORT, () => {
  console.log(`API habit-tracker sur http://localhost:${PORT}/api`);
});
