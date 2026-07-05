import { useMemo, useState } from "react";
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
} from "lucide-react";
import { useAdmin } from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import {
  api,
  type FeatureFlagKey,
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
  type ProfileResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";
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

function timeAgo(seconds: number | null): string {
  if (!seconds) return "never";
  const diff = Math.floor(Date.now() / 1000) - seconds;
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
    <div className="rounded-lg bg-surface-2 p-3 shadow-card">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl text-foreground">{value}</div>
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
};

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

function FlagsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-feature-flags"],
    queryFn: () => api.admin.featureFlags(),
  });
  const setFlag = useMutation({
    mutationFn: ({ key, enabled }: { key: FeatureFlagKey; enabled: boolean }) =>
      api.admin.setFeatureFlag(key, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-feature-flags"] });
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const flags = data?.flags;
  return (
    <Card title="Feature flags" icon={Flag}>
      <div className="space-y-1">
        {(Object.keys(FLAG_LABELS) as FeatureFlagKey[]).map((key) => (
          <div
            key={key}
            className="flex items-center justify-between border-b border-border/60 py-2 last:border-0"
          >
            <span className="text-sm">{FLAG_LABELS[key]}</span>
            <Switch
              checked={!!flags?.[key]}
              disabled={!flags || setFlag.isPending}
              onCheckedChange={(enabled) => setFlag.mutate({ key, enabled })}
              data-testid={`switch-flag-${key}`}
            />
          </div>
        ))}
      </div>
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

function ResetSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [wallet, setWallet] = useState("");
  const [options, setOptions] = useState<ResetOptions>(() =>
    Object.fromEntries(RESET_TOGGLES.map((t) => [t.key, t.defaultOn])) as ResetOptions,
  );

  const onDone = (label: string) => {
    toast({ title: `${label} complete`, description: "Affected rows were backed up before deletion." });
    qc.invalidateQueries();
  };
  const resetUser = useMutation({
    mutationFn: () => api.admin.resetUser(wallet.trim(), options),
    onSuccess: () => onDone("User reset"),
    onError: (e: Error) => toast({ title: "Reset failed", description: e.message, variant: "destructive" }),
  });
  const resetAll = useMutation({
    mutationFn: () => api.admin.resetAll(options),
    onSuccess: () => onDone("Global reset"),
    onError: (e: Error) => toast({ title: "Reset failed", description: e.message, variant: "destructive" }),
  });

  const toggle = (key: keyof ResetOptions, v: boolean) =>
    setOptions((o) => ({ ...o, [key]: v }));

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2 border border-border bg-background/40 p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Single user
          </div>
          <Input
            placeholder="wallet or x:<id>"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            data-testid="input-reset-wallet"
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="w-full"
                disabled={!wallet.trim() || resetUser.isPending}
                data-testid="button-reset-user"
              >
                {resetUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset this user
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset {wallet.trim()}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This applies the selected actions to a single account. A backup is taken first,
                  but this cannot be undone from the UI.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => resetUser.mutate()}>Reset user</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="space-y-2 border border-danger/30 bg-red-400/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-danger">
            All users - danger zone
          </div>
          <p className="text-xs text-muted-foreground">
            Applies the selected actions to every account on the platform.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full"
                disabled={resetAll.isPending}
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
                  This applies the selected actions across the entire platform. Affected rows are
                  backed up to <code>reset_backups</code> first, but this is a destructive, global
                  action.
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Shield className="h-6 w-6 text-accent" />
        <div>
          <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Platform operations, seasons & feature controls.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <StatsSection />

        <div className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Wrench className="h-4 w-4 text-accent" />
          Utilities
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <HealthSection />
          <MarketSection />
        </div>
        <RecoverySection />
        <LeverageSection />
        <FlagsSection />
        <OrdersSection />

        <div className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Award className="h-4 w-4 text-accent" />
          Official Badges
        </div>
        <BadgesSection />
        <VerificationSection />

        <div className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <MessageSquare className="h-4 w-4 text-accent" />
          Social & moderation
        </div>
        <ReputationSection />
        <SocialControlSection />
        <SocialResetSection />

        <ResetSection />
      </div>
    </div>
  );
}
