import { useEffect } from "react";
import { Link } from "wouter";
import { Map, CheckCircle2, Circle, ArrowRight } from "lucide-react";

type Status = "live" | "next" | "later";

const PHASES: { status: Status; title: string; items: string[] }[] = [
  {
    status: "live",
    title: "Available now",
    items: [
      "Live Solana paper trading with virtual SOL",
      "Trending markets with live price, market cap, liquidity & volume",
      "Portfolio tracking with realized & unrealized P&L",
      "Automated take-profit and stop-loss exits",
      "Daily, weekly, and all-time leaderboards",
      "SOL Recovery — reclaim trapped rent from unused token accounts",
    ],
  },
  {
    status: "next",
    title: "In progress",
    items: [
      "Public trader profiles linked from the leaderboard",
      "Deeper trade analytics and performance breakdowns",
      "Seasonal competitions and track-record history",
    ],
  },
  {
    status: "later",
    title: "Exploring",
    items: [
      "Advanced trade planning tools",
      "Richer market intelligence and discovery",
      "Community-driven challenges",
    ],
  },
];

const STATUS_META: Record<
  Status,
  { label: string; cls: string; icon: typeof Circle }
> = {
  live: {
    label: "Live",
    cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    icon: CheckCircle2,
  },
  next: {
    label: "Next",
    cls: "text-accent border-accent/40 bg-accent/10",
    icon: Circle,
  },
  later: {
    label: "Later",
    cls: "text-muted-foreground border-border bg-secondary",
    icon: Circle,
  },
};

export default function Roadmap() {
  useEffect(() => {
    document.title = "Roadmap — BlackPebble";
  }, []);

  return (
    <div className="flex flex-col gap-8 px-4 py-6 sm:py-10 max-w-3xl mx-auto">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Map className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-semibold">Roadmap</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Where BlackPebble is today and where it's heading. Plans evolve — this
          is direction, not a promise of dates.
        </p>
      </div>

      <div className="space-y-6">
        {PHASES.map((phase) => {
          const meta = STATUS_META[phase.status];
          const Icon = meta.icon;
          return (
            <div key={phase.title} className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">{phase.title}</h2>
                <span
                  className={`text-[11px] uppercase tracking-wider px-2 py-0.5 border ${meta.cls}`}
                >
                  {meta.label}
                </span>
              </div>
              <div className="border border-border bg-card divide-y divide-border">
                {phase.items.map((item) => (
                  <div
                    key={item}
                    className="px-5 py-3.5 text-sm text-muted-foreground flex items-start gap-3"
                  >
                    <Icon
                      className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                        phase.status === "live"
                          ? "text-emerald-400"
                          : "text-accent"
                      }`}
                    />
                    <span className="text-foreground/90">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <Link
          href="/"
          data-testid="link-roadmap-start"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-accent text-accent bg-accent/10 hover:bg-accent/20 transition-colors"
        >
          Start trading <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
