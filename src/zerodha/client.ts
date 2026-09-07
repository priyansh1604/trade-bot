import { KiteConnect } from "kiteconnect";
import type { Connect } from "kiteconnect";
import type { AppConfig } from "../config/env";

// Note on typing: the package exports `KiteConnect` as the *constructor's*
// type (`new (params) => Connect`) and separately exports `Connect` as the
// type of the resulting *instance*. `createKiteClient` returns an instance,
// so its return type is `Connect`, not `KiteConnect`.

/**
 * Creates a KiteConnect REST client bound to our api_key.
 * No access token is set here - that happens after authenticate()
 * (src/zerodha/auth.ts) succeeds, via kc.setAccessToken().
 *
 * Constructing the client does not make any network call by itself.
 */
export function createKiteClient(config: AppConfig): Connect {
  return new KiteConnect({ api_key: config.kite.apiKey });
}
