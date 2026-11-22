import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ENV from '../config/env.config.js';

export function migrateDatabase(filename = ENV.SQLITE_PATH): void {
  const absoluteFilename = resolve(filename);
  mkdirSync(dirname(absoluteFilename), { recursive: true });
  const db = new DatabaseSync(absoluteFilename);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );`);
    const version = '001_initial_schema';
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version)) {
      console.log(`Migration ${version} is already applied.`);
      return;
    }
    const migrationPath = resolve(process.cwd(), 'db/migrations/001_initial_schema.sql');
    db.exec(readFileSync(migrationPath, 'utf8'));
    console.log(`Applied migration ${version} to ${absoluteFilename}.`);
  } finally {
    db.close();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) migrateDatabase();
