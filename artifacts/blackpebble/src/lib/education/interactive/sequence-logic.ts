/**
 * Pure logic for the "put the steps in order" interaction (sequence-builder).
 * Kept UI-free so ordering/grading is unit-testable and reusable.
 */

export interface SequenceStep {
  id: string;
  label: string;
  /** Optional short detail shown under the label. */
  detail?: string;
}

export interface SequenceConfig {
  prompt?: string;
  /** Steps in their correct order. */
  steps: SequenceStep[];
}

/**
 * Deterministic shuffle (seeded) so the displayed order is stable across renders
 * but differs from the correct order. A fixed seed keeps SSR/prerender and the
 * client in agreement and makes tests deterministic.
 */
export function shuffleSteps<T>(items: T[], seed = 1): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    // xorshift-ish deterministic PRNG.
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const j = Math.abs(s) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Number of steps placed in their correct position. */
export function gradeSequence(
  correctIds: string[],
  chosenIds: string[],
): { correct: number; total: number; perfect: boolean } {
  const total = correctIds.length;
  let correct = 0;
  for (let i = 0; i < total; i++) {
    if (chosenIds[i] && chosenIds[i] === correctIds[i]) correct += 1;
  }
  return { correct, total, perfect: total > 0 && correct === total };
}
