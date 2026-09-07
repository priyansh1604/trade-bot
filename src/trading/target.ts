import type { Connect, Tick } from "kiteconnect";
import type { AppConfig } from "../config/env";
import type { Trade } from "../types/trading";
import { placeOrder } from "../zerodha/orders";
import { cancelStopLoss } from "./stopLoss";
import { markExited, updateTradeState } from "./positionManager";
import { logger } from "../utils/logger";

export async function checkTargets(
  ticks: Tick[],
  trades: Trade[],
  kc: Connect,
  config: AppConfig,
  tickSizeByToken: Map<number, number>
): Promise<Trade[]> {
  void tickSizeByToken;
  const updated = [...trades];

  for (const tick of ticks) {
    const ltp = tick.last_price;
    const token = tick.instrument_token;

    for (let i = 0; i < updated.length; i++) {
      const trade = updated[i];
      if (trade.state !== "OPEN" || trade.targetStatus !== "WATCHING") continue;
      if (trade.instrumentToken !== token) continue;
      if (trade.targetPrice === undefined) continue;

      const hit =
        trade.side === "LONG" ? ltp >= trade.targetPrice : ltp <= trade.targetPrice;
      if (!hit) continue;

      logger.info("Target reached - exiting", {
        symbol: trade.symbol,
        side: trade.side,
        ltp,
        target: trade.targetPrice,
      });

      // Mark pending immediately so duplicate ticks don't double-fire
      updated[i] = updateTradeState(trade, "TARGET_EXIT_PENDING");

      const exitSide = trade.side === "LONG" ? "SHORT" : "LONG";
      const exitResult = await placeOrder(
        kc,
        { tradingsymbol: trade.symbol, quantity: trade.quantity, side: exitSide, orderType: "MARKET", tag: "ZMBOT_TGT" },
        config
      );

      if (exitResult.blocked) {
        logger.info("Target exit blocked (safe mode) - simulating exit", { symbol: trade.symbol });
      } else {
        logger.info("Target exit order placed", { symbol: trade.symbol, orderId: exitResult.orderId });
      }

      // Cancel broker SL immediately after exit - never leave an orphan SL
      await cancelStopLoss(kc, updated[i], config);

      const gross = calculateGrossPnl(trade, ltp);
      const net = calculateNetPnl(gross, trade.quantity, ltp, trade.entryPrice ?? ltp, config);

      updated[i] = markExited(updated[i], "TARGET", ltp, gross, net);

      logger.info("Target exit complete", {
        symbol: trade.symbol,
        side: trade.side,
        entryPrice: trade.entryPrice,
        exitPrice: ltp,
        grossPnl: `₹${gross.toFixed(2)}`,
        netPnl: `₹${net.toFixed(2)}`,
      });
    }
  }

  return updated;
}

function calculateGrossPnl(trade: Trade, exitPrice: number): number {
  if (!trade.entryPrice) return 0;
  const diff =
    trade.side === "LONG" ? exitPrice - trade.entryPrice : trade.entryPrice - exitPrice;
  return diff * trade.quantity;
}

/**
 * Net P&L after transaction costs for NSE equity MIS.
 * All rates configurable in .env via TRANSACTION_* vars (see .env.example).
 * Defaults: Zerodha's published rates as of 2026.
 */
export function calculateNetPnl(
  grossPnl: number,
  quantity: number,
  exitPrice: number,
  entryPrice: number,
  config: AppConfig
): number {
  const c = config.costs;
  const brokeragePerOrder = c?.brokeragePerOrder ?? 20;
  const sttPct         = c?.sttPct         ?? 0.00025;
  const exchangeTxnPct = c?.exchangeTxnPct ?? 0.0000345;
  const gstRate        = c?.gstRate        ?? 0.18;
  const stampDutyPct   = c?.stampDutyPct   ?? 0.00003;
  const slippagePct    = c?.slippagePct    ?? 0.0005;

  const buyVal  = quantity * entryPrice;
  const sellVal = quantity * exitPrice;

  const brokerage  = Math.min(brokeragePerOrder * 2, (buyVal + sellVal) * 0.025);
  const stt        = sellVal * sttPct;
  const exchTxn    = (buyVal + sellVal) * exchangeTxnPct;
  const gst        = (brokerage + exchTxn) * gstRate;
  const stamp      = buyVal * stampDutyPct;
  const slippage   = (buyVal + sellVal) * slippagePct;

  return grossPnl - (brokerage + stt + exchTxn + gst + stamp + slippage);
}