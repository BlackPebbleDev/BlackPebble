---
name: Tier thresholds lockstep
description: Tier cutoff values are duplicated frontend/backend and must match
---

Tier cutoffs (Legend≥1000 / Diamond≥300 / Gold≥100 / Silver≥25 / Bronze≥5 realized
PnL in SOL, else Unranked) exist in two places:

- backend source of truth: `graduationTier()` / TIERS in api-server `lib/trading.ts`
- frontend display: `tierFromRealizedPnl()` / TIER_THRESHOLDS in web `lib/tiers.ts`

**Rule:** Any threshold change must be applied to both files in the same change.

**Why:** The backend computes and stores the authoritative tier; the frontend
thresholds exist only so list views can render a badge without a round-trip.
Drift makes a badge disagree with the stored tier.

**How to apply:** When editing one list, grep the other immediately. The badge
itself (`TierBadge` / `tierMeta`) maps a tier-name string and tolerates "none"→Unranked.
