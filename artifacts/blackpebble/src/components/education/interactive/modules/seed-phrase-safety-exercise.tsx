import { KeyRound } from "lucide-react";
import { ScenarioShell } from "../shared/scenario-shell";
import type { ScenarioRound } from "@/lib/education/interactive/scenario-logic";
import type { InteractiveModuleProps } from "../contract";

// All scenarios are fictional. This exercise never asks the user to type a real
// seed phrase or private key.
const ROUNDS: ScenarioRound[] = [
  {
    id: "support",
    prompt: "What should you do?",
    context: "Someone in a support chat says: \"I'm from wallet support. Share your recovery phrase so I can restore your funds.\"",
    fictionLabel: "Simulated scam message",
    options: [
      { id: "share", label: "Share it to get help", correct: false },
      { id: "refuse", label: "Refuse — real support never asks for it", correct: true, note: "This is always a scam." },
    ],
    explanation:
      "Real support will never ask for your recovery phrase. Anyone who has it controls your wallet completely. Never share or type it into a chat.",
  },
  {
    id: "storage",
    prompt: "Which storage choices are reasonable? (Select all that apply.)",
    context: "You need to back up a new 12-word recovery phrase.",
    fictionLabel: "Simulated setup",
    multi: true,
    options: [
      { id: "offline", label: "Written on paper stored securely offline", correct: true },
      { id: "metal", label: "Stamped on a metal backup plate", correct: true },
      { id: "screenshot", label: "Screenshot saved to cloud photos", correct: false, note: "Cloud sync exposes it." },
      { id: "email", label: "Emailed to yourself", correct: false, note: "Email accounts get compromised." },
    ],
    explanation:
      "Keep recovery phrases offline. Screenshots, cloud storage, and email are common ways phrases get stolen.",
  },
  {
    id: "airdrop",
    prompt: "How should you treat this?",
    context: "A site offers a free airdrop but first asks you to \"import your existing wallet by pasting your seed phrase.\"",
    fictionLabel: "Simulated phishing site",
    options: [
      { id: "paste", label: "Paste it to claim the airdrop", correct: false },
      { id: "leave", label: "Leave — legitimate airdrops never need your phrase", correct: true },
    ],
    explanation:
      "Legitimate airdrops are claimed with a normal wallet connection or signature, never by importing your seed phrase into a website.",
  },
];

export function SeedPhraseSafetyExercise({
  onEvent,
  onComplete,
}: InteractiveModuleProps) {
  return (
    <ScenarioShell
      title="Seed phrase safety exercise"
      description="Decide how to handle each fictional situation. Your real recovery phrase should never be typed into any website or chat."
      icon={KeyRound}
      rounds={ROUNDS}
      testId="seed-phrase-safety"
      onEvent={(type) => {
        if (type === "started") onEvent({ type: "interacted" });
      }}
      onComplete={() => onComplete({ completionType: "scenario" })}
    />
  );
}
