import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { shortAddr } from "@/lib/format";

export function solscanTx(sig: string): string {
  return `https://solscan.io/tx/${sig}`;
}

export function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}`;
}

/**
 * One confirmed transaction signature with copy-to-clipboard plus Solscan and
 * Solana Explorer links. Shared by the recovery success screen and the recovery
 * history list so signature actions look and behave identically everywhere.
 */
export function SignatureRow({ sig }: { sig: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(sig);
      setCopied(true);
      toast({ title: "Signature copied" });
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5"
      data-testid={`recovery-signature-${sig}`}
    >
      <span className="font-mono text-xs text-foreground flex-1 min-w-0 truncate">
        {shortAddr(sig, 6)}
      </span>
      <button
        type="button"
        onClick={copy}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        aria-label="Copy signature"
        data-testid={`button-copy-signature-${sig}`}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-accent" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
      <a
        href={solscanTx(sig)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        data-testid={`link-solscan-${sig}`}
      >
        Solscan
        <ExternalLink className="w-3 h-3" />
      </a>
      <a
        href={explorerTx(sig)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        data-testid={`link-explorer-${sig}`}
      >
        Explorer
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
