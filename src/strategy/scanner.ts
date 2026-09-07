import type { Connect } from "kiteconnect";
import type { AppConfig } from "../config/env";
import type { ResolvedInstrument } from "../zerodha/instruments";
import type { ScanCandidate } from "../types/trading";
import { logger } from "../utils/logger";

/**
 * Runs the 09:20 scan over the (already-resolved) Midcap 150 universe:
 *   1. Fetch live quotes for the whole universe in one batch call.
 *   2. Basic eligibility checks (data present, sane prices).
 *   3. Price filter (exclude > maxStockPrice).
 *   4. Liquidity/tradability filter (configurable - see below).
 *   5. Compute % change from previous close.
 *
 * Selecting the single top gainer/loser from the result is Phase 5's
 * signal.ts, not here - this module only filters and computes, it doesn't
 * rank/pick.
 *
 * A single kc.getQuote() call for ~150 symbols fits comfortably under
 * Kite's documented 500-instrument-per-request limit for /quote, so this
 * is one REST call per scan, not per stock, and not a poll loop - see the
 * "Market Data" note in the README about not polling REST repeatedly.
 */
export async function runScanner(
  kc: Connect,
  universe: ResolvedInstrument[],
  config: AppConfig
): Promise<ScanCandidate[]> {
  if (universe.length === 0) {
    logger.warn("Scanner called with an empty universe - nothing to scan");
    return [];
  }

  const keys = universe.map((u) => `NSE:${u.tradingsymbol}`);
  const quotes = await kc.getQuote(keys);

  const { minValue, maxSpread, minVolume } = config.liquidity;
  const liquidityConfigured =
    minValue !== undefined && maxSpread !== undefined && minVolume !== undefined;

  if (!liquidityConfigured) {
    logger.warn(
      "Liquidity filter is NOT active - one or more of LIQUIDITY_MIN_VALUE / " +
        "LIQUIDITY_MAX_SPREAD / LIQUIDITY_MIN_VOLUME is unset in .env. " +
        "The scanner will still run, but without filtering out illiquid Midcap " +
        "stocks. Set all three to enable it - see .env.example."
    );
  }

  let excludedNoData = 0;
  let excludedBadPrice = 0;
  let excludedTooExpensive = 0;
  let excludedIlliquid = 0;

  const candidates: ScanCandidate[] = [];

  for (const u of universe) {
    const key = `NSE:${u.tradingsymbol}`;
    const quote = quotes[key];

    // --- Eligibility: data actually present and sane ---
    if (!quote) {
      excludedNoData++;
      continue;
    }
    if (!(quote.last_price > 0) || !(quote.ohlc?.close > 0)) {
      excludedBadPrice++;
      continue;
    }

    // --- Price filter ---
    if (quote.last_price > config.risk.maxStockPrice) {
      excludedTooExpensive++;
      continue;
    }

    // --- Liquidity filter (only applied when fully configured) ---
    if (liquidityConfigured) {
      const value = quote.last_price * quote.volume;
      const bestBid = quote.depth?.buy?.[0]?.price;
      const bestAsk = quote.depth?.sell?.[0]?.price;
      const hasDepth = bestBid !== undefined && bestAsk !== undefined && bestBid > 0;
      const spreadPct = hasDepth ? ((bestAsk! - bestBid!) / bestBid!) * 100 : undefined;

      const failsValue = value < (minValue as number);
      const failsVolume = quote.volume < (minVolume as number);
      // If we can't compute a spread (no depth data), we don't fail the
      // stock on spread alone - we only enforce the checks we can actually
      // calculate reliably, per the "don't pretend a metric is accurate"
      // requirement. This is an explicit gap, not silently-passing logic.
      const failsSpread = spreadPct !== undefined && spreadPct > (maxSpread as number);

      if (failsValue || failsVolume || failsSpread) {
        excludedIlliquid++;
        continue;
      }
    }

    // --- % change from previous close ---
    const previousClose = quote.ohlc.close;
    const changePct = ((quote.last_price - previousClose) / previousClose) * 100;

    candidates.push({
      symbol: u.tradingsymbol,
      token: u.token,
      lastPrice: quote.last_price,
      previousClose,
      changePct,
      volume: quote.volume,
      tickSize: u.tickSize
    });
  }

  logger.info("Scan complete", {
    universeSize: universe.length,
    eligible: candidates.length,
    excludedNoData,
    excludedBadPrice,
    excludedTooExpensive,
    excludedIlliquid,
    liquidityFilterActive: liquidityConfigured,
  });

  return candidates;
}
