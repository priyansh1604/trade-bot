import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Reads a required string env var. Throws at startup if missing,
 * so we never silently run with an undefined credential.
 */
function requireString(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. Check your .env file (see .env.example).`
    );
  }
  return value;
}

function optionalString(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value;
}

function optionalNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got: "${value}"`);
  }
  return parsed;
}

function parseBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(
    `Environment variable ${name} must be exactly "true" or "false", got: "${value}"`
  );
}

export interface AppConfig {
  kite: {
    apiKey: string;
    apiSecret: string;
    // Access token may legitimately be empty before the daily login flow (Phase 2) runs.
    // If set here (via env), it is used directly and the login flow is skipped -
    // see src/zerodha/auth.ts. Useful for quickly resuming a session you already
    // generated, but it is NOT verified against Zerodha until Phase 3 (profile check).
    accessToken: string;
    /**
     * Local redirect server settings for the daily login flow (Phase 2).
     * This MUST exactly match the "Redirect URL" registered for your app at
     * https://developers.kite.trade/apps - Kite will only redirect to a URL
     * that matches the developer console configuration.
     */
    redirect: {
      port: number;
      path: string;
    };
  };
  trading: {
    mode: string;
    /**
     * THE master safety switch. Defaults to false (safe) if unset or malformed.
     * Order-placement code (Phase 7+) must check this before touching the
     * Kite order API, and must default to "blocked" on any ambiguity.
     */
    liveTradingEnabled: boolean;
  };
  risk: {
    capitalLongMax: number;
    capitalShortMax: number;
    stopLossPct: number;
    targetPct: number;
    maxStockPrice: number;
  };
  liquidity: {
    // Deliberately left unset/optional in Phase 1. These thresholds are not
    // yet calibrated against real Midcap 150 liquidity data - see Phase 5/6
    // notes in README. Consumers of this config must treat `undefined` as
    // "filter not yet configured", not "no filtering needed".
    minValue?: number;
    maxSpread?: number;
    minVolume?: number;
  };
  schedule: {
    start: string;
    marketOpen: string;
    scanTime: string;
    entryTime: string;
    forceExitTime: string;
  };
  logging: {
    level: string;
  };
}

function optionalNumberOrUndefined(name: string): number | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got: "${value}"`);
  }
  return parsed;
}

export function loadConfig(): AppConfig {
  const config: AppConfig = {
    kite: {
      apiKey: requireString("KITE_API_KEY"),
      apiSecret: requireString("KITE_API_SECRET"),
      accessToken: optionalString("KITE_ACCESS_TOKEN", ""),
      redirect: {
        port: optionalNumber("KITE_REDIRECT_PORT", 3000),
        path: optionalString("KITE_REDIRECT_PATH", "/callback"),
      },
    },
    trading: {
      mode: optionalString("TRADING_MODE", "LIVE"),
      liveTradingEnabled: parseBoolean("LIVE_TRADING_ENABLED", false),
    },
    risk: {
      capitalLongMax: optionalNumber("CAPITAL_LONG_MAX", 5000),
      capitalShortMax: optionalNumber("CAPITAL_SHORT_MAX", 5000),
      stopLossPct: optionalNumber("STOP_LOSS_PCT", 0.01),
      targetPct: optionalNumber("TARGET_PCT", 0.022),
      maxStockPrice: optionalNumber("MAX_STOCK_PRICE", 5000),
    },
    liquidity: {
      minValue: optionalNumberOrUndefined("LIQUIDITY_MIN_VALUE"),
      maxSpread: optionalNumberOrUndefined("LIQUIDITY_MAX_SPREAD"),
      minVolume: optionalNumberOrUndefined("LIQUIDITY_MIN_VOLUME"),
    },
    schedule: {
      start: optionalString("SCHEDULE_START", "09:00"),
      marketOpen: optionalString("SCHEDULE_MARKET_OPEN", "09:15"),
      scanTime: optionalString("SCHEDULE_SCAN_TIME", "09:20"),
      entryTime: optionalString("SCHEDULE_ENTRY_TIME", "09:21"),
      forceExitTime: optionalString("SCHEDULE_FORCE_EXIT_TIME", "15:00"),
    },
    logging: {
      level: optionalString("LOG_LEVEL", "info"),
    },
  };

  return config;
}
