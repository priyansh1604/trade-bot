import type { ScanCandidate, ScanSignal } from "../types/trading";
import { logger } from "../utils/logger";

/**
 * Selects the single highest eligible gainer (LONG candidate) and single
 * lowest eligible loser (SHORT candidate) from the scanner's filtered
 * output. Pure selection - no order sizing, no order placement, both of
 * which are later phases.
 */
export function selectSignal(candidates: ScanCandidate[]): ScanSignal {
  if (candidates.length === 0) {
    logger.warn("No eligible candidates after filtering - no signal this scan");
    return { long: null, short: null };
  }

  let long: ScanCandidate = candidates[0];
  let short: ScanCandidate = candidates[0];

  for (const c of candidates) {
    if (c.changePct > long.changePct) long = c;
    if (c.changePct < short.changePct) short = c;
  }

  logger.info("Top Gainer", {
    symbol: long.symbol,
    ltp: long.lastPrice,
    changePct: Number(long.changePct.toFixed(2)),
  });
  logger.info("Top Loser", {
    symbol: short.symbol,
    ltp: short.lastPrice,
    changePct: Number(short.changePct.toFixed(2)),
  });

  if (long.symbol === short.symbol) {
    // Only one eligible candidate total - can't take both a long and a
    // short leg on the same instrument. Prefer the long side and drop
    // the short; strategy.ts logs this explicitly rather than silently
    // doubling up on one stock.
    logger.warn(
      "Only one eligible candidate available - cannot open both a long and a short " +
        "leg on the same instrument. Keeping it as the LONG signal only.",
      { symbol: long.symbol }
    );
    return { long, short: null };
  }

  return { long, short };
}
