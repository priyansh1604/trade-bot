import { loadConfig } from "./config/env";
import { logger } from "./utils/logger";
import { createKiteClient } from "./zerodha/client";
import { authenticate } from "./zerodha/auth";
import { fetchProfile, fetchMargins, fetchPositions } from "./zerodha/account";
import { fetchOrders, placeOrder } from "./zerodha/orders";
import { fetchInstruments } from "./zerodha/instruments";
import { createTicker, wireTicker } from "./zerodha/marketData";
import { resolveMidcap150Universe } from "./strategy/universe";
import { runMorningScan } from "./strategy/strategy";
import { planFromSignal } from "./risk/riskManager";
import { placeEntryOrder } from "./trading/entry";
import { placeBrokerStopLoss, emergencyExit, cancelStopLoss, DEFAULT_TICK_SIZE } from "./trading/stopLoss";
import { checkTargets, calculateNetPnl } from "./trading/target";
import { reconcile } from "./trading/reconciliation";
import { scheduleMarketEvents } from "./scheduler/marketSchedule";
import { markExited } from "./trading/positionManager";
import type { Trade } from "./types/trading";
import type { Connect, Instrument, Tick } from "kiteconnect";
import type { AppConfig } from "./config/env";

let activeTrades: Trade[] = [];
let tickSizeByToken: Map<number, number> = new Map();

async function runEntrySequence(
  kc: Connect,
  instruments: Instrument[],
  config: AppConfig
): Promise<void> {
  logger.info("Running 09:20 scanner over Nifty Midcap 150...");

  let signal;
  try {
    signal = await runMorningScan(kc, instruments, config);
  } catch (err) {
    logger.error("Scanner failed", { error: (err as Error).message });
    return;
  }

  logger.info("Scan finished", {
    long:  signal.long  ? { symbol: signal.long.symbol,  changePct: Number(signal.long.changePct.toFixed(2))  } : null,
    short: signal.short ? { symbol: signal.short.symbol, changePct: Number(signal.short.changePct.toFixed(2)) } : null,
  });

  const plan = planFromSignal(signal, config);

  for (const side of ["LONG", "SHORT"] as const) {
    const planned = side === "LONG" ? plan.long : plan.short;
    if (!planned) continue;

    if (activeTrades.some((t) => t.side === side && (t.state === "OPEN" || t.state === "ENTRY_PENDING"))) {
      logger.warn(`Already have an active ${side} - skipping`, { symbol: planned.symbol });
      continue;
    }

    logger.info(`[${side} ENTRY]`, {
      symbol: planned.symbol,
      quantity: planned.quantity,
      referencePrice: planned.referencePrice,
      estimatedSL: planned.stopLossPrice,
      estimatedTarget: planned.targetPrice,
    });

    const trade = await placeEntryOrder(kc, planned, config);
    if (!trade || trade.state === "FAILED") {
      logger.error(`${side} entry failed`, { symbol: planned.symbol });
      continue;
    }

    const tickSize =
      tickSizeByToken.get(planned.token) ??
      Number(instruments.find((i) => Number(i.instrument_token) === planned.token)?.tick_size ?? DEFAULT_TICK_SIZE);

    const tradeWithSL = await placeBrokerStopLoss(kc, trade, tickSize, config);
    if (!tradeWithSL) {
      logger.error("SL placement failed - emergency exit", { symbol: trade.symbol });
      activeTrades.push(await emergencyExit(kc, trade, config));
      continue;
    }

    activeTrades.push(tradeWithSL);
    logger.info("Trade OPEN with broker SL", {
      symbol:      tradeWithSL.symbol,
      side:        tradeWithSL.side,
      quantity:    tradeWithSL.quantity,
      entryPrice:  tradeWithSL.entryPrice,
      slPrice:     tradeWithSL.stopLossPrice,
      slOrderId:   tradeWithSL.stopLossOrderId,
      targetPrice: tradeWithSL.targetPrice,
    });
  }
}

async function forceExitAll(kc: Connect, config: AppConfig): Promise<void> {
  logger.info("=== 15:00 FORCE EXIT ===");

  const toClose = activeTrades.filter((t) => t.state === "OPEN" || t.state === "TARGET_EXIT_PENDING");
  if (toClose.length === 0) {
    logger.info("No open positions at 15:00");
  }

  for (let i = 0; i < activeTrades.length; i++) {
    const trade = activeTrades[i];
    if (trade.state !== "OPEN" && trade.state !== "TARGET_EXIT_PENDING") continue;

    const exitSide = trade.side === "LONG" ? "SHORT" : "LONG";
    let exitPrice = trade.entryPrice ?? 0;

    try {
      const result = await placeOrder(
        kc,
        { tradingsymbol: trade.symbol, quantity: trade.quantity, side: exitSide, orderType: "MARKET", tag: "ZMBOT_EOD" },
        config
      );
      if (!result.blocked) logger.info("Force exit order placed", { symbol: trade.symbol, orderId: result.orderId });
    } catch (err) {
      logger.error("Force exit order FAILED - manual intervention required", {
        symbol: trade.symbol,
        error: (err as Error).message,
      });
    }

    // Cancel SL after exit (prevent orphan SL from creating a new position)
    await cancelStopLoss(kc, trade, config);

    const gross = trade.entryPrice !== undefined
      ? ((trade.side === "LONG" ? exitPrice - trade.entryPrice : trade.entryPrice - exitPrice) * trade.quantity)
      : 0;
    const net = calculateNetPnl(gross, trade.quantity, exitPrice, trade.entryPrice ?? exitPrice, config);

    activeTrades[i] = markExited(trade, "FORCE_EXIT", exitPrice, gross, net);
    logger.info("Position closed", {
      symbol: trade.symbol,
      side: trade.side,
      entryPrice: trade.entryPrice,
      exitPrice,
      grossPnl: `₹${gross.toFixed(2)}`,
      netPnl:   `₹${net.toFixed(2)}`,
    });
  }

  printDailySummary();
}

function printDailySummary(): void {
  logger.info("=== DAILY P&L SUMMARY ===");
  let totalGross = 0;
  let totalNet = 0;

  for (const t of activeTrades) {
    const gross = t.grossPnl ?? 0;
    const net   = t.netPnl   ?? 0;
    totalGross += gross;
    totalNet   += net;
    logger.info(`  ${t.symbol} [${t.side}]`, {
      state:      t.state,
      exitReason: t.exitReason,
      entryPrice: t.entryPrice,
      exitPrice:  t.exitPrice,
      grossPnl:   `₹${gross.toFixed(2)}`,
      netPnl:     `₹${net.toFixed(2)}`,
    });
  }

  logger.info("TOTALS", {
    grossPnl: `₹${totalGross.toFixed(2)}`,
    netPnl:   `₹${totalNet.toFixed(2)}`,
    trades:   activeTrades.length,
  });
}

async function main(): Promise<void> {
  logger.info("Starting zerodha-midcap-trading-bot");

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    logger.error("Config load failed", { error: (err as Error).message });
    process.exitCode = 1;
    return;
  }

  logger.setLevel(config.logging.level as "debug" | "info" | "warn" | "error");
  logger.info("Configuration loaded", {
    liveTradingEnabled: config.trading.liveTradingEnabled,
    capitalLong:  config.risk.capitalLongMax,
    capitalShort: config.risk.capitalShortMax,
    stopLossPct:  `${config.risk.stopLossPct  * 100}%`,
    targetPct:    `${config.risk.targetPct    * 100}%`,
  });

  if (config.trading.liveTradingEnabled) {
    logger.warn("⚠️  LIVE_TRADING_ENABLED=true — REAL MONEY ORDERS WILL BE PLACED");
  } else {
    logger.info("LIVE_TRADING_ENABLED=false — all orders simulated");
  }

  const kc = createKiteClient(config);

  let accessToken: string;
  try {
    const auth = await authenticate(kc, config);
    logger.info("Authenticated", { source: auth.source });
    accessToken = auth.accessToken;
  } catch (err) {
    logger.error("Auth failed", { error: (err as Error).message });
    process.exitCode = 1;
    return;
  }

  let instruments: Instrument[];
  try {
    await fetchProfile(kc);
    await fetchMargins(kc);
    await fetchPositions(kc);
    await fetchOrders(kc);
    instruments = await fetchInstruments(kc, "NSE");
  } catch (err) {
    logger.error("Startup connectivity failed — if token stale, delete kite-session.state.json", {
      error: (err as Error).message,
    });
    process.exitCode = 1;
    return;
  }

  const universe = resolveMidcap150Universe(instruments);
  logger.info("Midcap 150 universe resolved", { count: universe.length });
  tickSizeByToken = new Map(universe.map((u) => [u.token, u.tickSize]));

  // Startup reconciliation
  const { openTrades, closedByBroker } = await reconcile(kc, activeTrades);
  activeTrades = openTrades;
  if (closedByBroker.length > 0) {
    logger.info("Positions closed at broker since last run", { count: closedByBroker.length });
    for (const t of closedByBroker) logger.info(`  ${t.symbol} [${t.side}] → ${t.state}`);
  }

  // WebSocket — subscribe full Midcap 150 for live target monitoring
  const ticker = createTicker(config.kite.apiKey, accessToken);

  wireTicker(ticker, universe, async (ticks: Tick[]) => {
    if (activeTrades.some((t) => t.state === "OPEN")) {
      activeTrades = await checkTargets(ticks, activeTrades, kc, config, tickSizeByToken);
    }
  });

  ticker.on("reconnect", async () => {
    logger.info("WebSocket reconnected — reconciling...");
    const result = await reconcile(kc, activeTrades);
    activeTrades = result.openTrades;
    for (const t of result.closedByBroker) logger.info(`  Reconciled: ${t.symbol} → ${t.state}`);
  });

  ticker.connect();
  logger.info("WebSocket connected — subscribed to Midcap 150");

  const cancelSchedule = scheduleMarketEvents(config.schedule, {
    onMarketOpen: () => { logger.info("Market opened (09:15 IST)"); },

    onScanTime: async () => {
      await runEntrySequence(kc, instruments, config);
    },

    onEntryTime: () => {
      logger.info("09:21 entry window", {
        openPositions: activeTrades.filter((t) => t.state === "OPEN").length,
      });
    },

    onForceExit: async () => {
      await forceExitAll(kc, config);
      cancelSchedule();
      ticker.disconnect();
      logger.info("Trading day complete — exiting in 30s");
      setTimeout(() => process.exit(0), 30_000);
    },
  });

  logger.info("Bot running — waiting for market events", {
    marketOpen: config.schedule.marketOpen,
    scan:       config.schedule.scanTime,
    forceExit:  config.schedule.forceExitTime,
  });

  process.on("SIGINT", () => {
    logger.info("SIGINT — shutting down");
    cancelSchedule();
    ticker.disconnect();
    const open = activeTrades.filter((t) => t.state === "OPEN");
    if (open.length > 0) {
      logger.warn("Open positions on shutdown — check Zerodha manually!", {
        symbols: open.map((t) => t.symbol),
      });
    }
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error("Fatal unhandled error", { error: (err as Error).message });
  process.exitCode = 1;
});