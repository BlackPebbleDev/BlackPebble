import { useEffect } from "react";
import { CheckCircle2, Dot } from "lucide-react";

const FOCUS_AREAS = [
  "Trader Development",
  "Portfolio Analytics",
  "Community Tools",
  "Market Intelligence",
  "Leaderboards & Competitions",
  "Telegram Utilities",
  "Solana Ecosystem Tools",
];

const DIRECTION_ITEMS = [
  "Paper Trading",
  "Trading Analytics",
  "Community Utilities",
  "Telegram Tools",
  "Market Intelligence",
  "Community Funding Systems",
  "Professional Trading Terminal",
  "BlackPebble Ecosystem & Rewards",
];

export default function Roadmap() {
  useEffect(() => {
    document.title = "Vision — BlackPebble";
  }, []);

  return (
    <div className="flex flex-col gap-10 px-4 py-6 sm:py-12 max-w-3xl mx-auto">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          BlackPebble Vision
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
          BlackPebble is building tools to help traders learn, improve, compete,
          and participate in the Solana ecosystem.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
          Our focus is on practical tools, transparent development, and creating
          useful infrastructure for traders and communities.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-base font-semibold uppercase tracking-widest text-accent">
          Current Focus Areas
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FOCUS_AREAS.map((area) => (
            <div
              key={area}
              className="flex items-center gap-3 border border-border bg-card px-4 py-3"
            >
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-accent" />
              <span className="text-sm text-foreground/90">{area}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold uppercase tracking-widest text-accent">
          Long-Term Direction
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          BlackPebble is evolving into a Solana trader platform that combines:
        </p>
        <div className="border border-border bg-card divide-y divide-border">
          {DIRECTION_ITEMS.map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 px-5 py-3.5"
            >
              <Dot className="w-5 h-5 flex-shrink-0 text-accent" />
              <span className="text-sm text-foreground/90">{item}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2 pt-1">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Plans evolve based on community feedback, market conditions, and
            platform growth.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            BlackPebble is focused on building useful tools first and expanding
            the ecosystem over time.
          </p>
        </div>
      </section>
    </div>
  );
}
