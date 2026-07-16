/**
 * Community Campaigns - pure token enrichment.
 *
 * Isolated from campaign-engine.ts (and its DB imports) so the enrichment rules
 * can be unit-tested without a database. Given batched provider results, this
 * fills in token identity + market cap on campaign summaries following strict
 * rules:
 *
 *   - Never overwrite a value the row already has.
 *   - Only fill name/symbol/logo from real provider metadata.
 *   - Market cap is null when the provider has no data (never coerced to 0).
 *   - fetchedAt is only set when a real market cap is present.
 *
 * It also reports which rows gained identity so the caller can persist them
 * (one-time backfill), keeping the DB write as a side effect outside this pure
 * function.
 */

export interface TokenMetaLite {
  name: string | null;
  symbol: string | null;
  logo: string | null;
}

export interface EnrichableSummary {
  publicId: string;
  tokenMint: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  imageUrl: string | null;
  tokenMarketCapUsd: number | null;
  tokenMarketCapFetchedAt: number | null;
}

export interface IdentityBackfill {
  publicId: string;
  name: string | null;
  symbol: string | null;
}

/**
 * Mutate `summaries` in place with metadata + market cap. Returns the rows that
 * gained persisted-worthy identity (name/symbol newly derived) so the caller
 * can backfill the database.
 */
export function applyTokenEnrichment(
  summaries: EnrichableSummary[],
  meta: Record<string, TokenMetaLite>,
  mcByMint: Map<string, { mc: number | null; fetchedAt: number }>,
): IdentityBackfill[] {
  const backfill: IdentityBackfill[] = [];

  for (const s of summaries) {
    if (!s.tokenMint) continue;

    const md = meta[s.tokenMint];
    if (md) {
      const filledName = !s.tokenName && !!md.name;
      const filledSymbol = !s.tokenSymbol && !!md.symbol;
      if (filledName) s.tokenName = md.name;
      if (filledSymbol) s.tokenSymbol = md.symbol;
      if (!s.imageUrl && md.logo) s.imageUrl = md.logo;
      if (filledName || filledSymbol) {
        backfill.push({
          publicId: s.publicId,
          name: filledName ? md.name : null,
          symbol: filledSymbol ? md.symbol : null,
        });
      }
    }

    const cached = mcByMint.get(s.tokenMint);
    if (cached) {
      s.tokenMarketCapUsd = cached.mc;
      s.tokenMarketCapFetchedAt = cached.mc != null ? cached.fetchedAt : null;
    }
  }

  return backfill;
}
