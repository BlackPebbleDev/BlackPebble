import { useEffect, useRef, useState } from "react";
import { Share2, Send, MessagesSquare, Link2, Check } from "lucide-react";
import type { TokenInfo } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** Inline X (twitter) glyph — lucide has no brand mark for it. */
function XGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

/**
 * Universal share control for a token page. Opens a small menu with X,
 * Telegram, Discord, and Copy Link options; on devices that support the native
 * Web Share sheet (most mobile browsers) the trigger fires that directly.
 *
 * The shared link is always the current token-page URL, and the text is a short
 * human caption built from the token's symbol/name. No trading behaviour.
 */
export function ShareToken({ info }: { info: TokenInfo }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const url = typeof window !== "undefined" ? window.location.href : "";
  const label = info.symbol
    ? `$${info.symbol}`
    : info.name ?? "this token";
  const text = `${label} on BlackPebble`;

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function nativeShare() {
    try {
      await navigator.share({ title: text, text, url });
    } catch {
      /* user cancelled or unsupported — no-op */
    }
  }

  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: "Link copied" });
    } catch {
      toast({
        title: "Couldn't copy link",
        description: "Copy it from your address bar instead.",
        variant: "destructive",
      });
    }
    setOpen(false);
  }

  async function copyForDiscord() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast({
        title: "Copied for Discord",
        description: "Paste it into any channel or DM.",
      });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Copy the link from your address bar instead.",
        variant: "destructive",
      });
    }
    setOpen(false);
  }

  function handleTrigger() {
    if (canNativeShare) {
      void nativeShare();
      return;
    }
    setOpen((o) => !o);
  }

  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    text,
  )}&url=${encodeURIComponent(url)}`;
  const tgHref = `https://t.me/share/url?url=${encodeURIComponent(
    url,
  )}&text=${encodeURIComponent(text)}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleTrigger}
        data-testid="button-share-token"
        title="Share"
        className={cn(
          "flex items-center gap-2 px-4 h-10 rounded-full text-xs font-medium transition-all",
          open
            ? "bg-secondary text-foreground"
            : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary",
        )}
      >
        <Share2 className="w-4 h-4" />
        Share
      </button>
      {open && !canNativeShare && (
        <div className="absolute left-0 z-40 mt-2 w-48 rounded-xl bg-card border border-border shadow-card py-1.5 animate-in fade-in zoom-in-95 duration-200 origin-top-left">
          <a
            href={xHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            data-testid="share-x"
            className="flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <XGlyph className="w-3.5 h-3.5" />
            Share on X
          </a>
          <a
            href={tgHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            data-testid="share-telegram"
            className="flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Share on Telegram
          </a>
          <button
            type="button"
            onClick={copyForDiscord}
            data-testid="share-discord"
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <MessagesSquare className="w-3.5 h-3.5" />
            Copy for Discord
          </button>
          <div className="my-1 border-t border-border/60" />
          <button
            type="button"
            onClick={copyLink}
            data-testid="share-copy-link"
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-accent" />
            ) : (
              <Link2 className="w-3.5 h-3.5" />
            )}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
