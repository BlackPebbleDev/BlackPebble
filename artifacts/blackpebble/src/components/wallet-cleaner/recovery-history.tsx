import { useQuery } from "@tanstack/react-query";
import { History, Loader2, Inbox } from "lucide-react";
import { api, type RecoveryHistoryEvent } from "@/lib/api";
import { formatRentSol } from "@/hooks/use-wallet-cleaner";
import { SignatureRow } from "@/components/wallet-cleaner/signature-row";

/** Format a unix-seconds timestamp as a compact local date + time. */
function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A single lifetime metric tile. */
function MetricTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div
        className={
          accent
            ? "font-mono text-sm font-semibold text-accent"
            : "font-mono text-sm text-foreground"
        }
      >
        {value}
      </div>
    </div>
  );
}

/** A labelled value inside an event card's breakdown. */
function EventStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={
          accent
            ? "font-mono text-xs font-semibold text-accent"
            : "font-mono text-xs text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

function HistoryCard({ event }: { event: RecoveryHistoryEvent }) {
  const failed = event.status !== "success";
  return (
    <div
      className="rounded-2xl border border-border bg-card p-4 space-y-3"
      data-testid="recovery-history-event"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-foreground">
          {formatDate(event.created_at)}
        </span>
        <span
          className={
            failed
              ? "rounded-md bg-destructive/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-danger"
              : "rounded-md bg-accent/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent"
          }
        >
          {failed ? "Failed" : "Success"}
        </span>
      </div>

      <div className="space-y-1.5">
        <EventStat
          label="Accounts closed"
          value={String(event.accounts_closed)}
        />
        {event.tokens_burned > 0 && (
          <EventStat
            label="Tokens burned"
            value={String(event.tokens_burned)}
          />
        )}
        <EventStat
          label="SOL recovered"
          value={`${formatRentSol(event.recovered_sol)} SOL`}
        />
        <EventStat
          label="Network fee"
          value={`${formatRentSol(event.network_fee_sol)} SOL`}
        />
        <EventStat
          label="BlackPebble fee"
          value={`${formatRentSol(event.bp_fee_sol)} SOL`}
        />
        <EventStat
          label="Net recovery"
          value={`${formatRentSol(event.net_sol)} SOL`}
          accent
        />
      </div>

      {failed && event.error_message && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {event.error_message}
        </p>
      )}

      {event.signatures.length > 0 && (
        <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
          {event.signatures.map((sig) => (
            <SignatureRow key={sig} sig={sig} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Permanent Recovery History for the connected wallet, built entirely from
 * stored recovery_events. Shows lifetime metrics (the single source of truth
 * for a wallet's totals) plus every persisted cleanup with explorer links.
 * Never fabricates rows - an empty wallet gets a professional empty state.
 */
export function RecoveryHistory({ wallet }: { wallet: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["recovery-history", wallet],
    queryFn: () => api.recovery.history(wallet),
    enabled: !!wallet,
  });

  return (
    <section className="space-y-3" data-testid="recovery-history">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold">Recovery history</h2>
      </div>

      {isLoading ? (
        <div className="rounded-xl bg-card shadow-card p-10 text-center">
          <Loader2 className="w-5 h-5 text-accent animate-spin mx-auto" />
        </div>
      ) : isError || !data ? (
        <div className="rounded-xl bg-card shadow-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Couldn't load your recovery history right now.
          </p>
        </div>
      ) : data.events.length === 0 ? (
        <div
          className="rounded-xl bg-card shadow-card p-10 text-center space-y-3"
          data-testid="recovery-history-empty"
        >
          <Inbox className="w-8 h-8 text-muted-foreground mx-auto" />
          <div className="space-y-1">
            <div className="font-semibold">No recoveries yet</div>
            <p className="text-sm text-muted-foreground">
              Once you recover SOL from empty token accounts, every recovery will
              be recorded here permanently.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <MetricTile
              label="Lifetime SOL"
              value={`${formatRentSol(data.lifetime.sol_recovered)}`}
              accent
            />
            <MetricTile
              label="Accounts closed"
              value={String(data.lifetime.accounts_closed)}
            />
            <MetricTile
              label="Tokens burned"
              value={String(data.lifetime.tokens_burned ?? 0)}
            />
            <MetricTile
              label="Largest recovery"
              value={`${formatRentSol(data.lifetime.largest_recovery)}`}
            />
            <MetricTile
              label="Average recovery"
              value={`${formatRentSol(data.lifetime.avg_recovered)}`}
            />
            <MetricTile
              label="Successful"
              value={String(data.lifetime.successful_cleanups)}
            />
            <MetricTile
              label="Failed"
              value={String(data.lifetime.failed_cleanups)}
            />
          </div>

          <div className="space-y-3">
            {data.events.map((event, i) => (
              <HistoryCard
                key={`${event.created_at}-${i}`}
                event={event}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
