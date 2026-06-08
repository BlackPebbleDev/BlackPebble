-- =============================================================================
-- BlackPebble Paper Trading — Season Reset
-- =============================================================================
-- Safe to re-run: each statement is idempotent.
-- Preserves: accounts (wallet/auth), watchlist, token market data,
--            token_views, search_activity, users, user_identities
-- Clears:    positions, trades, paper_orders, portfolio_snapshots,
--            leaderboard_snapshots, participation_metrics,
--            competition_results, competitions
-- Resets:    accounts → paper_balance = :starting_balance (default 100),
--            all P&L, trade counts, streaks, tiers back to zero/none
-- =============================================================================

BEGIN;

-- 1. Clear all open positions
DELETE FROM positions;

-- 2. Clear all trade history
DELETE FROM trades;

-- 3. Cancel / remove all advanced orders (TP, SL, Buy Limits)
DELETE FROM paper_orders;

-- 4. Clear portfolio equity snapshots (performance chart data)
DELETE FROM portfolio_snapshots;

-- 5. Clear leaderboard snapshots
DELETE FROM leaderboard_snapshots;

-- 6. Clear daily participation metrics
DELETE FROM participation_metrics;

-- 7. Clear competition results and definitions
DELETE FROM competition_results;
DELETE FROM competitions;

-- 8. Reset all account trading statistics
--    Preserved: wallet (PK), created_at, last_active
--    Reset:     everything paper-trading related
UPDATE accounts
SET
  paper_balance       = 100,
  total_trades        = 0,
  winning_trades      = 0,
  total_pnl           = 0,
  realized_pnl        = 0,
  best_trade          = 0,
  worst_trade         = 0,
  current_streak      = 0,
  participation_points = 0,
  graduation_tier     = 'none',
  last_reset_at       = EXTRACT(EPOCH FROM NOW())::bigint;

COMMIT;

-- Verification — run after the reset to confirm state
SELECT
  'accounts'             AS tbl, COUNT(*) AS rows_remaining FROM accounts
UNION ALL SELECT 'positions',             COUNT(*) FROM positions
UNION ALL SELECT 'trades',                COUNT(*) FROM trades
UNION ALL SELECT 'paper_orders',          COUNT(*) FROM paper_orders
UNION ALL SELECT 'portfolio_snapshots',   COUNT(*) FROM portfolio_snapshots
UNION ALL SELECT 'leaderboard_snapshots', COUNT(*) FROM leaderboard_snapshots
UNION ALL SELECT 'participation_metrics', COUNT(*) FROM participation_metrics
UNION ALL SELECT 'watchlist',             COUNT(*) FROM watchlist
ORDER BY tbl;
