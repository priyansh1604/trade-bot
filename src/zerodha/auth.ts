import * as http from "http";
import type { Connect, SessionData } from "kiteconnect";
import type { AppConfig } from "../config/env";
import { logger } from "../utils/logger";
import { loadValidSession, saveSession } from "./session";

export type AuthSource = "env" | "cached-session" | "fresh-login";

export interface AuthResult {
  source: AuthSource;
  accessToken: string;
  /** Present for "cached-session" and "fresh-login"; absent for "env" (unverified, no session metadata). */
  session?: SessionData;
}

/**
 * Waits for Zerodha's login redirect on a local HTTP server and resolves
 * with the `request_token` it carries.
 *
 * Real, documented redirect shape (verified against Kite's own docs, not
 * assumed):
 *   YOUR_REDIRECT_URL?action=login&type=login&status=success&request_token=XXXX
 * On failure Kite may omit request_token or send a non-"success" status;
 * we treat "no request_token present" as the failure case rather than
 * hard-coding an exact error format we haven't verified.
 *
 * The request_token is single-use and only valid for a couple of minutes,
 * so this server is only ever up for the duration of one login attempt.
 */
function waitForRequestToken(port: number, callbackPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400).end("Bad request");
        return;
      }

      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname !== callbackPath) {
        res.writeHead(404).end("Not found");
        return;
      }

      const requestToken = url.searchParams.get("request_token");
      const status = url.searchParams.get("status");

      if (!requestToken) {
        res.writeHead(400, { "Content-Type": "text/html" }).end(
          `<html><body><h3>Login did not return a request_token.</h3>` +
            `<p>status=${status ?? "unknown"}. Check the terminal and try again.</p></body></html>`
        );
        server.close();
        reject(
          new Error(
            `Kite redirect did not include a request_token (status=${status ?? "unknown"}). ` +
              `Check that the redirect URL registered on the developer console exactly matches ` +
              `http://127.0.0.1:${port}${callbackPath}`
          )
        );
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" }).end(
        "<html><body><h3>Login successful.</h3><p>You can close this tab and return to the terminal.</p></body></html>"
      );
      server.close();
      resolve(requestToken);
    });

    server.on("error", (err) => {
      reject(
        new Error(
          `Local redirect server failed on port ${port}: ${err.message}. ` +
            `Is something else already using that port?`
        )
      );
    });

    server.listen(port, "127.0.0.1", () => {
      logger.info("Local redirect listener started", {
        url: `http://127.0.0.1:${port}${callbackPath}`,
      });
    });
  });
}

/**
 * Runs the full interactive login flow:
 *   1. Print the Kite login URL for the user to open.
 *   2. Start a local server that waits for Zerodha's redirect.
 *   3. Exchange the resulting request_token for an access_token.
 *   4. Set the access token on the client and persist the session locally.
 */
async function runLoginFlow(kc: Connect, config: AppConfig): Promise<SessionData> {
  const loginUrl = kc.getLoginURL();

  logger.info("Open this URL in your browser to log in to Zerodha:");
  logger.info(loginUrl);
  logger.info("Waiting for redirect back to the local callback server...");

  const requestToken = await waitForRequestToken(
    config.kite.redirect.port,
    config.kite.redirect.path
  );

  logger.info("request_token received, exchanging for access_token...");

  const session = await kc.generateSession(requestToken, config.kite.apiSecret);
  kc.setAccessToken(session.access_token);

  logger.info("Authentication successful", {
    userId: session.user_id,
    userName: session.user_name,
    email: session.email,
  });

  saveSession(session);

  return session;
}

/**
 * Top-level entrypoint for Phase 2 authentication.
 *
 * Order of precedence:
 *   1. KITE_ACCESS_TOKEN from env, if set - used directly, login flow skipped.
 *      NOTE: this is NOT verified against Zerodha in Phase 2 (no API call is
 *      made). A stale/invalid token here will only surface as a failure once
 *      Phase 3 makes its first real API call.
 *   2. A cached session on disk that hasn't crossed the 6 AM expiry.
 *   3. A fresh interactive login via the local redirect server.
 *
 * Does not place any orders and does not verify the token against Zerodha -
 * that verification (profile check) is explicitly Phase 3.
 */
export async function authenticate(kc: Connect, config: AppConfig): Promise<AuthResult> {
  if (config.kite.accessToken) {
    kc.setAccessToken(config.kite.accessToken);
    logger.info("Using KITE_ACCESS_TOKEN from environment (unverified until Phase 3)");
    return { source: "env", accessToken: config.kite.accessToken };
  }

  const cached = loadValidSession();
  if (cached) {
    kc.setAccessToken(cached.access_token);
    logger.info("Reusing cached session from earlier today", {
      userId: cached.user_id,
      userName: cached.user_name,
    });
    return { source: "cached-session", accessToken: cached.access_token, session: cached };
  }

  logger.info("No valid cached session found - starting fresh login flow");
  const session = await runLoginFlow(kc, config);
  return { source: "fresh-login", accessToken: session.access_token, session };
}
