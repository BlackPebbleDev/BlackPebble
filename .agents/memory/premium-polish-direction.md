---
name: BlackPebble premium polish direction
description: Approved visual-polish design rules for BlackPebble; apply when implementing the site-wide polish pass.
---

# BlackPebble premium visual-polish direction

Scope: a POLISH pass, not a redesign. Preserve all functionality, routing, page hierarchy, auth, DB, data fields, columns, and tab structure. Elevate craft only.

**Rules (approved by user):**
- Brand is fixed: deep-black bg, gold accent #c9a96e, white text, muted #a0a0a0.
- Gold reserved for active states + primary actions ONLY. Green/red reserved EXCLUSIVELY for P&L / price-change values — never chrome or buttons.
- Subtle radius: `--radius` 0rem → 2px (0.125rem). Use `rounded-[2px]` on cards/buttons/inputs/badges; `rounded-full` only for avatars/dots.
- All numerics in JetBrains Mono with `tabular-nums` for column alignment; labels are `text-[11px] uppercase tracking-wider text-muted-foreground`.
- Inspiration: Bloomberg Terminal, Hyperliquid, TradingView, institutional fintech.
- Hard bans: no glassmorphism/backdrop-blur, no neon, no glowing/colored shadows or borders, no gaming UI, no crypto-meme aesthetics, no decorative gradients.

**Why:** User required plan/mockup approval before any site-wide change and was explicit about the banned aesthetics and the gold/green-red color discipline.

**How to apply:** Approved mobile mockups live in `artifacts/mockup-sandbox/src/components/mockups/blackpebble-mobile/` (Trading, Portfolio, Leaderboard) with shared tokens in `_group.css`. Use these as the reference when graduating the polish into `artifacts/blackpebble`. Do NOT implement site-wide until the user approves the look.
