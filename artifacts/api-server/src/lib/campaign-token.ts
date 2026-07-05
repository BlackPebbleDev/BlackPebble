/**
 * Community Campaigns - token validation.
 *
 * Validates a token contract address before it can be attached to a campaign:
 * metadata (name/symbol/logo via the cached Helius batch) plus a RugCheck
 * safety scan. Dangerous tokens are blocked from campaign creation, matching
 * the safety-screening posture in docs/COMMUNITY_CAMPAIGNS.md.
 *
 * The RugCheck call is best-effort with a short timeout: when it fails we
 * report safety as "unknown" rather than blocking creation on a third-party
 * outage - but a definitive "danger" verdict always blocks.
 */

import axios from "axios";
import { getTokenMetadataBatch } from "./helius.js";
import {
  getCacheValue,
  isCacheFresh,
  setCacheValue,
} from "./database.js";
import { logger } from "./logger.js";

export type TokenSafetyLevel = "ok" | "warning" | "danger" | "unknown";

export interface TokenSafetyRisk {
  name: string;
  level: string;
  description: string;
}

export interface CampaignTokenValidation {
  mint: string;
  valid: boolean;
  symbol: string | null;
  name: string | null;
  logo: string | null;
  safety: TokenSafetyLevel;
  /** Individual RugCheck findings (empty when unavailable). */
  risks: TokenSafetyRisk[];
}

const RUGCHECK_TTL_MS = 10 * 60 * 1000;

interface RugcheckSummary {
  score?: number;
  score_normalised?: number;
  risks?: { name?: string; level?: string; description?: string }[];
}

async function fetchRugcheck(
  mint: string,
): Promise<{ safety: TokenSafetyLevel; risks: TokenSafetyRisk[] }> {
  const cacheKey = `rugcheck:${mint}`;
  if (isCacheFresh(cacheKey, RUGCHECK_TTL_MS)) {
    const cached = getCacheValue(cacheKey);
    if (cached) {
      return JSON.parse(cached) as {
        safety: TokenSafetyLevel;
        risks: TokenSafetyRisk[];
      };
    }
  }

  try {
    const res = await axios.get<RugcheckSummary>(
      `https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`,
      { timeout: 8_000 },
    );
    const risks: TokenSafetyRisk[] = (res.data.risks ?? []).map((r) => ({
      name: r.name ?? "Unknown risk",
      level: (r.level ?? "warn").toLowerCase(),
      description: r.description ?? "",
    }));

    let safety: TokenSafetyLevel = "ok";
    if (risks.some((r) => r.level === "danger")) safety = "danger";
    else if (risks.some((r) => r.level === "warn")) safety = "warning";

    const result = { safety, risks };
    setCacheValue(cacheKey, JSON.stringify(result));
    return result;
  } catch (e) {
    logger.warn({ err: e, mint }, "RugCheck lookup failed - safety unknown");
    return { safety: "unknown", risks: [] };
  }
}

/**
 * Validate a token for campaign use. `valid` is false only when the mint has
 * no discoverable metadata at all (likely not a real token) or the safety
 * verdict is a definitive danger.
 */
export async function validateCampaignToken(
  mint: string,
): Promise<CampaignTokenValidation> {
  const [meta, rug] = await Promise.all([
    getTokenMetadataBatch([mint]).catch(
      () => ({}) as Record<string, { symbol: string | null; name: string | null; logo: string | null }>,
    ),
    fetchRugcheck(mint),
  ]);

  const m = meta[mint] ?? { symbol: null, name: null, logo: null };
  const hasMetadata = Boolean(m.symbol || m.name);

  return {
    mint,
    valid: hasMetadata && rug.safety !== "danger",
    symbol: m.symbol,
    name: m.name,
    logo: m.logo,
    safety: rug.safety,
    risks: rug.risks,
  };
}
