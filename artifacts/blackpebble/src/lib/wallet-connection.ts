/**
 * Centralized wallet-connection policy for BlackPebble.
 *
 * The Solana wallet-adapter persists the selected wallet name and, with
 * `autoConnect`, eagerly reconnects on every page load. That meant an explicit
 * "Disconnect" did not survive a refresh or a new tab. This module is the SINGLE
 * source of truth for whether the user has explicitly disconnected, so
 * `autoConnect` can be disabled until they deliberately press Connect again.
 *
 * Rules enforced (see `WalletConnectionPolicy` in App.tsx):
 *  - explicit disconnect  -> persist the preference; disable autoConnect
 *  - deliberate reconnect -> clear the preference; normal persistence resumes
 *  - the preference survives refresh, route navigation, and tab reopen
 *  - only the wallet preference is touched - never auth/portfolio/analysis data
 */

/** Namespaced under the project's `blackpebble:` localStorage convention. */
export const WALLET_EXPLICIT_DISCONNECT_KEY =
  "blackpebble:wallet:explicitlyDisconnected";

/** localStorage if available (browser), else null (SSR / private mode / tests). */
function storage(): Storage | null {
  try {
    return typeof globalThis !== "undefined" && globalThis.localStorage
      ? globalThis.localStorage
      : null;
  } catch {
    return null;
  }
}

/** True when the user has explicitly disconnected and not since reconnected. */
export function walletExplicitlyDisconnected(): boolean {
  try {
    return storage()?.getItem(WALLET_EXPLICIT_DISCONNECT_KEY) === "true";
  } catch {
    return false;
  }
}

/** Persist (or clear) the explicit-disconnect preference. */
export function setWalletExplicitlyDisconnected(value: boolean): void {
  const s = storage();
  if (!s) return;
  try {
    if (value) {
      s.setItem(WALLET_EXPLICIT_DISCONNECT_KEY, "true");
    } else {
      s.removeItem(WALLET_EXPLICIT_DISCONNECT_KEY);
    }
  } catch {
    /* storage unavailable (private mode / SSR) - non-fatal */
  }
}

/**
 * The `autoConnect` value the wallet provider should use on mount: eager
 * reconnect is allowed only when the user has not explicitly disconnected.
 */
export function shouldAutoConnect(): boolean {
  return !walletExplicitlyDisconnected();
}
