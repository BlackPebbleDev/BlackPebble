import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  useGuestStore,
  guestExpiresAt,
  resetExpiredGuest,
  GUEST_RESET_HOURS,
} from "@/lib/guest-store";

/**
 * Shown to guests after their FIRST trade: a live countdown to when their
 * temporary portfolio resets, plus a nudge to register and keep it. The clock
 * doesn't start at account creation - only once the guest actually trades
 * (first_trade_at). When the window elapses, the guest store is wiped back to a
 * fresh state and this hides itself again.
 */
export function GuestCountdown() {
  const guest = useGuestStore();
  const expiresAt = guestExpiresAt(guest);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (expiresAt == null) return;
    const id = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // Once expired, reset the guest portfolio (same effect the store applies on
  // next load) so the UI and storage agree without a manual refresh.
  useEffect(() => {
    if (expiresAt != null && nowSec >= expiresAt) {
      resetExpiredGuest();
    }
  }, [expiresAt, nowSec]);

  // No countdown until the guest has traded.
  if (expiresAt == null) return null;

  const remaining = Math.max(0, expiresAt - nowSec);
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const label =
    hours > 0
      ? `${hours}h ${minutes}m`
      : minutes > 0
        ? `${minutes}m ${seconds}s`
        : `${seconds}s`;

  return (
    <div
      data-testid="banner-guest-countdown"
      className="flex flex-col gap-3 rounded-xl border border-warning/20 bg-gradient-to-r from-amber-500/[0.12] to-amber-500/[0.04] px-4 py-3.5 mb-6 shadow-card sm:flex-row sm:items-center sm:gap-3"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
        <Clock className="h-4 w-4" />
      </div>
      <p className="text-xs leading-relaxed text-foreground/90">
        Your guest portfolio resets in{" "}
        <span
          data-testid="text-guest-countdown"
          className="font-semibold text-amber-300 tabular-nums"
        >
          {label}
        </span>
        . Connect X to save your trades, build your profile, and keep your
        trading history - guest data is cleared {GUEST_RESET_HOURS}h after your
        first trade.
      </p>
    </div>
  );
}
