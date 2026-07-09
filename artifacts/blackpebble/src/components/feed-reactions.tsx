import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SmilePlus } from "lucide-react";
import {
  api,
  FEED_REACTIONS,
  type FeedActivityItem,
  type FeedReactionKey,
} from "@/lib/api";
import { useXAuth } from "@/hooks/use-x-auth";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Premium reaction pills for feed cards. A fixed reaction vocabulary (16), one
 * per user per event: tapping a pill toggles it, tapping a different one moves
 * the reaction. The three most-used reactions show as compact pills; any
 * further reactions collapse behind a "+N" pill that opens a full breakdown,
 * so a heavily-reacted card never turns into a cluttered wall of pills.
 *
 * Updates are optimistic (local state), then reconciled by invalidating the
 * feed queries in the background.
 */

const EMOJI: Record<string, string> = Object.fromEntries(
  FEED_REACTIONS.map((r) => [r.key, r.emoji]),
);
const LABEL: Record<string, string> = Object.fromEntries(
  FEED_REACTIONS.map((r) => [r.key, r.label]),
);

/** How many reaction pills render inline before the rest collapse behind +N. */
const TOP_PILLS = 3;

interface LocalState {
  counts: Record<string, number>;
  mine: string | null;
}

export function ReactionBar({
  item,
  trailing,
}: {
  item: FeedActivityItem;
  /** Optional right-aligned action rendered opposite the reactions (e.g. the
   *  feed's inline "Journal this trade" button). Self-gates to null when N/A. */
  trailing?: React.ReactNode;
}) {
  const { loggedIn, login } = useXAuth();
  const queryClient = useQueryClient();
  const [local, setLocal] = useState<LocalState>({
    counts: item.reactions ?? {},
    mine: item.viewerReaction ?? null,
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: (reaction: FeedReactionKey | null) =>
      api.feed.react(item.id, reaction),
    onSettled: () => {
      // Reconcile lazily; the optimistic state already reflects the change.
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  function toggle(key: FeedReactionKey) {
    if (!loggedIn) {
      login();
      return;
    }
    setPickerOpen(false);
    setBreakdownOpen(false);
    setLocal((prev) => {
      const counts = { ...prev.counts };
      const next: FeedReactionKey | null = prev.mine === key ? null : key;
      if (prev.mine) counts[prev.mine] = Math.max(0, (counts[prev.mine] ?? 1) - 1);
      if (next) counts[next] = (counts[next] ?? 0) + 1;
      mutation.mutate(next);
      return { counts, mine: next };
    });
  }

  // Every reaction with a live count, most-used first. The viewer's own
  // reaction is pinned into the visible pills so they can always un-toggle it.
  const visible = FEED_REACTIONS.filter(
    (r) => (local.counts[r.key] ?? 0) > 0,
  ).sort((a, b) => (local.counts[b.key] ?? 0) - (local.counts[a.key] ?? 0));

  const mineIndex = local.mine
    ? visible.findIndex((r) => r.key === local.mine)
    : -1;
  let top = visible.slice(0, TOP_PILLS);
  // Keep the viewer's own reaction visible even when it isn't a top-3 count.
  if (mineIndex >= TOP_PILLS) {
    top = [...visible.slice(0, TOP_PILLS - 1), visible[mineIndex]];
  }
  const topKeys = new Set(top.map((r) => r.key));
  const overflow = visible.filter((r) => !topKeys.has(r.key));

  function Pill({ rKey }: { rKey: string }) {
    const active = local.mine === rKey;
    return (
      <button
        type="button"
        title={LABEL[rKey]}
        onClick={(e) => {
          e.stopPropagation();
          toggle(rKey as FeedReactionKey);
        }}
        data-testid={`reaction-${rKey}-${item.id}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors border",
          active
            ? "bg-accent/15 border-accent/40 text-accent"
            : "bg-secondary/50 border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        <span className="text-[13px] leading-none">{EMOJI[rKey]}</span>
        <span className="font-mono tabular-nums text-[11px]">
          {local.counts[rKey]}
        </span>
      </button>
    );
  }

  return (
    <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
      {top.map((r) => (
        <Pill key={r.key} rKey={r.key} />
      ))}

      {overflow.length > 0 && (
        <Popover open={breakdownOpen} onOpenChange={setBreakdownOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              data-testid={`reaction-overflow-${item.id}`}
              title="Show all reactions"
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono tabular-nums transition-colors border border-transparent",
                "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              +{overflow.length}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            className="w-56 p-2 rounded-xl bg-surface-2 border-border shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-1 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60">
              Reactions
            </p>
            <div className="space-y-0.5">
              {visible.map((r) => {
                const active = local.mine === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => toggle(r.key)}
                    data-testid={`reaction-breakdown-${r.key}-${item.id}`}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1 text-xs transition-colors",
                      active
                        ? "bg-accent/15 text-accent"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <span className="text-[14px] leading-none">{r.emoji}</span>
                    <span className="flex-1 text-left truncate">
                      {r.label}
                    </span>
                    <span className="font-mono tabular-nums text-[11px]">
                      {local.counts[r.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            data-testid={`reaction-add-${item.id}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors border border-transparent",
              "text-muted-foreground/70 hover:text-foreground hover:bg-secondary/60",
            )}
            aria-label="React"
          >
            <SmilePlus className="w-3.5 h-3.5" />
            {visible.length === 0 && <span>React</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-auto p-1.5 rounded-xl bg-surface-2 border-border shadow-card"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 16 reactions wrap into a clean 8-per-row grid. */}
          <div className="grid grid-cols-8 gap-0.5">
            {FEED_REACTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                title={r.label}
                onClick={() => toggle(r.key)}
                data-testid={`reaction-pick-${r.key}-${item.id}`}
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-lg text-base transition-colors",
                  local.mine === r.key ? "bg-accent/15" : "hover:bg-secondary",
                )}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {trailing}
    </div>
  );
}
