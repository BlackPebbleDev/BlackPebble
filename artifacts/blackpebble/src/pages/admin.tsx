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
} from "lucide-react";
import { useAdmin } from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import {
  api,
  type FeatureFlagKey,
  type ResetOptions,
  type RecoveryWindowStats,
  type AdminStatsWindow,
} from "@/lib/api";
import { cn } from "@/lib/utils";
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
    <section className="border border-border bg-card">
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
    <div className="border border-border bg-background/40 p-3">
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
};

const STATS_WINDOWS: { key: AdminStatsWindow; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "all", label: "All Time" },
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
            "px-2.5 py-1 text-xs font-medium transition-colors",
            value === w.key
              ? "bg-accent text-accent-foreground"
              : "bg-background/40 text-muted-foreground hover:text-foreground",
          )}
        >
          {w.label}
        </button>
      ))}
    </div>
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
          <Stat label="Buys / Sells" value={`${fmt(trading?.buys)} / ${fmt(trading?.sells)}`} />
          <Stat label="Paper volume" value={`${fmt(trading?.volume_sol, 1)} SOL`} />
          <Stat label="Avg trade size" value={`${fmt(trading?.avg_trade_size, 2)} SOL`} />
        </div>
      </Card>

      <Card title="Top Tokens" icon={Sparkles}>
        {topTokens.length === 0 ? (
          <div className="text-sm text-muted-foreground">No trades in this window.</div>
        ) : (
          <div className="space-y-1">
            {topTokens.map((t) => (
              <div
                key={t.token_mint}
                className="flex items-center justify-between border-b border-border/60 py-1.5 text-sm last:border-0"
              >
                <span className="font-medium text-foreground">
                  {t.token_symbol || `${t.token_mint.slice(0, 4)}…`}
                </span>
                <span className="font-mono text-muted-foreground">
                  {fmt(t.trades)} trades · {fmt(t.volume_sol, 1)} SOL
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

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
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <UserPlus className="h-3.5 w-3.5 text-accent" />
            Guest funnel (lifetime)
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Created" value={fmt(totals?.guest_created)} />
            <Stat label="Traded" value={fmt(totals?.guest_traded)} />
            <Stat label="Converted" value={fmt(totals?.guest_converted)} />
          </div>
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

        <div className="space-y-2 border border-red-400/30 bg-red-400/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-red-400">
            All users — danger zone
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
            <Stat label="Unique wallets" value={fmt(l?.unique_wallets)} />
            <Stat label="Accounts closed" value={fmt(l?.accounts_closed)} />
            <Stat label="SOL recovered" value={fmt(l?.sol_recovered, 3)} />
            <Stat label="Avg / cleanup" value={fmt(l?.avg_recovered, 4)} />
            <Stat label="Largest recovery" value={fmt(l?.largest_recovery, 4)} />
            <Stat label="Successful cleanups" value={fmt(l?.successful_cleanups)} />
            <Stat label="Failed cleanups" value={fmt(l?.failed_cleanups)} />
          </div>
        </div>

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
                              ? "text-emerald-400"
                              : "text-red-400"
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
                          (u.realized_pnl_sol >= 0 ? "text-emerald-400" : "text-red-400")
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
        <ResetSection />
      </div>
    </div>
  );
}
