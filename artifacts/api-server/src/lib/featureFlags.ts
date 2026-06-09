import { dbAll, dbRun } from "./database.js";

/**
 * Simple persisted feature flags. The trading UI reads these (public endpoint)
 * and the admin dashboard toggles them. Only explicit admin overrides are
 * stored in the `feature_flags` table; any flag absent from the table falls
 * back to its default below, so a fresh database behaves exactly as before.
 */
export const FEATURE_FLAG_KEYS = [
  "buy_limits",
  "tp_sl",
  "multi_target_tp",
  "experimental_utilities",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

// Everything on by default — this preserves the current behaviour until an
// admin explicitly turns a capability off.
export const DEFAULT_FLAGS: FeatureFlags = {
  buy_limits: true,
  tp_sl: true,
  multi_target_tp: true,
  experimental_utilities: true,
};

function isFlagKey(v: string): v is FeatureFlagKey {
  return (FEATURE_FLAG_KEYS as readonly string[]).includes(v);
}

/** Resolved flags: defaults merged with any persisted admin overrides. */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const flags: FeatureFlags = { ...DEFAULT_FLAGS };
  const rows = await dbAll<{ key: string; enabled: boolean }>(
    "SELECT key, enabled FROM feature_flags",
  );
  for (const r of rows) {
    if (isFlagKey(r.key)) flags[r.key] = !!r.enabled;
  }
  return flags;
}

/** Upsert a single flag override. Returns the full resolved flag set. */
export async function setFeatureFlag(
  key: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string; flags?: FeatureFlags }> {
  if (!isFlagKey(key)) {
    return { ok: false, error: `Unknown feature flag: ${key}` };
  }
  await dbRun(
    `INSERT INTO feature_flags (key, enabled, updated_at)
     VALUES ($1, $2, EXTRACT(EPOCH FROM NOW())::bigint)
     ON CONFLICT (key) DO UPDATE
       SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at`,
    [key, enabled],
  );
  return { ok: true, flags: await getFeatureFlags() };
}
