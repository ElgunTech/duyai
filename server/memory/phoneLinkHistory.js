import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Reads the number of a finished call from Phone Link's local call history (Windows).
 * Phone Link writes a call to calling.db the moment it ends, so by the time the report
 * is ready the row is there. The database is copied first so Phone Link is never blocked.
 */

const FILETIME_EPOCH_OFFSET_MS = 11_644_473_600_000n; // 1601-01-01 → 1970-01-01
const MATCH_WINDOW_MS = 3 * 60 * 1000;

function findCallingDb() {
  const packages = path.join(process.env.LOCALAPPDATA ?? "", "Packages");
  if (!existsSync(packages)) return null;
  const phoneLink = readdirSync(packages).find((d) => d.startsWith("Microsoft.YourPhone_"));
  if (!phoneLink) return null;
  const indexed = path.join(packages, phoneLink, "LocalCache", "Indexed");
  if (!existsSync(indexed)) return null;
  for (const device of readdirSync(indexed)) {
    const db = path.join(indexed, device, "System", "Database", "calling.db");
    if (existsSync(db)) return db;
  }
  return null;
}

/**
 * The phone number of the Phone Link call that started closest to `startedAt`
 * (epoch ms), or null when unavailable (not Windows, no Phone Link, no match).
 */
export async function findCallNumber(startedAt) {
  if (process.platform !== "win32" || !startedAt) return null;
  const source = findCallingDb();
  if (!source) return null;

  const dir = mkdtempSync(path.join(tmpdir(), "acl-calls-"));
  try {
    // The -shm file is locked during calls and not needed: SQLite rebuilds it from the WAL.
    for (const suffix of ["", "-wal"]) {
      if (existsSync(source + suffix))
        copyFileSync(source + suffix, path.join(dir, `calling.db${suffix}`));
    }
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(path.join(dir, "calling.db"));
    const query = db.prepare(
      "SELECT phone_number, start_time FROM call_history ORDER BY start_time DESC LIMIT 20",
    );
    query.setReadBigInts(true);
    const rows = query.all();
    db.close();

    let best = null;
    for (const row of rows) {
      const ms = Number(row.start_time / 10_000n - FILETIME_EPOCH_OFFSET_MS);
      const distance = Math.abs(ms - startedAt);
      if (distance <= MATCH_WINDOW_MS && (!best || distance < best.distance)) {
        best = { number: String(row.phone_number), distance };
      }
    }
    return best?.number ?? null;
  } catch (err) {
    console.warn("[memory] Phone Link history unavailable:", err.message);
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
