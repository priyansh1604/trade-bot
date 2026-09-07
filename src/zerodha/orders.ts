import type { Connect, Order } from "kiteconnect";
import type { AppConfig } from "../config/env";
import type { Side } from "../types/trading";
import { logger } from "../utils/logger";

export async function fetchOrders(kc: Connect): Promise<Order[]> {
  const orders = await kc.getOrders();
  logger.info("Orders fetched", { count: orders.length });
  return orders;
}

export async function fetchOrder(kc: Connect, orderId: string): Promise<Order | null> {
  const orders = await kc.getOrders();
  return orders.find((o) => o.order_id === orderId) ?? null;
}

export interface PlaceOrderParams {
  tradingsymbol: string;
  quantity: number;
  side: Side;
  orderType: "MARKET" | "LIMIT" | "SL" | "SL-M";
  price?: number;
  triggerPrice?: number;
  tag?: string;
}

export interface PlaceOrderResult {
  blocked: boolean;
  orderId?: string;
  reason?: string;
}

/**
 * THE master order placement function. Checks LIVE_TRADING_ENABLED first.
 * When false: logs [ORDER BLOCKED] and returns without calling Kite.
 * When true: calls kc.placeOrder for an MIS (intraday) order on NSE.
 *
 * ALL order placement in this project must go through this function.
 * Never call kc.placeOrder directly anywhere else.
 */
export async function placeOrder(
  kc: Connect,
  params: PlaceOrderParams,
  config: AppConfig
): Promise<PlaceOrderResult> {
  const { tradingsymbol, quantity, side, orderType, price, triggerPrice, tag } = params;

  if (!config.trading.liveTradingEnabled) {
    logger.info("[ORDER BLOCKED]", {
      action: side === "LONG" ? "BUY" : "SELL",
      tradingsymbol,
      quantity,
      orderType,
      price,
      triggerPrice,
      product: "MIS",
      reason: "LIVE_TRADING_ENABLED=false",
    });
    return { blocked: true, reason: "LIVE_TRADING_ENABLED=false" };
  }

  const transactionType = side === "LONG" ? "BUY" : "SELL";

  const orderParams: Record<string, unknown> = {
    tradingsymbol,
    exchange: "NSE",
    transaction_type: transactionType,
    quantity,
    product: "MIS",
    order_type: orderType,
  };

  if (price !== undefined) orderParams["price"] = price;
  if (triggerPrice !== undefined) orderParams["trigger_price"] = triggerPrice;
  if (tag !== undefined) orderParams["tag"] = tag;

  const result = await kc.placeOrder("regular", orderParams as Parameters<Connect["placeOrder"]>[1]);

  logger.info("Order placed", {
    orderId: result.order_id,
    tradingsymbol,
    side,
    quantity,
    orderType,
  });

  return { blocked: false, orderId: result.order_id };
}

export async function cancelOrder(
  kc: Connect,
  orderId: string,
  config: AppConfig
): Promise<boolean> {
  if (!config.trading.liveTradingEnabled) {
    logger.info("[CANCEL BLOCKED]", { orderId, reason: "LIVE_TRADING_ENABLED=false" });
    return false;
  }
  await kc.cancelOrder("regular", orderId);
  logger.info("Order cancelled", { orderId });
  return true;
}