import { Sparkles, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { SupportSection } from "@/components/support-section";
import { FeedbackSection } from "@/components/feedback-section";

const IN_DEVELOPMENT = [
  "Wallet and token research dashboards",
  "Position sizing and risk calculators",
  "Market scanners with custom filters",
  "Performance reports and exportable insights",
];

export default function Utilities() {
  return (
    <div className="flex flex-col gap-8 px-4 py-6 sm:py-10 max-w-5xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Utilities</h1>
        <p className="text-sm text-muted-foreground">
          Standalone tools to help you manage your Solana wallet. These run
          directly on-chain and never touch your paper trading.
        </p>
      </div>

      <Link
        href="/utilities/wallet-cleaner"
        className="group border border-border bg-card hover:border-accent transition-colors p-5 flex items-center gap-4"
        data-testid="link-wallet-cleaner"
      >
        <div className="w-11 h-11 border border-accent/40 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">Wallet Cleaner</div>
          <p className="text-sm text-muted-foreground">
            Scan for empty token accounts and reclaim their locked SOL rent.
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors flex-shrink-0" />
      </Link>

      <div className="space-y-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          In development
        </div>
        <div className="border border-border bg-card divide-y divide-border">
          {IN_DEVELOPMENT.map((feature) => (
            <div
              key={feature}
              className="px-5 py-3.5 text-sm text-muted-foreground flex items-center gap-3"
            >
              <span className="w-1.5 h-1.5 bg-accent flex-shrink-0" />
              {feature}
            </div>
          ))}
        </div>
      </div>

      <SupportSection />
      <FeedbackSection />
    </div>
  );
}
