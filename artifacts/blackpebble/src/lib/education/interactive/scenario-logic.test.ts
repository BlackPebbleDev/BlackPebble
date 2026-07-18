import { describe, it, expect } from "vitest";
import {
  isRoundCorrect,
  scoreScenario,
  correctOptionIds,
  type ScenarioRound,
} from "./scenario-logic";

const single: ScenarioRound = {
  id: "r1",
  prompt: "A wallet asks you to sign a transaction granting unlimited spend.",
  options: [
    { id: "a", label: "Generally low risk", correct: false },
    { id: "b", label: "Dangerous", correct: true },
    { id: "c", label: "Never do this", correct: false },
  ],
  explanation: "Unlimited approvals are dangerous.",
};

const multi: ScenarioRound = {
  id: "r2",
  prompt: "Which are warning signs?",
  multi: true,
  options: [
    { id: "a", label: "Unlocked liquidity", correct: true },
    { id: "b", label: "Public audit", correct: false },
    { id: "c", label: "Dev holds 40%", correct: true },
  ],
  explanation: "Unlocked liquidity and concentrated dev supply are signs.",
};

describe("scenario-logic", () => {
  it("collects correct option ids", () => {
    expect(correctOptionIds(single)).toEqual(["b"]);
    expect(correctOptionIds(multi)).toEqual(["a", "c"]);
  });

  it("grades single-select rounds", () => {
    expect(isRoundCorrect(single, ["b"])).toBe(true);
    expect(isRoundCorrect(single, ["a"])).toBe(false);
    expect(isRoundCorrect(single, [])).toBe(false);
  });

  it("grades multi-select rounds as a set", () => {
    expect(isRoundCorrect(multi, ["a", "c"])).toBe(true);
    expect(isRoundCorrect(multi, ["c", "a"])).toBe(true);
    expect(isRoundCorrect(multi, ["a"])).toBe(false);
    expect(isRoundCorrect(multi, ["a", "b", "c"])).toBe(false);
  });

  it("scores a scenario", () => {
    expect(scoreScenario([single, multi], { r1: ["b"], r2: ["a"] })).toEqual({
      correct: 1,
      total: 2,
      ratio: 0.5,
    });
  });
});
