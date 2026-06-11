import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Copy, ExternalLink } from "lucide-react";

export const DONATION_ADDRESS = "DSg7mQ8kzCmuSVzJXPJjCQLq5H7Aiar8GpvkFF6mUb7z";

function CopyButton({ text, label }: { text: string; label?: string }) {
  const { toast } = useToast();

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast({ title: "Address copied", description: "The address is now on your clipboard." });
        } catch {
          toast({ title: "Copy failed", description: "Your browser did not allow clipboard access.", variant: "destructive" });
        }
      }}
      className="inline-flex items-center gap-2 border border-border text-muted-foreground hover:text-foreground hover:border-accent transition-colors px-3 py-2 text-xs font-medium"
    >
      <Copy className="w-3.5 h-3.5" />
      {label ?? "Copy Address"}
    </button>
  );
}

function SolscanLink({ address }: { address: string }) {
  return (
    <a
      href={`https://solscan.io/account/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
    >
      <ExternalLink className="w-3.5 h-3.5" />
      View on Solscan
    </a>
  );
}

/** Truncate a long address to a single-line `DSg7mQ8k…mUb7z` form. */
function shortenAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-5)}`;
}

/**
 * Premium single-line address container. Shows a truncated address that never
 * wraps; the full address is always what gets copied / linked.
 */
function AddressDisplay({ address }: { address: string }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center min-w-0 bg-background border border-border px-3 py-2.5">
        <code
          className="font-mono text-sm text-foreground whitespace-nowrap tracking-tight"
          title={address}
          data-testid="text-donation-address"
        >
          {shortenAddress(address)}
        </code>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <CopyButton text={address} label="Copy Address" />
        <SolscanLink address={address} />
      </div>
    </div>
  );
}

function SocialLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 border border-border text-muted-foreground hover:text-foreground hover:border-accent transition-colors px-4 py-2 text-sm font-medium"
    >
      {icon}
      {label}
    </a>
  );
}

export function SupportSection({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className={cn("space-y-5", className)}>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Support BlackPebble Development</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Contributions help fund infrastructure, market data, anti-cheat systems, tournaments,
            leaderboard improvements, and future platform development.
          </p>
        </div>
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Solana donation address</div>
          <AddressDisplay address={DONATION_ADDRESS} />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SocialLink
            href="https://x.com/BlackPebbleFun"
            label="Follow on X"
            icon={
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            }
          />
          <SocialLink
            href="https://t.me/BlackPebbleFun"
            label="Join Telegram"
            icon={
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
            }
          />
        </div>
        <div className="text-[10px] text-muted-foreground/60 leading-relaxed max-w-sm">
          Disclaimer: Donations are completely optional and do not provide any trading, leaderboard,
          ranking, tier, or platform advantages.
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-8", className)}>
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">Support BlackPebble Development</h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          BlackPebble is community-supported. Contributions help fund infrastructure, market data,
          anti-cheat systems, tournaments, leaderboard improvements, wallet tools, and future
          platform development.
        </p>
      </div>

      <div className="rounded-xl bg-card shadow-card p-4 sm:p-6 space-y-5">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Solana Donation Address
          </div>
          <AddressDisplay address={DONATION_ADDRESS} />
        </div>

        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Stay Connected
          </div>
          <div className="flex flex-wrap gap-3">
            <SocialLink
              href="https://x.com/BlackPebbleFun"
              label="Follow on X"
              icon={
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              }
            />
            <SocialLink
              href="https://t.me/BlackPebbleFun"
              label="Join Telegram"
              icon={
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Support &amp; Suggestions
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Questions, bug reports, feature suggestions, or partnership inquiries?
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              Official Contact:{" "}
              <a
                href="https://x.com/BlackPebbleFun"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-accent transition-colors underline underline-offset-2"
              >
                @BlackPebbleFun
              </a>
            </span>
            <span>
              Founder:{" "}
              <a
                href="https://x.com/pumpgunna"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-accent transition-colors underline underline-offset-2"
              >
                @pumpgunna
              </a>
            </span>
          </div>
        </div>

        <div className="text-xs text-muted-foreground/60 leading-relaxed border-t border-border pt-4">
          Disclaimer: Donations are completely optional and do not provide any trading, leaderboard,
          ranking, tier, or platform advantages.
        </div>
      </div>
    </div>
  );
}
