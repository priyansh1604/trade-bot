import { loadConfig } from "./config/env";
import { logger } from "./utils/logger";
import { createKiteClient } from "./zerodha/client";
import { authenticate } from "./zerodha/auth";
import { fetchProfile, fetchMargins, fetchPositions } from "./zerodha/account";
import { fetchOrders } from "./zerodha/orders";
import { fetchInstruments } from "./zerodha/instruments";
import { createTicker, resolveInstrumentTokens, wireTicker } from "./zerodha/marketData";
import { runMorningScan } from "./strategy/strategy";
import { planFromSignal } from "./risk/riskManager";
import { placeEntryOrder } from "./trading/entry";
import { placeBrokerStopLoss, emergencyExit } from "./trading/stopLoss";
import { reconcile } from "./trading/reconciliation";
import { scheduleMarketEvents } from "./scheduler/marketSchedule";
import type { Trade } from "./types/trading";
import type { Instrument, Connect, Tick } from "kiteconnect";
import type { AppConfig } from "./config/env";

/**
 * PHASE 7 ENTRYPOINT
 *
 * Adds the full execution engine:
 *   - Startup reconciliation (Zerodha state = source of truth)
 *   - Persistent scheduler (09:15 market open, 09:20 scan, 09:21 entry, 15:00 force exit)
 *   - Entry order + fill verification
 *   - Immediate broker-side SL-M placement
 *   - Emergency exit if SL placement fails
 *   - LIVE_TRADING_ENABLED safety switch enforced at every order call
 *
 * Target monitoring (Phase 8) and the force-exit implementation (Phase 9)
 * are wired to placeholder stubs here so the scheduler structure is visible.
 */

// In-memory trade state. Zerodha is always the source of truth.
// On restart, reconcile() rebuilds this from the broker.
let activeTrades: Trade[] = [];

async function runEntrySequence(
  kc: Connect,
  instruments: Instrument[],
  config: AppConfig
): Promise<void> {
  logger.info("Running 09:20 scanner over the Nifty Midcap 150 universe...");

  let signal;
  try {
    signal = await runMorningScan(kc, instruments, config);
  } catch (err) {
    logger.error("Scanner failed", { error: (err as Error).message });
    return;
  }

  logger.info("Scan finished", {
    long: signal.long ? { symbol: signal.long.symbol, changePct: Number(signal.long.changePct.toFixed(2)) } : null,
    short: signal.short ? { symbol: signal.short.symbol, changePct: Number(signal.short.changePct.toFixed(2)) } : null,
  });

  const plan = planFromSignal(signal, config);

  for (const [side, plannedTrade] of [["LONG", plan.long], ["SHORT", plan.short]] as const) {
    if (!plannedTrade) continue;

    // Don't re-enter if we already have an active trade on this side
    if (activeTrades.some((t) => t.side === side && (t.state === "OPEN" || t.state === "ENTRY_PENDING"))) {
      logger.warn(`Already have an active ${side} position - skipping entry`, { symbol: plannedTrade.symbol });
      continue;
    }

    logger.info(`Entering ${side}`, { symbol: plannedTrade.symbol, quantity: plannedTrade.quantity });

    const trade = await placeEntryOrder(kc, plannedTrade, config);
    if (!trade || trade.state === "FAILED") {
      logger.error(`${side} entry failed`, { symbol: plannedTrade.symbol });
      continue;
    }

    // Immediately place the broker-side stop-loss
    // Attach tickSize to the trade object so placeBrokerStopLoss can use it
    (trade as Trade & { tickSize?: number }).tickSize = plannedTrade.token
      ? (instruments.find((i) => Number(i.instrument_token) === plannedTrade.token)?.tick_size
          ? Number(instruments.find((i) => Number(i.instrument_token) === plannedTrade.token)!.tick_size)
          : 0.05)
      : 0.05;

    const tradeWithSL = await placeBrokerStopLoss(kc, trade, config);

    if (!tradeWithSL) {
      // CRITICAL FAILURE: entry succeeded but SL failed -> emergency exit
      logger.error("SL placement failed after entry - triggering emergency exit", { symbol: trade.symbol });
      const aborted = await emergencyExit(kc, trade, config);
      activeTrades.push(aborted);
      continue;
    }

    activeTrades.push(tradeWithSL);
    logger.info("Trade open with broker SL protection", {
      symbol: tradeWithSL.symbol,
      side: tradeWithSL.side,
      quantity: tradeWithSL.quantity,
      entryPrice: tradeWithSL.entryPrice,
      slPrice: tradeWithSL.stopLossPrice,
      targetPrice: tradeWithSL.targetPrice,
      slOrderId: tradeWithSL.stopLossOrderId,
    });
  }
}

async function forceExitAll(kc: Connect, config: AppConfig): Promise<void> {
  // Phase 9: implement forced exit of all open positions at 15:00.
  // Stub for now - log a clear message so it's obvious this needs completing.
  logger.warn("15:00 FORCE EXIT triggered - Phase 9 not yet implemented. Manual exit required if positions are open.", {
    openTrades: activeTrades.filter((t) => t.state === "OPEN").length,
  });
}

async function main(): Promise<void> {
  logger.info("Starting zerodha-midcap-trading-bot (Phase 7 - execution engine)");

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    logger.error("Failed to load configuration", { error: (err as Error).message });
    process.exitCode = 1;
    return;
  }

  logger.setLevel(config.logging.level as "debug" | "info" | "warn" | "error");

  logger.info("Configuration loaded", {
    tradingMode: config.trading.mode,
    liveTradingEnabled: config.trading.liveTradingEnabled,
    capitalLongMax: config.risk.capitalLongMax,
    capitalShortMax: config.risk.capitalShortMax,
    stopLossPct: config.risk.stopLossPct,
    targetPct: config.risk.targetPct,
  });

  if (config.trading.liveTradingEnabled) {
    logger.warn("LIVE_TRADING_ENABLED=true - REAL ORDERS WILL BE PLACED.");
  } else {
    logger.info("LIVE_TRADING_ENABLED=false - safe mode. All orders are blocked and simulated.");
  }

  const kc = createKiteClient(config);

  let accessToken: string;
  try {
    const auth = await authenticate(kc, config);
    logger.info("Ready. Access token acquired.", { source: auth.source });
    accessToken = auth.accessToken;
  } catch (err) {
    logger.error("Authentication failed", { error: (err as Error).message });
    process.exitCode = 1;
    return;
  }

  let instruments: Instrument[];
  try {
    await fetchProfile(kc);
    await fetchMargins(kc);
    const initialPositions = await fetchPositions(kc);
    const initialOrders = await fetchOrders(kc);

    // Startup reconciliation - rebuild state from broker before doing anything
    // On first run activeTrades is empty, so this is mostly a sanity check.
    // On restart after a crash, this is where we'd detect surviving positions.
    const { openTrades, closedByBroker } = await reconcile(kc, activeTrades);
    activeTrades = openTrades;

    if (closedByBroker.length > 0) {
      logger.info("Positions closed at broker during downtime", { count: closedByBroker.length });
    }

    void initialPositions;
    void initialOrders;

    instruments = await fetchInstruments(kc, "NSE");
  } catch (err) {
    logger.error("Startup checks failed", { error: (err as Error).message });
    logger.error("Delete kite-session.state.json and re-run if the token is stale.");
    process.exitCode = 1;
    return;
  }

  // WebSocket - needed for live tick monitoring (target exit in Phase 8)
  // For Phase 7 we connect it but the onTick handler is a stub.
  const resolved = resolveInstrumentTokens(instruments, [], "NSE"); // empty for now; Phase 8 subscribes Midcap 150
  const ticker = createTicker(config.kite.apiKey, accessToken);
  wireTicker(ticker, resolved, (_ticks: Tick[]) => {
    // Phase 8: monitor ticks against active trade target prices here
  });

  ticker.on("reconnect", async () => {
    logger.info("WebSocket reconnected - reconciling positions...");
    const { openTrades } = await reconcile(kc, activeTrades);
    activeTrades = openTrades;
  });

  ticker.connect();
  logger.info("WebSocket connected");

  // Schedule the market-hours events
  const cancelSchedule = scheduleMarketEvents(config.schedule, {
    onMarketOpen: () => {
      logger.info("Market opened (09:15) - collecting live data");
    },
    onScanTime: async () => {
      await runEntrySequence(kc, instruments, config);
    },
    onEntryTime: () => {
      logger.info("09:21 - entry window. Orders were placed at scan time (09:20).");
    },
    onForceExit: async () => {
      await forceExitAll(kc, config);
      cancelSchedule();
      logger.info("Trading day complete. Keeping process alive to monitor open positions.");
    },
  });

  logger.info("Bot running. Waiting for market events...", {
    marketOpen: config.schedule.marketOpen,
    scanTime: config.schedule.scanTime,
    forceExit: config.schedule.forceExitTime,
  });

  // Keep the process alive
  process.on("SIGINT", () => {
    logger.info("SIGINT received - shutting down gracefully");
    cancelSchedule();
    ticker.disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error("Unhandled error in main()", { error: (err as Error).message });
  process.exitCode = 1;
});