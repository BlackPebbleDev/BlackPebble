/**
 * Client-side artificial sparkline placeholder (fallback level L6, LAST RESORT).
 *
 * When the server can supply no real history for a token from ANY source
 * (GeckoTerminal, DexScreener-derived, Birdeye, observed snapshots), a card
 * would otherwise be blank. Rather than lie with a fabricated "trend", we draw a
 * clearly-secondary, deterministic placeholder so the layout stays alive — and
 * the UI renders it at reduced opacity with its own test id so it never claims to
 * be real market data.
 *
 * Properties:
 *  - Deterministic: seeded by the mint, so the same token always looks the same
 *    (no flicker between renders) while different tokens look different.
 *  - Varied: ~10 market-shaped templates × per-seed amplitude/phase/jitter, so a
 *    list of placeholders doesn't look like rows of the same canned squiggle.
 *  - Shape-only: values are arbitrary-scale; the SVG normalises by min/max, so
 *    only the silhouette matters. The instant real data arrives the component
 *    swaps to it with a smooth opacity transition.
 */

/** xmur3 string hash → 32-bit seed. */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 PRNG: tiny, fast, deterministic. Returns [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Template = (rng: () => number, n: number) => number[];

/** Smooth a series with a simple moving average to avoid jagged placeholder lines. */
function smooth(values: number[], radius = 1): number[] {
  if (radius <= 0) return values;
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = i - radius; j <= i + radius; j++) {
      if (j >= 0 && j < values.length) {
        sum += values[j];
        count++;
      }
    }
    return sum / count;
  });
}

/** Small per-point noise scaled by `amp`. */
function noisy(base: number[], rng: () => number, amp: number): number[] {
  return base.map((v) => v + (rng() - 0.5) * amp);
}

/**
 * Ten market-shaped silhouettes. Each returns values in roughly [0, 1] before
 * the caller applies amplitude/offset/jitter; absolute scale is irrelevant.
 */
const TEMPLATES: Template[] = [
  // 0 — gradual climb
  (rng, n) => noisy(Array.from({ length: n }, (_, i) => i / (n - 1)), rng, 0.12),
  // 1 — gradual decline
  (rng, n) => noisy(Array.from({ length: n }, (_, i) => 1 - i / (n - 1)), rng, 0.12),
  // 2 — sideways chop
  (rng, n) =>
    noisy(
      Array.from({ length: n }, (_, i) => 0.5 + Math.sin(i * 1.1) * 0.12),
      rng,
      0.2,
    ),
  // 3 — recovery (V): down then up
  (rng, n) =>
    noisy(
      Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        return Math.abs(t - 0.4) * 1.4 + (t > 0.4 ? 0.1 : 0);
      }),
      rng,
      0.1,
    ),
  // 4 — consolidation (tight range, slight drift)
  (rng, n) =>
    noisy(
      Array.from({ length: n }, (_, i) => 0.45 + (i / (n - 1)) * 0.12),
      rng,
      0.08,
    ),
  // 5 — mild volatility waves
  (rng, n) =>
    noisy(
      Array.from(
        { length: n },
        (_, i) => 0.5 + Math.sin(i * 0.8) * 0.2 + Math.sin(i * 0.31) * 0.1,
      ),
      rng,
      0.18,
    ),
  // 6 — breakout then pullback (rise to a peak, settle below it)
  (rng, n) =>
    noisy(
      Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        const peak = 0.65;
        return t < peak ? (t / peak) * 0.95 : 0.95 - ((t - peak) / (1 - peak)) * 0.35;
      }),
      rng,
      0.1,
    ),
  // 7 — slow uptrend with wobble
  (rng, n) =>
    noisy(
      Array.from(
        { length: n },
        (_, i) => (i / (n - 1)) * 0.7 + 0.15 + Math.sin(i * 0.5) * 0.07,
      ),
      rng,
      0.1,
    ),
  // 8 — slow downtrend with wobble
  (rng, n) =>
    noisy(
      Array.from(
        { length: n },
        (_, i) => (1 - i / (n - 1)) * 0.7 + 0.15 + Math.sin(i * 0.5) * 0.07,
      ),
      rng,
      0.1,
    ),
  // 9 — low-volatility drift
  (rng, n) =>
    noisy(
      Array.from({ length: n }, (_, i) => 0.5 + Math.sin(i * 0.25 + 1) * 0.06),
      rng,
      0.05,
    ),
];

/**
 * Generate a deterministic, market-shaped placeholder series for a mint. Returns
 * a chronological array (oldest first) suitable for the same drawing code real
 * series use. Pure and synchronous — safe to call in render.
 */
export function generatePlaceholderSeries(seed: string, count = 20): number[] {
  const n = Math.max(6, count);
  const rng = mulberry32(hashSeed(seed || "x"));
  const template = TEMPLATES[Math.floor(rng() * TEMPLATES.length) % TEMPLATES.length];

  const amp = 0.7 + rng() * 0.6; // amplitude variation
  const offset = (rng() - 0.5) * 0.2; // vertical shift
  const base = template(rng, n);
  const scaled = base.map((v) => v * amp + offset);
  return smooth(scaled, 1);
}
