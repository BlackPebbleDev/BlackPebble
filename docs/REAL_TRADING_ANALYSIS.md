# Real Trading Analysis Engine — Architecture (v2)

BlackPebble's Trader Intelligence Engine: read-only, on-chain analysis that
powers trader DNA, reputation signals, portfolio quality, insights, and
milestone events. The foundation for profiles, feed intelligence, achievements,
and the future AI coaching layer.

> **Naming**: this engine's structure score is called **Portfolio Quality** in
> the UI. "Wallet Health" belongs exclusively to the Wallet Cleanup utility's
> hygiene score (spam / empty accounts / fake-value tokens). Two different
> concepts, two different names. Internal API fields keep the `walletHealth`
> key for compatibility.

## Philosophy

- **Read-only**: Never requests seed phrases, private keys, signing, or approvals.
- **Separate from paper trading**: Parallel `real_*` tables; never mixed with `accounts`/`trades`.
- **Signals as primitives**: Every score is a named, versioned signal with history — not an ad-hoc number.
- **Evolving identity**: Trader DNA is an EMA-blended trait vector, not a static label.
- **Milestones, not raw activity**: The feed/profile layer reads intelligence events, never raw trades.

## Architecture

```
Wallet Connect (read-only)
        ↓
Helius SWAP History API (paginated, incremental early-stop)
        ↓
real-trading-ingest.ts   →  real_token_trades + real_credited_signatures
        ↓
real-trading-math.ts     →  FIFO cost basis, P&L, 20+ metrics (pure/testable)
        │                    + holdings reconciliation: FIFO leftovers are
        │                    capped against LIVE on-chain token balances
        │                    (getTokenAccountsByOwner) so transfers/burns/
        │                    non-swap exits never produce ghost positions.
        │                    Snapshots record holdings_verified; the UI marks
        │                    unverified data and prompts a refresh.
real-trading-behavior.ts →  Extensible rules engine → insights + tags
        ↓
real-trading-signals.ts  →  SIGNAL REGISTRY (12 signals, 0–100, evidence,
        │                    confidence) → real_signal_values (time series)
        ↓
real-trading-dna.ts      →  TRADER DNA (11-trait vector, EMA evolution,
        │                    archetype projection) → real_trader_dna
real-trading-health.ts   →  Portfolio Quality breakdown
real-trading-performance.ts → Chart series: cumulative realized PnL, monthly
        │                    activity, hold-duration buckets, winners/losers
        ↓
real-trading-engine.ts   →  Orchestrator → real_analysis_snapshots (full
        │                    fidelity) + real_insights
        ↓
real-trading-timeline.ts →  MILESTONE EVENTS (signal improved, DNA evolved,
                             trade milestones…) → real_timeline_events
        ↓
API / Utilities page / Portfolio card / Achievements
```

## Signal Registry (reputation engine foundation)

12 reusable signals, each 0–100 with confidence and human-readable evidence:

`consistency, risk, discipline, timing, patience, recovery, profitability,
conviction, position_sizing, diversification, drawdown_management, activity`

- Persisted daily to `real_signal_values` (one row per signal per day).
- Every read returns the ~30-day delta ("Consistency 61 → 69").
- Future consumers: profiles, leaderboards, competitions, discovery, AI coach.
- `risk` is direction-neutral (high = aggressive), everything else higher = better.

## Trader DNA

- 11-trait vector (`momentum, patience, conviction, risk_tolerance,
  diversification, discipline, recovery, rotation, scalping, swing, fomo`).
- Each analysis observes a fresh vector, then blends with EMA (α=0.3) so
  identity evolves smoothly instead of flip-flopping.
- 13 archetypes are declarative projections over the vector (requirements +
  score traits) — adding one is a data change, not a logic rewrite.
- Archetype changes with confidence ≥ 0.5 emit a "Trading DNA evolved" event.

## Timeline Events (feed/profile intelligence)

Milestones only — payloads never contain amounts, mints, or tx details:

| Event | Trigger |
|-------|---------|
| `verified_wallet_connected` | First analysis for a wallet |
| `signal_improved` | Signal +8 pts over 30d (confidence ≥ 0.4) |
| `wallet_health_improved` | Health +10 pts |
| `dna_evolved` | Primary archetype changed |
| `milestone_trades` | 100 / 250 / 500 / 1000 / 2500 / 5000 swaps |
| `best_trade_record` | New largest realized gain (≥ 0.5 SOL) |

All emissions deduped inside a 7-day window per (type, subject).

## Database Tables

| Table | Purpose |
|-------|---------|
| `real_wallet_sync_jobs` | Sync cursor and status per wallet |
| `real_token_trades` | Parsed buy/sell events from on-chain swaps |
| `real_credited_signatures` | Replay protection (mirror recovery pattern) |
| `real_analysis_snapshots` | Latest full-fidelity computed state |
| `real_insights` | Behavioral insight history |
| `real_signal_values` | Signal time series (deltas, reputation) |
| `real_trader_dna` | Evolving trait vector + archetypes |
| `real_timeline_events` | Intelligence milestones |

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/real-analysis/:wallet` | Full analysis summary (public read) |
| POST | `/real-analysis/:wallet/sync` | Manual sync (rate limited 3/min) |
| GET | `/real-analysis/:wallet/insights` | Behavioral insights only |
| GET | `/real-analysis/:wallet/performance` | Chart series + winners/losers (local data only) |
| GET | `/real-analysis/:wallet/timeline` | Milestone events |

## Frontend Surfaces

- `/utilities/trading-analysis` — the intelligence report (flagship page):
  1. Wallet Summary hero (wallet value, total/realized/unrealized P&L,
     Portfolio Quality, trader identity)
  2. Performance Overview (cumulative realized PnL curve, monthly activity,
     hold-duration distribution)
  3. Trader Intelligence (12 signals as `MetricTile`s with 30d deltas)
  4. Behavior Analysis (strengths vs areas to watch)
  5. Risk & Exposure (exposure, concentration, sizing, largest gain/loss)
  6. Holdings & Trades (open positions with token identity, top winners/losers)
  7. Detailed Metrics (expandable) + Evolution timeline
  Built on the reusable `components/metric-tile.tsx` primitive.
- Utilities hub card — consistent with Journal / Wallet Cleanup / Trade Planner.
- Portfolio — compact summary card (DNA + top 3 signals) linking to the utility.

## Feature Flag

`real_trading_analysis` — default `false`. Enable via admin dashboard or:

```sql
INSERT INTO feature_flags (key, enabled, updated_at)
VALUES ('real_trading_analysis', true, EXTRACT(EPOCH FROM NOW())::bigint)
ON CONFLICT (key) DO UPDATE SET enabled = true;
```

## Performance Notes

- Open positions valued with ONE batched DexScreener call (no N+1).
- Avg market cap enrichment batched over unique mints.
- Incremental syncs stop paging at the first fully-seen page.
- First backfill capped at 20 pages (2000 swaps) per run; subsequent runs
  continue deeper history organically.
- Signal writes throttled to one row per signal per day.

## Achievements Integration

- `verified_wallet_analysis` ("Verified Wallet") — first analyzed wallet.
- `real_trader_100` ("100 Real Trades") — 100+ analyzed swaps.
- Badge mint fires automatically after each analysis for linked users.

## Future Phases (designed for, not built)

- Profile "Verified Trading" tab with per-field consent controls
- Feed UNION integration for `real_timeline_events` (kind: `intelligence`)
- Reputation composite consuming signal registry (parallel to paper trust)
- AI coaching layer reading structured `ai_input` exports
- Helius webhooks for real-time sync; job queue for scale
- Multi-wallet aggregation per user

## Security

- All data from public blockchain APIs; client cannot inject trades.
- Signature dedup prevents replay/double-counting.
- Sync endpoint rate limited; all endpoints feature-flag gated.
- Timeline payloads carry no sensitive wallet details.
