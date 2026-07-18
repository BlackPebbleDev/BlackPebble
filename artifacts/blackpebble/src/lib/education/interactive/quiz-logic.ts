import type { LessonQuizQuestion } from "../types";

/**
 * Pure quiz scoring logic, separated from the renderer so it can be tested and
 * reused. Supports single-choice, boolean (single), and multiple-choice
 * (order-independent set match).
 */

export function correctAnswerIndices(q: LessonQuizQuestion): number[] {
  const kind = q.kind ?? "single";
  if (kind === "multiple") return [...(q.correctIndices ?? [])].sort((a, b) => a - b);
  return typeof q.correctIndex === "number" ? [q.correctIndex] : [];
}

export function isAnswerCorrect(
  q: LessonQuizQuestion,
  selected: number[],
): boolean {
  const kind = q.kind ?? "single";
  const correct = correctAnswerIndices(q);
  if (correct.length === 0) return false;
  if (kind === "multiple") {
    if (selected.length !== correct.length) return false;
    const set = new Set(correct);
    return selected.every((i) => set.has(i));
  }
  return selected.length === 1 && selected[0] === correct[0];
}

export interface QuizScore {
  correct: number;
  total: number;
  ratio: number;
}

export function scoreQuiz(
  questions: LessonQuizQuestion[],
  answers: Record<string, number[]>,
): QuizScore {
  const total = questions.length;
  let correct = 0;
  for (const q of questions) {
    if (isAnswerCorrect(q, answers[q.id] ?? [])) correct += 1;
  }
  return { correct, total, ratio: total > 0 ? correct / total : 0 };
}
