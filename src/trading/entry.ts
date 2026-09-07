import type { Connect, Order } from "kiteconnect";
import type { AppConfig } from "../config/env";
import type { PlannedTrade, Trade } from "../types/trading";
import { placeOrder, fetchOrder } from "../zerodha/orders";
import { createTrade, setEntryFill, updateTradeState } from "./positionManager";
import { logger } from "../utils/logger";

const FILL_POLL_INTERVAL_MS = 500;
const FILL_POLL_MAX_ATTEMPTS = 20; // 10 seconds total

/**
 * Polls kc.getOrders() until the order reaches a terminal state.
 * Returns the completed Order, or null if it never filled in time.
 *
 * We poll rather than rely on WebSocket order updates here because
 * the order-update WebSocket stream requires a separate subscription
 * mode that Phase 4 did not set up - straightforward polling is safe
 * for a once-per-day entry order and avoids a second subscription concern.
 */
async function waitForFill(kc: Connect, orderId: string): Promise<Order | null> {
  for (let attempt = 0; attempt < FILL_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, FILL_POLL_INTERVAL_MS));
    const order = await fetchOrder(kc, orderId);
    if (!order) {
      logger.warn("Order not found during fill poll", { orderId, attempt });
      continue;
    }
    const s = order.status;
    if (s === "COMPLETE") return order;
    if (s === "REJECTED" || s === "CANCELLED") {
      logger.error("Entry order rejected/cancelled", { orderId, status: s, statusMessage: order.status_message });
      return null;
    }
    logger.debug("Waiting for fill", { orderId, status: s, attempt });
  }
  logger.error("Entry order did not fill within timeout", { orderId });
  return null;
}

/**
 * Places a market entry order and waits for a fill.
 * Returns a Trade in ENTRY_PENDING -> OPEN state (with actual fill price/qty),
 * or null if the order failed or didn't fill.
 *
 * IMPORTANT: the caller (executeTrade in entry orchestration) MUST
 * immediately place a protective stop-loss after receiving a non-null Trade.
 * If that SL placement fails, the caller MUST call emergencyExit().
 */
export async function placeEntryOrder(
  kc: Connect,
  plan: PlannedTrade,
  config: AppConfig
): Promise<Trade | null> {
  logger.info("Placing entry order", {
    symbol: plan.symbol,
    side: plan.side,
    quantity: plan.quantity,
    referencePrice: plan.referencePrice,
  });

  const result = await placeOrder(kc, {
    tradingsymbol: plan.symbol,
    quantity: plan.quantity,
    side: plan.side,
    orderType: "MARKET",
    tag: "ZMBOT",
  }, config);

  if (result.blocked) {
    // LIVE_TRADING_ENABLED=false - simulate a successful entry for dev purposes
    logger.info("Entry order blocked (safe mode). Simulating fill at reference price.");
    const simulatedTrade = createTrade(plan.symbol, plan.token, plan.side, plan.quantity, "SIMULATED");
    return setEntryFill(simulatedTrade, plan.referencePrice, plan.quantity);
  }

  if (!result.orderId) {
    logger.error("Entry order returned no orderId", { plan });
    return null;
  }

  const trade = createTrade(plan.symbol, plan.token, plan.side, plan.quantity, result.orderId);

  const filledOrder = await waitForFill(kc, result.orderId);
  if (!filledOrder) {
    logger.error("Entry fill failed - order did not complete", { orderId: result.orderId });
    return updateTradeState(trade, "FAILED");
  }

  const fillPrice = filledOrder.average_price;
  const fillQty = filledOrder.filled_quantity;

  if (!fillPrice || !fillQty || fillQty === 0) {
    logger.error("Entry filled with 0 quantity or 0 price - treating as failed", {
      orderId: result.orderId, fillPrice, fillQty,
    });
    return updateTradeState(trade, "FAILED");
  }

  logger.info("Entry filled", {
    symbol: plan.symbol,
    side: plan.side,
    fillQty,
    fillPrice,
    entryOrderId: result.orderId,
  });

  return setEntryFill(trade, fillPrice, fillQty);
}