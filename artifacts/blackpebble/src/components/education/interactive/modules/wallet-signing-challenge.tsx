import { ShieldAlert } from "lucide-react";
import { ScenarioShell } from "../shared/scenario-shell";
import type { ScenarioRound } from "@/lib/education/interactive/scenario-logic";
import type { InteractiveModuleProps } from "../contract";

// Every context below is fictional and clearly labelled. This exercise never
// trains the user to approve real requests.
const ROUNDS: ScenarioRound[] = [
  {
    id: "connect",
    prompt: "How risky is this request, by itself?",
    context: "A well-known site asks: \"Connect wallet to view your portfolio.\" It requests no signature.",
    fictionLabel: "Simulated request — not real",
    options: [
      { id: "low", label: "Generally low risk", correct: true, note: "Connecting shares your public address only." },
      { id: "review", label: "Review carefully", correct: false },
      { id: "danger", label: "Dangerous", correct: false },
    ],
    explanation:
      "Connecting a wallet typically shares only your public address and does not move funds. Risk rises when a site then asks you to sign something.",
  },
  {
    id: "message",
    prompt: "How should you treat this?",
    context: "A login prompt asks you to sign a plain message: \"Sign in to ExampleApp at 12:00.\" No transaction, no approval.",
    fictionLabel: "Simulated signature request",
    options: [
      { id: "low", label: "Generally low risk", correct: true, note: "Signing a readable message does not move funds." },
      { id: "danger", label: "Dangerous", correct: false },
      { id: "never", label: "Never do this", correct: false },
    ],
    explanation:
      "Signing a readable off-chain message for login is normally safe. Be cautious if the message is blank, garbled, or asks to approve spending.",
  },
  {
    id: "approval",
    prompt: "How should you treat this?",
    context: "A new site asks you to approve unlimited spending of your USDC to an unfamiliar contract.",
    fictionLabel: "Simulated approval request",
    options: [
      { id: "low", label: "Generally low risk", correct: false },
      { id: "review", label: "Review carefully", correct: true, note: "Limit the amount and verify the contract." },
      { id: "danger", label: "Dangerous if blindly approved", correct: true },
    ],
    multi: true,
    explanation:
      "Unlimited token approvals let a contract move your tokens later. Approve only what you need, verify the contract, and revoke unused approvals.",
  },
  {
    id: "seed",
    prompt: "How should you treat this?",
    context: "A popup says: \"Verify your wallet — enter your 12-word recovery phrase to continue.\"",
    fictionLabel: "Simulated phishing prompt",
    options: [
      { id: "low", label: "Generally low risk", correct: false },
      { id: "never", label: "Never do this", correct: true, note: "No legitimate app asks for your seed phrase." },
    ],
    explanation:
      "No legitimate wallet or app ever asks for your recovery phrase. Entering it hands over full control of your funds. Close the page.",
  },
];

export function WalletSigningChallenge({
  lesson,
  onEvent,
  onComplete,
}: InteractiveModuleProps) {
  const chainNote =
    lesson.chainScope === "solana"
      ? undefined
      : "Concepts are universal; specific prompts differ across wallets and chains.";
  return (
    <ScenarioShell
      title="Wallet connection vs signing"
      description={
        chainNote ??
        "Classify each fictional request. Never approve real requests you do not understand."
      }
      icon={ShieldAlert}
      rounds={ROUNDS}
      testId="wallet-signing-challenge"
      onEvent={(type) => {
        if (type === "started") onEvent({ type: "interacted" });
      }}
      onComplete={() => onComplete({ completionType: "scenario" })}
    />
  );
}
