import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Small circular token logo with a graceful fallback. When no logo is available
 * (or it fails to load) it shows the symbol's initial, or "?" when the token is
 * unknown. Purely presentational - shared by the recovery account list and the
 * confirmation preview so both render token identity identically.
 */
export function TokenAvatar({
  logo,
  symbol,
  size = 32,
  className,
}: {
  logo?: string | null;
  symbol?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = !failed ? (logo ?? null) : null;
  const trimmed = symbol?.trim() ?? "";
  const initial = trimmed ? trimmed.slice(0, 1).toUpperCase() : "?";

  return (
    <div
      className={cn(
        "rounded-full overflow-hidden bg-secondary flex items-center justify-center flex-shrink-0",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span
          className="font-semibold text-muted-foreground leading-none"
          style={{ fontSize: Math.max(9, Math.round(size * 0.34)) }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
