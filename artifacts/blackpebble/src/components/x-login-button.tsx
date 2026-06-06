import { cn } from "@/lib/utils";
import { useXAuth } from "@/hooks/use-x-auth";

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function XLoginButton({ className }: { className?: string }) {
  const { loggedIn, user, login, logout } = useXAuth();

  if (loggedIn && user) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {user.x_avatar_url ? (
          <img
            src={user.x_avatar_url}
            alt={user.x_display_name || user.x_username}
            className="w-7 h-7 rounded-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] text-muted-foreground">
            <XLogo className="w-3.5 h-3.5" />
          </div>
        )}
        <div className="hidden lg:flex flex-col items-start leading-tight">
          <span className="text-[11px] text-foreground font-medium max-w-[120px] truncate">
            {user.x_display_name || user.x_username}
          </span>
          <span className="text-[10px] text-muted-foreground">@{user.x_username}</span>
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-[10px] text-muted-foreground hover:text-foreground ml-1"
          title="Disconnect X"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => login()}
      title="Sign in with X"
      aria-label="Sign in with X"
      data-testid="button-login-x"
      className={cn(
        "inline-flex items-center gap-2 h-9 px-3 text-xs font-medium border border-border bg-secondary text-muted-foreground transition-colors",
        "hover:text-accent hover:border-accent",
        className,
      )}
    >
      <XLogo className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="hidden lg:inline whitespace-nowrap">Login with X</span>
    </button>
  );
}
