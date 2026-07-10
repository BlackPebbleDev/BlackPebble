import * as React from "react";
import { Bell, CheckCheck, X, Inbox } from "lucide-react";
import { useLocation } from "wouter";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TOAST_ACCENT_TEXT, type ToastVariant } from "@/components/ui/toast";
import { KIND_STYLE } from "@/lib/activity-toast";
import {
  useNotifications,
  setActiveNotificationUser,
  type NotificationItem,
} from "@/lib/notifications-store";
import { useXAuth } from "@/hooks/use-x-auth";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

// Keep chip toning identical to the toast chips (components/ui/toaster.tsx)
// so a metric looks the same whether it appears in a toast or the center.
const CHIP_TONE: Record<string, string> = {
  up: "text-emerald-300 border-emerald-400/25 bg-emerald-400/10",
  down: "text-orange-300 border-orange-400/25 bg-orange-400/10",
  neutral: "text-foreground/70 border-white/10 bg-white/[0.04]",
};

function NotificationRow({
  item,
  onRead,
  onRemove,
}: {
  item: NotificationItem;
  onRead: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [, navigate] = useLocation();
  const style = KIND_STYLE[item.kind];
  const Icon = style?.icon ?? Bell;
  const accent = TOAST_ACCENT_TEXT[(style?.variant ?? "default") as ToastVariant];

  function handleClick() {
    if (!item.read) onRead(item.id);
    if (item.href) navigate(item.href);
  }

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-3 py-3 rounded-lg cursor-pointer transition-colors",
        item.read ? "opacity-60 hover:opacity-90" : "bg-white/[0.03] hover:bg-white/[0.06]",
      )}
      onClick={handleClick}
    >
      {!item.read && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-full bg-accent" />
      )}
      <div className="flex-shrink-0 mt-0.5">
        {item.pfp ? (
          <img
            src={item.pfp}
            alt=""
            className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10"
          />
        ) : item.tokenLogo ? (
          <img
            src={item.tokenLogo}
            alt=""
            className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/10">
            <Icon className={cn("h-4 w-4", accent)} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="text-sm font-semibold leading-tight text-foreground truncate">
            {item.title}
          </p>
          <span className="ml-auto flex-shrink-0 text-[10px] text-muted-foreground/70 whitespace-nowrap">
            {timeAgo(item.timestamp)}
          </span>
        </div>
        {item.description && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-snug break-words">
            {item.description}
          </p>
        )}
        {item.chips && item.chips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.chips.map((c, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                  CHIP_TONE[c.tone ?? "neutral"],
                )}
              >
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label="Dismiss notification"
        className="absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-white/10 hover:text-foreground group-hover:flex"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item.id);
        }}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function NotificationCenter() {
  const { user } = useXAuth();
  const uid = user?.id ?? null;
  const { items, unreadCount, markRead, markAllRead, remove, clearAll } =
    useNotifications();

  // Point the localStorage-backed store at the current user (or guest). Loads
  // that user's persisted items; never replays historical backlog as new.
  React.useEffect(() => {
    setActiveNotificationUser(uid != null ? String(uid) : null);
  }, [uid]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          data-testid="button-notifications"
          className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] h-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-accent-foreground ring-2 ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[calc(100vw-1.5rem)] max-w-sm sm:w-96 p-0 overflow-hidden rounded-xl border-white/10 bg-zinc-950/90 text-foreground shadow-[0_16px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-wide">Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                {unreadCount} new
              </span>
            )}
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  data-testid="button-mark-all-read"
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-white/10">
              <Inbox className="h-5 w-5 text-muted-foreground/70" />
            </span>
            <p className="text-sm font-medium text-foreground">You're all caught up</p>
            <p className="max-w-[220px] text-xs text-muted-foreground">
              Your trade fills, milestones, and account activity will show up here.
            </p>
          </div>
        ) : (
          <div className="no-scrollbar max-h-[min(70vh,26rem)] overflow-y-auto">
            <div className="flex flex-col gap-0.5 p-1.5">
              {items.map((it) => (
                <NotificationRow
                  key={it.id}
                  item={it}
                  onRead={markRead}
                  onRemove={remove}
                />
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
