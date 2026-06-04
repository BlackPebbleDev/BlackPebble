import { cn } from "@/lib/utils";

/**
 * Secondary, optional sign-in with X (Twitter).
 *
 * Wallet connection remains the PRIMARY identity for paper trading. This button
 * is scaffolding for a future X OAuth flow that will let users attach an X
 * profile (avatar + username) to their account for leaderboards and shareable
 * PnL cards.
 *
 * It is intentionally inert until OAuth is configured server-side. There is no
 * fake/simulated login here — flip X_LOGIN_ENABLED once the real OAuth
 * (PKCE, server-side token exchange) and the `/auth/x/*` routes exist.
 */
const X_LOGIN_ENABLED = false;

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function XLoginButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      disabled={!X_LOGIN_ENABLED}
      title={X_LOGIN_ENABLED ? "Sign in with X" : "X sign-in is coming soon"}
      data-testid="button-login-x"
      className={cn(
        "inline-flex items-center gap-2 h-9 px-3 text-xs font-medium border border-border bg-secondary text-muted-foreground transition-colors",
        "hover:enabled:text-accent hover:enabled:border-accent disabled:cursor-not-allowed disabled:opacity-80",
        className,
      )}
    >
      <XLogo className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="whitespace-nowrap">
        {X_LOGIN_ENABLED ? "Login with X" : "Login with X (Coming Soon)"}
      </span>
    </button>
  );
}
