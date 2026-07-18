/**
 * Shared data model + pure grading for decision-exercise modules (order-type
 * challenge, wallet signing, seed-phrase safety, rug-pull, trading psychology).
 * Keeping the model uniform lets one ScenarioShell drive many modules and lets
 * grading be tested without the UI.
 */

export interface ScenarioOption {
  id: string;
  label: string;
  correct: boolean;
  /** Optional per-option feedback shown after answering. */
  note?: string;
}

export interface ScenarioRound {
  id: string;
  prompt: string;
  /** Optional fictional context (a simulated prompt / message / token profile). */
  context?: string;
  /** Label stressing the context is fictional (e.g. "Simulated request"). */
  fictionLabel?: string;
  /** When true, the user must select all correct options ("select all that apply"). */
  multi?: boolean;
  options: ScenarioOption[];
  explanation: string;
}

export interface ScenarioConfig {
  rounds: ScenarioRound[];
}

export function correctOptionIds(round: ScenarioRound): string[] {
  return round.options.filter((o) => o.correct).map((o) => o.id);
}

export function isRoundCorrect(
  round: ScenarioRound,
  selectedIds: string[],
): boolean {
  const correct = correctOptionIds(round);
  if (correct.length === 0) return false;
  if (round.multi) {
    if (selectedIds.length !== correct.length) return false;
    const set = new Set(correct);
    return selectedIds.every((id) => set.has(id));
  }
  return selectedIds.length === 1 && selectedIds[0] === correct[0];
}

export function scoreScenario(
  rounds: ScenarioRound[],
  answers: Record<string, string[]>,
): { correct: number; total: number; ratio: number } {
  const total = rounds.length;
  let correct = 0;
  for (const round of rounds) {
    if (isRoundCorrect(round, answers[round.id] ?? [])) correct += 1;
  }
  return { correct, total, ratio: total > 0 ? correct / total : 0 };
}
