import WebSocket from "ws";
import { logger } from "./logger.js";

const PUMPPORTAL_WS = "wss://pumpportal.fun/api/data";

export interface NewToken {
  mint: string;
  name: string;
  symbol: string;
  logo: string | null;
  marketCapSol: number;
  priceSol: number;
  createdAt: number;
}

export interface MigrationEvent {
  mint: string;
  name: string;
  symbol: string;
  pool: string | null;
  migratedAt: number;
}

export interface LiveTrade {
  mint: string;
  side: "buy" | "sell";
  solAmount: number;
  tokenAmount: number;
  trader: string;
  priceSol: number;
  marketCapSol: number;
  timestamp: number;
}

export interface BondingPrice {
  priceSol: number;
  marketCapSol: number;
  vSol: number;
  vTokens: number;
  updatedAt: number;
}

const MAX_NEW_TOKENS = 80;
const MAX_MIGRATIONS = 60;
const MAX_TRADES_PER_TOKEN = 60;
const MAX_SUBSCRIPTIONS = 50;

// In development / preview the pump.fun firehose (hundreds of create + trade
// events per second) can choke the preview. Throttle the two high-volume event
// types so the UI stays responsive while still showing live activity.
// Production processes every event (interval = 0).
const IS_PROD = process.env.NODE_ENV === "production";
const NEW_TOKEN_MIN_INTERVAL_MS = IS_PROD ? 0 : 1500;
const TRADE_MIN_INTERVAL_MS = IS_PROD ? 0 : 400;

class PumpPortalService {
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectDelay = 2000;
  private newTokens: NewToken[] = [];
  private migrations: MigrationEvent[] = [];
  private trades = new Map<string, LiveTrade[]>();
  private bonding = new Map<string, BondingPrice>();
  private subscribed = new Set<string>();
  private subOrder: string[] = [];
  private lastNewTokenAt = 0;
  private lastTradeAt = new Map<string, number>();

  start(): void {
    if (this.ws) return;
    this.connect();
  }

  private connect(): void {
    try {
      logger.info("Connecting to PumpPortal WebSocket");
      this.ws = new WebSocket(PUMPPORTAL_WS);

      this.ws.on("open", () => {
        this.connected = true;
        this.reconnectDelay = 2000;
        logger.info("PumpPortal WebSocket connected");
        this.send({ method: "subscribeNewToken" });
        this.send({ method: "subscribeMigration" });
        // Re-subscribe to any tokens we were tracking.
        for (const mint of this.subscribed) {
          this.send({ method: "subscribeTokenTrade", keys: [mint] });
        }
      });

      this.ws.on("message", (data: WebSocket.RawData) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("close", () => {
        this.connected = false;
        this.ws = null;
        logger.warn(
          { delay: this.reconnectDelay },
          "PumpPortal WebSocket closed, reconnecting",
        );
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      });

      this.ws.on("error", (err) => {
        logger.warn({ err: err.message }, "PumpPortal WebSocket error");
        try {
          this.ws?.close();
        } catch {
          // ignore
        }
      });
    } catch (e) {
      logger.warn({ err: e }, "PumpPortal connect failed");
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    }
  }

  private send(obj: unknown): void {
    if (this.ws && this.connected) {
      try {
        this.ws.send(JSON.stringify(obj));
      } catch (e) {
        logger.warn({ err: e }, "PumpPortal send failed");
      }
    }
  }

  private handleMessage(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg["message"] && !msg["mint"]) return; // status acks

    const txType = msg["txType"];
    const pool = msg["pool"];

    if (txType === "create") {
      this.onNewToken(msg);
    } else if (txType === "buy" || txType === "sell") {
      this.onTrade(msg, txType as "buy" | "sell");
    } else if (msg["mint"] && (txType === "migrate" || pool === "raydium")) {
      this.onMigration(msg);
    }
  }

  private deriveBonding(msg: Record<string, unknown>): BondingPrice | null {
    const vSol = Number(msg["vSolInBondingCurve"]);
    const vTokens = Number(msg["vTokensInBondingCurve"]);
    const marketCapSol = Number(msg["marketCapSol"]) || 0;
    if (vSol > 0 && vTokens > 0) {
      return {
        priceSol: vSol / vTokens,
        marketCapSol,
        vSol,
        vTokens,
        updatedAt: Date.now(),
      };
    }
    return null;
  }

  private onNewToken(msg: Record<string, unknown>): void {
    const mint = String(msg["mint"] || "");
    if (!mint) return;
    if (NEW_TOKEN_MIN_INTERVAL_MS > 0) {
      const now = Date.now();
      if (now - this.lastNewTokenAt < NEW_TOKEN_MIN_INTERVAL_MS) return;
      this.lastNewTokenAt = now;
    }
    const bonding = this.deriveBonding(msg);
    if (bonding) this.bonding.set(mint, bonding);

    const token: NewToken = {
      mint,
      name: String(msg["name"] || mint.slice(0, 6)),
      symbol: String(msg["symbol"] || "").toUpperCase(),
      logo: (msg["uri"] as string) || null,
      marketCapSol: Number(msg["marketCapSol"]) || 0,
      priceSol: bonding?.priceSol ?? 0,
      createdAt: Date.now(),
    };
    this.newTokens.unshift(token);
    if (this.newTokens.length > MAX_NEW_TOKENS)
      this.newTokens.length = MAX_NEW_TOKENS;
  }

  private onMigration(msg: Record<string, unknown>): void {
    const mint = String(msg["mint"] || "");
    if (!mint) return;
    const ev: MigrationEvent = {
      mint,
      name: String(msg["name"] || mint.slice(0, 6)),
      symbol: String(msg["symbol"] || "").toUpperCase(),
      pool: (msg["pool"] as string) || null,
      migratedAt: Date.now(),
    };
    this.migrations.unshift(ev);
    if (this.migrations.length > MAX_MIGRATIONS)
      this.migrations.length = MAX_MIGRATIONS;
  }

  private onTrade(msg: Record<string, unknown>, side: "buy" | "sell"): void {
    const mint = String(msg["mint"] || "");
    if (!mint) return;
    if (TRADE_MIN_INTERVAL_MS > 0) {
      // Throttle per-mint so the token the user is actively viewing keeps
      // receiving updates and cannot be starved by noisier unrelated tokens.
      const now = Date.now();
      const last = this.lastTradeAt.get(mint) ?? 0;
      if (now - last < TRADE_MIN_INTERVAL_MS) return;
      this.lastTradeAt.set(mint, now);
    }
    const bonding = this.deriveBonding(msg);
    if (bonding) this.bonding.set(mint, bonding);

    const trade: LiveTrade = {
      mint,
      side,
      solAmount: Number(msg["solAmount"]) || 0,
      tokenAmount: Number(msg["tokenAmount"]) || 0,
      trader: String(msg["traderPublicKey"] || ""),
      priceSol: bonding?.priceSol ?? 0,
      marketCapSol: Number(msg["marketCapSol"]) || 0,
      timestamp: Date.now(),
    };
    const list = this.trades.get(mint) ?? [];
    list.unshift(trade);
    if (list.length > MAX_TRADES_PER_TOKEN) list.length = MAX_TRADES_PER_TOKEN;
    this.trades.set(mint, list);
  }

  subscribeToken(mint: string): void {
    if (this.subscribed.has(mint)) {
      // refresh LRU position
      this.subOrder = this.subOrder.filter((m) => m !== mint);
      this.subOrder.push(mint);
      return;
    }
    this.subscribed.add(mint);
    this.subOrder.push(mint);
    this.send({ method: "subscribeTokenTrade", keys: [mint] });

    while (this.subOrder.length > MAX_SUBSCRIPTIONS) {
      const evict = this.subOrder.shift();
      if (evict) {
        this.subscribed.delete(evict);
        this.send({ method: "unsubscribeTokenTrade", keys: [evict] });
      }
    }
  }

  getNewTokens(limit = 40): NewToken[] {
    return this.newTokens.slice(0, limit);
  }

  getMigrations(limit = 40): MigrationEvent[] {
    return this.migrations.slice(0, limit);
  }

  getTrades(mint: string, limit = 40): LiveTrade[] {
    return (this.trades.get(mint) ?? []).slice(0, limit);
  }

  getBondingPrice(mint: string): BondingPrice | null {
    const b = this.bonding.get(mint);
    if (!b) return null;
    // Bonding prices are only valid while actively traded; expire after 10 min.
    if (Date.now() - b.updatedAt > 10 * 60 * 1000) return null;
    return b;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export const pumpportal = new PumpPortalService();
