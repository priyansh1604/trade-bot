import type { Connect, Instrument } from "kiteconnect";
import type { AppConfig } from "../config/env";
import type { ScanSignal } from "../types/trading";
import { resolveMidcap150Universe } from "./universe";
import { runScanner } from "./scanner";
import { selectSignal } from "./signal";
import { logger } from "../utils/logger";

/**
 * Orchestrates the 09:20 morning scan end to end:
 *   universe (Midcap 150 -> tokens) -> scanner (filter + % change) ->
 *   signal (pick top gainer/loser).
 *
 * Takes an already-fetched NSE instrument list (see zerodha/instruments.ts)
 * rather than fetching it itself, so callers control when/how often that
 * bulk call happens.
 *
 * Does NOT size positions, calculate stop-loss/target, or place any order -
 * that's Phase 6 (risk) and Phase 7 (execution).
 */
export async function runMorningScan(
  kc: Connect,
  instruments: Instrument[],
  config: AppConfig
): Promise<ScanSignal> {
  const universe = resolveMidcap150Universe(instruments);
  logger.info("Universe resolved", {
    configuredConstituents: 150,
    resolvedToTokens: universe.length,
  });

  if (universe.length < 150) {
    logger.warn(
      "Fewer than 150 Midcap constituents resolved to instrument tokens. This can mean " +
        "the hard-coded universe list (src/strategy/universe.ts) is out of date versus " +
        "NSE's current index, or some symbols aren't present in the fetched instrument dump.",
      { resolved: universe.length, expected: 150 }
    );
  }

  const candidates = await runScanner(kc, universe, config);
  return selectSignal(candidates);
}
