import { ShieldAlert } from "lucide-react";
import { ScenarioShell } from "../shared/scenario-shell";
import type { ScenarioRound } from "@/lib/education/interactive/scenario-logic";
import type { InteractiveModuleProps } from "../contract";

/**
 * Config-driven "spot the scam" exercise. Presents realistic but clearly
 * fictional messages/sites and asks the reader to identify the red flags. Built
 * on ScenarioShell so grading, per-item feedback, and retry are shared. Each
 * scam lesson supplies its own `rounds` via config; a default set covers the
 * most common beginner scams so the module always renders something useful.
 */

interface SpotTheScamConfig {
  title?: string;
  description?: string;
  rounds?: ScenarioRound[];
}

const DEFAULT_ROUNDS: ScenarioRound[] = [
  {
    id: "dm-support",
    prompt: "Which parts are red flags? (Select all that apply.)",
    context:
      '"Hi, this is BlackPebble Support. We noticed suspicious activity. To secure your wallet, please share your 12-word recovery phrase so we can restore access. Act within 10 minutes or your funds may be locked."',
    fictionLabel: "Simulated DM (not real)",
    multi: true,
    options: [
      { id: "dm-first", label: "Support messaged you first", correct: true, note: "Real support doesn't DM you first." },
      { id: "seed", label: "Asks for your recovery phrase", correct: true, note: "No one legitimate ever needs it." },
      { id: "urgency", label: "Creates urgency (10 minutes)", correct: true, note: "Pressure is a manipulation tactic." },
      { id: "name", label: "Uses the BlackPebble name", correct: false, note: "A name alone isn't proof of anything." },
    ],
    explanation:
      "Unsolicited contact, a request for your recovery phrase, and artificial urgency are three classic scam signals. Any request for your seed phrase is always a scam.",
  },
  {
    id: "fake-site",
    prompt: "What should make you stop? (Select all that apply.)",
    context:
      "A link in a chat leads to a site that looks like your wallet. It asks you to \"re-validate\" by signing a transaction that requests unlimited spending approval on all your tokens.",
    fictionLabel: "Simulated site (not real)",
    multi: true,
    options: [
      { id: "link", label: "You arrived via a chat link", correct: true, note: "Bookmark official sites; don't trust links." },
      { id: "unlimited", label: "Unlimited spending approval", correct: true, note: "Rarely needed; a drainer favorite." },
      { id: "revalidate", label: '"Re-validate" wording', correct: true, note: "Invented urgency to make you sign." },
      { id: "wallet-ui", label: "It looks like your wallet", correct: false, note: "Looks are easy to fake." },
    ],
    explanation:
      "Phishing sites copy real interfaces exactly. Judge by how you arrived and what is being requested. An unlimited approval you didn't initiate is a stop sign.",
  },
  {
    id: "airdrop",
    prompt: "A surprise token appears in your wallet worth '$4,000'. What's safe?",
    context:
      "The token's description contains a link to 'claim' your reward by connecting and signing.",
    fictionLabel: "Simulated airdrop (not real)",
    options: [
      { id: "claim", label: "Connect and claim it before it expires", correct: false },
      { id: "ignore", label: "Ignore it and never interact with the link", correct: true, note: "Interacting is how the trap springs." },
    ],
    explanation:
      "Unexpected airdrops are often bait. Interacting with them can trigger wallet-draining approvals. Ignore them, or burn spam with a trusted cleanup tool.",
  },
];

export function SpotTheScam({
  config,
  onEvent,
  onComplete,
}: InteractiveModuleProps<SpotTheScamConfig>) {
  const rounds = config?.rounds?.length ? config.rounds : DEFAULT_ROUNDS;
  return (
    <ScenarioShell
      title={config?.title ?? "Spot the scam"}
      description={
        config?.description ??
        "Every example below is fictional and safe. Find the warning signs. This is exactly how these scams look in real life."
      }
      icon={ShieldAlert}
      rounds={rounds}
      testId="spot-the-scam"
      onEvent={(type) => {
        if (type === "started") onEvent({ type: "interacted" });
      }}
      onComplete={() => onComplete({ completionType: "scenario" })}
    />
  );
}
