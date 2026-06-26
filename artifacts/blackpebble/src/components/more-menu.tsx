import { useEffect, useRef, useState } from "react";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type ProviderCategory = "trading" | "analytics" | "research";

interface ExternalProvider {
  label: string;
  category: ProviderCategory;
  /** Absolute path from public root, e.g. "/provider-logos/axiom.jpg" */
  logo: string;
  /**
   * When true the provider needs a DEX pair/pool address, not just a mint.
   * If pairAddress is null the row is rendered disabled.
   */
  requiresPair: boolean;
  /**
   * Returns the destination URL.
   * mint       = token mint address (always available)
   * pairOrMint = pairAddress ?? mint (use for pair-aware URLs)
   * Return null to disable the link (e.g. when pair is unavailable).
   */
  buildHref: (mint: string, pairOrMint: string) => string | null;
}

/**
 * Single source of truth for every external provider in the More menu.
 * To add a new provider: append one object here — no other code changes needed.
 *
 * Identifier notes (verified):
 *   mint       — Axiom, GMGN, Terminal (static), Phantom, Jupiter, Birdeye,
 *                BubbleMaps, RugCheck, Solscan
 *   pairOrMint — DexScreener (accepts both), Photon (LP addr), GeckoTerminal
 *                (pool addr), DEXTools (pair addr)
 *
 * Pump.fun Terminal: no token deep-link exists (catch-all SPA shell verified via
 * bundle inspection). Static sign-in fallback used.
 * Phantom: verified Next.js /token/[mint] route with dedicated layout/loading chunks.
 */
const PROVIDERS: ExternalProvider[] = [
  // ── TRADING ────────────────────────────────────────────────────────────────
  {
    label: "Axiom",
    category: "trading",
    logo: "/provider-logos/axiom.jpg",
    requiresPair: false,
    buildHref: (mint) => `https://axiom.trade/t/${mint}`,
  },
  {
    label: "GMGN",
    category: "trading",
    logo: "/provider-logos/gmgn.png",
    requiresPair: false,
    buildHref: (mint) => `https://gmgn.ai/sol/token/${mint}`,
  },
  {
    label: "Photon",
    category: "trading",
    logo: "/provider-logos/photon.png",
    requiresPair: true,
    buildHref: (_, pairOrMint) =>
      `https://photon-sol.tinyastro.io/en/lp/${pairOrMint}`,
  },
  {
    label: "Terminal",
    category: "trading",
    logo: "/provider-logos/terminal.svg",
    requiresPair: false,
    // No token-specific deep link — verified via bundle route inspection
    buildHref: () => "https://terminal.pump.fun/sign-in",
  },
  {
    label: "Phantom",
    category: "trading",
    logo: "/provider-logos/phantom.png",
    requiresPair: false,
    // Verified: Next.js SSR route /token/[address] with dedicated chunks
    buildHref: (mint) => `https://trade.phantom.com/token/${mint}`,
  },
  {
    label: "Jupiter",
    category: "trading",
    logo: "/provider-logos/jupiter.png",
    requiresPair: false,
    buildHref: (mint) => `https://jup.ag/swap/SOL-${mint}`,
  },

  // ── ANALYTICS ──────────────────────────────────────────────────────────────
  {
    label: "DexScreener",
    category: "analytics",
    logo: "/provider-logos/dexscreener.png",
    requiresPair: false,
    buildHref: (_, pairOrMint) =>
      `https://dexscreener.com/solana/${pairOrMint}`,
  },
  {
    label: "Birdeye",
    category: "analytics",
    logo: "/provider-logos/birdeye.png",
    requiresPair: false,
    buildHref: (mint) => `https://birdeye.so/token/${mint}?chain=solana`,
  },
  {
    label: "GeckoTerminal",
    category: "analytics",
    logo: "/provider-logos/geckoterminal.jpg",
    requiresPair: true,
    buildHref: (_, pairOrMint) =>
      `https://www.geckoterminal.com/solana/pools/${pairOrMint}`,
  },
  {
    label: "DEXTools",
    category: "analytics",
    logo: "/provider-logos/dextools.png",
    requiresPair: true,
    buildHref: (_, pairOrMint) =>
      `https://www.dextools.io/app/en/solana/pair-explorer/${pairOrMint}`,
  },

  // ── RESEARCH & SECURITY ────────────────────────────────────────────────────
  {
    label: "RugCheck",
    category: "research",
    logo: "/provider-logos/rugcheck.png",
    requiresPair: false,
    buildHref: (mint) => `https://rugcheck.xyz/tokens/${mint}`,
  },
  {
    label: "BubbleMaps",
    category: "research",
    logo: "/provider-logos/bubblemaps.jpg",
    requiresPair: false,
    buildHref: (mint) => `https://app.bubblemaps.io/sol/token/${mint}`,
  },
  {
    label: "Solscan",
    category: "research",
    logo: "/provider-logos/solscan.png",
    requiresPair: false,
    buildHref: (mint) => `https://solscan.io/token/${mint}`,
  },
];

const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  trading: "Trading",
  analytics: "Analytics",
  research: "Research & Security",
};

const CATEGORY_ORDER: ProviderCategory[] = ["trading", "analytics", "research"];

interface ProviderLogoProps {
  src: string;
  label: string;
}

function ProviderLogo({ src, label }: ProviderLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="flex w-[18px] h-[18px] shrink-0 items-center justify-center rounded-sm bg-secondary text-[9px] font-semibold text-muted-foreground uppercase">
        {label[0]}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={label}
      width={18}
      height={18}
      className="w-[18px] h-[18px] shrink-0 rounded-sm object-contain"
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

interface MoreMenuProps {
  mint: string;
  pairAddress: string | null;
}

export function MoreMenu({ mint, pairAddress }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
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

  const pairOrMint = pairAddress ?? mint;

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    providers: PROVIDERS.filter((p) => p.category === cat),
  }));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="button-token-more"
        title="More"
        className={cn(
          "flex items-center gap-2 px-4 h-10 rounded-full text-xs font-medium transition-all",
          open
            ? "bg-secondary text-foreground"
            : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary",
        )}
      >
        <MoreHorizontal className="w-4 h-4" />
        More
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-48 rounded-xl bg-card border border-border shadow-card overflow-hidden">
          <div className="max-h-[min(440px,78vh)] overflow-y-auto py-1">
            {grouped.map((group, gi) => (
              <div key={group.category}>
                {gi > 0 && (
                  <div className="mx-3 my-1 border-t border-border/40" />
                )}
                <div className="px-3 pt-1.5 pb-0.5">
                  <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
                    {group.label}
                  </span>
                </div>
                {group.providers.map((provider) => {
                  const hasPair = !!pairAddress;
                  const disabled = provider.requiresPair && !hasPair;
                  const href = disabled
                    ? null
                    : provider.buildHref(mint, pairOrMint);

                  const rowClass = cn(
                    "flex items-center gap-2.5 px-3 py-[7px] text-xs transition-colors",
                    disabled
                      ? "opacity-40 cursor-not-allowed text-muted-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 cursor-pointer",
                  );

                  const inner = (
                    <>
                      <ProviderLogo src={provider.logo} label={provider.label} />
                      <span className="flex-1 truncate">{provider.label}</span>
                      {!disabled && (
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                      )}
                    </>
                  );

                  if (disabled || !href) {
                    return (
                      <div
                        key={provider.label}
                        className={rowClass}
                        title="Pair address unavailable for this token"
                      >
                        {inner}
                      </div>
                    );
                  }

                  return (
                    <a
                      key={provider.label}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpen(false)}
                      className={rowClass}
                    >
                      {inner}
                    </a>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
