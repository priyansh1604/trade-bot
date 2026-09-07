import { logger } from "../utils/logger";

/**
 * Converts a "HH:MM" string (IST) to today's Date in the local timezone.
 * The Mac is assumed to run with IST as system timezone (or at least the
 * correct local time). No tz-conversion library is used - we rely on the
 * system clock being set correctly, which is appropriate for a local Mac bot.
 */
function todayAt(hhmm: string): Date {
  const [hh, mm] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(hh!, mm!, 0, 0);
  return d;
}

function msUntil(target: Date): number {
  return Math.max(0, target.getTime() - Date.now());
}

export interface MarketScheduleCallbacks {
  onMarketOpen: () => Promise<void> | void;
  onScanTime: () => Promise<void> | void;
  onEntryTime: () => Promise<void> | void;
  onForceExit: () => Promise<void> | void;
}

/**
 * Sets up market-hours timers using schedule times from config.
 * Returns a cleanup function that cancels all pending timers if called
 * (e.g. on an early shutdown or after force exit).
 *
 * All times are read from config, not hard-coded.
 */
export function scheduleMarketEvents(
  schedule: { marketOpen: string; scanTime: string; entryTime: string; forceExitTime: string },
  callbacks: MarketScheduleCallbacks
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];

  function at(hhmm: string, label: string, fn: () => Promise<void> | void): void {
    const target = todayAt(hhmm);
    const delay = msUntil(target);
    if (delay === 0) {
      logger.warn(`${label} time (${hhmm}) is already in the past - skipping timer`);
      return;
    }
    logger.info(`Scheduling ${label} at ${hhmm} (in ${Math.round(delay / 1000)}s)`);
    timers.push(
      setTimeout(async () => {
        logger.info(`${label} triggered`);
        try {
          await fn();
        } catch (err) {
          logger.error(`Error in ${label} callback`, { error: (err as Error).message });
        }
      }, delay)
    );
  }

  at(schedule.marketOpen, "Market open (09:15)", callbacks.onMarketOpen);
  at(schedule.scanTime, "Scanner (09:20)", callbacks.onScanTime);
  at(schedule.entryTime, "Entry (09:21)", callbacks.onEntryTime);
  at(schedule.forceExitTime, "Force exit (15:00)", callbacks.onForceExit);

  return () => {
    for (const t of timers) clearTimeout(t);
    logger.info("Market schedule timers cancelled");
  };
}