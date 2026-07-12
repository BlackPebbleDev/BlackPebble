import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  RefreshCw,
  Activity,
  Database,
  Server,
  Flag,
  ListOrdered,
  AlertTriangle,
  Loader2,
  Sparkles,
  Users,
  TrendingUp,
  Eye,
  UserPlus,
  Wrench,
  BarChart3,
  ShoppingCart,
  Tag,
  MessageSquare,
  ScrollText,
  BookOpen,
  EyeOff,
  Trash2,
  Megaphone,
  Award,
  BadgeCheck,
  ShieldCheck,
  Copy,
  Download,
  Search,
  ChevronRight,
  Brain,
  Gauge,
  LayoutDashboard,
} from "lucide-react";
import { useAdmin } from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import {
  api,
  type FeatureFlagKey,
  type FeatureFlags,
  type OfficialBadgeType,
  type ResetOptions,
  type RecoveryWindowStats,
  type AdminStatsWindow,
  type AdminTopToken,
  type AdminFunnel,
  type AdminSocialTestFilter,
  type AdminSocialFilters,
  type AdminCallout,
  type AdminThesis,
  type AdminJournalEntry,
  type AdminUserPreview,
  type ResetResult,
  type AdminAuditEntry,
  type AdminAuditFilters,
  type AchievementsAudit,
  type ApiError,
  type ProfileResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AdminSection,
  AdminNav,
  StatusChip,
  type AdminNavItem,
} from "@/components/admin-ui";
import {
  worstStatus,
  freshnessStatus,
  latencyStatus,
  boolStatus,
  toCsv,
  downloadFile,
  type StatusLevel,
} from "@/lib/admin-ops";
import { UserIdentity } from "@/components/user-identity";
import { ROLE_META, ROLE_ORDER } from "@/components/official-badge";
import { tierMeta } from "@/lib/tiers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function timeAgo(ts: number | null): string {
  if (!ts) return "never";
  // Accept either unix-seconds or unix-milliseconds (backends return both).
  const seconds = ts > 1e12 ? Math.floor(ts / 1000) : ts;
  // Clamp so a slightly-ahead server clock never renders a negative duration.
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Card({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-card shadow-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-foreground">
          <Icon className="h-4 w-4 text-accent" />
          {title}
        </h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-2 p-3 shadow-card">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-all font-mono text-xl text-foreground">
        {value}
      </div>
    </div>
  );
}

const FLAG_LABELS: Record<FeatureFlagKey, string> = {
  buy_limits: "Buy limit orders",
  tp_sl: "Take-profit / Stop-loss",
  multi_target_tp: "Multi-target take-profit",
  experimental_utilities: "Experimental utilities",
  leverage: "Leverage trading (longs)",
  real_trading_analysis: "Real Trading Analysis (on-chain intelligence)",
  community_campaigns: "Community Campaigns (escrow-backed funding)",
  public_paper_trading: "Enable Public Paper Trading + Perps",
};

// Optional one-line help shown under a flag's label in the admin panel. Only the
// flags that need extra context appear here; the rest render label-only.
const FLAG_DESCRIPTIONS: Partial<Record<FeatureFlagKey, string>> = {
  public_paper_trading:
    "Allows visitors to use Spot and Perps paper trading without X login. Hides X auth walls/nudges. Guest trades are demo/review trades and do not count toward public profiles, reputation, or leaderboards unless the user signs in.",
};

type FlagGroup = "Trading" | "Wallet & Intelligence" | "Community";
type FlagEnforcementKind = "full" | "client-only";

interface FlagMeta {
  group: FlagGroup;
  /** Code-verified enforcement classification (Phase 3 audit). */
  enforcement: FlagEnforcementKind;
  frontend: boolean;
  backend: boolean;
  /** Background worker / processor also respects it, where applicable. */
  worker?: boolean;
  dependsOn?: FeatureFlagKey[];
  /** Toggling requires an explicit confirmation modal. */
  highImpact?: boolean;
  note?: string;
}

/**
 * Enforcement classification for every flag, verified in code during the Phase 3
 * audit. `full` = frontend gates AND the backend independently rejects the
 * operation. `client-only` = the surface is client-side by design (no backend
 * endpoint exists to bypass), which is correct, not a defect.
 */
const FLAG_META: Record<FeatureFlagKey, FlagMeta> = {
  buy_limits: { group: "Trading", enforcement: "full", frontend: true, backend: true },
  tp_sl: { group: "Trading", enforcement: "full", frontend: true, backend: true },
  multi_target_tp: {
    group: "Trading",
    enforcement: "full",
    frontend: true,
    backend: true,
    dependsOn: ["tp_sl"],
    note: "A 2nd+ take-profit on a position requires this flag; the backend enforces it via the existing take-profit count.",
  },
  leverage: {
    group: "Trading",
    enforcement: "full",
    frontend: true,
    backend: true,
    worker: true,
    highImpact: true,
    note: "Opening perps + new exit orders are gated; closing existing positions is always allowed. The liquidation sweep runs server-side.",
  },
  public_paper_trading: {
    group: "Trading",
    enforcement: "client-only",
    frontend: true,
    backend: false,
    highImpact: true,
    note: "Guest paper trading runs entirely client-side; there is no separate backend guest-trade endpoint to bypass.",
  },
  experimental_utilities: {
    group: "Wallet & Intelligence",
    enforcement: "client-only",
    frontend: true,
    backend: false,
    highImpact: true,
    note: "Gates client-side experimental utility surfaces (e.g. trade planner).",
  },
  real_trading_analysis: {
    group: "Wallet & Intelligence",
    enforcement: "full",
    frontend: true,
    backend: true,
    highImpact: true,
    note: "The backend returns 404 on every /real-analysis route when disabled.",
  },
  community_campaigns: {
    group: "Community",
    enforcement: "full",
    frontend: true,
    backend: true,
    highImpact: true,
    note: "The backend returns 404 on every /campaigns route when disabled.",
  },
};

const FLAG_GROUP_ORDER: FlagGroup[] = [
  "Trading",
  "Wallet & Intelligence",
  "Community",
];

const STATS_WINDOWS: { key: AdminStatsWindow; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "all", label: "Lifetime" },
];

function WindowSelector({
  value,
  onChange,
}: {
  value: AdminStatsWindow;
  onChange: (w: AdminStatsWindow) => void;
}) {
  return (
    <div className="flex items-center gap-1" data-testid="stats-window-selector">
      {STATS_WINDOWS.map((w) => (
        <button
          key={w.key}
          type="button"
          onClick={() => onChange(w.key)}
          data-testid={`stats-window-${w.key}`}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === w.key
              ? "bg-accent text-accent-foreground"
              : "bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-3",
          )}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

function TokenList({
  title,
  icon,
  tokens,
  metric,
}: {
  title: string;
  icon: typeof Sparkles;
  tokens: AdminTopToken[];
  metric: (t: AdminTopToken) => string;
}) {
  return (
    <Card title={title} icon={icon}>
      {tokens.length === 0 ? (
        <div className="text-sm text-muted-foreground">No trades in this window.</div>
      ) : (
        <div className="space-y-1">
          {tokens.map((t) => (
            <div
              key={t.token_mint}
              className="flex items-center justify-between border-b border-border/60 py-1.5 text-sm last:border-0"
            >
              <span className="font-medium text-foreground">
                {t.token_symbol || `${t.token_mint.slice(0, 4)}…`}
              </span>
              <span className="font-mono text-muted-foreground">{metric(t)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const FUNNEL_STAGES: { key: keyof AdminFunnel; label: string }[] = [
  { key: "guest_sessions", label: "Guest Sessions" },
  { key: "wallet_searches", label: "Wallet Searches" },
  { key: "token_views", label: "Token Views" },
  { key: "first_trade", label: "First Trade" },
  { key: "second_trade", label: "Second Trade" },
  { key: "x_connect", label: "X Connect" },
  { key: "registration", label: "Registration" },
];

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return (n / d) * 100;
}

/**
 * Guest funnel visualization - full journey with per-stage counts, conversion %
 * (vs the previous stage), and dropoff %. Windowed via the parent's selector.
 */
function GuestFunnel({ funnel }: { funnel?: AdminFunnel }) {
  const rows = FUNNEL_STAGES.map((s, i) => {
    const count = funnel?.[s.key] ?? 0;
    const prev = i === 0 ? count : (funnel?.[FUNNEL_STAGES[i - 1].key] ?? 0);
    const conversion = i === 0 ? 100 : pct(count, prev);
    const dropoff = i === 0 ? 0 : 100 - conversion;
    return { ...s, count, conversion, dropoff };
  });
  const top = rows[0]?.count ?? 0;
  const final = rows[rows.length - 1]?.count ?? 0;
  const overall = pct(final, top);

  // Biggest dropoff stage (skip the first stage, which has no previous).
  const worst = rows
    .slice(1)
    .reduce<(typeof rows)[number] | null>(
      (acc, r) => (acc == null || r.dropoff > acc.dropoff ? r : acc),
      null,
    );

  return (
    <Card title="Guest Funnel" icon={UserPlus}>
      {/* Analytics summary */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Top of funnel" value={fmt(top)} />
        <Stat label="Overall conversion" value={`${fmt(overall, 1)}%`} />
        <Stat
          label="Biggest dropoff"
          value={
            worst && top > 0 ? `${worst.label} · ${fmt(worst.dropoff, 1)}%` : "—"
          }
        />
      </div>

      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <div key={r.key} data-testid={`funnel-stage-${r.key}`}>
            <div className="mb-1 flex items-end justify-between gap-2">
              <span className="text-xs font-medium text-foreground">
                <span className="text-muted-foreground">{i + 1}.</span>{" "}
                {r.label}
              </span>
              <span className="font-mono text-sm text-foreground">
                {fmt(r.count)}
              </span>
            </div>
            <div className="relative h-7 overflow-hidden border border-border bg-background/40">
              <div
                className="absolute inset-y-0 left-0 bg-accent/25"
                style={{ width: `${Math.min(pct(r.count, top), 100)}%` }}
              />
              <div className="relative flex h-full items-center justify-between px-2 text-[11px]">
                <span className="text-muted-foreground">
                  {i === 0 ? "entry" : `${fmt(r.conversion, 1)}% of prev`}
                </span>
                {i > 0 && r.dropoff > 0 && (
                  <span className="font-mono text-destructive">
                    −{fmt(r.dropoff, 1)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatsSection() {
  const [window, setWindow] = useState<AdminStatsWindow>("24h");
  const { data, isFetching } = useQuery({
    queryKey: ["admin-stats", window],
    queryFn: () => api.admin.stats(window),
    refetchInterval: 30_000,
  });
  const users = data?.users;
  const trading = data?.trading;
  const feed = data?.feed;
  const totals = data?.totals;
  const topTokens = data?.tokens ?? [];
  const tokensByVolume = data?.tokens_by_volume ?? [];
  const tokensByBuys = data?.tokens_by_buys ?? [];
  const tokensBySells = data?.tokens_by_sells ?? [];

  const selector = (
    <div className="flex items-center gap-2">
      {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      <WindowSelector value={window} onChange={setWindow} />
    </div>
  );

  return (
    <div className="space-y-6">
      <Card title="Users" icon={Users} action={selector}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="New users" value={fmt(users?.new_users)} />
          <Stat label="Guest users" value={fmt(users?.guest_users)} />
          <Stat label="X sign-ups" value={fmt(users?.x_users)} />
          <Stat label="Returning users" value={fmt(users?.returning_users)} />
          <Stat label="Active users" value={fmt(users?.active_users)} />
        </div>
      </Card>

      <Card title="Trading" icon={TrendingUp}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Total trades" value={fmt(trading?.trades)} />
          <Stat label="Spot trades" value={fmt(trading?.spot_trades)} />
          <Stat label="Leverage trades" value={fmt(trading?.leverage_trades)} />
          <Stat label="Buy count" value={fmt(trading?.buys)} />
          <Stat label="Sell count" value={fmt(trading?.sells)} />
          <Stat label="Unique traders" value={fmt(trading?.unique_traders)} />
          <Stat label="Total volume" value={`${fmt(trading?.volume_sol, 1)} SOL`} />
          <Stat label="Avg trade size" value={`${fmt(trading?.avg_trade_size, 2)} SOL`} />
          <Stat label="Largest trade" value={`${fmt(trading?.largest_trade, 2)} SOL`} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <TokenList
          title="Most Traded Tokens"
          icon={Sparkles}
          tokens={topTokens}
          metric={(t) => `${fmt(t.trades)} trades · ${fmt(t.volume_sol, 1)} SOL`}
        />
        <TokenList
          title="Highest Volume Tokens"
          icon={BarChart3}
          tokens={tokensByVolume}
          metric={(t) => `${fmt(t.volume_sol, 1)} SOL · ${fmt(t.trades)} trades`}
        />
        <TokenList
          title="Most Bought Tokens"
          icon={ShoppingCart}
          tokens={tokensByBuys}
          metric={(t) => `${fmt(t.trades)} buys · ${fmt(t.volume_sol, 1)} SOL`}
        />
        <TokenList
          title="Most Sold Tokens"
          icon={Tag}
          tokens={tokensBySells}
          metric={(t) => `${fmt(t.trades)} sells · ${fmt(t.volume_sol, 1)} SOL`}
        />
      </div>

      <GuestFunnel funnel={data?.funnel} />

      <Card title="Feed & Social" icon={Eye}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Feed views" value={fmt(feed?.feed_views)} />
          <Stat label="Profile views" value={fmt(feed?.profile_views)} />
          <Stat label="New follows" value={fmt(feed?.follows)} />
        </div>
      </Card>

      <Card title="Lifetime Totals" icon={Database}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Registered users" value={fmt(totals?.users)} />
          <Stat label="Accounts" value={fmt(totals?.accounts)} />
          <Stat label="Wallet links" value={fmt(totals?.wallet_links)} />
          <Stat label="X links" value={fmt(totals?.x_links)} />
          <Stat label="Open positions" value={fmt(totals?.positions)} />
          <Stat label="Active orders" value={fmt(totals?.active_orders)} />
          <Stat label="Leaderboard users" value={fmt(totals?.leaderboard_users)} />
          <Stat label="Portfolio views" value={fmt(totals?.portfolio_views)} />
          <Stat label="Leaderboard views" value={fmt(totals?.leaderboard_views)} />
        </div>
      </Card>
    </div>
  );
}

function HealthSection() {
  const qc = useQueryClient();
  const { data, isFetching } = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => api.admin.health(),
    refetchInterval: 30_000,
  });
  const dot = (ok: boolean) =>
    ok ? "bg-emerald-400" : "bg-red-400";
  return (
    <Card
      title="System health"
      icon={Server}
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["admin-health"] })}
          disabled={isFetching}
          data-testid="button-refresh-health"
        >
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${dot(!!data?.api.ok)}`} />
          <Server className="h-4 w-4 text-muted-foreground" /> API · up{" "}
          {fmt(data?.api.uptimeSeconds)}s · {data?.api.node}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${dot(!!data?.db.ok)}`} />
          <Database className="h-4 w-4 text-muted-foreground" /> Database ·{" "}
          {data?.db.latencyMs != null ? `${data.db.latencyMs}ms` : "—"}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${dot(!!data?.market.pumpportalConnected)}`} />
          <Activity className="h-4 w-4 text-muted-foreground" /> Live feed ·{" "}
          {data?.market.pumpportalConnected ? "connected" : "disconnected"}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Server className="h-4 w-4" /> Memory · {fmt(data?.memory.rssMb)}MB RSS
        </div>
      </div>
    </Card>
  );
}

function MarketSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => api.admin.health(),
  });
  const refresh = useMutation({
    mutationFn: () => api.admin.refreshMarket(),
    onSuccess: (r) => {
      toast({ title: "Market cache refreshed", description: `${r.tokenCount} tokens loaded.` });
      qc.invalidateQueries({ queryKey: ["admin-health"] });
    },
    onError: (e: Error) => toast({ title: "Refresh failed", description: e.message, variant: "destructive" }),
  });
  return (
    <Card
      title="Market cache"
      icon={RefreshCw}
      action={
        <Button
          size="sm"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          data-testid="button-refresh-market"
        >
          {refresh.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Force refresh
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Tokens cached" value={fmt(data?.market.tokenCount)} />
        <Stat label="Last updated" value={timeAgo(data?.market.lastUpdated ?? null)} />
        <Stat
          label="Cache age"
          value={data?.market.cacheAge != null ? `${data.market.cacheAge}s` : "—"}
        />
      </div>
    </Card>
  );
}

function EnforcementChip({ meta }: { meta: FlagMeta }) {
  if (meta.enforcement === "full") {
    return <StatusChip level="healthy" label="Fully Enforced" />;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-sky-400/70" aria-hidden />
      Client-side
    </span>
  );
}

function FlagCard({
  flagKey,
  flags,
  history,
  onToggle,
  pending,
}: {
  flagKey: FeatureFlagKey;
  flags: FeatureFlags;
  history: AdminAuditEntry[];
  onToggle: (key: FeatureFlagKey, enabled: boolean) => void;
  pending: boolean;
}) {
  const meta = FLAG_META[flagKey];
  const [open, setOpen] = useState(false);
  const enabled = !!flags[flagKey];

  // Dependency: can't enable when a required parent flag is off.
  const missingDep = (meta.dependsOn ?? []).filter((d) => !flags[d]);
  const blockedByDep = !enabled && missingDep.length > 0;
  const depDisabledWhileOn = enabled && missingDep.length > 0;

  const last = history[0];
  const targetState = !enabled;
  const impactMsg = `${FLAG_LABELS[flagKey]} will be ${targetState ? "ENABLED" : "DISABLED"}.${
    meta.note ? ` ${meta.note}` : ""
  }`;

  const Toggle = (
    <Switch
      checked={enabled}
      disabled={pending || blockedByDep}
      onCheckedChange={(v) => onToggle(flagKey, v)}
      data-testid={`switch-flag-${flagKey}`}
      className="mt-0.5 shrink-0"
    />
  );

  return (
    <div
      className="rounded-xl border border-border/60 bg-background/40 p-3"
      data-testid={`flag-card-${flagKey}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {FLAG_LABELS[flagKey]}
            </span>
            <EnforcementChip meta={meta} />
            {depDisabledWhileOn && (
              <StatusChip level="warning" label="Dependency disabled" />
            )}
          </div>
          {(FLAG_DESCRIPTIONS[flagKey] || meta.note) && (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {FLAG_DESCRIPTIONS[flagKey] ?? meta.note}
            </p>
          )}
        </div>
        {/* High-impact toggles require a confirmation modal. */}
        {meta.highImpact && !blockedByDep ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="mt-0.5 shrink-0"
                data-testid={`switch-flag-${flagKey}`}
                aria-label={`Toggle ${FLAG_LABELS[flagKey]}`}
              >
                <span className="pointer-events-none">
                  <Switch checked={enabled} className="pointer-events-none" />
                </span>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {targetState ? "Enable" : "Disable"} {FLAG_LABELS[flagKey]}?
                </AlertDialogTitle>
                <AlertDialogDescription>{impactMsg}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onToggle(flagKey, targetState)}>
                  {targetState ? "Enable" : "Disable"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          Toggle
        )}
      </div>

      {blockedByDep && (
        <p className="mt-2 text-[11px] text-amber-400">
          Requires{" "}
          {missingDep.map((d) => FLAG_LABELS[d]).join(", ")} to be enabled first.
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {last
            ? `Changed by ${last.admin_handle ? `@${last.admin_handle}` : last.admin_x_id ?? "admin"} ${timeAgo(Date.parse(last.created_at) / 1000)}`
            : "No recorded changes"}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[11px] font-medium text-accent hover:underline"
        >
          {open ? "Hide" : "Details"}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-2 border-t border-border/50 pt-2 text-[11px]">
          <div className="flex flex-wrap gap-1.5">
            <EnfPill label="Frontend" on={meta.frontend} />
            <EnfPill label="Backend" on={meta.backend} />
            {meta.worker != null && <EnfPill label="Worker" on={meta.worker} />}
          </div>
          {meta.dependsOn && meta.dependsOn.length > 0 && (
            <div className="text-muted-foreground">
              Depends on: {meta.dependsOn.map((d) => FLAG_LABELS[d]).join(", ")}
            </div>
          )}
          {meta.note && <div className="text-muted-foreground">{meta.note}</div>}
          {history.length > 0 && (
            <div>
              <div className="mb-1 text-muted-foreground">Recent changes</div>
              <div className="space-y-0.5">
                {history.slice(0, 5).map((h) => (
                  <div key={h.id} className="flex justify-between gap-2">
                    <span className="truncate text-foreground">
                      {h.admin_handle ? `@${h.admin_handle}` : h.admin_x_id ?? "admin"}
                      {(() => {
                        const a = h.after_state as { enabled?: boolean } | null;
                        return a && typeof a.enabled === "boolean"
                          ? ` → ${a.enabled ? "on" : "off"}`
                          : "";
                      })()}
                    </span>
                    <span className="flex-shrink-0 text-muted-foreground">
                      {timeAgo(Date.parse(h.created_at) / 1000)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EnfPill({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
        on
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
          : "border-border/60 bg-secondary/30 text-muted-foreground",
      )}
    >
      {label}: {on ? "enforced" : "n/a"}
    </span>
  );
}

/**
 * Feature Flags control center: grouped operational cards with code-verified
 * enforcement status, dependencies, last-modified (from the audit log) and
 * per-flag change history. High-impact toggles confirm before applying.
 */
function FlagsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-feature-flags"],
    queryFn: () => api.admin.featureFlags(),
  });
  const { data: audit } = useQuery({
    queryKey: ["admin-flag-audit"],
    queryFn: () => api.admin.auditLog({ action: "feature-flag", limit: 50 }),
  });

  const setFlag = useMutation({
    mutationFn: ({ key, enabled }: { key: FeatureFlagKey; enabled: boolean }) =>
      api.admin.setFeatureFlag(key, enabled),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-feature-flags"] });
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
      qc.invalidateQueries({ queryKey: ["admin-flag-audit"] });
      toast({
        title: `${FLAG_LABELS[vars.key]} ${vars.enabled ? "enabled" : "disabled"}`,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const flags = data?.flags;
  const historyByKey = useMemo(() => {
    const m = new Map<string, AdminAuditEntry[]>();
    for (const e of audit?.entries ?? []) {
      if (!e.target_id) continue;
      const list = m.get(e.target_id) ?? [];
      list.push(e);
      m.set(e.target_id, list);
    }
    return m;
  }, [audit]);

  return (
    <Card title="Feature flags" icon={Flag}>
      {!flags ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {FLAG_GROUP_ORDER.map((group) => {
            const keys = (Object.keys(FLAG_META) as FeatureFlagKey[]).filter(
              (k) => FLAG_META[k].group === group,
            );
            return (
              <div key={group}>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </div>
                <div className="space-y-2">
                  {keys.map((key) => (
                    <FlagCard
                      key={key}
                      flagKey={key}
                      flags={flags}
                      history={historyByKey.get(key) ?? []}
                      pending={setFlag.isPending}
                      onToggle={(k, enabled) => setFlag.mutate({ key: k, enabled })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function BadgesSection() {
  const [handle, setHandle] = useState("");
  const [badgeType, setBadgeType] = useState<OfficialBadgeType>("bp_team");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: "assign" | "remove") {
    const h = handle.trim();
    if (!h) return;
    setResult(null);
    setError(null);
    setBusy(true);
    try {
      const label = ROLE_META[badgeType].label;
      if (action === "assign") {
        const res = await api.admin.assignOfficialBadge(h, badgeType);
        setResult(`Assigned ${label} badge to @${res.x_username}`);
      } else {
        await api.admin.removeOfficialBadge(h, badgeType);
        setResult(`Removed ${label} badge.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Official Badges" icon={Award}>
      <p className="text-sm text-muted-foreground mb-4">
        Assign or remove Founder and BlackPebble Team badges by X handle. Badges
        display on profiles and leaderboard cards.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <Input
          placeholder="X handle (e.g. PumpGunna)"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          className="flex-1"
        />
        <select
          value={badgeType}
          onChange={(e) => setBadgeType(e.target.value as OfficialBadgeType)}
          className="h-10 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {ROLE_ORDER.map((t) => (
            <option key={t} value={t}>
              {ROLE_META[t].label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => act("assign")}
          disabled={busy || !handle.trim()}
          size="sm"
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Assign Badge"
          )}
        </Button>
        <Button
          onClick={() => act("remove")}
          disabled={busy || !handle.trim()}
          size="sm"
          variant="outline"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Remove Badge"
          )}
        </Button>
      </div>
      {result && (
        <div className="mt-3 rounded-lg bg-emerald-950/40 border border-emerald-700/40 px-4 py-2 text-sm text-success">
          {result}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg bg-red-950/40 border border-red-700/40 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}
    </Card>
  );
}

function VerificationSection() {
  const [handle, setHandle] = useState("");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    const h = handle.trim().replace(/^@/, "");
    if (!h) return;
    setError(null);
    setProfile(null);
    setBusy(true);
    try {
      setProfile(await api.profiles.get(h));
    } catch (err) {
      setError(err instanceof Error ? err.message : "User not found");
    } finally {
      setBusy(false);
    }
  }

  const badges = profile?.officialBadges ?? [];
  const tier = profile ? tierMeta(profile.graduationTier) : null;

  return (
    <Card title="Reputation Verification" icon={BadgeCheck}>
      <p className="mb-4 text-sm text-muted-foreground">
        Look up any user by X handle to verify their official badges and tier
        exactly as they render across the app. Read-only - no changes are made.
      </p>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="X handle (e.g. PumpGunna)"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") verify();
          }}
          className="flex-1"
          data-testid="input-verify-handle"
        />
        <Button
          onClick={verify}
          disabled={busy || !handle.trim()}
          size="sm"
          className="bg-accent text-accent-foreground hover:bg-accent/90"
          data-testid="button-verify-user"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-700/40 bg-red-950/40 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {profile && tier && (
        <div
          className="rounded-xl bg-surface-2 p-4 shadow-card"
          data-testid="verify-result"
        >
          <UserIdentity
            avatarUrl={profile.x_avatar_url}
            displayName={profile.x_display_name}
            handle={profile.x_username}
            officialBadges={profile.officialBadges}
            tier={profile.graduationTier}
            size="lg"
          />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Tier" value={tier.name} />
            <Stat
              label="Roles"
              value={
                badges.length
                  ? ROLE_ORDER.filter((t) => badges.includes(t))
                      .map((t) => ROLE_META[t].label)
                      .join(", ")
                  : "None"
              }
            />
            <Stat
              label="Realized P&L"
              value={`${fmt(profile.stats.realizedPnlSol, 2)} SOL`}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

function OrdersSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const [user, setUser] = useState("");
  const filters = useMemo(() => ({ token, user }), [token, user]);
  const { data, isFetching } = useQuery({
    queryKey: ["admin-orders", filters],
    queryFn: () => api.admin.orders(filters),
  });
  const cancel = useMutation({
    mutationFn: (id: number) => api.admin.cancelOrder(id),
    onSuccess: () => {
      toast({ title: "Order canceled" });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e: Error) => toast({ title: "Cancel failed", description: e.message, variant: "destructive" }),
  });
  const orders = data?.orders ?? [];
  return (
    <Card
      title="Order management"
      icon={ListOrdered}
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["admin-orders"] })}
          disabled={isFetching}
          data-testid="button-refresh-orders"
        >
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      }
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Filter by token symbol / mint"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="sm:max-w-xs"
          data-testid="input-filter-token"
        />
        <Input
          placeholder="Filter by wallet"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          className="sm:max-w-xs"
          data-testid="input-filter-user"
        />
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-2 pr-2">Token</th>
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2">Trigger</th>
              <th className="py-2 pr-2">Wallet</th>
              <th className="py-2 pr-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  No active orders.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="border-t border-border/60">
                  <td className="py-2 pr-2 font-mono">{o.token_symbol ?? o.token_mint.slice(0, 6)}</td>
                  <td className="py-2 pr-2">{o.order_type}</td>
                  <td className="py-2 pr-2 font-mono">
                    {o.trigger_direction === "gte" ? "≥" : "≤"} {fmt(o.trigger_value)}
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">
                    {o.wallet.slice(0, 10)}…
                  </td>
                  <td className="py-2 pr-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancel.mutate(o.id)}
                      disabled={cancel.isPending}
                      data-testid={`button-cancel-order-${o.id}`}
                    >
                      Cancel
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const RESET_TOGGLES: { key: keyof ResetOptions; label: string; defaultOn: boolean }[] = [
  { key: "resetBalance", label: "Reset balance to 100 SOL (+ bump season)", defaultOn: true },
  { key: "clearPositions", label: "Clear open positions", defaultOn: true },
  { key: "clearOrders", label: "Clear pending orders", defaultOn: true },
  { key: "clearTrades", label: "Clear trade history", defaultOn: false },
  { key: "resetLeaderboard", label: "Reset leaderboard / competition stats", defaultOn: false },
  { key: "clearWatchlist", label: "Clear watchlist", defaultOn: false },
  { key: "clearLeverage", label: "Clear leverage positions & trades", defaultOn: false },
];

/** Compact avatar + identity header for a resolved admin user preview. */
function PreviewIdentity({ preview }: { preview: AdminUserPreview }) {
  const id = preview.identity;
  const name = id?.xDisplayName || id?.xUsername || "Guest account";
  return (
    <div className="flex items-center gap-3">
      {id?.xAvatarUrl ? (
        <img
          src={id.xAvatarUrl}
          alt=""
          className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Users className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {name}
          </span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
              preview.registered
                ? "bg-accent/15 text-accent"
                : "bg-secondary text-muted-foreground",
            )}
          >
            {preview.registered ? "Registered" : "Guest"}
          </span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {id?.xUsername ? `@${id.xUsername}` : preview.accountKey}
          {preview.matchedBy ? ` · matched by ${preview.matchedBy}` : ""}
        </div>
      </div>
    </div>
  );
}

/** The rich, read-only preview shown before any destructive single-user action. */
function ResetUserPreview({ preview }: { preview: AdminUserPreview }) {
  return (
    <div
      className="space-y-3 rounded-xl border border-border bg-background/40 p-3"
      data-testid="reset-user-preview"
    >
      <PreviewIdentity preview={preview} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Account key" value={preview.accountKey ?? "—"} />
        <Stat label="X id" value={preview.identity?.xId ?? "—"} />
        <Stat label="Internal id" value={preview.identity?.userId != null ? String(preview.identity.userId) : "—"} />
        <Stat label="Balance" value={preview.balance != null ? `${fmt(preview.balance, 2)} SOL` : "—"} />
        <Stat label="Season" value={preview.season != null ? String(preview.season) : "—"} />
        <Stat label="Tier" value={preview.tier ?? "—"} />
        <Stat label="Open spot" value={fmt(preview.openSpotPositions)} />
        <Stat label="Open perps" value={fmt(preview.openPerpsPositions)} />
        <Stat label="Active orders" value={fmt(preview.activeOrders)} />
        <Stat label="Closed trades" value={fmt(preview.closedTrades)} />
        <Stat label="Executions" value={fmt(preview.executions)} />
        <Stat label="Watchlist" value={fmt(preview.watchlistCount)} />
        <Stat label="Rank" value={preview.rank != null ? `#${preview.rank}` : "Unranked"} />
        <Stat label="Trust" value={preview.trustScore != null ? String(preview.trustScore) : "—"} />
        <Stat label="Created" value={timeAgo(preview.createdAt)} />
      </div>
      {preview.connectedWallet && (
        <div className="text-xs text-muted-foreground">
          Connected wallet: <code>{shortWallet(preview.connectedWallet)}</code>
        </div>
      )}
      {preview.officialBadges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {preview.officialBadges.map((b) => (
            <span
              key={b}
              className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent"
            >
              {b}
            </span>
          ))}
        </div>
      )}
      {!preview.hasAccount && (
        <p className="text-xs text-warning/80">
          This user has no paper-trading account yet, so there is nothing to
          reset.
        </p>
      )}
    </div>
  );
}

interface ResetErrorInfo {
  status?: number;
  message: string;
  stage?: string;
  correlationId?: string;
  accountKey?: string;
}

/**
 * Admin-only reset diagnostics panel. Surfaces the REAL backend failure (status,
 * message, failing pipeline stage, correlation id, target account key) instead
 * of a generic toast, with a copy-diagnostics button. No secrets, SQL, tokens,
 * env vars, or stack traces are shown - only the sanitized fields the backend
 * returns for an admin.
 */
function ResetDiagnostics({
  info,
  onDismiss,
}: {
  info: ResetErrorInfo;
  onDismiss: () => void;
}) {
  const { toast } = useToast();
  const lines = [
    `Reset failed`,
    info.stage ? `Stage: ${info.stage}` : null,
    info.status != null ? `Status: ${info.status}` : null,
    `Message: ${info.message}`,
    info.correlationId ? `Correlation ID: ${info.correlationId}` : null,
    info.accountKey ? `Account key: ${info.accountKey}` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      className="space-y-2 rounded-xl border border-danger/40 bg-red-400/5 p-3"
      data-testid="reset-diagnostics"
      role="alert"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-danger">Reset failed</span>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(lines.join("\n"));
              toast({ title: "Diagnostics copied" });
            }}
            data-testid="button-copy-diagnostics"
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
        {info.stage && (
          <>
            <dt className="text-muted-foreground">Stage</dt>
            <dd className="font-mono text-foreground">{info.stage}</dd>
          </>
        )}
        {info.status != null && (
          <>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-mono text-foreground">{info.status}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Message</dt>
        <dd className="break-words font-mono text-foreground">{info.message}</dd>
        {info.correlationId && (
          <>
            <dt className="text-muted-foreground">Correlation</dt>
            <dd className="break-all font-mono text-foreground">
              {info.correlationId}
            </dd>
          </>
        )}
        {info.accountKey && (
          <>
            <dt className="text-muted-foreground">Account</dt>
            <dd className="break-all font-mono text-foreground">
              {info.accountKey}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

const ALL_RESET_PHRASE = "RESET ALL";

function ResetSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [identifier, setIdentifier] = useState("");
  const [preview, setPreview] = useState<AdminUserPreview | null>(null);
  const [idemKey, setIdemKey] = useState("");
  const [resetError, setResetError] = useState<ResetErrorInfo | null>(null);
  const [allConfirm, setAllConfirm] = useState("");
  const [options, setOptions] = useState<ResetOptions>(() =>
    Object.fromEntries(RESET_TOGGLES.map((t) => [t.key, t.defaultOn])) as ResetOptions,
  );

  const resolve = useMutation({
    mutationFn: () => api.admin.resolveUser(identifier.trim()),
    onSuccess: (r) => {
      setPreview(r.preview);
      setResetError(null);
      // One stable idempotency key per resolved user, so a double-submit of the
      // same reset is deduped server-side.
      setIdemKey(crypto.randomUUID());
    },
    onError: (e: Error) => {
      setPreview(null);
      toast({ title: "Could not resolve user", description: e.message, variant: "destructive" });
    },
  });

  const resetUser = useMutation({
    mutationFn: (key: string) => api.admin.resetUser(key, options, idemKey),
    onSuccess: (r: ResetResult) => {
      if (r.nothingChanged) {
        toast({
          title: "Nothing changed",
          description: r.warning ?? "The resolved account had no data to reset.",
          variant: "destructive",
        });
      } else {
        const total = Object.values(r.deleted).reduce((a, b) => a + b, 0);
        toast({
          title: r.deduped ? "Already applied" : "User reset complete",
          description: `${total} rows backed up + cleared; ${r.accountsReset} account(s) reset. Applied: ${r.applied.join(", ") || "none"}.${r.correlationId ? ` Ref ${r.correlationId.slice(0, 8)}.` : ""}`,
        });
      }
      setResetError(null);
      qc.invalidateQueries();
      if (identifier.trim()) resolve.mutate(); // refresh the preview + rotate key
    },
    onError: (e: Error) => {
      const ae = e as ApiError;
      const body = (ae.data ?? {}) as {
        stage?: string;
        correlationId?: string;
        accountKey?: string;
      };
      setResetError({
        status: ae.status,
        message: e.message,
        stage: body.stage,
        correlationId: body.correlationId,
        accountKey: body.accountKey ?? preview?.accountKey ?? undefined,
      });
      toast({ title: "Reset failed", description: e.message, variant: "destructive" });
    },
  });

  const resetAll = useMutation({
    mutationFn: () => api.admin.resetAll(options, crypto.randomUUID()),
    onSuccess: (r: ResetResult) => {
      const total = Object.values(r.deleted).reduce((a, b) => a + b, 0);
      toast({
        title: "Global reset complete",
        description: `${total} rows backed up + cleared; ${r.accountsReset} accounts reset.${r.correlationId ? ` Ref ${r.correlationId.slice(0, 8)}.` : ""}`,
      });
      setAllConfirm("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast({ title: "Reset failed", description: e.message, variant: "destructive" }),
  });

  const toggle = (key: keyof ResetOptions, v: boolean) =>
    setOptions((o) => ({ ...o, [key]: v }));

  const canReset = !!preview?.found && !!preview.accountKey;

  return (
    <Card title="Paper-trading reset" icon={AlertTriangle}>
      <p className="mb-3 text-sm text-muted-foreground">
        Affected rows are snapshotted into the <code>reset_backups</code> schema before deletion.
        Identities and wallet / X links are always preserved.
      </p>
      <div className="mb-4 space-y-2">
        {RESET_TOGGLES.map((t) => (
          <label key={t.key} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={!!options[t.key]}
              onCheckedChange={(v) => toggle(t.key, v === true)}
              data-testid={`checkbox-${t.key}`}
            />
            {t.label}
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Single user: resolve -> preview -> confirm */}
        <div className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Single user
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="@handle, X id, internal id, x:<id>, or wallet"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setPreview(null);
                setResetError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && identifier.trim()) resolve.mutate();
              }}
              data-testid="input-reset-wallet"
            />
            <Button
              variant="outline"
              onClick={() => resolve.mutate()}
              disabled={!identifier.trim() || resolve.isPending}
              data-testid="button-resolve-user"
            >
              {resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look up"}
            </Button>
          </div>

          {preview?.found && <ResetUserPreview preview={preview} />}

          {resetError && (
            <ResetDiagnostics
              info={resetError}
              onDismiss={() => setResetError(null)}
            />
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="w-full"
                disabled={!canReset || resetUser.isPending}
                data-testid="button-reset-user"
              >
                {resetUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset this user
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Reset {preview?.identity?.xUsername ? `@${preview.identity.xUsername}` : preview?.accountKey}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This applies the selected actions to this single account
                  (<code>{preview?.accountKey}</code>). A backup is taken first,
                  but this cannot be undone from the UI.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => canReset && resetUser.mutate(preview!.accountKey!)}
                >
                  Reset user
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* All users: harder to trigger (typed phrase + modal) */}
        <div className="space-y-3 rounded-xl border border-danger/30 bg-red-400/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-danger">
            All users - danger zone
          </div>
          <p className="text-xs text-muted-foreground">
            Applies the selected actions to every account on the platform. Type
            <code className="mx-1">{ALL_RESET_PHRASE}</code> to unlock.
          </p>
          <Input
            placeholder={`Type ${ALL_RESET_PHRASE} to confirm`}
            value={allConfirm}
            onChange={(e) => setAllConfirm(e.target.value)}
            data-testid="input-reset-all-confirm"
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full"
                disabled={allConfirm.trim() !== ALL_RESET_PHRASE || resetAll.isPending}
                data-testid="button-reset-all"
              >
                {resetAll.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset ALL users
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset every account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This applies the selected actions across the ENTIRE platform.
                  Affected rows are backed up to <code>reset_backups</code> first,
                  but this is a destructive, global action.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-500 text-white hover:bg-red-600"
                  onClick={() => resetAll.mutate()}
                >
                  Reset all users
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "reset-user": "User reset",
  "reset-all": "All-user reset",
  "reset-test-data": "Purge test data",
  "reset-social": "Reset social",
  "reset-journal": "Reset journal",
  "full-reset": "Full reset",
  "feature-flag": "Feature flag",
  "badge-assign": "Badge assigned",
  "badge-remove": "Badge removed",
  "order-cancel": "Order canceled",
  "market-refresh": "Market cache refresh",
};

function auditActionLabel(a: string): string {
  return AUDIT_ACTION_LABELS[a] ?? a;
}

/** One expandable audit row (mobile-friendly card). */
function AuditRow({ e }: { e: AdminAuditEntry }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const detail = (label: string, value: React.ReactNode) =>
    value != null && value !== "" ? (
      <div className="flex flex-wrap gap-x-2">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="break-all font-mono text-foreground">{value}</dd>
      </div>
    ) : null;

  const stateJson = (v: unknown) =>
    v == null ? null : JSON.stringify(v, null, 2);
  const after = stateJson(e.after_state);
  const before = stateJson(e.before_state);

  return (
    <div
      className="rounded-xl border border-border/60 bg-background/40 p-3"
      data-testid={`audit-entry-${e.id}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 flex-shrink-0 rounded-full",
                e.success ? "bg-emerald-400" : "bg-red-400",
              )}
              aria-hidden
            />
            <span className="text-sm font-semibold text-foreground">
              {auditActionLabel(e.action)}
            </span>
            {!e.success && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                Failed
              </span>
            )}
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {e.admin_handle ? `@${e.admin_handle}` : e.admin_x_id ?? "admin"}
            {e.target_label ? ` → ${e.target_label}` : ""}
          </span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {timeAgo(Date.parse(e.created_at) / 1000)}
          </span>
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
        </span>
      </button>
      {e.error && !open && (
        <div className="mt-1 truncate text-xs text-red-400">{e.error}</div>
      )}
      {open && (
        <dl className="mt-3 space-y-1 border-t border-border/50 pt-3 text-xs">
          {detail("Target type", e.target_type)}
          {detail("Target id", e.target_id)}
          {detail("Admin id", e.admin_x_id)}
          {detail("Reason", e.reason)}
          {e.error && detail("Error", <span className="text-red-400">{e.error}</span>)}
          {e.correlation_id && (
            <div className="flex flex-wrap items-center gap-x-2">
              <dt className="text-muted-foreground">Correlation</dt>
              <dd className="break-all font-mono text-foreground">
                {e.correlation_id}
              </dd>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(e.correlation_id ?? "");
                  toast({ title: "Correlation ID copied" });
                }}
                className="text-accent hover:underline"
                data-testid={`copy-correlation-${e.id}`}
              >
                <Copy className="inline h-3 w-3" />
              </button>
            </div>
          )}
          {after && (
            <div>
              <dt className="text-muted-foreground">After</dt>
              <dd>
                <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap break-words rounded bg-surface-2 p-2 font-mono text-[10px] text-foreground">
                  {after}
                </pre>
              </dd>
            </div>
          )}
          {before && (
            <div>
              <dt className="text-muted-foreground">Before</dt>
              <dd>
                <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap break-words rounded bg-surface-2 p-2 font-mono text-[10px] text-foreground">
                  {before}
                </pre>
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

/**
 * Full admin audit-log viewer: free-text search, action / result / date
 * filters, cursor pagination (load more), expandable rows, copy correlation id,
 * and CSV / JSON export of the current filtered set.
 */
function AuditLogSection() {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [action, setAction] = useState("");
  const [success, setSuccess] = useState<"" | "true" | "false">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const filters = useMemo<AdminAuditFilters>(
    () => ({
      q: appliedQ.trim() || undefined,
      action: action || undefined,
      success: success === "" ? undefined : success === "true",
      from: from ? Math.floor(new Date(from).getTime() / 1000) : undefined,
      to: to ? Math.floor(new Date(`${to}T23:59:59`).getTime() / 1000) : undefined,
      limit: 50,
    }),
    [appliedQ, action, success, from, to],
  );

  const load = async (reset: boolean) => {
    setLoading(true);
    try {
      const r = await api.admin.auditLog({
        ...filters,
        cursor: reset ? undefined : cursor ?? undefined,
      });
      setEntries((prev) => (reset ? r.entries : [...prev, ...r.entries]));
      setCursor(r.nextCursor);
    } catch (e) {
      toast({
        title: "Audit load failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Reload from the top whenever a filter changes.
  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const exportData = (kind: "csv" | "json") => {
    if (entries.length === 0) return;
    const flat = entries.map((e) => ({
      id: e.id,
      created_at: e.created_at,
      admin_handle: e.admin_handle,
      admin_x_id: e.admin_x_id,
      action: e.action,
      target_type: e.target_type,
      target_id: e.target_id,
      target_label: e.target_label,
      success: e.success,
      error: e.error,
      correlation_id: e.correlation_id,
      reason: e.reason,
      after_state: e.after_state,
      before_state: e.before_state,
    }));
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (kind === "csv") {
      downloadFile(`admin-audit-${stamp}.csv`, toCsv(flat), "text/csv");
    } else {
      downloadFile(
        `admin-audit-${stamp}.json`,
        JSON.stringify(flat, null, 2),
        "application/json",
      );
    }
  };

  return (
    <Card
      title="Admin audit log"
      icon={ScrollText}
      action={
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportData("csv")}
            disabled={entries.length === 0}
            data-testid="audit-export-csv"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportData("json")}
            disabled={entries.length === 0}
          >
            JSON
          </Button>
        </div>
      }
    >
      {/* Filters */}
      <div className="mb-3 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search target, error, correlation id…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setAppliedQ(q);
              }}
              data-testid="audit-search"
            />
          </div>
          <Button variant="outline" onClick={() => setAppliedQ(q)}>
            Search
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
            data-testid="audit-filter-action"
          >
            <option value="">All actions</option>
            {Object.keys(AUDIT_ACTION_LABELS).map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABELS[a]}
              </option>
            ))}
          </select>
          <select
            value={success}
            onChange={(e) => setSuccess(e.target.value as "" | "true" | "false")}
            className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
            data-testid="audit-filter-success"
          >
            <option value="">Any result</option>
            <option value="true">Success</option>
            <option value="false">Failure</option>
          </select>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-auto text-xs"
            aria-label="From date"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-auto text-xs"
            aria-label="To date"
          />
        </div>
      </div>

      {loading && entries.length === 0 ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No admin actions match these filters.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {entries.map((e) => (
              <AuditRow key={e.id} e={e} />
            ))}
          </div>
          {cursor != null && (
            <div className="mt-3 flex justify-center">
              <Button
                size="sm"
                variant="outline"
                onClick={() => load(false)}
                disabled={loading}
                data-testid="audit-load-more"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Overview Operations Center. Real system-health probes + factual feature
 * configuration + today's activity + recent admin actions/failures + deploy
 * identity. Unknown data renders as "Unknown" - never faked, never zero-as-null.
 */
function OverviewSection() {
  const { data: health } = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => api.admin.health(),
    refetchInterval: 30_000,
  });
  const { data: version } = useQuery({
    queryKey: ["admin-version"],
    queryFn: () => api.admin.version(),
    staleTime: 300_000,
  });
  const { data: stats } = useQuery({
    queryKey: ["admin-stats", "24h"],
    queryFn: () => api.admin.stats("24h"),
    staleTime: 60_000,
  });
  const { data: flags } = useQuery({
    queryKey: ["admin-flags"],
    queryFn: () => api.admin.featureFlags(),
    staleTime: 60_000,
  });
  const { data: recent } = useQuery({
    queryKey: ["admin-audit-recent"],
    queryFn: () => api.admin.auditLog({ limit: 6 }),
    refetchInterval: 30_000,
  });
  const { data: failures } = useQuery({
    queryKey: ["admin-audit-failures"],
    queryFn: () => api.admin.auditLog({ success: false, limit: 5 }),
    refetchInterval: 30_000,
  });

  const apiStatus: StatusLevel = boolStatus(health?.api.ok);
  const dbStatus: StatusLevel = health
    ? worstStatus([boolStatus(health.db.ok), latencyStatus(health.db.latencyMs)])
    : "unknown";
  const feedStatus: StatusLevel = health
    ? boolStatus(health.market.pumpportalConnected, "warning")
    : "unknown";
  const cacheStatus: StatusLevel = freshnessStatus(
    health?.market.lastUpdated,
    600,
    1800,
  );

  const systemTiles: Array<{ label: string; level: StatusLevel; sub?: string }> = [
    { label: "API", level: apiStatus, sub: health?.api.node },
    {
      label: "Database",
      level: dbStatus,
      sub: health?.db.latencyMs != null ? `${health.db.latencyMs}ms` : "Unknown",
    },
    { label: "Live feed", level: feedStatus, sub: "pump.fun stream" },
    {
      label: "Market cache",
      level: cacheStatus,
      sub:
        health?.market.tokenCount != null
          ? `${fmt(health.market.tokenCount)} tokens`
          : "Unknown",
    },
  ];

  const flagCfg: Array<{ label: string; on: boolean | undefined }> = flags
    ? [
        { label: "Perps", on: flags.flags.leverage },
        { label: "Buy limits", on: flags.flags.buy_limits },
        { label: "TP / SL", on: flags.flags.tp_sl },
        { label: "Multi-target TP", on: flags.flags.multi_target_tp },
        { label: "Trading Intelligence", on: flags.flags.real_trading_analysis },
        { label: "Campaigns", on: flags.flags.community_campaigns },
        { label: "Guest trading", on: flags.flags.public_paper_trading },
        { label: "Experimental", on: flags.flags.experimental_utilities },
      ]
    : [];

  const overall = worstStatus([apiStatus, dbStatus, feedStatus, cacheStatus]);

  return (
    <div className="space-y-4">
      {/* System health */}
      <Card title="System status" icon={Activity}>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Platform</span>
          <StatusChip level={overall} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {systemTiles.map((t) => (
            <div
              key={t.label}
              className="min-w-0 rounded-xl border border-border/60 bg-secondary/20 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t.label}
                </span>
                <StatusChip level={t.level} label="" />
              </div>
              <div className="mt-1 truncate text-xs text-foreground">
                {STATUS_LEVEL_LABEL[t.level]}
              </div>
              {t.sub && (
                <div className="truncate text-[10px] text-muted-foreground/70">
                  {t.sub}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Today */}
      <Card title="Today (last 24h)" icon={BarChart3}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="New users" value={fmt(stats?.users.new_users)} />
          <Stat label="Active users" value={fmt(stats?.users.active_users)} />
          <Stat label="Trades" value={fmt(stats?.trading.trades)} />
          <Stat label="Volume (SOL)" value={fmt(stats?.trading.volume_sol, 1)} />
          <Stat label="Unique traders" value={fmt(stats?.trading.unique_traders)} />
          <Stat label="Guest sessions" value={fmt(stats?.funnel.guest_sessions)} />
          <Stat label="Registrations" value={fmt(stats?.funnel.registration)} />
          <Stat label="Active orders" value={fmt(stats?.totals.active_orders)} />
        </div>
      </Card>

      {/* Feature configuration (factual, not health) */}
      <Card title="Feature configuration" icon={Flag}>
        <div className="flex flex-wrap gap-1.5">
          {flagCfg.length === 0 ? (
            <span className="text-xs text-muted-foreground">Unknown</span>
          ) : (
            flagCfg.map((f) => (
              <span
                key={f.label}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  f.on
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : "border-border/60 bg-secondary/30 text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    f.on ? "bg-emerald-400" : "bg-muted-foreground/40",
                  )}
                  aria-hidden
                />
                {f.label}: {f.on == null ? "Unknown" : f.on ? "On" : "Off"}
              </span>
            ))
          )}
        </div>
      </Card>

      {/* Recent activity + failures */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Recent admin actions" icon={ScrollText}>
          {!recent ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : recent.entries.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              No admin actions recorded yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {recent.entries.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 flex-shrink-0 rounded-full",
                        e.success ? "bg-emerald-400" : "bg-red-400",
                      )}
                    />
                    <span className="truncate text-foreground">
                      {auditActionLabel(e.action)}
                    </span>
                    {e.target_label && (
                      <span className="truncate text-muted-foreground">
                        {e.target_label}
                      </span>
                    )}
                  </span>
                  <span className="flex-shrink-0 text-muted-foreground">
                    {timeAgo(Date.parse(e.created_at) / 1000)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Recent failures" icon={AlertTriangle}>
          {!failures ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : failures.entries.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              No recent failures.
            </p>
          ) : (
            <div className="space-y-1.5">
              {failures.entries.map((e) => (
                <div key={e.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">
                      {auditActionLabel(e.action)}
                    </span>
                    <span className="flex-shrink-0 text-muted-foreground">
                      {timeAgo(Date.parse(e.created_at) / 1000)}
                    </span>
                  </div>
                  {e.error && (
                    <div className="truncate text-red-400">{e.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Deploy identity */}
      <Card title="Deployment" icon={Server}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Backend commit" value={version?.commit ?? "unknown"} />
          <Stat label="Branch" value={version?.branch ?? "unknown"} />
          <Stat label="Node" value={version?.node ?? "unknown"} />
          <Stat
            label="Uptime"
            value={version ? fmtUptime(version.uptimeSeconds) : "unknown"}
          />
        </div>
      </Card>
    </div>
  );
}

const STATUS_LEVEL_LABEL: Record<StatusLevel, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
};

function fmtUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "unknown";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Operational diagnostics: exposes existing backend endpoints that had no UI -
 * achievement integrity audit, sparkline/snapshot diagnostics, and the pending
 * recovery re-verification backfill.
 */
function DiagnosticsSection() {
  const { toast } = useToast();
  const [showAllBadges, setShowAllBadges] = useState(false);

  const achievements = useQuery({
    queryKey: ["admin-achievements-audit"],
    queryFn: () => api.admin.achievementsAudit(),
  });
  const sparkline = useQuery({
    queryKey: ["admin-sparkline-diagnostics"],
    queryFn: () => api.admin.sparklineDiagnostics(),
  });

  const verify = useMutation({
    mutationFn: () => api.admin.recoveryVerifyPending(50),
    onSuccess: (r) =>
      toast({
        title: "Recovery verification run",
        description: `Processed ${r.processed}: ${r.verified} verified, ${r.partial} partial, ${r.failed} failed.`,
      }),
    onError: (e: Error) =>
      toast({ title: "Verification failed", description: e.message, variant: "destructive" }),
  });

  const a: AchievementsAudit | undefined = achievements.data;
  const neverEarned = (a?.badges ?? []).filter((b) => b.holders === 0);
  const noPath = (a?.badges ?? []).filter((b) => !b.hasUnlockPath);

  return (
    <div className="space-y-4">
      {/* Achievements integrity */}
      <Card
        title="Achievements integrity"
        icon={Award}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => achievements.refetch()}
            disabled={achievements.isFetching}
          >
            {achievements.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        }
      >
        {achievements.isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !a ? (
          <p className="py-3 text-center text-sm text-muted-foreground">
            Unavailable.
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <StatusChip level={a.integrity.ok ? "healthy" : "critical"} />
              <span className="text-xs text-muted-foreground">
                {a.integrity.ok
                  ? "Catalogue sound"
                  : "Integrity violations detected"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Total badges" value={fmt(a.summary.totalBadges)} />
              <Stat label="Ever earned" value={fmt(a.summary.everEarned)} />
              <Stat label="Never earned" value={fmt(a.summary.neverEarned)} />
              <Stat label="Feed-eligible" value={fmt(a.summary.feedEligible)} />
              <Stat label="Hidden" value={fmt(a.summary.hidden)} />
              <Stat label="Total users" value={fmt(a.totalUsers)} />
            </div>
            {noPath.length > 0 && (
              <div className="mt-3 rounded-lg border border-danger/40 bg-red-400/5 p-2 text-xs text-red-400">
                Badges with no unlock path: {noPath.map((b) => b.key).join(", ")}
              </div>
            )}
            {a.integrity.evaluatorsWithoutDefinition.length > 0 && (
              <div className="mt-2 rounded-lg border border-danger/40 bg-red-400/5 p-2 text-xs text-red-400">
                Evaluators without a definition:{" "}
                {a.integrity.evaluatorsWithoutDefinition.join(", ")}
              </div>
            )}
            {neverEarned.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllBadges((s) => !s)}
                className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-accent"
              >
                {showAllBadges ? "Hide" : "Show"} {neverEarned.length} never-earned
              </button>
            )}
            {showAllBadges && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {neverEarned.map((b) => (
                  <span
                    key={b.key}
                    className="rounded-full border border-border/60 bg-secondary/30 px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {b.name}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {/* Sparkline / snapshot diagnostics */}
      <Card
        title="Sparkline & snapshot diagnostics"
        icon={Gauge}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => sparkline.refetch()}
            disabled={sparkline.isFetching}
          >
            {sparkline.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        }
      >
        {sparkline.isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !sparkline.data ? (
          <p className="py-3 text-center text-sm text-muted-foreground">
            Unavailable.
          </p>
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 font-mono text-[10px] text-foreground">
            {JSON.stringify(sparkline.data, null, 2)}
          </pre>
        )}
      </Card>

      {/* Pending recovery verification */}
      <Card title="Recovery re-verification" icon={ShieldCheck}>
        <p className="mb-3 text-xs text-muted-foreground">
          Re-runs on-chain verification for successful cleanups that carry
          signatures but are not yet verified. Never fabricates a result - each
          row must still pass on-chain proof.
        </p>
        <Button
          onClick={() => verify.mutate()}
          disabled={verify.isPending}
          data-testid="button-recovery-verify"
        >
          {verify.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Verify pending (up to 50)
        </Button>
      </Card>
    </div>
  );
}

function shortWallet(w: string): string {
  if (!w) return "—";
  if (w.length <= 12) return w;
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

function WindowCard({
  label,
  stats,
}: {
  label: string;
  stats?: RecoveryWindowStats;
}) {
  return (
    <div className="border border-border bg-background/40 p-3">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-accent">
        {label}
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Scans</dt>
          <dd className="font-mono">{fmt(stats?.scans)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Unique wallets</dt>
          <dd className="font-mono">{fmt(stats?.unique_wallets)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Accounts closed</dt>
          <dd className="font-mono">{fmt(stats?.accounts_closed)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">SOL recovered</dt>
          <dd className="font-mono text-accent">{fmt(stats?.sol_recovered, 3)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Cleanups</dt>
          <dd className="font-mono">{fmt(stats?.successful_cleanups)}</dd>
        </div>
      </dl>
    </div>
  );
}

function RecoverySection() {
  const qc = useQueryClient();
  const { data, isFetching } = useQuery({
    queryKey: ["admin-recovery-stats"],
    queryFn: () => api.admin.recoveryStats(),
    refetchInterval: 60_000,
  });
  const l = data?.lifetime;
  const recent = data?.recent ?? [];
  const top = data?.topUsers ?? [];
  const fee = data?.feeStatus;

  return (
    <Card
      title="SOL Recovery analytics"
      icon={Sparkles}
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["admin-recovery-stats"] })}
          disabled={isFetching}
          data-testid="button-refresh-recovery"
        >
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Lifetime
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Total scans" value={fmt(l?.scans)} />
            <Stat label="Recovery users" value={fmt(l?.recovery_users)} />
            <Stat label="Accounts closed" value={fmt(l?.accounts_closed)} />
            <Stat label="SOL recovered" value={fmt(l?.sol_recovered, 3)} />
            <Stat label="Net recovery" value={fmt(l?.total_net, 3)} />
            <Stat label="Network fees" value={fmt(l?.total_network_fees, 4)} />
            <Stat label="Avg / cleanup" value={fmt(l?.avg_recovered, 4)} />
            <Stat label="Largest recovery" value={fmt(l?.largest_recovery, 4)} />
            <Stat label="Successful cleanups" value={fmt(l?.successful_cleanups)} />
            <Stat label="Failed cleanups" value={fmt(l?.failed_cleanups)} />
            <Stat label="Unique wallets" value={fmt(l?.unique_wallets)} />
          </div>
        </div>

        {fee && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              Fee architecture
              <span
                className={
                  fee.active
                    ? "rounded-sm bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success"
                    : "rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                }
                data-testid="badge-fee-status"
              >
                {fee.active ? `ACTIVE · ${fee.feePercent}%` : "DISABLED · 0%"}
              </span>
            </div>
            <div className="border border-border p-3 text-xs text-muted-foreground">
              {fee.summary}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {fee.pipeline.map((s) => (
                <div
                  key={s.key}
                  className="border border-border/60 px-3 py-2"
                  title={s.description}
                >
                  <div className="text-[13px] text-foreground">{s.label}</div>
                  <div
                    className={
                      s.enabled
                        ? "text-[11px] text-success"
                        : "text-[11px] text-muted-foreground"
                    }
                  >
                    {s.enabled ? "Enabled" : "Disabled"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Time windows
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <WindowCard label="Last 24 hours" stats={data?.windows.day} />
            <WindowCard label="Last 7 days" stats={data?.windows.week} />
            <WindowCard label="Last 30 days" stats={data?.windows.month} />
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Recent activity
          </div>
          <div className="max-h-80 overflow-auto border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Wallet</th>
                  <th className="px-3 py-2">X user</th>
                  <th className="px-3 py-2 text-right">Closed</th>
                  <th className="px-3 py-2 text-right">SOL</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      No recovery activity yet.
                    </td>
                  </tr>
                ) : (
                  recent.map((r, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {timeAgo(r.created_at)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {shortWallet(r.wallet)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.x_username ? `@${r.x_username}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {fmt(r.accounts_closed)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-accent">
                        {fmt(r.recovered_sol, 4)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            r.status === "success"
                              ? "text-success"
                              : "text-danger"
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {top.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              Top recovery users
            </div>
            <div className="overflow-auto border border-border">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Wallet / X user</th>
                    <th className="px-3 py-2 text-right">SOL recovered</th>
                    <th className="px-3 py-2 text-right">Accounts closed</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((u, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-3 py-2 font-mono text-xs">
                        {u.x_username ? `@${u.x_username}` : shortWallet(u.wallet)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-accent">
                        {fmt(u.total_recovered, 4)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {fmt(u.total_closed)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function LeverageSection() {
  const qc = useQueryClient();
  const { data, isFetching } = useQuery({
    queryKey: ["admin-leverage-stats"],
    queryFn: () => api.admin.leverageStats(),
    refetchInterval: 60_000,
  });
  const top = data?.topUsers ?? [];

  return (
    <Card
      title="Leverage analytics"
      icon={Activity}
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["admin-leverage-stats"] })}
          disabled={isFetching}
          data-testid="button-refresh-leverage"
        >
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Total positions" value={fmt(data?.totalPositions)} />
          <Stat label="Open positions" value={fmt(data?.openPositions)} />
          <Stat label="Liquidations" value={fmt(data?.liquidations)} />
          <Stat label="Unique traders" value={fmt(data?.uniqueTraders)} />
          <Stat label="Volume (SOL)" value={fmt(data?.totalVolumeSol, 2)} />
          <Stat label="Margin (SOL)" value={fmt(data?.totalMarginSol, 2)} />
          <Stat label="Realized P&L (SOL)" value={fmt(data?.realizedPnlSol, 3)} />
        </div>

        {top.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              Top leverage traders
            </div>
            <div className="overflow-auto border border-border">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Wallet / X user</th>
                    <th className="px-3 py-2 text-right">Positions</th>
                    <th className="px-3 py-2 text-right">Volume (SOL)</th>
                    <th className="px-3 py-2 text-right">Realized P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((u, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-3 py-2 font-mono text-xs">
                        {u.x_username ? `@${u.x_username}` : shortWallet(u.wallet)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {fmt(u.positions)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-accent">
                        {fmt(u.volume_sol, 2)}
                      </td>
                      <td
                        className={
                          "px-3 py-2 text-right font-mono " +
                          (u.realized_pnl_sol >= 0 ? "text-success" : "text-danger")
                        }
                      >
                        {fmt(u.realized_pnl_sol, 3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ───────────────────────── Social Control Center ───────────────────────── */

function shortMint(m: string | null): string {
  if (!m) return "—";
  if (m.length <= 10) return m;
  return `${m.slice(0, 4)}…${m.slice(-4)}`;
}

function authorName(a: {
  x_display_name: string | null;
  x_username: string | null;
}): string {
  return a.x_display_name || (a.x_username ? `@${a.x_username}` : "Anonymous");
}

const SOCIAL_FILTERS: { key: AdminSocialTestFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "real", label: "Real only" },
  { key: "test", label: "Test only" },
  { key: "hidden", label: "Hidden" },
];

function FilterPills({
  value,
  onChange,
}: {
  value: AdminSocialTestFilter;
  onChange: (f: AdminSocialTestFilter) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {SOCIAL_FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onChange(f.key)}
          data-testid={`social-filter-${f.key}`}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === f.key
              ? "bg-accent text-accent-foreground"
              : "bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-3",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** Inline badges marking a row as test / hidden. */
function RowFlags({ isTest, isHidden }: { isTest: boolean; isHidden: boolean }) {
  if (!isTest && !isHidden) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1">
      {isTest && (
        <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-warning">
          Test
        </span>
      )}
      {isHidden && (
        <span className="rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-danger">
          Hidden
        </span>
      )}
    </span>
  );
}

/** Small icon action button used in moderation rows. */
function ModButton({
  icon: Icon,
  label,
  onClick,
  active,
  danger,
  disabled,
  testid,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  testid?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      data-testid={testid}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
        danger
          ? "border-danger/30 text-danger hover:bg-danger/10"
          : active
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-surface-3",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ConfirmDeleteButton({
  onConfirm,
  title,
  description,
  testid,
}: {
  onConfirm: () => void;
  title: string;
  description: string;
  testid?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          title="Delete"
          data-testid={testid}
          className="inline-flex items-center gap-1 rounded-md border border-danger/30 px-2 py-1 text-[11px] font-medium text-danger transition-colors hover:bg-danger/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-500 text-white hover:bg-red-600"
            onClick={onConfirm}
          >
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type SocialTab = "callouts" | "theses" | "journal";

function CalloutsModTable({ filter }: { filter: AdminSocialTestFilter }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const filters: AdminSocialFilters = { filter, limit: 200 };
  const { data, isLoading } = useQuery({
    queryKey: ["admin-social-callouts", filter],
    queryFn: () => api.admin.social.listCallouts(filters),
  });
  const rows = data?.callouts ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-social-callouts"] });
    qc.invalidateQueries({ queryKey: ["admin-social-overview"] });
  };
  const onErr = (e: Error) =>
    toast({ title: "Action failed", description: e.message, variant: "destructive" });

  const markTest = useMutation({
    mutationFn: ({ id, v }: { id: number; v: boolean }) =>
      api.admin.social.markCalloutTest(id, v),
    onSuccess: invalidate,
    onError: onErr,
  });
  const hide = useMutation({
    mutationFn: ({ id, v }: { id: number; v: boolean }) =>
      api.admin.social.hideCallout(id, v),
    onSuccess: invalidate,
    onError: onErr,
  });
  const del = useMutation({
    mutationFn: (id: number) => api.admin.social.deleteCallout(id),
    onSuccess: () => {
      toast({ title: "Callout deleted", description: "Backed up before deletion." });
      invalidate();
    },
    onError: onErr,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="py-6 text-center text-sm text-muted-foreground">No callouts match this filter.</div>;
  }
  return (
    <div className="space-y-2">
      {rows.map((c: AdminCallout) => (
        <div
          key={c.id}
          data-testid={`admin-callout-${c.id}`}
          className="rounded-lg border border-border bg-background/40 p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center text-sm font-medium text-foreground">
                <span className="truncate">{authorName(c)}</span>
                <RowFlags isTest={c.is_test} isHidden={c.is_hidden_by_admin} />
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                called{" "}
                <span className="text-foreground">
                  {c.token_symbol || shortMint(c.token_mint)}
                </span>{" "}
                · {timeAgo(c.created_at)}
              </div>
              {c.thesis && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.thesis}</p>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ModButton
              icon={Tag}
              label={c.is_test ? "Unmark test" : "Mark test"}
              active={c.is_test}
              onClick={() => markTest.mutate({ id: c.id, v: !c.is_test })}
              testid={`callout-test-${c.id}`}
            />
            <ModButton
              icon={c.is_hidden_by_admin ? Eye : EyeOff}
              label={c.is_hidden_by_admin ? "Unhide" : "Hide"}
              active={c.is_hidden_by_admin}
              onClick={() => hide.mutate({ id: c.id, v: !c.is_hidden_by_admin })}
              testid={`callout-hide-${c.id}`}
            />
            <ConfirmDeleteButton
              onConfirm={() => del.mutate(c.id)}
              title="Delete this callout?"
              description="Callouts are immutable to normal users. This admin deletion is permanent (a backup is taken first)."
              testid={`callout-delete-${c.id}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ThesesModTable({ filter }: { filter: AdminSocialTestFilter }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-social-theses", filter],
    queryFn: () => api.admin.social.listTheses({ filter, limit: 200 }),
  });
  const rows = data?.theses ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-social-theses"] });
    qc.invalidateQueries({ queryKey: ["admin-social-overview"] });
  };
  const onErr = (e: Error) =>
    toast({ title: "Action failed", description: e.message, variant: "destructive" });

  const markTest = useMutation({
    mutationFn: ({ id, v }: { id: number; v: boolean }) =>
      api.admin.social.markThesisTest(id, v),
    onSuccess: invalidate,
    onError: onErr,
  });
  const hide = useMutation({
    mutationFn: ({ id, v }: { id: number; v: boolean }) =>
      api.admin.social.hideThesis(id, v),
    onSuccess: invalidate,
    onError: onErr,
  });
  const del = useMutation({
    mutationFn: (id: number) => api.admin.social.deleteThesis(id),
    onSuccess: () => {
      toast({ title: "Thesis deleted", description: "Backed up before deletion." });
      invalidate();
    },
    onError: onErr,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="py-6 text-center text-sm text-muted-foreground">No theses match this filter.</div>;
  }
  return (
    <div className="space-y-2">
      {rows.map((t: AdminThesis) => (
        <div
          key={t.id}
          data-testid={`admin-thesis-${t.id}`}
          className="rounded-lg border border-border bg-background/40 p-3"
        >
          <div className="min-w-0">
            <div className="flex items-center text-sm font-medium text-foreground">
              <span className="truncate">{authorName(t)}</span>
              <RowFlags isTest={t.is_test} isHidden={t.is_hidden_by_admin} />
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {t.token_symbol || shortMint(t.token_mint)} · {t.sentiment} ·{" "}
              {timeAgo(t.created_at)}
            </div>
            <p className="mt-1 text-xs font-semibold text-foreground">{t.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.content}</p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ModButton
              icon={Tag}
              label={t.is_test ? "Unmark test" : "Mark test"}
              active={t.is_test}
              onClick={() => markTest.mutate({ id: t.id, v: !t.is_test })}
              testid={`thesis-test-${t.id}`}
            />
            <ModButton
              icon={t.is_hidden_by_admin ? Eye : EyeOff}
              label={t.is_hidden_by_admin ? "Unhide" : "Hide"}
              active={t.is_hidden_by_admin}
              onClick={() => hide.mutate({ id: t.id, v: !t.is_hidden_by_admin })}
              testid={`thesis-hide-${t.id}`}
            />
            <ConfirmDeleteButton
              onConfirm={() => del.mutate(t.id)}
              title="Delete this thesis?"
              description="This permanently removes the thesis (a backup is taken first)."
              testid={`thesis-delete-${t.id}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function JournalModTable({ filter }: { filter: AdminSocialTestFilter }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-social-journal", filter],
    queryFn: () => api.admin.social.listJournal({ filter, limit: 200 }),
  });
  const rows = data?.journal ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-social-journal"] });
    qc.invalidateQueries({ queryKey: ["admin-social-overview"] });
  };
  const onErr = (e: Error) =>
    toast({ title: "Action failed", description: e.message, variant: "destructive" });

  const markTest = useMutation({
    mutationFn: ({ id, v }: { id: number; v: boolean }) =>
      api.admin.social.markJournalTest(id, v),
    onSuccess: invalidate,
    onError: onErr,
  });
  const del = useMutation({
    mutationFn: (id: number) => api.admin.social.deleteJournal(id),
    onSuccess: () => {
      toast({ title: "Journal entry deleted", description: "Backed up before deletion." });
      invalidate();
    },
    onError: onErr,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="py-6 text-center text-sm text-muted-foreground">No journal entries match this filter.</div>;
  }
  return (
    <div className="space-y-2">
      {rows.map((j: AdminJournalEntry) => (
        <div
          key={j.id}
          data-testid={`admin-journal-${j.id}`}
          className="rounded-lg border border-border bg-background/40 p-3"
        >
          <div className="min-w-0">
            <div className="flex items-center text-sm font-medium text-foreground">
              <span className="truncate">{authorName(j)}</span>
              <RowFlags isTest={j.is_test} isHidden={j.is_hidden_by_admin} />
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {j.title || "Untitled"}
              {j.token ? ` · ${j.token}` : ""}
              {j.outcome ? ` · ${j.outcome}` : ""} · {timeAgo(j.created_at)}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ModButton
              icon={Tag}
              label={j.is_test ? "Unmark test" : "Mark test"}
              active={j.is_test}
              onClick={() => markTest.mutate({ id: j.id, v: !j.is_test })}
              testid={`journal-test-${j.id}`}
            />
            <ConfirmDeleteButton
              onConfirm={() => del.mutate(j.id)}
              title="Delete this journal entry?"
              description="This permanently removes the journal entry (a backup is taken first)."
              testid={`journal-delete-${j.id}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function SocialControlSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<SocialTab>("callouts");
  const [filter, setFilter] = useState<AdminSocialTestFilter>("all");

  const { data: ov } = useQuery({
    queryKey: ["admin-social-overview"],
    queryFn: () => api.admin.social.overview(),
    refetchInterval: 60_000,
  });
  const o = ov?.overview;

  const bulkTag = useMutation({
    mutationFn: ({ type, value }: { type: SocialTab; value: boolean }) =>
      api.admin.social.bulkTagTest(type, value),
    onSuccess: (r) => {
      toast({ title: "Bulk tag applied", description: `${r.tagged} rows updated.` });
      qc.invalidateQueries({ queryKey: [`admin-social-${tab}`] });
      qc.invalidateQueries({ queryKey: ["admin-social-overview"] });
    },
    onError: (e: Error) =>
      toast({ title: "Bulk tag failed", description: e.message, variant: "destructive" }),
  });

  const TABS: { key: SocialTab; label: string; icon: React.ElementType }[] = [
    { key: "callouts", label: "Callouts", icon: Megaphone },
    { key: "theses", label: "Theses", icon: ScrollText },
    { key: "journal", label: "Journal", icon: BookOpen },
  ];

  return (
    <Card title="Social Control Center" icon={MessageSquare}>
      {/* Overview counts */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3">
        <Stat label="Callouts" value={`${fmt(o?.callouts_total)} · ${fmt(o?.callouts_test)}t · ${fmt(o?.callouts_hidden)}h`} />
        <Stat label="Theses" value={`${fmt(o?.theses_total)} · ${fmt(o?.theses_test)}t · ${fmt(o?.theses_hidden)}h`} />
        <Stat label="Journal" value={`${fmt(o?.journal_total)} · ${fmt(o?.journal_test)}t`} />
      </div>

      {/* Tabs */}
      <div className="mb-3 flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            data-testid={`social-tab-${t.key}`}
            className={cn(
              "flex items-center gap-1.5 border-b-2 -mb-px px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter + bulk-tag toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <FilterPills value={filter} onChange={setFilter} />
        <div className="flex items-center gap-2">
          <ModButton
            icon={Tag}
            label="Tag all as test"
            onClick={() => bulkTag.mutate({ type: tab, value: true })}
            disabled={bulkTag.isPending}
            testid={`bulk-tag-test-${tab}`}
          />
          <ModButton
            icon={Tag}
            label="Untag all"
            onClick={() => bulkTag.mutate({ type: tab, value: false })}
            disabled={bulkTag.isPending}
            testid={`bulk-untag-test-${tab}`}
          />
        </div>
      </div>

      {tab === "callouts" && <CalloutsModTable filter={filter} />}
      {tab === "theses" && <ThesesModTable filter={filter} />}
      {tab === "journal" && <JournalModTable filter={filter} />}
    </Card>
  );
}

/* ─────────────────────── Social / Test-data reset controls ──────────────── */

const SOCIAL_RESETS: {
  key: "test-data" | "social" | "journal" | "full";
  label: string;
  phrase: string;
  desc: string;
  deletes: string;
  danger: boolean;
}[] = [
  {
    key: "test-data",
    label: "Purge test data",
    phrase: "RESET",
    desc: "Removes every row flagged as test across callouts, theses and journal.",
    deletes: "All is_test callouts, theses & journal entries.",
    danger: false,
  },
  {
    key: "social",
    label: "Reset social",
    phrase: "RESET",
    desc: "Clears all callouts, callout updates, theses and follows.",
    deletes: "All callouts, callout_updates, theses, follows.",
    danger: true,
  },
  {
    key: "journal",
    label: "Reset journal",
    phrase: "RESET",
    desc: "Clears every trading-journal entry for all users.",
    deletes: "All journal_entries.",
    danger: true,
  },
  {
    key: "full",
    label: "Full reset",
    phrase: "FULL RESET",
    desc: "Wipes ALL social + journal + paper-trading data platform-wide. Identities, admin account, feature flags and config are preserved.",
    deletes: "All callouts, theses, journal, follows, positions, orders, trades, leverage & balances.",
    danger: true,
  },
];

function SocialResetCard({
  spec,
}: {
  spec: (typeof SOCIAL_RESETS)[number];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState("");

  const mut = useMutation({
    mutationFn: () => {
      if (spec.key === "test-data") return api.admin.resetTestData(confirm);
      if (spec.key === "social") return api.admin.resetSocial(confirm);
      if (spec.key === "journal") return api.admin.resetJournal(confirm);
      return api.admin.fullReset(confirm);
    },
    onSuccess: () => {
      toast({ title: `${spec.label} complete`, description: "Affected rows were backed up first." });
      setConfirm("");
      qc.invalidateQueries();
    },
    onError: (e: Error) =>
      toast({ title: `${spec.label} failed`, description: e.message, variant: "destructive" }),
  });

  const ready = confirm.trim() === spec.phrase;

  return (
    <div
      className={cn(
        "space-y-2 border p-3",
        spec.danger ? "border-danger/30 bg-red-400/5" : "border-border bg-background/40",
      )}
    >
      <div
        className={cn(
          "text-[11px] uppercase tracking-wider",
          spec.danger ? "text-danger" : "text-muted-foreground",
        )}
      >
        {spec.label}
      </div>
      <p className="text-xs text-muted-foreground">{spec.desc}</p>
      <p className="text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">Deletes:</span> {spec.deletes}
      </p>
      <Input
        placeholder={`Type ${spec.phrase} to confirm`}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        data-testid={`input-reset-${spec.key}`}
      />
      <Button
        variant={spec.danger ? "destructive" : "default"}
        className="w-full"
        disabled={!ready || mut.isPending}
        onClick={() => mut.mutate()}
        data-testid={`button-reset-${spec.key}`}
      >
        {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {spec.label}
      </Button>
    </div>
  );
}

function ReputationRow({
  entry,
  metric,
}: {
  entry: import("@/lib/api").ReputationEntry;
  metric: "trust" | "rising";
}) {
  const handle = entry.x_username?.trim().replace(/^@+/, "") || null;
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">
        #{entry.rank}
      </span>
      <UserIdentity
        className="flex-1 min-w-0"
        size="sm"
        avatarUrl={entry.x_avatar_url}
        displayName={entry.x_display_name}
        handle={handle}
        officialBadges={entry.officialBadges}
        tier={entry.graduation_tier}
        fallbackName={`User ${entry.user_id}`}
      />
      <div className="shrink-0 text-right">
        {metric === "trust" ? (
          <>
            <div className="font-mono text-sm text-foreground">
              {entry.trustScore}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {entry.trustLabel}
            </div>
          </>
        ) : (
          <>
            <div className="font-mono text-sm text-success">
              +{entry.followers30d}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              30d follows
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Admin visibility into the reputation network: trust + rising boards. */
function ReputationSection() {
  const { data: trust, isFetching: trustLoading } = useQuery({
    queryKey: ["admin", "reputation", "trust"],
    queryFn: () => api.leaderboardTrust(),
    refetchInterval: 60_000,
  });
  const { data: rising, isFetching: risingLoading } = useQuery({
    queryKey: ["admin", "reputation", "rising"],
    queryFn: () => api.leaderboardRising(),
    refetchInterval: 60_000,
  });

  const trustEntries = trust?.entries ?? [];
  const risingEntries = rising?.entries ?? [];

  const totalFollowers = trustEntries.reduce((s, e) => s + e.followers, 0);
  const totalFollowing = trustEntries.reduce((s, e) => s + e.following, 0);
  const totalCalls = trustEntries.reduce((s, e) => s + e.callsMade, 0);
  const avgTrust =
    trustEntries.length > 0
      ? Math.round(
          trustEntries.reduce((s, e) => s + e.trustScore, 0) /
            trustEntries.length,
        )
      : 0;

  return (
    <Card title="Reputation network" icon={ShieldCheck}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Ranked traders" value={fmt(trustEntries.length)} />
        <Stat label="Avg trust" value={fmt(avgTrust)} />
        <Stat label="Total followers" value={fmt(totalFollowers)} />
        <Stat label="Total calls" value={fmt(totalCalls)} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total following" value={fmt(totalFollowing)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            Highest trust
          </div>
          <div className="rounded-lg bg-surface-2 shadow-card divide-y divide-border">
            {trustLoading && trustEntries.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : trustEntries.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No ranked traders yet.
              </div>
            ) : (
              trustEntries
                .slice(0, 10)
                .map((e) => (
                  <ReputationRow key={e.user_id} entry={e} metric="trust" />
                ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-accent" />
            Top rising (30d)
          </div>
          <div className="rounded-lg bg-surface-2 shadow-card divide-y divide-border">
            {risingLoading && risingEntries.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : risingEntries.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No rising traders yet.
              </div>
            ) : (
              risingEntries
                .slice(0, 10)
                .map((e) => (
                  <ReputationRow key={e.user_id} entry={e} metric="rising" />
                ))
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function SocialResetSection() {
  return (
    <Card title="Social & test-data resets" icon={AlertTriangle}>
      <p className="mb-3 text-sm text-muted-foreground">
        Each reset snapshots affected rows into the <code>reset_backups</code> schema first.
        Identities, the admin account, feature flags and config are always preserved.
        Type the exact confirmation phrase to enable each action.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SOCIAL_RESETS.map((s) => (
          <SocialResetCard key={s.key} spec={s} />
        ))}
      </div>
    </Card>
  );
}

export default function AdminPage() {
  const { isAdmin, loading } = useAdmin();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <Shield className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need an approved admin account to view this dashboard.
        </p>
      </div>
    );
  }

  const navItems: AdminNavItem[] = [
    { id: "overview", label: "Overview" },
    { id: "trading", label: "Trading" },
    { id: "utilities", label: "Utilities" },
    { id: "identity", label: "Identity" },
    { id: "social", label: "Social" },
    { id: "flags", label: "Flags" },
    { id: "system", label: "System" },
    { id: "diagnostics", label: "Diagnostics" },
    { id: "audit", label: "Audit" },
    { id: "danger", label: "Danger" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <div className="mb-3 flex items-center gap-3">
        <Shield className="h-6 w-6 text-accent" />
        <div>
          <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            BlackPebble operations center.
          </p>
        </div>
      </div>

      <AdminNav items={navItems} />

      <div className="space-y-4">
        <AdminSection id="overview" title="Overview" icon={LayoutDashboard} defaultOpen>
          <OverviewSection />
        </AdminSection>

        <AdminSection id="trading" title="Trading" icon={BarChart3}>
          <StatsSection />
          <LeverageSection />
          <OrdersSection />
        </AdminSection>

        <AdminSection id="utilities" title="Wallet Utilities" icon={Wrench}>
          <MarketSection />
          <RecoverySection />
        </AdminSection>

        <AdminSection id="identity" title="Identity & Reputation" icon={Award}>
          <BadgesSection />
          <VerificationSection />
          <ReputationSection />
        </AdminSection>

        <AdminSection id="social" title="Social & Moderation" icon={MessageSquare}>
          <SocialControlSection />
        </AdminSection>

        <AdminSection id="flags" title="Feature Flags" icon={Flag}>
          <FlagsSection />
        </AdminSection>

        <AdminSection id="system" title="System Health" icon={Server}>
          <HealthSection />
        </AdminSection>

        <AdminSection id="diagnostics" title="Operational Diagnostics" icon={Gauge}>
          <DiagnosticsSection />
        </AdminSection>

        <AdminSection id="audit" title="Audit Log" icon={ScrollText} defaultOpen>
          <AuditLogSection />
        </AdminSection>

        <AdminSection id="danger" title="Reset & Danger Zone" icon={AlertTriangle}>
          <SocialResetSection />
          <ResetSection />
        </AdminSection>
      </div>
    </div>
  );
}
