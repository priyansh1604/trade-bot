import type { Side } from "../types/trading";

/**
 * quantity = floor(allocatedCapital / price), never fractional shares,
 * never exceeding the allocated capital. Returns 0 if the price is too
 * high for the allocated capital to buy even one share - callers must
 * check for 0 and skip the trade (see riskManager.ts).
 */
export function calculateQuantity(allocatedCapital: number, price: number): number {
  if (price <= 0 || allocatedCapital <= 0) return 0;
  return Math.floor(allocatedCapital / price);
}

/**
 * Stop loss: 1% adverse move from entry (percentage is read from config,
 * not hard-coded here, but 0.01 is the documented default).
 *   LONG:  entryPrice * (1 - stopLossPct)
 *   SHORT: entryPrice * (1 + stopLossPct)
 */
export function calculateStopLossPrice(side: Side, entryPrice: number, stopLossPct: number, tickSize: number): number {
  if (side === "LONG") {
    
    const rawPrice = entryPrice * (1 - stopLossPct);

    return roundToTick(rawPrice, tickSize, "up");
  }

  const rawPrice = entryPrice * (1 + stopLossPct);

  return roundToTick(rawPrice, tickSize, "down");
}

/**
 * Target: 2.2% favorable move from entry (percentage read from config).
 *   LONG:  entryPrice * (1 + targetPct)
 *   SHORT: entryPrice * (1 - targetPct)
 */
export function calculateTargetPrice(side: Side, entryPrice: number, targetPct: number, tickSize: number): number {
  if (side === "LONG") {
    const rawPrice = entryPrice * (1 + targetPct);

    return roundToTick(rawPrice, tickSize, "down");
  }

  const rawPrice = entryPrice * (1 - targetPct);

  return roundToTick(rawPrice, tickSize, "up");
}

export function roundToTick(price: number, tickSize: number, direction: "up" | "down"): number {
  if (tickSize <= 0) return price; // defensive fallback
  const ticks = price / tickSize;
  const rounded = direction === "up" ? Math.ceil(ticks) : Math.floor(ticks);
  return Number((rounded * tickSize).toFixed(2));
}
