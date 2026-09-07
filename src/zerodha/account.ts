import type { Connect } from "kiteconnect";
import { logger } from "../utils/logger";

/**
 * Not part of the original fixed file list (which had no dedicated file for
 * profile/margins/positions). Added rather than stuffing these into
 * client.ts (whose stated purpose is client initialization) or orders.ts
 * (which is specifically about orders). Same reasoning as session.ts -
 * flagging the structural addition explicitly.
 *
 * All three functions here are read-only account queries. None of them
 * place, modify, or cancel anything.
 */

export async function fetchProfile(kc: Connect) {
  const profile = await kc.getProfile();
  logger.info("Profile fetched", {
    userId: profile.user_id,
    userName: profile.user_name,
    broker: profile.broker,
    exchanges: profile.exchanges,
  });
  return profile;
}

export async function fetchMargins(kc: Connect) {
  const margins = await kc.getMargins("equity");
  
  if (margins) {
    logger.info("Equity margins fetched", {
      net: margins.net,
      availableCash: margins.available.cash,
      liveBalance: margins.available.live_balance,
    });
  } else {
    logger.warn("No equity margin data returned - equity segment may not be enabled on this account");
  }
  return margins;
}   
        
export async function fetchPositions(kc: Connect) {
  const positions = await kc.getPositions();
  logger.info("Positions fetched", {
    netCount: positions.net.length,
    dayCount: positions.day.length, 
  });
  return positions;
}
