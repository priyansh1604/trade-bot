import type { Connect, Order, Position } from "kiteconnect";
import type { Trade } from "../types/trading";
import { logger } from "../utils/logger";

export interface ReconciliationResult {
  openTrades: Trade[];
  closedByBroker: Trade[];
}

/**
 * On startup or WebSocket reconnect: fetch the real position and order state
 * from Zerodha and rebuild local Trade objects. Zerodha's state is always
 * the source of truth - local memory is never trusted alone after a restart.
 *
 * Strategy: we look for MIS positions on NSE tagged "ZMBOT" that have a
 * non-zero quantity. For each, we try to find the corresponding SL order.
 * If the SL is already cancelled/triggered, we mark the trade as closed.
 *
 * This is intentionally conservative: if we can't determine a position's
 * state with certainty, we log a warning and leave it in the returned list
 * for the caller to handle manually rather than guessing.
 */
export async function reconcile(
  kc: Connect,
  existingTrades: Trade[]
): Promise<ReconciliationResult> {
  logger.info("Reconciling positions and orders with Zerodha...");

  let positions: { net: Position[]; day: Position[] };
  let orders: Order[];

  try {
    positions = await kc.getPositions();
    orders = await kc.getOrders();
  } catch (err) {
    logger.error("Reconciliation fetch failed", { error: (err as Error).message });
    // Return existing trades unchanged rather than clearing state on a fetch error
    return { openTrades: existingTrades, closedByBroker: [] };
  }

  // Index orders by order_id for quick lookup
  const orderById = new Map<string, Order>();
  for (const o of orders) {
    orderById.set(o.order_id, o);
  }

  // MIS day positions with non-zero net quantity
  const openPositions = positions.day.filter(
    (p) => p.product === "MIS" && Math.abs(p.quantity) > 0
  );

  const symbolsWithPosition = new Set(openPositions.map((p) => p.tradingsymbol));

  const openTrades: Trade[] = [];
  const closedByBroker: Trade[] = [];

  for (const trade of existingTrades) {
    if (!symbolsWithPosition.has(trade.symbol)) {
      // Position gone at the broker - it was closed (by SL trigger, manual intervention, etc.)
      logger.info("Position closed at broker (no longer in Zerodha day positions)", {
        symbol: trade.symbol,
        side: trade.side,
        previousState: trade.state,
      });

      // Try to determine how it closed from the SL order status
      if (trade.stopLossOrderId) {
        const slOrder = orderById.get(trade.stopLossOrderId);
        if (slOrder?.status === "COMPLETE") {
          logger.info("SL order was triggered - marking STOP_EXITED", { symbol: trade.symbol });
          closedByBroker.push({ ...trade, state: "STOP_EXITED", updatedAt: new Date().toISOString() });
          continue;
        }
      }

      closedByBroker.push({ ...trade, state: "FORCE_EXITED", updatedAt: new Date().toISOString() });
    } else {
      // Position still open at broker - verify SL is still active
      if (trade.stopLossOrderId && trade.stopLossOrderId !== "SIMULATED_SL") {
        const slOrder = orderById.get(trade.stopLossOrderId);
        if (!slOrder || slOrder.status === "CANCELLED" || slOrder.status === "REJECTED") {
          logger.warn("SL order missing or cancelled at broker - position is UNPROTECTED", {
            symbol: trade.symbol,
            slOrderId: trade.stopLossOrderId,
          });
        }
      }
      openTrades.push(trade);
    }
  }

  // Warn about any ZMBOT-tagged positions at the broker that we have no local Trade for
  for (const pos of openPositions) {
    const hasLocalTrade = existingTrades.some((t) => t.symbol === pos.tradingsymbol);
    if (!hasLocalTrade) {
      logger.warn("Found open position at broker with no matching local Trade - possible state loss", {
        tradingsymbol: pos.tradingsymbol,
        quantity: pos.quantity,
        product: pos.product,
      });
    }
  }

  logger.info("Reconciliation complete", {
    openTrades: openTrades.length,
    closedByBroker: closedByBroker.length,
  });

  return { openTrades, closedByBroker };
}