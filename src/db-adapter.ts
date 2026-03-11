/**
 * Thin synchronous-SQLite adapter that works under both Bun (bun:sqlite) and
 * Node (node:sqlite, available since Node 22.5).
 *
 * Both drivers expose a synchronous API and support proper WAL-mode concurrent
 * access across processes, which is the key property we need: the MCP server
 * can hold a persistent connection while CLI commands open short-lived connections
 * to the same database without "Locking error: Failed locking file".
 *
 * The public surface mirrors what FeedbackStore needs from the old
 * @tursodatabase/database driver:
 *   - db.exec(sql)
 *   - db.prepare(sql) → stmt
 *   - stmt.run(...params) → { changes }
 *   - stmt.get(...params) → row | null
 *   - stmt.all(...params) → row[]
 *   - db.close()
 */

export interface DbRunResult {
  changes: number;
}

export interface DbStatement {
  run(...params: unknown[]): DbRunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface DbConnection {
  exec(sql: string): void;
  prepare(sql: string): DbStatement;
  close(): void;
}

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

function isBunRuntime(): boolean {
  return typeof (globalThis as any).Bun !== "undefined";
}

// ---------------------------------------------------------------------------
// Bun adapter  (bun:sqlite)
// ---------------------------------------------------------------------------

async function openBunDb(path: string): Promise<DbConnection> {
  const { Database } = await import("bun:sqlite" as any);
  const db = new Database(path);
  return {
    exec(sql: string) {
      db.exec(sql);
    },
    prepare(sql: string): DbStatement {
      const stmt = db.prepare(sql);
      return {
        run(...params: unknown[]): DbRunResult {
          const r = stmt.run(...params);
          return { changes: r.changes ?? 0 };
        },
        get(...params: unknown[]): unknown {
          return stmt.get(...params) ?? null;
        },
        all(...params: unknown[]): unknown[] {
          return stmt.all(...params);
        },
      };
    },
    close() {
      db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Node adapter  (node:sqlite, Node ≥ 22.5)
// ---------------------------------------------------------------------------

async function openNodeDb(path: string): Promise<DbConnection> {
  // node:sqlite is synchronous — DatabaseSync
  const { DatabaseSync } = await import("node:sqlite" as any);
  const db = new DatabaseSync(path);
  return {
    exec(sql: string) {
      db.exec(sql);
    },
    prepare(sql: string): DbStatement {
      const stmt = db.prepare(sql);
      return {
        run(...params: unknown[]): DbRunResult {
          const r = stmt.run(...params);
          return { changes: r.changes ?? 0 };
        },
        get(...params: unknown[]): unknown {
          return stmt.get(...params) ?? null;
        },
        all(...params: unknown[]): unknown[] {
          return stmt.all(...params);
        },
      };
    },
    close() {
      db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Open a SQLite database at the given path, set WAL mode and a 5-second busy
 * timeout, then return the connection.
 *
 * Uses bun:sqlite when running under Bun, node:sqlite otherwise.  Both drivers
 * support proper WAL concurrent reads/writes across multiple processes, which
 * fixes the "Locking error: Failed locking file" that occurred with the old
 * @tursodatabase/database driver.
 */
export async function openDb(path: string): Promise<DbConnection> {
  const db = isBunRuntime() ? await openBunDb(path) : await openNodeDb(path);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA busy_timeout=5000");
  return db;
}
