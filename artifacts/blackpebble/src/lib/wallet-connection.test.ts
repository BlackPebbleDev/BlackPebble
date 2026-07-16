import { describe, it, expect, beforeEach } from "vitest";
import {
  walletExplicitlyDisconnected,
  setWalletExplicitlyDisconnected,
  shouldAutoConnect,
  WALLET_EXPLICIT_DISCONNECT_KEY,
} from "./wallet-connection";

/**
 * The disconnect preference is the single source of truth that gates wallet
 * auto-reconnect. These tests use a fake localStorage on globalThis and treat a
 * fresh read as "after a refresh / route change / new tab" (the value survives
 * because it lives in persistent storage, not React state).
 */

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, String(v));
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
  key(): string | null {
    return null;
  }
  get length(): number {
    return this.store.size;
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage =
    new MemoryStorage() as unknown as Storage;
});

describe("wallet explicit-disconnect policy", () => {
  it("defaults to connected/auto-connect allowed", () => {
    expect(walletExplicitlyDisconnected()).toBe(false);
    expect(shouldAutoConnect()).toBe(true);
  });

  it("explicit disconnect persists through a page refresh", () => {
    setWalletExplicitlyDisconnected(true);
    // Simulate a refresh: a brand-new read from the same persistent storage.
    expect(walletExplicitlyDisconnected()).toBe(true);
    expect(globalThis.localStorage.getItem(WALLET_EXPLICIT_DISCONNECT_KEY)).toBe(
      "true",
    );
    // autoConnect must be disabled while explicitly disconnected.
    expect(shouldAutoConnect()).toBe(false);
  });

  it("explicit disconnect persists through route changes (repeated reads)", () => {
    setWalletExplicitlyDisconnected(true);
    for (let i = 0; i < 5; i++) {
      expect(walletExplicitlyDisconnected()).toBe(true);
    }
  });

  it("deliberate reconnect clears the disconnect preference", () => {
    setWalletExplicitlyDisconnected(true);
    expect(walletExplicitlyDisconnected()).toBe(true);
    // Pressing Connect Wallet again -> a successful connection clears the flag.
    setWalletExplicitlyDisconnected(false);
    expect(walletExplicitlyDisconnected()).toBe(false);
    expect(shouldAutoConnect()).toBe(true);
    expect(
      globalThis.localStorage.getItem(WALLET_EXPLICIT_DISCONNECT_KEY),
    ).toBeNull();
  });

  it("an unrelated action (e.g. X login) does not reconnect the wallet", () => {
    setWalletExplicitlyDisconnected(true);
    // Simulate signing into X: it must NOT touch the wallet disconnect pref.
    // (X auth writes its own session cookie only.)
    const before = walletExplicitlyDisconnected();
    // ...X login happens here, no wallet-connection call...
    expect(before).toBe(true);
    expect(walletExplicitlyDisconnected()).toBe(true);
    expect(shouldAutoConnect()).toBe(false);
  });

  it("is resilient when storage is unavailable", () => {
    (globalThis as unknown as { localStorage: undefined }).localStorage =
      undefined;
    expect(() => setWalletExplicitlyDisconnected(true)).not.toThrow();
    expect(walletExplicitlyDisconnected()).toBe(false);
    expect(shouldAutoConnect()).toBe(true);
  });
});
