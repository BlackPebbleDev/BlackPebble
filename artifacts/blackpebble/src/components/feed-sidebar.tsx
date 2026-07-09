import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Flame, Loader2, Megaphone } from "lucide-react";
import { api } from "@/lib/api";
import { fmtMarketCap, fmtPercentSafe, pnlColorSafe } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The feed's right context rail. Turns the timeline into a dashboard rather
 * than a centered blog column. Every widget is powered by real, already-served
 * data (no fabricated activity): Hot Tokens comes from the live trending feed,
 * Active Campaigns from the live escrow campaigns list. When a source is empty
 * (or unavailable), the widget shows an honest empty state rather than filler.
 *
 * Hidden below `lg` so mobile stays a clean single column.
 */

function RailCard({
  icon: Icon,
  title,
  href,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-card shadow-card overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <Icon className="w-4 h-4 text-accent shrink-0" />
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {href && (
          <Link
            href={href}
            className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-accent transition-colors"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function RailLoading() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
    </div>
  );
}

function RailEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 py-6 text-center text-xs text-muted-foreground/70">
      {children}
    </p>
  );
}

function RailTokenLogo({
  logo,
  label,
}: {
  logo: string | null;
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    return (
      <img
        src={logo}
        alt=""
        width={28}
        height={28}
        className="w-7 h-7 rounded-full object-cover shrink-0 bg-secondary"
        onError={() => setFailed(true)}
        loading="lazy"
      />
    );
  }
  return (
    <span className="flex w-7 h-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground uppercase">
      {label.slice(0, 2)}
    </span>
  );
}

/** Top movers from the live trending feed. */
function HotTokensWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["feed-rail", "trending"],
    queryFn: () => api.trending(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const tokens = (data?.tokens ?? []).slice(0, 6);

  return (
    <RailCard icon={Flame} title="Hot Tokens" href="/markets">
      {isLoading ? (
        <RailLoading />
      ) : tokens.length === 0 ? (
        <RailEmpty>No trending tokens right now.</RailEmpty>
      ) : (
        <ul className="divide-y divide-border/40">
          {tokens.map((t) => {
            const label = t.symbol?.trim() || t.name?.trim() || "token";
            return (
              <li key={t.mint}>
                <Link
                  href={`/?token=${t.mint}`}
                  className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-3 transition-colors"
                >
                  <RailTokenLogo logo={t.logo} label={label} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {label}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {fmtMarketCap(t.marketCapUsd)} MC
                    </p>
                  </div>
                  <span
                    className={cn(
                      "font-mono tabular-nums text-xs shrink-0",
                      pnlColorSafe(t.priceChange24h),
                    )}
                  >
                    {fmtPercentSafe(t.priceChange24h)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </RailCard>
  );
}

/** Live community campaigns with real escrow funding progress. */
function ActiveCampaignsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["feed-rail", "campaigns", "live"],
    queryFn: () => api.campaigns.list("live"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const campaigns = (data?.campaigns ?? []).slice(0, 4);

  return (
    <RailCard icon={Megaphone} title="Active Campaigns" href="/campaigns">
      {isLoading ? (
        <RailLoading />
      ) : campaigns.length === 0 ? (
        <RailEmpty>
          {data && !data.escrowReady
            ? "Campaigns are warming up."
            : "No live campaigns right now."}
        </RailEmpty>
      ) : (
        <ul className="divide-y divide-border/40">
          {campaigns.map((c) => {
            const pct = Math.max(
              0,
              Math.min(100, Math.round((c.accounting?.progress ?? 0) * 100)),
            );
            return (
              <li key={c.publicId}>
                <Link
                  href={`/campaigns/${c.publicId}`}
                  className="block px-4 py-2.5 hover:bg-surface-3 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {c.title}
                    </p>
                    <span className="font-mono tabular-nums text-[11px] text-accent shrink-0">
                      {pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-secondary/70 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground truncate">
                    {c.accounting?.contributorCount ?? 0} contributor
                    {(c.accounting?.contributorCount ?? 0) === 1 ? "" : "s"}
                    {c.goalLabel ? ` · ${c.goalLabel}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </RailCard>
  );
}

export function FeedSidebar() {
  return (
    <aside className="hidden lg:block w-full space-y-4">
      <div className="lg:sticky lg:top-6 space-y-4">
        <HotTokensWidget />
        <ActiveCampaignsWidget />
      </div>
    </aside>
  );
}
