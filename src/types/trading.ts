/**
 * Core shared types for the trading bot.
 * Types only - the logic that produces/consumes them lives in the
 * corresponding phase's module (scanner/signal types below are used by
 * strategy/scanner.ts and strategy/signal.ts, Phase 5).
 */

export type Side = "LONG" | "SHORT";

/**
 * A Midcap 150 stock that survived eligibility/price/liquidity filtering
 * during the 09:20 scan, with its computed % change from previous close.
 */
export interface ScanCandidate {
  symbol: string;
  token: number;
  lastPrice: number;
  previousClose: number;
  changePct: number;
  volume: number;
  tickSize: number;
}

/**
 * Output of signal selection: the single best eligible gainer (for LONG)
 * and single best eligible loser (for SHORT), if any existed. Either can
 * be null if no candidate survived filtering on that side.
 */
export interface ScanSignal {
  long: ScanCandidate | null;
  short: ScanCandidate | null;
}

/**
 * Lifecycle states for a single strategy trade (one long or one short leg).
 * Kept intentionally explicit rather than a loose string so the state
 * machine in Phase 7/8 can be exhaustively checked by the compiler.
 */
export type TradeState =
  | "ENTRY_PENDING"
  | "OPEN"
  | "TARGET_EXIT_PENDING"
  | "STOP_EXITED"
  | "TARGET_EXITED"
  | "FORCE_EXITED"
  | "FAILED"
  | "ABORTED";

export interface Trade {
  symbol: string;
  instrumentToken: number;
  side: Side;

  quantity: number;

  entryOrderId?: string;
  entryPrice?: number;

  stopLossOrderId?: string;
  stopLossPrice?: number;
  stopLossStatus?: "PENDING" | "ACTIVE" | "TRIGGERED" | "CANCELLED" | "FAILED";

  targetPrice?: number;
  targetStatus?: "PENDING" | "WATCHING" | "TRIGGERED" | "NOT_APPLICABLE";

  state: TradeState;

  createdAt: string;
  updatedAt: string;

  exitReason?: "TARGET" | "STOP_LOSS" | "FORCE_EXIT" | "ABORT";
  exitPrice?: number;

  grossPnl?: number;
  netPnl?: number;
}

/**
 * Output of Phase 6 risk sizing: what we WOULD trade, if we were placing
 * orders (we aren't yet - that's Phase 7). `referencePrice` is the price
 * this was calculated from - the scanner's last-traded-price at scan time,
 * NOT a guaranteed fill price. Phase 7 MUST recompute quantity/SL/target
 * from the actual executed fill price once an order fills - see the
 * "Use actual executed/fill price for final calculations" requirement.
 * Treat this as a pre-trade estimate/preview, not the final sizing.
 */
export interface PlannedTrade {
  symbol: string;
  token: number;
  side: Side;
  referencePrice: number;
  allocatedCapital: number;
  quantity: number;
  estimatedCost: number;
  stopLossPrice: number;
  targetPrice: number;
}

/**
 * Result returned by any function that attempts to place an order.
 * When live trading is disabled, `blocked` will be true and no real
 * order will have been sent - see the safety switch in config/env.ts.
 */
export interface OrderAttemptResult {
  blocked: boolean;
  orderId?: string;
  reason?: string;
}
