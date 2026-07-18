import { describe, it, expect } from "vitest";
import {
  isAnswerCorrect,
  scoreQuiz,
  correctAnswerIndices,
} from "./quiz-logic";
import type { LessonQuizQuestion } from "../types";

const single: LessonQuizQuestion = {
  id: "q1",
  prompt: "1M tokens at $1 each. Market cap?",
  options: ["$1", "$1M", "$10M", "$100k"],
  correctIndex: 1,
  explanation: "price x supply = 1 x 1,000,000 = $1,000,000.",
};

const multi: LessonQuizQuestion = {
  id: "q2",
  prompt: "Which are rug-pull warning signs?",
  kind: "multiple",
  options: ["Unlocked liquidity", "Audited code", "Concentrated supply", "Public team"],
  correctIndices: [0, 2],
  explanation: "Unlocked liquidity and concentrated supply are warning signs.",
};

describe("quiz-logic", () => {
  it("resolves correct indices per kind", () => {
    expect(correctAnswerIndices(single)).toEqual([1]);
    expect(correctAnswerIndices(multi)).toEqual([0, 2]);
  });

  it("grades single-choice questions", () => {
    expect(isAnswerCorrect(single, [1])).toBe(true);
    expect(isAnswerCorrect(single, [0])).toBe(false);
    expect(isAnswerCorrect(single, [])).toBe(false);
    expect(isAnswerCorrect(single, [1, 2])).toBe(false);
  });

  it("grades multiple-choice as an order-independent set", () => {
    expect(isAnswerCorrect(multi, [0, 2])).toBe(true);
    expect(isAnswerCorrect(multi, [2, 0])).toBe(true);
    expect(isAnswerCorrect(multi, [0])).toBe(false);
    expect(isAnswerCorrect(multi, [0, 2, 3])).toBe(false);
  });

  it("scores a quiz", () => {
    const s = scoreQuiz([single, multi], { q1: [1], q2: [0] });
    expect(s).toEqual({ correct: 1, total: 2, ratio: 0.5 });
    const perfect = scoreQuiz([single, multi], { q1: [1], q2: [2, 0] });
    expect(perfect).toEqual({ correct: 2, total: 2, ratio: 1 });
  });
});
