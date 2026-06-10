---
name: Profile/social reads must stay read-only
description: Why getProfileStats avoids ensureAccount/getPortfolio for never-traded users
---

- Social profile reads (`getProfileStats` in `artifacts/api-server/src/lib/profiles.ts`)
  must NOT create trading state. `ensureAccount` and `getPortfolio` both lazily
  `INSERT INTO accounts ... ON CONFLICT DO NOTHING`, so calling them on a profile GET
  materializes an `accounts` row for an X user who has never traded.

**Why:** Phase-1 social layer is "read-only reuse" of trading/portfolio math. A profile
view creating an account is a silent write side-effect that violates that contract and
pollutes leaderboards/counts. Caught in architect review.

**How to apply:** Fetch the account read-only first (`getAccount`); if null, return zeroed
default stats (tier "Unranked") and skip getPortfolio/leverage/closed-stats entirely. Only
when the account already exists is it safe to reuse getPortfolio (its INSERT becomes a
no-op). Any new social read path that reuses trading primitives must apply the same guard.
