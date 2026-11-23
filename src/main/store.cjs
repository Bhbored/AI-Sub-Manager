const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

function openStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'monitor.sqlite'));
  db.exec('PRAGMA journal_mode = WAL');
  if (db.prepare('PRAGMA user_version').get().user_version === 0) {
    db.exec(`BEGIN;
      CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE snapshots (id INTEGER PRIMARY KEY, provider TEXT NOT NULL, collected TEXT NOT NULL, value TEXT NOT NULL);
      CREATE INDEX snapshots_provider ON snapshots(provider, id DESC);
      PRAGMA user_version = 1;
      COMMIT;`);
  }
  const setting = db.prepare('SELECT value FROM preferences WHERE key = ?');
  const save = db.prepare('INSERT INTO preferences VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const latest = db.prepare('SELECT value FROM snapshots WHERE provider = ? ORDER BY id DESC LIMIT 1');
  return {
    read: key => JSON.parse(setting.get(key)?.value ?? 'null'),
    write: (key, value) => save.run(key, JSON.stringify(value)),
    latest: id => JSON.parse(latest.get(id)?.value ?? 'null'),
    clear: id => db.prepare('DELETE FROM snapshots WHERE provider = ?').run(id),
    snapshot(id, value) {
      db.prepare('INSERT INTO snapshots(provider,collected,value) VALUES (?, ?, ?)').run(id, value.collectedAt, JSON.stringify(value));
      db.prepare('DELETE FROM snapshots WHERE provider = ? AND id NOT IN (SELECT id FROM snapshots WHERE provider = ? ORDER BY id DESC LIMIT 500)').run(id, id);
    },
    close: () => db.close()
  };
}
module.exports = { openStore };
