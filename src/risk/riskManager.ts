import type { AppConfig } from "../config/env";
import type { ScanCandidate, ScanSignal, PlannedTrade, Side } from "../types/trading";
import { calculateQuantity, calculateStopLossPrice, calculateTargetPrice } from "./positionSizing";
import { logger } from "../utils/logger";

/**
 * Turns one scan candidate into a PlannedTrade: quantity, SL price, target
 * price, sized against the per-side capital cap from config. Returns null
 * (and logs why) if the resulting quantity would be 0 - per the "if
 * quantity is 0, do not trade that stock" rule, a stock that's too
 * expensive for the allocated capital is simply skipped, not rounded up.
 *
 * `candidate.lastPrice` (the scan-time price) is used as the reference
 * price here. This is a pre-trade estimate - see the PlannedTrade type
 * doc comment. It is NOT the actual fill price, which won't exist until
 * Phase 7 places and fills a real order.
 */
export function planTrade(
  candidate: ScanCandidate,
  side: Side,
  config: AppConfig
): PlannedTrade | null {
  const allocatedCapital = side === "LONG" ? config.risk.capitalLongMax : config.risk.capitalShortMax;
  const referencePrice = candidate.lastPrice;

  const quantity = calculateQuantity(allocatedCapital, referencePrice);
  if (quantity === 0) {
    logger.warn(
      "Planned quantity is 0 - allocated capital cannot buy even one share at this price. Skipping.",
      { symbol: candidate.symbol, side, allocatedCapital, referencePrice }
    );
    return null;
  }

  const stopLossPrice = calculateStopLossPrice(side, referencePrice, config.risk.stopLossPct,candidate.tickSize);
  const targetPrice = calculateTargetPrice(side, referencePrice, config.risk.targetPct, candidate.tickSize);
  const estimatedCost = quantity * referencePrice;

  const planned: PlannedTrade = {
    symbol: candidate.symbol,
    token: candidate.token,
    side,
    referencePrice,
    allocatedCapital,
    quantity,
    estimatedCost,
    stopLossPrice,
    targetPrice,
  };

  logger.info("Planned trade", {
    symbol: planned.symbol,
    side: planned.side,
    quantity: planned.quantity,
    referencePrice: planned.referencePrice,
    estimatedCost: Number(planned.estimatedCost.toFixed(2)),
    stopLossPrice: Number(planned.stopLossPrice.toFixed(2)),
    targetPrice: Number(planned.targetPrice.toFixed(2)),
  });

  return planned;
}

export interface RiskPlan {
  long: PlannedTrade | null;
  short: PlannedTrade | null;
}

/**
 * Converts a Phase 5 ScanSignal into sized PlannedTrades for both legs.
 *
 * Position-count limit (max 1 long + 1 short, max 2 simultaneous positions)
 * is satisfied by construction here - ScanSignal already carries at most
 * one long and one short candidate, and this function produces at most one
 * PlannedTrade per side. The real enforcement against ALREADY-OPEN
 * positions (e.g. refusing a new entry if Zerodha reconciliation shows a
 * position is still open) requires live position state and belongs in
 * Phase 7's reconciliation-aware execution logic, not here - this function
 * only sizes a signal, it doesn't know what's currently open at the broker.
 */
export function planFromSignal(signal: ScanSignal, config: AppConfig): RiskPlan {
  const long = signal.long ? planTrade(signal.long, "LONG", config) : null;
  const short = signal.short ? planTrade(signal.short, "SHORT", config) : null;

  if (!long && !short) {
    logger.warn("No plannable trades this cycle (no signal, or all planned quantities were 0)");
  }

  return { long, short };
}
