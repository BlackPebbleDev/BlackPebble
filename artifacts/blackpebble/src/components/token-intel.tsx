import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Users,
  MessageSquare,
  Megaphone,
  TrendingUp,
  Loader2,
  Sparkles,
  Eye,
  BookOpen,
  Flame,
  ScrollText,
} from "lucide-react";
import { api, type TokenInfo, type TokenIntelligence } from "@/lib/api";
import { fmtMarketCap, fmtPercent, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Token age from the pair-creation timestamp (ms epoch). */
function fmtAge(ms?: number | null): string {
  if (!ms || ms <= 0) return "—";
  const diff = Date.now() - ms;
  if (diff < 0) return "—";
  const d = Math.floor(diff / 86_400_000);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(diff / 3_600_000);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(diff / 60_000);
  return `${Math.max(m, 1)}m`;
}

function fmtInt(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** A small labelled stat tile used across the intelligence panels. */
function Tile({
  label,
  value,
  accent,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-secondary/30 border border-border/60 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-sm font-semibold",
          mono && "font-mono",
          accent ? "text-accent" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/** A "Coming Soon" tile for data the model doesn't capture yet. */
function SoonTile({ label }: { label: string }) {
  return (
    <div className="rounded-xl bg-secondary/20 border border-dashed border-border/60 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xs font-medium text-muted-foreground/70">
        Coming Soon
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: typeof Activity;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-accent" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function Avatar({
  url,
  name,
}: {
  url: string | null;
  name: string | null;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={name ?? ""}
        className="w-7 h-7 rounded-full object-cover flex-shrink-0"
        loading="lazy"
      />
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[11px] font-semibold flex-shrink-0">
      {(name ?? "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

function callerName(
  display: string | null,
  username: string | null,
): string {
  return display || (username ? `@${username}` : "Anonymous");
}

function convictionTone(c: string | null): string {
  if (c === "high") return "text-emerald-400";
  if (c === "medium") return "text-accent";
  if (c === "low") return "text-muted-foreground";
  return "text-muted-foreground";
}

function sentimentBadge(s: string | null): { label: string; cls: string } {
  if (s === "bullish")
    return {
      label: "Bullish",
      cls: "bg-success/15 text-success border-success/30",
    };
  if (s === "bearish")
    return {
      label: "Bearish",
      cls: "bg-destructive/15 text-destructive border-destructive/30",
    };
  return {
    label: "Neutral",
    cls: "bg-muted/40 text-muted-foreground border-border",
  };
}

/** Volume-trend label derived from the 1h rate vs the 24h hourly average. */
function volumeTrend(info: TokenInfo): { label: string; tone: string } {
  const v1h = info.volume1hUsd;
  const v24h = info.volume24hUsd;
  if (v1h == null || v24h == null || v24h <= 0) {
    return { label: "—", tone: "text-muted-foreground" };
  }
  const hourlyAvg = v24h / 24;
  if (hourlyAvg <= 0) return { label: "—", tone: "text-muted-foreground" };
  const ratio = v1h / hourlyAvg;
  if (ratio >= 1.25) return { label: "Rising", tone: "text-emerald-400" };
  if (ratio <= 0.75) return { label: "Cooling", tone: "text-rose-400" };
  return { label: "Steady", tone: "text-foreground" };
}

function buySellRatio(info: TokenInfo): {
  label: string;
  buyPct: number | null;
} {
  const b = info.buys24h;
  const s = info.sells24h;
  if (b == null || s == null || b + s === 0) return { label: "—", buyPct: null };
  const buyPct = (b / (b + s)) * 100;
  return { label: `${fmtInt(b)} / ${fmtInt(s)}`, buyPct };
}

/* ────────────────────────── Token Intelligence Panel ───────────────────── */

function IntelligencePanel({
  info,
  intel,
}: {
  info: TokenInfo;
  intel: TokenIntelligence | undefined;
}) {
  const trend = volumeTrend(info);
  const ratio = buySellRatio(info);
  const s = intel?.sentiment;

  return (
    <div className="rounded-2xl bg-card shadow-card p-4 md:p-5 border border-border/60">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-accent" />
        <h2 className="text-base font-semibold text-foreground">
          Token Intelligence
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Overview */}
        <div>
          <SectionHeader icon={BarChart3} title="Overview" />
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Market Cap" value={fmtMarketCap(info.marketCapUsd)} />
            <Tile label="Liquidity" value={fmtMarketCap(info.liquidityUsd)} />
            <Tile label="Volume 24h" value={fmtMarketCap(info.volume24hUsd)} />
            <Tile label="Age" value={fmtAge(info.pairCreatedAt)} />
            <Tile
              label="Buys 24h"
              value={fmtInt(info.buys24h)}
              accent={info.buys24h != null}
            />
            <Tile label="Sells 24h" value={fmtInt(info.sells24h)} />
            <SoonTile label="Holders" />
          </div>
        </div>

        {/* Market Activity */}
        <div>
          <SectionHeader icon={Activity} title="Market Activity" />
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Buy / Sell" value={ratio.label} />
            <Tile
              label="Buy Pressure"
              value={ratio.buyPct == null ? "—" : `${ratio.buyPct.toFixed(0)}%`}
              accent={ratio.buyPct != null && ratio.buyPct >= 50}
            />
            <Tile
              label="Volume Trend"
              value={<span className={trend.tone}>{trend.label}</span>}
              mono={false}
            />
            <Tile label="Vol 1h" value={fmtMarketCap(info.volume1hUsd)} />
            <SoonTile label="Largest Buy" />
            <SoonTile label="Largest Sell" />
          </div>
          {ratio.buyPct != null && (
            <div className="mt-2 h-1.5 rounded-full bg-rose-500/30 overflow-hidden">
              <div
                className="h-full bg-emerald-400/80"
                style={{ width: `${ratio.buyPct}%` }}
              />
            </div>
          )}
        </div>

        {/* Trader Sentiment */}
        <div>
          <SectionHeader icon={TrendingUp} title="Trader Sentiment" />
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Total Calls" value={fmtInt(s?.totalCalls ?? 0)} />
            <Tile
              label="Active Theses"
              value={fmtInt(s?.theses ?? 0)}
              accent={(s?.theses ?? 0) > 0}
            />
            <Tile
              label="Success Rate"
              value={
                s && s.gradedCalls > 0
                  ? fmtPercent(s.successRate * 100, 0)
                  : "—"
              }
              accent={s != null && s.gradedCalls > 0 && s.successRate >= 0.5}
            />
            <Tile label="Callers" value={fmtInt(s?.activeCallers ?? 0)} />
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-mono">
              High {s?.convictionHigh ?? 0}
            </span>
            <span className="px-2 py-1 rounded-full bg-accent/10 text-accent font-mono">
              Med {s?.convictionMedium ?? 0}
            </span>
            <span className="px-2 py-1 rounded-full bg-secondary/60 text-muted-foreground font-mono">
              Low {s?.convictionLow ?? 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Community Intelligence ──────────────────────── */

function CommunityCard({ intel }: { intel: TokenIntelligence | undefined }) {
  const c = intel?.community;
  const items: { icon: typeof Eye; label: string; value: number }[] = [
    { icon: Eye, label: "Watchers", value: c?.watchers ?? 0 },
    { icon: Megaphone, label: "Active Callers", value: c?.callers ?? 0 },
    { icon: BookOpen, label: "Journal Entries", value: c?.journalEntries ?? 0 },
    { icon: MessageSquare, label: "Theses Written", value: c?.theses ?? 0 },
  ];
  return (
    <div className="rounded-2xl bg-card shadow-card p-4 md:p-5 border border-border/60">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-accent" />
        <h2 className="text-base font-semibold text-foreground">
          Community Intelligence
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map((it) => (
          <div
            key={it.label}
            className="rounded-xl bg-secondary/30 border border-border/60 px-3 py-3 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
              <it.icon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-lg font-bold font-mono text-foreground leading-none">
                {fmtInt(it.value)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {it.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────────── Recent Theses ──────────────────────────── */

function RecentThesesCard({
  intel,
}: {
  intel: TokenIntelligence | undefined;
}) {
  const theses = intel?.recentTheses ?? [];
  return (
    <div className="rounded-2xl bg-card shadow-card p-4 md:p-5 border border-border/60">
      <div className="flex items-center gap-2 mb-1">
        <ScrollText className="w-4 h-4 text-accent" />
        <h2 className="text-base font-semibold text-foreground">
          Research Theses
        </h2>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Standalone research — not graded as calls.
      </p>
      {theses.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No theses yet — share your research on this token.
        </p>
      ) : (
        <div className="space-y-3">
          {theses.map((t) => {
            const sent = sentimentBadge(t.sentiment);
            return (
              <div
                key={t.id}
                className="flex items-start gap-3 rounded-xl bg-secondary/20 border border-border/60 px-3 py-2.5"
              >
                <Avatar url={t.x_avatar_url} name={t.x_display_name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {callerName(t.x_display_name, t.x_username)}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {timeAgo(t.created_at)}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-foreground mt-1 line-clamp-1">
                    {t.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {t.content}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wider font-semibold rounded-full px-2 py-0.5 border",
                        sent.cls,
                      )}
                    >
                      {sent.label}
                    </span>
                    {t.conviction && (
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wider font-medium",
                          convictionTone(t.conviction),
                        )}
                      >
                        {t.conviction} conviction
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────── Recent Callouts ─────────────────────────── */

function multipleTone(m: number | null): string {
  if (m == null) return "text-muted-foreground";
  if (m >= 2) return "text-emerald-400";
  if (m >= 1) return "text-foreground";
  return "text-rose-400";
}

function RecentCalloutsCard({
  intel,
}: {
  intel: TokenIntelligence | undefined;
}) {
  const callouts = intel?.recentCallouts ?? [];
  return (
    <div className="rounded-2xl bg-card shadow-card p-4 md:p-5 border border-border/60">
      <div className="flex items-center gap-2 mb-4">
        <Megaphone className="w-4 h-4 text-accent" />
        <h2 className="text-base font-semibold text-foreground">
          Recent Callouts
        </h2>
      </div>
      {callouts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No callouts on the record yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground text-left">
                <th className="font-medium py-2 pr-2">Caller</th>
                <th className="font-medium py-2 px-2 text-right">Called MC</th>
                <th className="font-medium py-2 px-2 text-right">Multiple</th>
                <th className="font-medium py-2 px-2 text-right">ATH</th>
                <th className="font-medium py-2 pl-2 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {callouts.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-border/40"
                >
                  <td className="py-2.5 pr-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar url={c.x_avatar_url} name={c.x_display_name} />
                      <span className="font-medium text-foreground truncate max-w-[120px]">
                        {callerName(c.x_display_name, c.x_username)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-muted-foreground">
                    {fmtMarketCap(c.call_market_cap)}
                  </td>
                  <td
                    className={cn(
                      "py-2.5 px-2 text-right font-mono font-semibold",
                      multipleTone(c.currentMultiple),
                    )}
                  >
                    {c.currentMultiple == null
                      ? "—"
                      : `${c.currentMultiple.toFixed(2)}x`}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-muted-foreground/60">
                    —
                  </td>
                  <td className="py-2.5 pl-2 text-right text-muted-foreground">
                    {timeAgo(c.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
            <Flame className="w-3 h-3" />
            ATH multiple tracking is coming soon — multiples shown are live.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Section wrapper ──────────────────────────── */

/**
 * Full Token Page V2 intelligence section: a premium analytics workstation
 * rendered below the chart. Fetches the per-token intelligence roll-up and lays
 * out the intelligence panel, community card, recent theses and recent callouts.
 */
export function TokenIntelligenceSection({ info }: { info: TokenInfo }) {
  const { data, isLoading } = useQuery({
    queryKey: ["token-intel", info.mint],
    queryFn: () => api.tokenIntelligence(info.mint),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <IntelligencePanel info={info} intel={data} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CommunityCard intel={data} />
        <RecentThesesCard intel={data} />
      </div>
      <RecentCalloutsCard intel={data} />
      {isLoading && !data && (
        <div className="flex items-center justify-center py-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}
    </div>
  );
}
