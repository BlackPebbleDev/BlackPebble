import { AlertOctagon } from "lucide-react";
import { ScenarioShell } from "../shared/scenario-shell";
import type { ScenarioRound } from "@/lib/education/interactive/scenario-logic";
import type { InteractiveModuleProps } from "../contract";

// Fictional token profiles only. No real project is labelled a scam.
const ROUNDS: ScenarioRound[] = [
  {
    id: "profile-1",
    prompt: "Which warning signs are present? (Select all that apply.)",
    context:
      "Fictional token: liquidity is not locked, the developer wallet holds 45% of supply, and social accounts were created two days ago with bought followers.",
    fictionLabel: "Fictional token profile",
    multi: true,
    options: [
      { id: "liq", label: "Unlocked liquidity", correct: true, note: "Liquidity can be removed at any time." },
      { id: "dev", label: "Concentrated developer supply", correct: true, note: "A single seller can crash price." },
      { id: "social", label: "Fake / bought social proof", correct: true, note: "Manufactured hype is a red flag." },
      { id: "audit", label: "Independent audit", correct: false, note: "None was mentioned here." },
    ],
    explanation:
      "Unlocked liquidity, concentrated supply, and fake social proof are classic warning signs. Any one alone is a concern; together they are serious.",
  },
  {
    id: "profile-2",
    prompt: "What is the safest response?",
    context:
      "Fictional token is pumping fast. A prompt asks you to approve unlimited token spend to \"enable trading\" on a brand-new site.",
    fictionLabel: "Fictional prompt",
    options: [
      { id: "approve", label: "Approve to not miss out", correct: false },
      { id: "review", label: "Decline and verify the contract first", correct: true },
    ],
    explanation:
      "FOMO plus an unusual unlimited-approval request is a dangerous combination. Decline, verify the contract, and never approve blindly.",
  },
  {
    id: "profile-3",
    prompt: "Which factors reduce (not remove) risk? (Select all that apply.)",
    context: "Fictional token: liquidity locked for 12 months, mint authority renounced, supply broadly distributed.",
    fictionLabel: "Fictional token profile",
    multi: true,
    options: [
      { id: "lock", label: "Locked liquidity", correct: true },
      { id: "renounce", label: "Renounced mint authority", correct: true },
      { id: "distribution", label: "Broad holder distribution", correct: true },
      { id: "guarantee", label: "Guaranteed it is safe", correct: false, note: "Nothing guarantees safety." },
    ],
    explanation:
      "Locked liquidity, renounced authority, and distribution lower certain risks, but nothing makes a token safe. Always size positions for total loss.",
  },
];

export function RugPullScenario({ onEvent, onComplete }: InteractiveModuleProps) {
  return (
    <ScenarioShell
      title="Rug-pull warning signs"
      description="Review each fictional token profile and identify the risks. No real project is being labelled."
      icon={AlertOctagon}
      rounds={ROUNDS}
      testId="rug-pull-scenario"
      onEvent={(type) => {
        if (type === "started") onEvent({ type: "interacted" });
      }}
      onComplete={() => onComplete({ completionType: "scenario" })}
    />
  );
}
