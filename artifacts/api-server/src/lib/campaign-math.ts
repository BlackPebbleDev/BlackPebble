/**
 * Community Campaigns - pure accounting + lifecycle math.
 *
 * Everything in this file is deterministic and side-effect free so the money
 * rules can be exhaustively unit-tested. The escrow service and engine call
 * these; they never re-implement the arithmetic.
 *
 * All amounts are integer lamports. The ledger is the single source of truth:
 *   deposited = paidOut + refunded + fees + remaining
 */

export type CampaignState =
  | "live" // accepting contributions
  | "funded" // goal reached, awaiting fulfillment (admin)
  | "settled" // fulfilled: payout + fee executed, proof attached
  | "failed" // deadline passed below goal - refunds owed
  | "refunded" // all failed-campaign refunds completed
  | "frozen"; // invariant breach - no money moves until admin resolves

export type LedgerKind = "deposit" | "payout" | "refund" | "fee";

export interface LedgerRow {
  kind: LedgerKind;
  lamports: number;
}

export interface LedgerSummary {
  deposited: number;
  paidOut: number;
  refunded: number;
  fees: number;
  /** deposited - paidOut - refunded - fees. What escrow should still hold. */
  remaining: number;
}

export function summarizeLedger(rows: LedgerRow[]): LedgerSummary {
  let deposited = 0;
  let paidOut = 0;
  let refunded = 0;
  let fees = 0;
  for (const r of rows) {
    if (!Number.isFinite(r.lamports) || r.lamports < 0) {
      throw new Error(`Invalid ledger amount: ${r.lamports}`);
    }
    switch (r.kind) {
      case "deposit":
        deposited += r.lamports;
        break;
      case "payout":
        paidOut += r.lamports;
        break;
      case "refund":
        refunded += r.lamports;
        break;
      case "fee":
        fees += r.lamports;
        break;
    }
  }
  return {
    deposited,
    paidOut,
    refunded,
    fees,
    remaining: deposited - paidOut - refunded - fees,
  };
}

/** Funding progress in [0, 1+]; >1 means overfunded. */
export function fundingProgress(deposited: number, goal: number): number {
  if (goal <= 0) return 0;
  return deposited / goal;
}

// ── State machine ────────────────────────────────────────────────────────────

const TRANSITIONS: Record<CampaignState, CampaignState[]> = {
  live: ["funded", "failed", "frozen"],
  funded: ["settled", "frozen"],
  settled: [],
  failed: ["refunded", "frozen"],
  refunded: [],
  frozen: ["live", "funded", "failed"], // admin unfreeze restores prior state
};

export function canTransition(
  from: CampaignState,
  to: CampaignState,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Decide the next automatic state for a live campaign given the clock and the
 * ledger. Returns null when no transition is due.
 */
export function dueTransition(
  state: CampaignState,
  deposited: number,
  goal: number,
  deadlineAt: number,
  nowSec: number,
): CampaignState | null {
  if (state !== "live") return null;
  if (deposited >= goal) return "funded";
  if (nowSec >= deadlineAt) return "failed";
  return null;
}

// ── Refund planning ──────────────────────────────────────────────────────────

/** Per-transfer network fee the escrow pays; deducted from each refund. */
export const REFUND_NETWORK_FEE_LAMPORTS = 5_000;

export interface ContributionLike {
  id: number;
  contributor: string;
  lamports: number;
  refunded: boolean;
}

export interface RefundInstruction {
  contributionId: number;
  destination: string;
  lamports: number;
}

/**
 * Plan refunds for a FAILED campaign: every non-refunded contribution goes
 * back to its sender in full, minus only the on-chain network fee (there is
 * deliberately NO platform refund fee). Contributions too small to cover the
 * network fee are skipped (nothing meaningful to return).
 */
export function planFailureRefunds(
  contributions: ContributionLike[],
): RefundInstruction[] {
  const out: RefundInstruction[] = [];
  for (const c of contributions) {
    if (c.refunded) continue;
    const amount = c.lamports - REFUND_NETWORK_FEE_LAMPORTS;
    if (amount <= 0) continue;
    out.push({
      contributionId: c.id,
      destination: c.contributor,
      lamports: amount,
    });
  }
  return out;
}

/**
 * Plan pro-rata refunds of the OVERFUNDED excess when a campaign settles.
 * DexVault silently keeps overfunding as a "tip" - we return it. Each
 * contributor gets floor(excess * share); dust below the network fee stays in
 * escrow (recorded as fee by the caller so the ledger still balances).
 */
export function planExcessRefunds(
  contributions: ContributionLike[],
  excessLamports: number,
): RefundInstruction[] {
  if (excessLamports <= 0) return [];
  const total = contributions.reduce((s, c) => s + c.lamports, 0);
  if (total <= 0) return [];
  const out: RefundInstruction[] = [];
  for (const c of contributions) {
    const share = Math.floor((excessLamports * c.lamports) / total);
    const amount = share - REFUND_NETWORK_FEE_LAMPORTS;
    if (amount <= 0) continue;
    out.push({
      contributionId: c.id,
      destination: c.contributor,
      lamports: amount,
    });
  }
  return out;
}

// ── Settlement planning ──────────────────────────────────────────────────────

export interface SettlementPlan {
  /** Paid to the fulfillment destination. */
  payoutLamports: number;
  /** Platform fee taken from the goal amount. */
  feeLamports: number;
  /** Overfunded excess owed back to contributors pro-rata. */
  excessLamports: number;
}

/**
 * Split a funded campaign's deposits into payout / fee / excess. The fee is
 * `feeBps` of the GOAL (never of the excess - overfunding is not revenue).
 */
export function planSettlement(
  deposited: number,
  goal: number,
  feeBps: number,
): SettlementPlan {
  if (deposited < goal) {
    throw new Error("Cannot settle: deposits below goal");
  }
  if (feeBps < 0 || feeBps > 2_000) {
    throw new Error(`Unreasonable fee bps: ${feeBps}`);
  }
  const feeLamports = Math.floor((goal * feeBps) / 10_000);
  return {
    payoutLamports: goal - feeLamports,
    feeLamports,
    excessLamports: deposited - goal,
  };
}

// ── Campaign trust score v0 ──────────────────────────────────────────────────

export interface TrustScoreInputs {
  /** Creator's platform trust score 0–100 (existing computeTrustScore). */
  creatorTrustScore: number;
  /** Creator account age in days. */
  creatorAccountAgeDays: number;
  /** Campaigns this creator previously settled successfully. */
  creatorSettledCampaigns: number;
  /** Campaigns this creator previously had fail or freeze. */
  creatorFailedCampaigns: number;
  /** Brief length, link, and image present. */
  hasCompleteBrief: boolean;
  hasImage: boolean;
  hasLink: boolean;
}

/**
 * Campaign trust score v0 (0–100), computed BEFORE a campaign is shown so
 * participants can rank opportunities by trustworthiness. Deliberately simple
 * and explainable; the reputation phase will extend the inputs, not the shape.
 *
 *   50% creator reputation · 20% creator campaign history ·
 *   15% account age · 15% campaign completeness
 */
export function computeCampaignTrustScore(i: TrustScoreInputs): number {
  const creator = Math.max(0, Math.min(100, i.creatorTrustScore));

  const totalHistory = i.creatorSettledCampaigns + i.creatorFailedCampaigns;
  // Neutral 50 with no history; successes pull up, failures pull down.
  const history =
    totalHistory === 0
      ? 50
      : (i.creatorSettledCampaigns / totalHistory) * 100;

  const age = Math.max(0, Math.min(100, (i.creatorAccountAgeDays / 90) * 100));

  const completeness =
    ((i.hasCompleteBrief ? 1 : 0) + (i.hasImage ? 1 : 0) + (i.hasLink ? 1 : 0)) *
    (100 / 3);

  const score =
    creator * 0.5 + history * 0.2 + age * 0.15 + completeness * 0.15;
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ── Validation ───────────────────────────────────────────────────────────────

export const MIN_GOAL_LAMPORTS = 100_000_000; // 0.1 SOL
export const MAX_GOAL_LAMPORTS = 10_000_000_000_000; // 10k SOL
export const MIN_DURATION_SEC = 6 * 3600;
export const MAX_DURATION_SEC = 14 * 86_400;

export interface CampaignInput {
  title: string;
  brief: string;
  typeKey: string;
  goalLamports: number;
  durationSec: number;
}

/**
 * Campaign type catalogue: the single source of truth for what each type is
 * and what it costs. Every goal is set in stone, derived from the REAL retail
 * price of the service plus a ~10% processing margin (covers the platform fee
 * and price movement between funding and purchase). Combo tiers are the sum
 * of their component services.
 *
 * Retail reference prices (verified Jul 2026):
 *   DEXScreener Boosts: 10=$99, 30=$249, 50=$399, 100=$899, 500=$3,999
 *   DEXScreener Enhanced Token Info: from $299
 *   DEXTools NITRO: 200=$199, 500=$499, 1000=$899, 5000=$3,999
 *   DEXTools Fast Track update (Solana): ~5 SOL
 *
 * Goals are pegged in USD and converted to SOL at the live price when the
 * campaign launches.
 */

/** Assets the creator must provide so BlackPebble can fulfill the purchase. */
export type CampaignAsset = "icon" | "banner" | "title" | "pitch";

export interface CampaignGoalOption {
  /** Tier name, e.g. "Listing + 30x Boost". */
  label: string;
  /** The set-in-stone campaign goal in USD. */
  usd: number;
  /** One-line explanation of exactly what this tier buys. */
  description: string;
}

export interface CampaignTypeDef {
  key: string;
  /** Platform grouping for the create flow (DEXScreener / DEXTools / Community). */
  group: string;
  label: string;
  description: string;
  /** Fixed goal tiers. Every campaign goal is preset; there are no custom goals. */
  goalOptions: CampaignGoalOption[];
  /** Whether a validated token contract address is required. */
  requiresToken: boolean;
  /**
   * Assets required for fulfillment. "icon" is auto-filled from the validated
   * token; "banner" needs a creator-supplied image; "title"/"pitch" come from
   * the campaign title and brief.
   */
  requiredAssets: CampaignAsset[];
}

export const CAMPAIGN_TYPE_DEFS: CampaignTypeDef[] = [
  {
    key: "dex_listing",
    group: "DEXScreener",
    label: "DEX Listing",
    description:
      "Get your token listed on DEXScreener with Enhanced Token Info. Choose listing only, or a combo that adds a trending boost the moment the listing goes live.",
    goalOptions: [
      {
        label: "Listing Only",
        usd: 330,
        description: "Enhanced Token Info with custom icon, banner, and socials",
      },
      {
        label: "Listing + 30x Boost",
        usd: 605,
        description: "Listing plus a 30x trending boost with priority placement",
      },
      {
        label: "Listing + 50x Boost",
        usd: 770,
        description: "Listing plus a 50x boost with premium placement",
      },
      {
        label: "Listing + 100x Boost",
        usd: 1_320,
        description: "Listing plus a 24-hour 100x top-tier boost",
      },
      {
        label: "Listing + 500x Boost",
        usd: 4_730,
        description: "Listing plus the 500x Golden Ticker, maximum visibility",
      },
    ],
    requiresToken: true,
    requiredAssets: ["icon", "banner"],
  },
  {
    key: "dex_boost",
    group: "DEXScreener",
    label: "DEX Boost",
    description:
      "Golden flame placement in the DEXScreener Boosted section. Pick the multiplier; 10x to 50x run 12 hours, 100x and up run a full 24 hours.",
    goalOptions: [
      {
        label: "10x Boost",
        usd: 110,
        description: "12-hour boost, golden flame on every search result",
      },
      {
        label: "30x Boost",
        usd: 275,
        description: "12-hour boost with priority trending placement",
      },
      {
        label: "50x Boost",
        usd: 440,
        description: "12-hour boost with premium trending placement",
      },
      {
        label: "100x Boost",
        usd: 990,
        description: "24-hour top-tier boost across the trending carousel",
      },
      {
        label: "500x Golden Ticker",
        usd: 4_400,
        description: "24-hour Golden Ticker status, the maximum DEXScreener offers",
      },
    ],
    requiresToken: true,
    requiredAssets: [],
  },
  {
    key: "dex_ads",
    group: "DEXScreener",
    label: "Token Advertising",
    description:
      "Targeted display advertising on DEXScreener. Tiers are sized by guaranteed impressions in front of the most active traders in crypto.",
    goalOptions: [
      {
        label: "20K Views",
        usd: 330,
        description: "20,000 targeted impressions for your token",
      },
      {
        label: "50K Views",
        usd: 770,
        description: "50,000 impressions with premium ad placement",
      },
      {
        label: "100K Views",
        usd: 1_100,
        description: "100,000 impressions with enhanced visibility",
      },
      {
        label: "200K Views",
        usd: 2_200,
        description: "200,000 impressions, a full premium advertising package",
      },
      {
        label: "400K Views",
        usd: 4_400,
        description: "400,000 impressions with priority placement",
      },
      {
        label: "800K Views",
        usd: 7_700,
        description: "800,000 impressions, maximum reach on the platform",
      },
    ],
    requiresToken: true,
    requiredAssets: ["title", "pitch", "icon"],
  },
  {
    key: "dex_trending",
    group: "DEXScreener",
    label: "Trending Bar Placement",
    description:
      "Showcase your token in the DEXScreener trending bar alongside the top tokens on the platform.",
    goalOptions: [
      {
        label: "24 Hours",
        usd: 2_200,
        description: "One full day in the trending bar at maximum exposure",
      },
      {
        label: "2 Days",
        usd: 4_400,
        description: "Two full days of premium trending visibility",
      },
      {
        label: "1 Week",
        usd: 15_000,
        description: "Seven days among the top tokens for maximum impact",
      },
    ],
    requiresToken: true,
    requiredAssets: ["title", "icon"],
  },
  {
    key: "dextools_listing",
    group: "DEXTools",
    label: "DEXTools Listing",
    description:
      "Fast Track metadata update on DEXTools: logo, socials, website, and eligibility for a custom URL.",
    goalOptions: [
      {
        label: "Fast Track Update",
        usd: 340,
        description: "Full profile update with custom icon, banner, and socials",
      },
    ],
    requiresToken: true,
    requiredAssets: ["icon", "banner"],
  },
  {
    key: "dextools_nitro",
    group: "DEXTools",
    label: "Nitro Boost",
    description:
      "NITRO packs push your token up the DEXTboard Token Race. Every pack is a 24-hour visibility boost; bigger packs climb higher.",
    goalOptions: [
      {
        label: "Nitro 200",
        usd: 220,
        description: "200 NITRO points, a 24-hour DEXTboard boost",
      },
      {
        label: "Nitro 500",
        usd: 550,
        description: "500 NITRO points with stronger leaderboard placement",
      },
      {
        label: "Nitro 1000",
        usd: 990,
        description: "1,000 NITRO points for top-of-board contention",
      },
      {
        label: "Nitro 5000",
        usd: 4_400,
        description: "5,000 NITRO points, the maximum pack DEXTools sells",
      },
    ],
    requiresToken: true,
    requiredAssets: [],
  },
  {
    key: "dextools_ads",
    group: "DEXTools",
    label: "DEXTools Ads",
    description:
      "Banner advertising across DEXTools, in front of a deep chart-native trading audience.",
    goalOptions: [
      {
        label: "24 Hours",
        usd: 330,
        description: "One day of banner rotation across DEXTools",
      },
      {
        label: "3 Days",
        usd: 770,
        description: "Three days of sustained banner exposure",
      },
      {
        label: "1 Week",
        usd: 1_540,
        description: "A full week of banner placement at the best rate",
      },
    ],
    requiresToken: true,
    requiredAssets: ["banner"],
  },
  {
    key: "community_takeover",
    group: "Community",
    label: "CTO (Community Takeover)",
    description:
      "Fund a community takeover for a token the original team abandoned. Covers new socials, updated listings, and fresh momentum.",
    goalOptions: [
      {
        label: "Community Takeover",
        usd: 220,
        description: "Relisting with new icon, banner, and community socials",
      },
    ],
    requiresToken: true,
    requiredAssets: ["icon", "banner"],
  },
];

export function getCampaignTypeDef(key: string): CampaignTypeDef | null {
  return CAMPAIGN_TYPE_DEFS.find((t) => t.key === key) ?? null;
}

export const CAMPAIGN_TYPE_KEYS = CAMPAIGN_TYPE_DEFS.map((t) => t.key);

/**
 * Resolve the goal in lamports for a campaign type. The `goalUsd` must
 * exactly match one of the type's tier options; it converts at the live SOL
 * price. Returns an error string on invalid input.
 */
export function resolveGoalLamports(opts: {
  typeKey: string;
  goalUsd: number | null;
  goalSol: number | null;
  solPriceUsd: number;
}): { lamports: number } | { error: string } {
  const def = getCampaignTypeDef(opts.typeKey);
  if (!def) return { error: "Unknown campaign type" };

  const option = def.goalOptions.find((o) => o.usd === opts.goalUsd);
  if (opts.goalUsd == null || !option) {
    return {
      error: `This campaign type has preset goals: ${def.goalOptions.map((o) => `$${o.usd}`).join(", ")}`,
    };
  }
  if (!Number.isFinite(opts.solPriceUsd) || opts.solPriceUsd <= 0) {
    return { error: "SOL price unavailable, try again shortly" };
  }
  const sol = opts.goalUsd / opts.solPriceUsd;
  return { lamports: Math.round(sol * 1e9) };
}

export function validateCampaignInput(c: CampaignInput): string | null {
  if (!c.title || c.title.trim().length < 4 || c.title.length > 80) {
    return "Title must be 4–80 characters";
  }
  if (!c.brief || c.brief.trim().length < 20 || c.brief.length > 2_000) {
    return "Brief must be 20–2000 characters";
  }
  if (!CAMPAIGN_TYPE_KEYS.includes(c.typeKey)) {
    return "Unknown campaign type";
  }
  if (
    !Number.isInteger(c.goalLamports) ||
    c.goalLamports < MIN_GOAL_LAMPORTS ||
    c.goalLamports > MAX_GOAL_LAMPORTS
  ) {
    return "Goal must be between 0.1 and 10,000 SOL";
  }
  if (
    !Number.isInteger(c.durationSec) ||
    c.durationSec < MIN_DURATION_SEC ||
    c.durationSec > MAX_DURATION_SEC
  ) {
    return "Duration must be between 6 hours and 14 days";
  }
  return null;
}
