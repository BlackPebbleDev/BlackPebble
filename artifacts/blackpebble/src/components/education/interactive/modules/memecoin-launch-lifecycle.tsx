import { useState } from "react";
import { Rocket, ArrowLeft, ArrowRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SimulatorShell } from "../shared/simulator-shell";
import { Note } from "../shared/results";
import { RelatedActions } from "../shared/actions";
import type { InteractiveModuleProps } from "../contract";

interface Stage {
  title: string;
  body: string;
  risk?: string;
  solanaExample?: string;
}

// Universal lifecycle core. Chain-specific detail lives in optional notes so the
// same module works beyond Solana as more launchpads are added.
const STAGES: Stage[] = [
  {
    title: "Token creation",
    body: "A token is created on-chain. At this point it has no trading history, no proven liquidity, and no track record. Anyone can create a token.",
    risk: "A token existing says nothing about its quality or safety.",
    solanaExample: "On Solana, tokens are commonly created as SPL or Token-2022 mints.",
  },
  {
    title: "Initial pricing / bonding curve",
    body: "Early pricing is often set by a bonding curve where each purchase raises the price for the next buyer. Early buyers pay less than later buyers.",
    risk: "Being early is not automatically safe — many tokens fade before maturing.",
  },
  {
    title: "Early buyers and attention",
    body: "Early buyers, social posts, and momentum can drive rapid interest. Attention can arrive and leave very quickly.",
    risk: "Hype is not liquidity. Interest can vanish faster than you can exit.",
  },
  {
    title: "Liquidity migration",
    body: "If a token reaches a threshold, liquidity often migrates to an open market or pool, enabling wider trading.",
    risk: "Whether liquidity is locked and how deep it is matters more than the milestone itself.",
    solanaExample: "On Solana this often means moving to a DEX pool after a launchpad threshold.",
  },
  {
    title: "Open-market trading",
    body: "The token trades freely. Price is now driven by supply, demand, liquidity depth, and holder behavior.",
    risk: "Thin liquidity means large trades — including exits — move price sharply.",
  },
  {
    title: "Developer and community activity",
    body: "Ongoing developer and community activity can support a token, or its absence can signal abandonment. Developer selling can pressure price.",
    risk: "Watch developer holdings and whether authority has been renounced.",
  },
  {
    title: "Possible failure points",
    body: "Tokens can fail at any stage: liquidity removed, developer sells, interest fades, or the project was never genuine. Most launches do not last.",
    risk: "Assume most tokens fail. Size positions accordingly and protect your wallet.",
  },
];

export function MemecoinLaunchLifecycle({
  lesson,
  onEvent,
  onComplete,
}: InteractiveModuleProps) {
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const stage = STAGES[index];

  function go(next: number) {
    if (!started) {
      setStarted(true);
      onEvent({ type: "interacted" });
    }
    const clamped = Math.max(0, Math.min(STAGES.length - 1, next));
    setIndex(clamped);
    if (clamped === STAGES.length - 1) onComplete({ completionType: "walkthrough" });
  }

  return (
    <SimulatorShell
      title="Memecoin launch lifecycle"
      icon={Rocket}
      testId="launch-lifecycle"
      relatedActions={<RelatedActions lesson={lesson} />}
    >
      <div className="space-y-3">
        {/* Stage rail */}
        <ol className="flex items-center gap-1" aria-label="Lifecycle stages">
          {STAGES.map((s, i) => (
            <li key={s.title} className="flex-1">
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === index ? "step" : undefined}
                className={cn(
                  "h-1.5 w-full rounded-full transition-colors",
                  i <= index ? "bg-accent" : "bg-surface-2",
                )}
                title={s.title}
              >
                <span className="sr-only">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="rounded-xl border border-border/60 bg-card/60 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Stage {index + 1} of {STAGES.length}
          </div>
          <h4 className="mt-0.5 text-base font-semibold text-foreground">
            {stage.title}
          </h4>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {stage.body}
          </p>
          {stage.solanaExample ? (
            <p className="mt-2 text-xs text-muted-foreground/80">
              <span className="font-semibold text-foreground/80">Solana example: </span>
              {stage.solanaExample}
            </p>
          ) : null}
          {stage.risk ? (
            <div className="mt-3">
              <Note tone="warning">
                <span className="inline-flex items-center gap-1 font-semibold">
                  <AlertTriangle className="h-3 w-3" aria-hidden /> Watch for:
                </span>{" "}
                {stage.risk}
              </Note>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            data-testid="lifecycle-prev"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            disabled={index === STAGES.length - 1}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
            data-testid="lifecycle-next"
          >
            Next <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </SimulatorShell>
  );
}
