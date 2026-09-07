import type { Connect, Exchanges, Instrument } from "kiteconnect";
import { logger } from "../utils/logger";

/**
 * Fetches the full instrument list for an exchange (~thousands of rows for
 * NSE - includes equities, indices, etc). This is a bulk REST call, not
 * something to poll repeatedly - see the "Market Data" section of the
 * README: WebSocket is for live prices, REST is for this kind of bulk/
 * infrequent lookup.
 */
export async function fetchInstruments(
  kc: Connect,
  exchange: Exchanges = "NSE"
): Promise<Instrument[]> {
  const instruments = await kc.getInstruments(exchange);
  logger.info("Instruments loaded", { exchange, count: instruments.length });
  return instruments;
}

export interface ResolvedInstrument {
  tradingsymbol: string;
  token: number;
  tickSize: number
}

/**
 * Looks up instrument_token for a list of tradingsymbols from an already-
 * fetched instrument list, rather than hard-coding token numbers - those
 * are exchange-issued identifiers we should never guess at.
 *
 * Shared by src/zerodha/marketData.ts (Phase 4 WebSocket subscriptions) and
 * src/strategy/universe.ts (Phase 5 Midcap 150 -> token mapping) so the
 * resolution logic exists in exactly one place.
 *
 * Note: the `kiteconnect` package's REST `Instrument` type declares
 * `instrument_token` as a `string`, while the WebSocket `Tick` type declares
 * it as a `number`. We convert here rather than assume the types agree.
 *
 * Symbols not found (wrong exchange, delisted, typo, temporarily
 * suspended) are logged and skipped rather than failing the whole batch.
 */
export function resolveTokensBySymbol(
  instruments: Instrument[],
  tradingsymbols: string[],
  exchange: string = "NSE"
): ResolvedInstrument[] {
  const bySymbol = new Map<string, Instrument>();
  for (const instrument of instruments) {
    if (instrument.exchange === exchange && instrument.instrument_type === "EQ") {
      bySymbol.set(instrument.tradingsymbol, instrument);
    }
  }

  const resolved: ResolvedInstrument[] = [];
  for (const symbol of tradingsymbols) {
    const instrument = bySymbol.get(symbol);
    if (!instrument) {
      logger.warn("Could not resolve tradingsymbol to an instrument_token - skipping", {
        symbol,
        exchange,
      });
      continue;
    }
    const token = Number(instrument.instrument_token);
    if (Number.isNaN(token)) {
      logger.warn("instrument_token was not numeric - skipping", {
        symbol,
        raw: instrument.instrument_token,
      });
      continue;
    }
    const tickSize = Number(instrument.tick_size);
    if (!Number.isFinite(tickSize) || tickSize <= 0) {
      logger.warn("tick_size was invalid - skipping", {
        symbol,
        raw: instrument.tick_size,
      });
      continue;
    }
    
    resolved.push({ tradingsymbol: symbol, token, tickSize });
  }

  return resolved;
}
