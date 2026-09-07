import type { Connect } from "kiteconnect";
import type { AppConfig } from "../config/env";
import type { Trade } from "../types/trading";
import { placeOrder, cancelOrder } from "../zerodha/orders";
import { calculateStopLossPrice, calculateTargetPrice } from "../risk/positionSizing";
import { setStopLoss, setTarget, updateTradeState, markExited } from "./positionManager";
import { logger } from "../utils/logger";

/**
 * Places a broker-side SL-M stop-loss order immediately after entry fill.
 *
 * This is the PRIMARY risk protection - it lives at Zerodha's servers so it
 * persists if the Mac sleeps, Node crashes, or the internet drops.
 *
 * For SL-M (Stop Loss Market) on NSE MIS:
 *   LONG:  SELL SL-M, trigger = slPrice (sell if price drops to slPrice)
 *   SHORT: BUY  SL-M, trigger = slPrice (buy back if price rises to slPrice)
 *
 * The trigger price must be tick-aligned - we recalculate from actual fill
 * price here, not from the scan-time estimate, per the spec requirement.
 */
export async function placeBrokerStopLoss(
  kc: Connect,
  trade: Trade,
  config: AppConfig
): Promise<Trade | null> {
  if (!trade.entryPrice || !trade.quantity) {
    logger.error("Cannot place SL: trade has no fill price or quantity", { trade });
    return null;
  }

  // Fetch tickSize from the trade - it was carried through from ResolvedInstrument.
  // We store it on the trade object via the caller (executeTrade).
  const tickSize = (trade as Trade & { tickSize?: number }).tickSize ?? 0.05;

  const slPrice = calculateStopLossPrice(
    trade.side,
    trade.entryPrice,
    config.risk.stopLossPct,
    tickSize
  );

  const targetPrice = calculateTargetPrice(
    trade.side,
    trade.entryPrice,
    config.risk.targetPct,
    tickSize
  );

  // SL-M order: the exit side is opposite to the entry side
  const slSide = trade.side === "LONG" ? "SHORT" : "LONG";

  logger.info("Placing broker-side SL-M", {
    symbol: trade.symbol,
    slSide,
    quantity: trade.quantity,
    triggerPrice: slPrice,
  });

  const result = await placeOrder(kc, {
    tradingsymbol: trade.symbol,
    quantity: trade.quantity,
    side: slSide,
    orderType: "SL-M",
    triggerPrice: slPrice,
    tag: "ZMBOT_SL",
  }, config);

  if (result.blocked) {
    // Safe mode: simulate SL as placed
    logger.info("SL order blocked (safe mode). Simulating SL placement.");
    let t = setStopLoss(trade, "SIMULATED_SL", slPrice);
    t = setTarget(t, targetPrice);
    return t;
  }

  if (!result.orderId) {
    logger.error("SL order returned no orderId - CRITICAL: will trigger emergency exit", { trade });
    return null;
  }

  logger.info("Broker SL-M placed", {
    symbol: trade.symbol,
    slOrderId: result.orderId,
    slPrice,
    targetPrice,
  });

  let t = setStopLoss(trade, result.orderId, slPrice);
  t = setTarget(t, targetPrice);
  return t;
}

/**
 * CRITICAL FAILURE SAFETY: if SL placement fails after a successful entry,
 * we MUST exit the position immediately. Never leave an unprotected position.
 *
 *   ENTRY SUCCESS
 *         |
 *     SL PLACEMENT
 *         |
 *     +---+---+
 *     |       |
 *  SUCCESS  FAILURE
 *     |       |
 *     v       v
 * Continue  emergencyExit()
 */
export async function emergencyExit(
  kc: Connect,
  trade: Trade,
  config: AppConfig
): Promise<Trade> {
  logger.error("EMERGENCY EXIT: SL placement failed. Closing position immediately.", {
    symbol: trade.symbol,
    side: trade.side,
    quantity: trade.quantity,
  });

  const exitSide = trade.side === "LONG" ? "SHORT" : "LONG";

  try {
    const result = await placeOrder(kc, {
      tradingsymbol: trade.symbol,
      quantity: trade.quantity,
      side: exitSide,
      orderType: "MARKET",
      tag: "ZMBOT_EMRG",
    }, config);

    if (result.blocked) {
      logger.warn("Emergency exit blocked (safe mode). Trade marked ABORTED.");
    } else {
      logger.info("Emergency exit order placed", { orderId: result.orderId });
    }
  } catch (err) {
    logger.error("Emergency exit order ALSO failed - manual intervention required!", {
      symbol: trade.symbol,
      error: (err as Error).message,
    });
  }

  return markExited(trade, "ABORT", trade.entryPrice ?? 0, 0, 0);
}

export async function cancelStopLoss(
  kc: Connect,
  trade: Trade,
  config: AppConfig
): Promise<void> {
  if (!trade.stopLossOrderId || trade.stopLossOrderId === "SIMULATED_SL") return;
  try {
    await cancelOrder(kc, trade.stopLossOrderId, config);
    logger.info("SL order cancelled", { slOrderId: trade.stopLossOrderId, symbol: trade.symbol });
  } catch (err) {
    logger.warn("Failed to cancel SL order (may have already triggered)", {
      slOrderId: trade.stopLossOrderId,
      error: (err as Error).message,
    });
  }
}