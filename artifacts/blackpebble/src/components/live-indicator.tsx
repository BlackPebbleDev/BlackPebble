import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

function fmtAgo(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

type FeedColor = "green" | "yellow" | "red";

function feedColor(secondsAgo: number): FeedColor {
  if (secondsAgo < 120) return "green";
  if (secondsAgo < 300) return "yellow";
  return "red";
}

const dotCls: Record<FeedColor, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-red-400",
};
const textCls: Record<FeedColor, string> = {
  green: "text-emerald-400",
  yellow: "text-amber-400",
  red: "text-red-400",
};
const labelCls: Record<FeedColor, string> = {
  green: "Connected",
  yellow: "Delayed",
  red: "Disconnected",
};

interface Props {
  /** TanStack Query's dataUpdatedAt (milliseconds). 0 means no data yet. */
  dataUpdatedAt: number;
}

export function LiveIndicator({ dataUpdatedAt }: Props) {
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [open, setOpen] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["market-status"],
    queryFn: () => api.marketStatus(),
    enabled: open,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (dataUpdatedAt <= 0) return;
    const tick = () =>
      setSecondsAgo(Math.max(0, Math.floor((Date.now() - dataUpdatedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

  if (dataUpdatedAt <= 0) return null;

  const color = feedColor(secondsAgo);

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Click for feed status"
        className="flex items-center gap-1.5 group"
        data-testid="live-indicator"
      >
        <span
          className={cn(
            "w-2 h-2 rounded-full flex-shrink-0",
            dotCls[color],
            color === "green" && "animate-pulse",
          )}
        />
        <span
          className={cn(
            "font-mono font-semibold tracking-widest uppercase text-[10px]",
            textCls[color],
          )}
        >
          Live
        </span>
        <span className="text-muted-foreground text-[10px] font-mono">
          · Updated {fmtAgo(secondsAgo)}
        </span>
      </button>

      {open && (
        <>
          {/* Backdrop to close on outside click */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          {/* Status panel */}
          <div className="absolute top-6 left-0 z-50 w-52 rounded-xl bg-card border border-border p-4 shadow-card text-xs">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-semibold">
              Market Feed Status
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">DexScreener</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn("w-1.5 h-1.5 rounded-full", dotCls[color])}
                  />
                  <span className={textCls[color]}>{labelCls[color]}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">PumpPortal</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      status?.pumpportalConnected !== false
                        ? "bg-emerald-400"
                        : "bg-red-400",
                    )}
                  />
                  <span
                    className={
                      status?.pumpportalConnected !== false
                        ? "text-emerald-400"
                        : "text-red-400"
                    }
                  >
                    {status?.pumpportalConnected !== false
                      ? "Connected"
                      : "Disconnected"}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last Update</span>
                <span className="font-mono tabular-nums">{fmtAgo(secondsAgo)}</span>
              </div>
              {status?.tokenCount != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tokens Loaded</span>
                  <span className="font-mono tabular-nums">{status.tokenCount}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
