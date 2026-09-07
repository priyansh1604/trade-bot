import * as fs from "fs";
import * as path from "path";
import type { SessionData } from "kiteconnect";
import { logger } from "../utils/logger";

/**
 * Not part of the original file list you specified - added because
 * "persist the access token so we don't force a fresh login on every
 * restart" needs somewhere to live, and cramming file I/O into auth.ts
 * would work against "small focused modules". Flagging the deviation
 * explicitly rather than silently expanding the structure.
 */

const SESSION_FILE = path.resolve(process.cwd(), "kite-session.state.json");

interface PersistedSession {
  generatedAt: string; // ISO timestamp, local time when generateSession() succeeded
  session: SessionData;
}

/**
 * Kite access tokens expire at 6:00 AM the day after they were issued
 * (this is a documented regulatory requirement, not our own assumption -
 * see the SessionData.access_token doc comment in the kiteconnect package).
 * This computes that cutoff from when the session was generated.
 */
function expiryFor(generatedAt: Date): Date {
  const expiry = new Date(generatedAt);
  expiry.setDate(expiry.getDate() + 1);
  expiry.setHours(6, 0, 0, 0);
  return expiry;
}

export function saveSession(session: SessionData): void {
  const payload: PersistedSession = {
    generatedAt: new Date().toISOString(),
    session,
  };
  fs.writeFileSync(SESSION_FILE, JSON.stringify(payload, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  logger.info("Session persisted locally", { file: SESSION_FILE });
}

/**
 * Loads a persisted session if one exists AND it hasn't crossed the
 * 6 AM next-day expiry. Returns null otherwise (missing, unreadable,
 * malformed, or expired) - any of these just means "log in again",
 * never a hard failure.
 */
export function loadValidSession(): SessionData | null {
  if (!fs.existsSync(SESSION_FILE)) {
    return null;
  }

  let parsed: PersistedSession;
  try {
    const raw = fs.readFileSync(SESSION_FILE, "utf-8");
    parsed = JSON.parse(raw) as PersistedSession;
  } catch (err) {
    logger.warn("Could not read/parse persisted session file - ignoring it", {
      error: (err as Error).message,
    });
    return null;
  }

  const generatedAt = new Date(parsed.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) {
    logger.warn("Persisted session file has an invalid timestamp - ignoring it");
    return null;
  }

  const expiry = expiryFor(generatedAt);
  if (new Date() >= expiry) {
    logger.info("Persisted session has expired (past 6 AM cutoff) - fresh login required", {
      generatedAt: parsed.generatedAt,
      expiredAt: expiry.toISOString(),
    });
    return null;
  }

  return parsed.session;
}

export function clearSession(): void {
  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
  }
}
