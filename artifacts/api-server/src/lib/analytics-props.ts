/**
 * Analytics event property sanitization.
 *
 * Academy (and future) events may attach a small, typed properties object so
 * the funnel can answer "which lesson / which module / which query". To keep
 * POST /analytics/event from becoming an arbitrary-data ingestion endpoint:
 *   - only known keys are accepted (unknown keys are discarded)
 *   - values are type-constrained (string / bounded int / boolean)
 *   - strings are trimmed and length-capped
 *   - the serialized result is size-capped
 *   - no free-form / nested JSON is stored
 *
 * Returns null when nothing valid remains, so legacy type-only events are
 * unaffected.
 */

export const ALLOWED_ANALYTICS_PROP_KEYS = [
  "lessonSlug",
  "categoryId",
  "moduleId",
  "resultType",
  "queryIntent",
  "chainScope",
  "sourceSurface",
  "learningPathId",
  "stepId",
  "completionType",
  "difficulty",
  "resultCount",
  "queryLength",
  "isGuest",
] as const;

export type AnalyticsPropKey = (typeof ALLOWED_ANALYTICS_PROP_KEYS)[number];

const STRING_MAX = 96;
const SERIALIZED_MAX = 1024;
const NUMERIC_KEYS = new Set<AnalyticsPropKey>(["resultCount", "queryLength"]);
const BOOL_KEYS = new Set<AnalyticsPropKey>(["isGuest"]);

export type SanitizedAnalyticsProps = Record<string, string | number | boolean>;

/** Validate/whitelist an untrusted props object. Returns null if empty. */
export function sanitizeAnalyticsProps(
  input: unknown,
): SanitizedAnalyticsProps | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const src = input as Record<string, unknown>;
  const out: SanitizedAnalyticsProps = {};

  for (const key of ALLOWED_ANALYTICS_PROP_KEYS) {
    if (!(key in src)) continue;
    const value = src[key];
    if (value === null || value === undefined) continue;

    if (BOOL_KEYS.has(key)) {
      if (typeof value === "boolean") out[key] = value;
      continue;
    }
    if (NUMERIC_KEYS.has(key)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        out[key] = Math.max(0, Math.min(1_000_000, Math.trunc(value)));
      }
      continue;
    }
    // Remaining keys are strings.
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) out[key] = trimmed.slice(0, STRING_MAX);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = String(value).slice(0, STRING_MAX);
    }
  }

  if (Object.keys(out).length === 0) return null;
  // Final safety net: never persist an unexpectedly large blob.
  if (JSON.stringify(out).length > SERIALIZED_MAX) return null;
  return out;
}
