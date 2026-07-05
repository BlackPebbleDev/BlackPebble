# BlackPebble Community Campaign Platform

## Competitive Research + System Architecture (Planning Document — nothing built yet)

Status: **Research & architecture only.** This document is the foundation for a
future flagship utility. No schema, routes, or UI exist yet.

---

# Part 1 — Market Research

## 1.1 DexVault (dexvault.xyz)

**What it is:** community crowdfunding for token *services* — DEXScreener
listings (~$330), Community Takeovers (~$220), DEX boosts, token/trending-bar
advertising. Anyone can start a campaign for any token by pasting a contract
address (multichain tokens, but ALL contributions in SOL).

**How it works (reverse-engineered):**

1. Creator pastes a token CA → DexVault pulls live token data, runs a RugCheck
   safety scan (dangerous tokens blocked), requires icon/banner uploads.
2. The platform generates a **fresh Solana keypair per campaign** as the
   "escrow wallet" (server-custodied — contributors must trust DexVault holds
   the key honestly).
3. Contributors send raw SOL to that address. A server cron polls balances
   every ~60s and updates the UI.
4. Goal met within 12–36h → DexVault manually/semi-automatically purchases the
   service (their roadmap admits full automation isn't done). Goal missed →
   refunds, **minus a 2% fee**, "within 24 hours."
5. Overfunding is silently kept as a "tip" to the platform.
6. Fees: 5–10% of successful campaigns depending on type/tier.

**Strengths**

- Dead-simple mental model: fund a thing, thing happens, or refund.
- Campaign-per-escrow-wallet gives a *feel* of transparency (you can watch the
  address on Solscan).
- RugCheck screening at creation is a genuinely good idea.
- Clear pricing anchors per campaign type.
- Time-boxed campaigns create urgency.

**Weaknesses / trust issues**

- **Custodial escrow with no proof.** A server-held keypair is not escrow —
  it's an IOU. Nothing on-chain enforces refunds or spending rules.
- **Refund friction:** 2% refund fee punishes contributors for a campaign's
  failure; refunds are "within 24 hours," not instant or claimable.
- **Overfunding capture:** excess funds are keep-as-tip by policy. Contributors
  routinely overshoot goals in the final minutes; that money vanishes.
- **Send-raw-SOL UX is dangerous:** their own homepage warns that tokens sent
  wrongly "will be lost permanently." That's a UX failure elevated to policy.
- Contributors are anonymous — zero reputation, zero recognition, zero reason
  to return. No accounts, no history, no social layer at all.
- Fulfillment is opaque: nothing proves the listing/boost was actually
  purchased with the funds raised.
- Balance polling every 60s; no live websocket/on-chain subscription.
- Reputation system ("OG, Whale, Trusted Campaigner") is roadmap vaporware.

**What DexVault teaches us:** the *crowdfund-a-goal* escrow shape (goal,
deadline, refund-on-failure) is proven and simple. But their trust story is
"trust us," their contributor relationship is a dead end, and fulfillment is
a black box.

## 1.2 Shillz (shillz.app)

**What it is:** a paid-engagement marketplace ("Get Paid to Shill"). Brands
fund campaigns with tokens or stablecoins; creators link X accounts, submit
posts/replies, get manually reviewed, and get paid in the campaign's token.
Stack (from their privacy policy): Vercel + Supabase + Privy (embedded wallets)
on Solana. Public leaderboards of earners; truncated wallet addresses and X
handles visible.

**How it works (reverse-engineered):**

1. Brand connects wallet, creates a campaign, funds it with their token or a
   stablecoin.
2. Creator connects wallet (Phantom/Solflare/Privy embedded), links X
   (read-only), browses campaigns, posts content, submits the tweet link.
3. Platform pulls public engagement metrics for the submission; brand (or
   platform) reviews and approves; payout is an on-chain transfer.
4. Leaderboards rank earners; "anti-gaming AI engine" is claimed in marketing
   material ("AI catches fake engagement and slop").

**Strengths**

- Aligned incentives framing: creators earn the token they promote.
- On-chain payouts with public leaderboards — visible earning history.
- Low-friction onboarding via Privy embedded wallets.
- Manual review keeps the worst spam out of payouts (at a scaling cost).

**Weaknesses / trust issues**

- **The product IS the abuse vector.** Paying per post for token promotion
  attracts exactly the engagement farms documented in the Signal Engine case
  study: a farm generating 2,000+ tweets produced **zero organic clicks** —
  the only non-farm visitor was Twitter's link-preview bot. Buyers are
  purchasing noise.
- **Undisclosed paid promotion** is the core mechanic — a reputational and
  regulatory liability (FTC-style disclosure rules; SafeMoon-style precedent).
- Manual review doesn't scale and creates payment limbo: creators do work,
  then wait on a brand's whim. No visible escrow guarantees, no auto-approve
  deadline (competitors like Reellu at least auto-approve after 7 days).
- Paid in the promoted token: volatile, often illiquid; creators carry the
  exit risk.
- Reputation is only "total earned" — quality, approval rate, and account
  authenticity are invisible. A bot farm and a genuine KOL look identical
  until the payout.
- Trust in the platform is required at every step (funds custody, review
  fairness, metric collection) with no transparency instruments.

**What Shillz teaches us:** the creator-marketplace shape (brief → submit →
verify → payout) is the workflow to support, but *quality must be priced in*,
review must have deadlines and receipts, and payouts must be escrow-backed
and visible. Also: pure pay-to-shill is a race to the bottom BlackPebble
should refuse to run.

## 1.3 Adjacent market patterns (what the rest of the field does)

| Platform | Notable mechanic worth learning from |
|---|---|
| ShillX | Flat $0.15/verified reply; 5-layer verification + Trust Score; auto-ban with **clawback returned to campaign budget**; browser extension living inside X |
| Shillers.net | Rate-per-1k-views campaigns; **per-campaign treasury wallets**; refundable unspent budget; optional creator gates (holder-only, min followers, min account age) |
| ShillOS (Laika) | **Escrowed budgets in a campaign contract**; proof-of-publication via content hash + oracle; deterministic checks (tags, link, window); appeal window; reputation-gated brief access |
| RaidSharks | Raider eligibility floors (100+ followers, account 3+ months, healthy profile); Telegram-native mini-app distribution |
| Reellu | CPM with min/max payout caps; **7-day review window with auto-approve** if the brand stalls; 6% fee taken at payout, on-chain |

**Market-wide failure modes (documented, not speculative):**

1. Engagement without an audience is noise — farms provably generate zero
   organic traffic.
2. Custodial "escrow" without on-chain enforcement is the norm; nobody offers
   proof of fulfillment.
3. Contributor/creator reputation is either absent or a single "earned"
   number; quality never compounds.
4. Anti-abuse is bolted on (review queues, bans) rather than architectural
   (identity cost, reputation weighting, quality pricing).
5. Every platform is an island — no profile, no history, no social graph, no
   reason to stay.

## 1.4 The opportunity

Nobody in this market has: **a persistent identity a participant cares
about.** BlackPebble already has one — X-verified profiles, a trust score, a
reputation board, achievements, a feed, verified wallets (recovery + real
trading analysis), and trader DNA. Campaigns plugged into that identity layer
invert the market's economics:

- Competitors pay anonymous accounts and pray. BlackPebble pays **known
  reputations** and compounds them.
- Competitors treat abuse as a moderation cost. BlackPebble makes abuse
  economically irrational: burning a reputation that gates future earnings,
  rewards weighting, and profile standing costs more than a fresh wallet is
  worth.
- Competitors are single-product sites. For BlackPebble, campaigns are one
  more surface of an ecosystem users already inhabit daily.

---

# Part 2 — BlackPebble Vision

**Not another bounty site. The community growth layer of the BlackPebble
ecosystem.**

Positioning line: *the most trusted community campaign platform in crypto* —
professional, premium, minimal, transparent, fast, community-first,
integrated.

Two campaign shapes unify everything we saw in the market:

1. **Goal campaigns** (DexVault shape): fund a defined outcome; refund if it
   fails. Community takeovers, listings, community events, charity/marketing
   pools.
2. **Task campaigns** (Shillz shape): a funded pool pays participants for
   verified actions. Content, research bounties, trading competitions,
   educational quests, moderation work.

Both share one escrow model, one reputation pipeline, one feed/profile
integration, one anti-abuse layer.

**The BlackPebble twist — quality-first, disclosure-first:**

- Participation quality (not raw volume) determines rewards, via reputation
  weighting.
- Paid participation is **labeled** — share cards and feed events carry a
  "BlackPebble Campaign" mark. Transparency is a feature, not a confession;
  it's also the regulatory moat competitors will eventually be forced into.
- Every campaign has a public, auditable money trail: funded → held → paid
  out/refunded, with tx signatures at every step.

---

# Part 3 — System Architecture

## 3.1 Design principles

1. **Escrow before live.** No campaign is visible until funds are verified
   on-chain.
2. **Every lamport accounted.** `pool = paid + reserved + remaining + fees`,
   always displayable, always backed by tx signatures.
3. **Verification is modular.** Campaign types are plugins; the engine never
   knows what a "tweet" is.
4. **Reputation in, reputation out.** Reputation gates entry, weights rewards,
   and is itself updated by campaign outcomes.
5. **Feature-flagged, additive, isolated.** Parallel `campaign_*` tables; no
   coupling to paper-trading accounting (mirrors the real-trading-analysis
   precedent).
6. **Architect for trustless, ship transparent-custodial first.** The service
   boundary hides the escrow implementation so a v2 on-chain program swaps in
   without touching product code.

## 3.2 Service decomposition

```
campaign-engine.ts        Orchestrator: lifecycle state machine, invariants
campaign-escrow.ts        Escrow service (see 3.3) — deposits, reservations,
                          payouts, refunds; the ONLY module that moves funds
campaign-types/           Verifier plugins, one per campaign category
    x-engagement.ts       X post/reply verification (existing X OAuth + API)
    paper-competition.ts  Paper-trading competition scoring (existing tables)
    content-bounty.ts     Long-form content w/ manual+assisted review
    referral.ts           Referral/onboarding verification
    ...                   (registry pattern, like real-trading-signals)
campaign-reputation.ts    Bridges campaigns ↔ computeTrustScore inputs;
                          participant/creator/campaign trust scoring
campaign-abuse.ts         Layered anti-abuse scoring (see 3.6)
campaign-events.ts        Emits feed items, timeline events, achievement
                          triggers (reuses feed.ts + badges.ts patterns)
routes/campaigns.ts       Public API
```

Rationale: same shape that worked for the Real Trading Analysis engine —
pure/testable cores, one orchestrator, pluggable registries, additive schema.

## 3.3 Escrow architecture

**Phase A — transparent custodial (ship first):**

- One dedicated **derived keypair per campaign** (deterministic derivation
  from a master seed + campaign id; never a hot shared wallet).
- **Deposit addresses are watched, not polled-per-minute:** Helius webhooks /
  websocket subscription for instant crediting (beats DexVault's 60s cron).
- A `campaign_ledger` table is the source of truth, append-only:
  `(campaign_id, kind: deposit|reserve|release|payout|refund|fee, lamports,
  tx_signature, counterparty, created_at)`. Every UI number derives from this
  ledger; every row that moved funds carries a signature.
- **Invariant checks on every mutation** (like leverage's data-integrity
  posture): ledger sum must equal on-chain balance ± in-flight txs; mismatch
  freezes the campaign and alerts admin.
- Refunds are **claimable instantly and fee-free** on failure/expiry
  (differentiator vs DexVault's 2% + 24h). Contributions are recorded with
  the sender address at deposit time, so refund destinations are known.
- **Overfunding returns to contributors** pro-rata (or optionally rolls into
  the reward pool if the creator declared it upfront). Never silently kept.

**Phase B — on-chain escrow program (architect now, build later):**

- Anchor program with a PDA vault per campaign; deposits, goal, deadline,
  and refund paths enforced by the program, not policy.
- Payout authority is a platform signer *bounded by program rules* (can only
  pay verified claims up to pool size; can always refund after deadline).
- The `campaign-escrow.ts` interface (`fund/reserve/release/refund/balance`)
  is identical for both phases — product code never knows which backend runs.

**What participants always see (both phases):**

reward pool · paid out so far · reserved for pending claims · remaining ·
platform fee · every tx signature · campaign progress %. One "Escrow" tab per
campaign renders the ledger verbatim.

## 3.4 Campaign lifecycle (one state machine for both shapes)

```
draft → pending_funding → live → { completing | failed } → settled → archived
```

- `draft`: creator configures; RugCheck-style safety screening for any token
  attached; creator reputation snapshot taken.
- `pending_funding`: escrow address issued; goes `live` only when on-chain
  balance ≥ declared pool (goal campaigns: goal amount; task campaigns:
  reward budget). Auto-expires back to refund if unfunded.
- `live`: contributions/submissions accepted. Task campaigns: claims flow
  `submitted → auto_checked → (approved | rejected | flagged_for_review)`;
  **review SLA with auto-approve** (Reellu's lesson) so participants are
  never in limbo — creator inaction defaults in the participant's favor when
  automated checks passed.
- `completing`: goal reached / deadline hit; payouts execute; fulfillment
  proof attached (for service campaigns: receipts/links; for competitions:
  final leaderboard snapshot).
- `failed`: refunds claimable immediately, fee-free.
- `settled`: ledger closed, invariant-checked; reputation effects applied;
  feed/achievement events emitted.

## 3.5 Reputation integration (architecture only — no new formula yet)

Three scores, all derived, all versioned like the signal registry:

1. **Participant campaign reputation** — approval rate, quality ratings,
   completion rate, clawback history, verified-wallet & verified-trader
   status (existing recovery + real-trading systems), account age/tier.
   Stored as **campaign signals** in the same style as `real_signal_values`
   so the future reputation layer consumes them uniformly.
2. **Creator reputation** — campaigns funded on time, payout punctuality,
   review fairness (auto-approve rate vs rejection overturn rate on appeal),
   refund history, fulfillment proofs.
3. **Campaign trust score** — computed *before* going live: creator
   reputation × escrow status × token safety scan × disclosure completeness.
   Displayed as a badge on every campaign card so participants can rank
   opportunities by trustworthiness (nobody in the market does this).

**Reputation-weighted rewards (architected, flag-gated):** task campaigns can
declare a weighting curve — e.g. base rate × (0.5 + participantScore/200) —
so proven contributors earn more per action. This single mechanism both
rewards quality and starves Sybils (fresh accounts earn the floor, making
farming uneconomical). Weighting inputs come from the campaign signals above
plus existing `computeTrustScore` — **never** modifying that formula, only
consuming it (same read-only posture as reputation.ts).

Campaign outcomes feed back as achievements (badges.ts additions), profile
sections (campaign history with stats), and optional feed events.

## 3.6 Anti-abuse: layered, economic, architectural

Layer 0 — **Identity cost.** X-linked account + verified wallet + account age
+ tier floors per campaign (creator-tunable gates, like Shillers). Privy-style
throwaway wallets never reach the reward-weighting floor that makes farming
profitable.

Layer 1 — **Deterministic checks** (per verifier plugin): handle match,
required tags/links, time window, content hash de-dup, URL de-dup, plagiarism
similarity. Free, instant, catches the lazy 80%.

Layer 2 — **Behavior scoring** (campaign-abuse.ts): submission cadence
anomalies, view-to-engagement ratio outliers, cross-campaign duplicate
graphs, wallet clustering (funding-source overlap between "different"
participants — we already read on-chain history in the real-trading
ingester), device/IP fingerprint signals.

Layer 3 — **Reputation weighting** (see 3.5) — abuse detection doesn't need
to be perfect if abuse doesn't pay.

Layer 4 — **Clawback + appeal.** Rejected-after-payout actions return funds
to the pool (ShillX's best idea), with a 48h appeal window and human review;
appeal outcomes feed reviewer-fairness metrics.

Layer 5 — **Transparency as deterrent.** Public campaign ledgers and public
participation histories mean farms build a visible, bannable footprint.

## 3.7 Social & ecosystem integration

- **Feed:** `campaign_launched`, `campaign_funded`, `campaign_completed`,
  `milestone_reached`, `payout_earned` (opt-in per user) — new `kind` values
  in the existing feed union, same read-only pattern.
- **Profiles:** a Campaigns section — created (with trust score) and
  participated (with approval rate); counts feed the trust-score *inputs*
  already architected for expansion.
- **Achievements:** first campaign funded, 10 verified contributions,
  campaign creator with 5 fulfilled campaigns, competition winner, etc. —
  straight additions to BADGE_DEFINITIONS.
- **Competitions:** paper-trading competition campaigns reuse existing
  leaderboard machinery with a time-boxed, escrow-funded prize pool — an
  immediately differentiated campaign type nobody else can offer.
- **Share cards:** campaign cards and "I earned X on BlackPebble" cards with
  the disclosure mark built in.
- **Future AI layer:** campaign briefs, submissions, and quality ratings are
  structured data — ready for AI-assisted review (Layer-1.5 triage) and
  AI-personalized campaign matching later.

## 3.8 Data model sketch (parallel `campaign_*` tables, runtime-DDL pattern)

```
campaigns                 id, kind(goal|task), type_key, creator_user_id,
                          token_mint?, title, brief, disclosure_level,
                          pool_lamports, goal_lamports?, deadline, state,
                          trust_score, escrow_address, created_at…
campaign_ledger           append-only money trail (see 3.3)
campaign_contributions    goal-campaign deposits (contributor, lamports, sig)
campaign_claims           task submissions: participant, payload_json,
                          checks_json, state, reviewed_by?, payout_ledger_id?
campaign_signals          per-user campaign reputation series
                          (mirrors real_signal_values)
campaign_events           feed/timeline emission log (idempotency)
campaign_gates            per-campaign entry requirements
campaign_appeals          claim_id, reason, state, resolved_by, outcome
```

## 3.9 API surface sketch

```
GET  /campaigns                     browse (filter: kind/type/state/trust)
GET  /campaigns/:id                 detail + live escrow accounting
GET  /campaigns/:id/ledger          full public money trail
POST /campaigns                     create draft (auth, reputation floor)
POST /campaigns/:id/fund            returns escrow deposit instructions
POST /campaigns/:id/claims          submit action (auth + gates)
POST /campaigns/:id/claims/:cid/appeal
GET  /users/:id/campaign-history    profile section source
```

## 3.10 Phasing

- **Phase 0 (this doc):** research + architecture. ✅
- **Phase 1:** schema + escrow service (Phase-A custodial with ledger +
  invariants) + goal campaigns end-to-end + campaign trust score v0 + feed
  events. Flag: `community_campaigns`. ✅ **BUILT** — see 3.12.
- **Phase 2:** task campaigns with the X-engagement verifier + claims/review
  SLA + clawback + appeals + achievements + profile sections.
- **Phase 3:** reputation-weighted rewards + behavior scoring + paper-trading
  competition campaigns.
- **Phase 4:** Anchor escrow program (Phase B) + creator analytics + AI
  review triage.

## 3.11 Compliance & positioning notes

- Undisclosed paid promotion is the market's dirty engine. BlackPebble
  campaigns carry disclosure marks by design — the trust positioning and the
  regulatory hedge are the same feature.
- Escrow custody (Phase A) is still custody: keep per-campaign derived keys,
  never commingle, publish the ledger, and prioritize the Phase-B program.
- Token-denominated rewards carry volatility/liquidity risk for participants;
  support SOL/USDC pools first, project tokens with a visible risk label.

## 3.12 Phase 1 implementation (shipped, flag-gated)

Backend (`artifacts/api-server/src/lib/`):

- `campaign-schema.ts` — runtime idempotent DDL: `campaigns`,
  `campaign_ledger` (append-only, unique per tx signature),
  `campaign_contributions`, `campaign_events`, `campaign_sync_cursors`.
- `campaign-math.ts` — pure, fully unit-tested money rules: ledger
  summarization (`deposited = paidOut + refunded + fees + remaining`), the
  lifecycle state machine, failure-refund and pro-rata excess-refund
  planning, settlement splitting (fee applies to the goal, never the
  excess), campaign trust score v0, input validation. Also holds the
  **campaign type catalogue**: every type has set-in-stone USD goal tiers
  derived from the real retail price of the service plus a ~10% processing
  margin (DEXScreener Enhanced Token Info / Boost 10×–500× / Ads; DEXTools
  Fast Track / Nitro 200–5000 / Ads; CTO). No custom goals — goals convert
  to SOL at the live price at launch, and the chosen tier (`goal_label`,
  `goal_usd`) is stored on the campaign row.
- Fulfillment: neither DEXScreener nor DEXTools exposes a public purchase
  API, so funded campaigns enter a fulfillment queue (funded state banner)
  and an admin executes the purchase and settles with mandatory proof. The
  settle path is the future integration point for automated purchasing if
  either platform ships an API or a headless checkout becomes viable.
- `campaign-escrow.ts` — the ONLY module holding keys or moving funds.
  Per-campaign keypairs derived via HMAC-SHA512(CAMPAIGN_ESCROW_SEED,
  publicId); incremental deposit sweeps with per-campaign cursors;
  exactly-once crediting; `balance >= ledger remaining` invariant that
  freezes the campaign on violation; outbound sends refuse to exceed the
  ledger.
- `campaign-engine.ts` — lifecycle orchestration: create (X-auth, one active
  campaign per creator), sweeps, automatic funded/failed transitions,
  automatic failure refunds (full amount minus network fee only), admin
  settlement with mandatory fulfillment proof and pro-rata overfund return.
- `routes/campaigns.ts` — browse / detail / public ledger / create /
  refresh / admin settle. Gated by the `community_campaigns` flag (default
  off).
- Cron: 30-second sweep (deposits, transitions, refunds), overlap-guarded.
- Feed: campaign `launched` / `funded` / `completed` events join the
  activity union.

Frontend (`artifacts/blackpebble/src/`):

- `pages/campaigns.tsx` — browse grid (state filters, trust badges, progress
  bars, countdowns), campaign detail with metric tiles, in-app contribution
  via the connected wallet, public escrow ledger with Solscan links, admin
  settle panel. Registered at `/campaigns` and `/campaigns/:id`; utilities
  hub card; feed card for campaign milestones; admin flag toggle.

Environment:

- `CAMPAIGN_ESCROW_SEED` — escrow master seed (treat as a wallet secret;
  never rotate while campaigns hold funds).
- `CAMPAIGN_FEE_BPS` — platform fee in basis points of the goal (default
  300 = 3%; capped at 2000).
- `CAMPAIGN_FEE_WALLET` — optional fee destination; without it no fee
  transfer is taken.

---

## Summary of the edge

| Dimension | DexVault | Shillz | BlackPebble (this design) |
|---|---|---|---|
| Escrow | Custodial, opaque, 2% refund fee | Platform custody, no guarantees | Ledger-backed, instant fee-free refunds, program-enforced in v2 |
| Identity | None | Wallet + X link | Full ecosystem identity: trust score, verified wallet, trader DNA |
| Quality | N/A | Manual review, volume-paid | Reputation-weighted rewards; quality compounds |
| Anti-abuse | N/A | Review queue + claimed AI | 6-layer, economics-first |
| Review limbo | N/A | Indefinite | SLA + auto-approve in participant's favor |
| Retention | Zero (anonymous) | Leaderboard only | Profiles, achievements, feed, reputation growth |
| Transparency | Watch an address | Tx hashes | Full public per-campaign ledger + fulfillment proofs |
| Unique types | Service crowdfunds | Content bounties | + Paper-trading competitions, research bounties, seasonal events |
