import Database from '@tauri-apps/plugin-sql';

const DB_URL = 'sqlite:nodx.db';

let dbPromise: Promise<Database> | null = null;

/**
 * Lazy-load and cache the SQLite handle. Migrations are declared on the Rust
 * side (`apps/desktop/src-tauri/src/lib.rs`) and run automatically on first
 * `Database::load`.
 */
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}
