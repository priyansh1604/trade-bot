import type { Trade, TradeState, Side } from "../types/trading";

/**
 * Creates a new Trade object in ENTRY_PENDING state.
 * All timestamps are ISO strings so they survive JSON serialisation.
 */
export function createTrade(
  symbol: string,
  token: number,
  side: Side,
  quantity: number,
  entryOrderId: string
): Trade {
  const now = new Date().toISOString();
  return {
    symbol,
    instrumentToken: token,
    side,
    quantity,
    entryOrderId,
    state: "ENTRY_PENDING",
    createdAt: now,
    updatedAt: now,
  };
}

export function updateTradeState(trade: Trade, newState: TradeState): Trade {
  return { ...trade, state: newState, updatedAt: new Date().toISOString() };
}

export function setEntryFill(trade: Trade, fillPrice: number, fillQty: number): Trade {
  return {
    ...trade,
    entryPrice: fillPrice,
    quantity: fillQty,
    state: "OPEN",
    updatedAt: new Date().toISOString(),
  };
}

export function setStopLoss(trade: Trade, slOrderId: string, slPrice: number): Trade {
  return {
    ...trade,
    stopLossOrderId: slOrderId,
    stopLossPrice: slPrice,
    stopLossStatus: "ACTIVE",
    updatedAt: new Date().toISOString(),
  };
}

export function setTarget(trade: Trade, targetPrice: number): Trade {
  return {
    ...trade,
    targetPrice,
    targetStatus: "WATCHING",
    updatedAt: new Date().toISOString(),
  };
}

export function markExited(
  trade: Trade,
  reason: Trade["exitReason"],
  exitPrice: number,
  grossPnl: number,
  netPnl: number
): Trade {
  const stateMap: Record<NonNullable<Trade["exitReason"]>, TradeState> = {
    TARGET: "TARGET_EXITED",
    STOP_LOSS: "STOP_EXITED",
    FORCE_EXIT: "FORCE_EXITED",
    ABORT: "ABORTED",
  };
  return {
    ...trade,
    exitReason: reason,
    exitPrice,
    grossPnl,
    netPnl,
    state: reason ? stateMap[reason] : "FAILED",
    updatedAt: new Date().toISOString(),
  };
}