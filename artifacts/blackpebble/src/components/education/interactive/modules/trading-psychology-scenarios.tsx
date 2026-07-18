import { Brain } from "lucide-react";
import { ScenarioShell } from "../shared/scenario-shell";
import type { ScenarioRound } from "@/lib/education/interactive/scenario-logic";
import type { InteractiveModuleProps } from "../contract";

// These reward process and self-awareness, not a single "perfect" trade.
const ROUNDS: ScenarioRound[] = [
  {
    id: "fomo",
    prompt: "What is the more disciplined response?",
    context: "A token is up 300% today and your feed is full of gains. You had no plan to buy it.",
    fictionLabel: "Simulated situation",
    options: [
      { id: "chase", label: "Buy immediately so you don't miss out", correct: false, note: "That is FOMO driving the decision." },
      { id: "plan", label: "Decide a level and size first, or skip it", correct: true, note: "Process over impulse." },
    ],
    explanation:
      "FOMO leads to buying tops without a plan. Deciding entry, size, and invalidation beforehand keeps decisions deliberate.",
  },
  {
    id: "revenge",
    prompt: "What is the healthier response?",
    context: "You just took a loss and feel the urge to immediately put on a bigger trade to win it back.",
    fictionLabel: "Simulated situation",
    options: [
      { id: "revenge", label: "Double the size to recover fast", correct: false, note: "Revenge trading compounds losses." },
      { id: "pause", label: "Step back and stick to your normal size", correct: true },
    ],
    explanation:
      "Revenge trading increases risk exactly when judgment is weakest. A pause and normal sizing protect the account.",
  },
  {
    id: "winners",
    prompt: "Which habits describe a repeatable process? (Select all that apply.)",
    context: "You review your recent trades.",
    fictionLabel: "Simulated review",
    multi: true,
    options: [
      { id: "plan", label: "Entry, stop, and target defined in advance", correct: true },
      { id: "size", label: "Consistent position sizing", correct: true },
      { id: "hold-loser", label: "Holding losers hoping they recover", correct: false, note: "A common, costly bias." },
      { id: "cut-winner", label: "Selling winners immediately out of fear", correct: false, note: "Caps upside prematurely." },
    ],
    explanation:
      "A repeatable process relies on pre-defined plans and consistent sizing, not on hope or fear. Awareness of your biases is the first step.",
  },
];

export function TradingPsychologyScenarios({
  onEvent,
  onComplete,
}: InteractiveModuleProps) {
  return (
    <ScenarioShell
      title="Trading psychology scenarios"
      description="There is not always one perfect decision. Focus on process, risk, and self-awareness."
      icon={Brain}
      rounds={ROUNDS}
      testId="trading-psychology"
      onEvent={(type) => {
        if (type === "started") onEvent({ type: "interacted" });
      }}
      onComplete={() => onComplete({ completionType: "scenario" })}
    />
  );
}
