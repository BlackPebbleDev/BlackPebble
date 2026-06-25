---
name: Identity three-axis model
description: The separated identity axes (account status / role badges / progression) and the rule that their label vocabularies must never collide.
---

BlackPebble identity is THREE independent axes, each with ONE source of truth and
its OWN label vocabulary that must never overlap:

1. **Account status** — `guest | member` only. There is NO paid/"Premium" status;
   membership is binary. Source for the current viewer: `useAccount().isGuest`
   (false ⇒ member). Helper: `lib/account-status.ts`; renderer:
   `AccountStatusChip` (deliberately understated — it is a state, not prestige).
2. **Role badges** — admin-assigned, curated, multiple-per-user, extensible
   (founder, bp_team, early_user, verified_trader, ambassador). Single source of
   display config is `ROLE_META` + `ROLE_ORDER` in `components/official-badge.tsx`
   (icon/label/tone/order). `UserIdentity` ordering and the admin assign UI both
   consume `ROLE_ORDER`/`ROLE_META` — never re-list roles inline.
3. **Trading progression** — Rookie/Bronze/Silver/Gold/Elite/Black Label
   (`lib/tiers.ts`). Base is always "Rookie" so a progression badge is never
   absent. Names are chosen to NOT collide with status or role names.

**Why:** The original drift was that progression labels ("Member"/"Premium")
read like membership, so users couldn't tell status from rank. Keeping the three
vocabularies disjoint is what prevents that confusion from coming back.

**How to apply:** When adding a new identity label, first decide which axis it
belongs to and confirm its name does not appear in either other axis. Adding a
role = one entry in server `OFFICIAL_BADGE_TYPES`/META + client `OfficialBadgeType`
union + `ROLE_META`/`ROLE_ORDER`; admin route validates against the shared
`OFFICIAL_BADGE_TYPES` list (don't hardcode).

Achievement axis is separate again: `BadgeRarity` (common/rare/epic/legendary) +
optional `progress` are additive optional fields; the collectible tile is
`components/achievement-badge.tsx` (rarity tint + lock overlay).
