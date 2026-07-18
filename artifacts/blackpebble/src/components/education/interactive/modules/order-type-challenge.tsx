import { ListChecks } from "lucide-react";
import { ScenarioShell } from "../shared/scenario-shell";
import type { ScenarioRound } from "@/lib/education/interactive/scenario-logic";
import type { InteractiveModuleProps } from "../contract";

const ROUNDS: ScenarioRound[] = [
  {
    id: "fill-now",
    prompt: "You want to enter a liquid token immediately at roughly the current price. Which order fits best?",
    options: [
      { id: "market", label: "Market order", correct: true, note: "Fills right away near the current price." },
      { id: "limit", label: "Limit order below price", correct: false, note: "Would wait and might never fill." },
      { id: "stop", label: "Stop loss", correct: false, note: "That protects a position, it does not open one here." },
    ],
    explanation:
      "A market order prioritizes speed of execution over an exact price, which suits an immediate entry in a liquid market. Expect some slippage in thin markets.",
  },
  {
    id: "specific-price",
    prompt: "You only want to buy if the price drops to a specific lower level. Which order fits best?",
    options: [
      { id: "limit", label: "Limit buy at your level", correct: true, note: "Executes only at your price or better." },
      { id: "market", label: "Market order", correct: false, note: "Would buy now, not at your target." },
      { id: "tp", label: "Take profit", correct: false, note: "That is for exiting in profit." },
    ],
    explanation:
      "A limit order lets you set the maximum price you will pay. It may not fill if the price never reaches your level.",
  },
  {
    id: "protect-downside",
    prompt: "You hold a position and want to cap your loss if price falls sharply. Which tool fits best?",
    options: [
      { id: "stop", label: "Stop loss", correct: true, note: "Triggers an exit when your level is hit." },
      { id: "limit", label: "Limit buy", correct: false },
      { id: "hold", label: "Do nothing", correct: false, note: "Leaves the downside uncapped." },
    ],
    explanation:
      "A stop loss defines where your trade idea is wrong and exits to limit further loss. Stops can slip and are not guaranteed in fast markets.",
  },
  {
    id: "lock-gains",
    prompt: "You want to take profit automatically at a higher target. Which fits best?",
    options: [
      { id: "tp", label: "Take profit / limit sell at target", correct: true },
      { id: "market", label: "Market sell now", correct: false, note: "Exits immediately, not at your target." },
      { id: "stop", label: "Stop loss", correct: false },
    ],
    explanation:
      "A take-profit (limit sell) exits when price reaches your planned target, removing the need to watch constantly.",
  },
];

export function OrderTypeChallenge({
  onEvent,
  onComplete,
}: InteractiveModuleProps) {
  return (
    <ScenarioShell
      title="Order-type decision challenge"
      description="Pick the order type that best fits each situation. There is often more than one reasonable choice — focus on why."
      icon={ListChecks}
      rounds={ROUNDS}
      testId="order-type-challenge"
      onEvent={(type) => {
        if (type === "started") onEvent({ type: "interacted" });
      }}
      onComplete={() => onComplete({ completionType: "scenario" })}
    />
  );
}
