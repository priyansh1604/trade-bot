import { KiteTicker } from "kiteconnect";
import type { Ticker, Tick } from "kiteconnect";
import { logger } from "../utils/logger";
import type { ResolvedInstrument } from "./instruments";
export type { ResolvedInstrument } from "./instruments";
export { resolveTokensBySymbol as resolveInstrumentTokens } from "./instruments";

// Same constructor/instance typing split as KiteConnect (see client.ts):
// `KiteTicker` types the constructor, `Ticker` types the instance.

/**
 * Creates a KiteTicker WebSocket client. Does not connect by itself -
 * call .connect() (wireTicker() below does this).
 */
export function createTicker(apiKey: string, accessToken: string): Ticker {
  return new KiteTicker({ api_key: apiKey, access_token: accessToken });
}

/**
 * Wires up all documented KiteTicker events and subscribes to the given
 * tokens in LTP mode once connected. Auto-reconnect is enabled by default
 * in the SDK (exponential backoff) - we only observe and log those events
 * here rather than re-implementing reconnection ourselves.
 *
 * `onTick` is called for every batch of ticks received.
 */
export function wireTicker(
  ticker: Ticker,
  instruments: ResolvedInstrument[],
  onTick: (ticks: Tick[]) => void
): void {
  const tokens = instruments.map((i) => i.token);

  ticker.on("connect", () => {
    logger.info("WebSocket connected");
    const subscribed = ticker.subscribe(tokens);
    ticker.setMode(ticker.modeLTP, tokens);
    logger.info("Subscribed to instruments (LTP mode)", {
      count: subscribed.length,
      symbols: instruments.map((i) => i.tradingsymbol),
    });
  });

  ticker.on("ticks", (ticks: Tick[]) => {
    onTick(ticks);
  });

  ticker.on("disconnect", (error: Error) => {
    logger.warn("WebSocket disconnected", { error: error?.message });
  });

  ticker.on("error", (error: Error) => {
    logger.error("WebSocket error", { error: error?.message });
  });

  ticker.on("close", (reason: string) => {
    // NOTE: despite being typed as `(reason: string)`, the SDK was observed
    // (via live testing against wss://ws.kite.trade) to actually pass a raw
    // WebSocket CloseEvent-like object here, not a string. We extract a
    // readable summary defensively rather than trusting the declared type,
    // since logging the raw object dumps an entire internal WebSocket
    // instance into the logs.
    const raw = reason as unknown;
    let summary: string;
    if (typeof raw === "string") {
      summary = raw;
    } else if (raw && typeof raw === "object" && "code" in raw) {
      const code = (raw as { code?: unknown }).code;
      summary = `code=${String(code)}`;
    } else {
      summary = "unknown";
    }
    logger.warn("WebSocket closed", { reason: summary });
  });

  ticker.on("reconnect", (attempt: number, intervalMs: number) => {
    logger.warn("WebSocket reconnecting", { attempt, intervalMs });
  });

  ticker.on("noreconnect", () => {
    logger.error(
      "WebSocket gave up reconnecting after max retries - market data is now stopped. " +
        "This is exactly the scenario the broker-side stop-loss (Phase 7+) is designed to survive."
    );
  });
}

