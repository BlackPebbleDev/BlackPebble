import { Info } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * "How simulated perps work" — progressive-disclosure education panel. Opened
 * from the small info icon in the perps ticket / history so the default UI
 * stays clean. Plain-English, trust-first: it must be obvious that nothing
 * here involves real funds.
 */
export function PerpsInfoSheet({ trigger }: { trigger?: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label="How simulated perps work"
            data-testid="button-perps-info"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
            How it works
          </button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>How simulated perps work</SheetTitle>
          <SheetDescription>
            Paper trading only — no real funds are ever at risk.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <InfoBlock title="Everything is simulated">
            Perps on BlackPebble are paper positions against live market data.
            There is no real order, no custody, no token approvals, and nothing
            leaves your simulated balance.
          </InfoBlock>
          <InfoBlock title="Margin">
            Margin is the simulated SOL you commit to a position. It is set
            aside from your paper balance while the position is open and is the
            most you can lose.
          </InfoBlock>
          <InfoBlock title="Leverage">
            Leverage multiplies your exposure. 5x leverage on 1 SOL margin
            controls a 5 SOL position — gains and losses both move 5x faster
            relative to your margin.
          </InfoBlock>
          <InfoBlock title="Long vs. Short">
            A long profits when the token&apos;s market cap rises. A short
            profits when it falls. Both track the token&apos;s USD market cap —
            the same number you see on the chart.
          </InfoBlock>
          <InfoBlock title="Liquidation">
            If the market cap moves against you far enough that your loss would
            reach your margin, the position is force-closed and the margin is
            lost. We liquidate slightly early (a small maintenance buffer) so
            your balance can never go negative. Every liquidation is recorded
            with the trigger level and price observed at the time.
          </InfoBlock>
          <InfoBlock title="How this differs from real perps">
            Real perpetual futures charge funding rates and trading fees, and
            losses can exceed initial margin on some venues. This simulation
            has no funding or fees, and your loss is always capped at margin —
            it&apos;s a learning and strategy tool, not an execution venue.
          </InfoBlock>
          <InfoBlock title="How stats are recorded">
            Every open, close, and liquidation writes a permanent history entry
            with entry, exit, trigger, and P&amp;L. Perps results are tracked
            separately from your spot stats and never affect the leaderboard or
            your Trust Score.
          </InfoBlock>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-foreground">
        {title}
      </h4>
      <p className="text-[13px]">{children}</p>
    </div>
  );
}
