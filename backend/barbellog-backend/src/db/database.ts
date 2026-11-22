import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ENV from '../config/env.config.js';

let database: DatabaseSync | undefined;

export function getDatabase(): DatabaseSync {
  if (database) return database;

  const filename = resolve(ENV.SQLITE_PATH);
  mkdirSync(dirname(filename), { recursive: true });
  database = new DatabaseSync(filename);
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  return database;
}

/**
 * Run synchronous database work in one write transaction.
 * userId must come from verified authentication state, never request input.
 * SQLite has no row-level security, so every query must scope user-owned rows by userId.
 */
export function withUserContext<T>(
  userId: string,
  operation: (db: DatabaseSync, userId: string) => T,
): T {
  if (!userId) throw new Error('An authenticated user is required');

  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation(db, userId);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function closeDatabase(): void {
  database?.close();
  database = undefined;
}
