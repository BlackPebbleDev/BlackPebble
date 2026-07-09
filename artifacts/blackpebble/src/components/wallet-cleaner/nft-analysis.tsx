import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  AlertTriangle,
  ExternalLink,
  ImageIcon,
  Layers,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Real read-only NFT & cNFT scanner, powered by the Helius DAS API on the same
 * RPC endpoint the rest of Wallet Cleanup already uses. Analysis only: nothing
 * here builds or signs a transaction. Burning NFTs/cNFTs requires Metaplex /
 * Bubblegum burn instructions that are intentionally not implemented yet -
 * this view detects and classifies so users can review what they hold.
 */

interface DasAsset {
  id: string;
  interface: string;
  compression?: { compressed?: boolean };
  content?: {
    metadata?: { name?: string; description?: string };
    links?: { image?: string };
  };
  grouping?: { group_key: string; group_value: string }[];
}

export interface ScannedNft {
  mint: string;
  name: string;
  image: string | null;
  collection: string | null;
  compressed: boolean;
  /** True when the metadata carries classic airdrop-spam markers. */
  likelySpam: boolean;
}

const FUNGIBLE_INTERFACES = new Set(["FungibleToken", "FungibleAsset"]);

/**
 * Spam heuristic for unsolicited NFT airdrops: metadata that pushes the user
 * to visit an external site to "claim" something. Conservative on purpose -
 * a miss is safe (read-only), a false positive is just a warning pill.
 */
const SPAM_PATTERNS =
  /(https?:\/\/|www\.|\.com|\.io|\.xyz|\.net|claim|airdrop|reward|voucher|winner|prize|\$\d)/i;

function classify(asset: DasAsset): ScannedNft {
  const name = asset.content?.metadata?.name?.trim() || "Unnamed asset";
  const description = asset.content?.metadata?.description ?? "";
  const compressed = asset.compression?.compressed === true;
  return {
    mint: asset.id,
    name,
    image: asset.content?.links?.image ?? null,
    collection:
      asset.grouping?.find((g) => g.group_key === "collection")?.group_value ??
      null,
    compressed,
    likelySpam: SPAM_PATTERNS.test(name) || SPAM_PATTERNS.test(description),
  };
}

/** Page through DAS getAssetsByOwner and keep only non-fungible assets. */
async function scanNfts(
  endpoint: string,
  owner: string,
): Promise<ScannedNft[]> {
  const out: ScannedNft[] = [];
  const limit = 1000;
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "wallet-cleanup-nft-scan",
        method: "getAssetsByOwner",
        params: { ownerAddress: owner, page, limit },
      }),
    });
    if (!res.ok) throw new Error(`NFT scan failed (${res.status})`);
    const json = (await res.json()) as {
      result?: { items?: DasAsset[] };
      error?: { message?: string };
    };
    if (json.error) {
      throw new Error(json.error.message ?? "NFT scan failed");
    }
    const items = json.result?.items ?? [];
    for (const item of items) {
      if (FUNGIBLE_INTERFACES.has(item.interface)) continue;
      out.push(classify(item));
    }
    if (items.length < limit) break;
  }
  return out;
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-lg",
          tone === "warn" && value > 0 ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function NftRow({ nft }: { nft: ScannedNft }) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5"
      data-testid={`nft-row-${nft.mint}`}
    >
      {nft.image && !imgFailed ? (
        <img
          src={nft.image}
          alt=""
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="w-8 h-8 rounded-lg object-cover flex-shrink-0 bg-secondary"
        />
      ) : (
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground truncate">
          {nft.name}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground truncate">
          {nft.collection
            ? `Collection ${shortAddr(nft.collection, 4)}`
            : shortAddr(nft.mint, 4)}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {nft.likelySpam && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/12 text-warning px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
            <AlertTriangle className="w-2.5 h-2.5" />
            Likely spam
          </span>
        )}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
            nft.compressed
              ? "bg-accent/10 text-accent"
              : "bg-muted-foreground/10 text-muted-foreground",
          )}
        >
          {nft.compressed ? "cNFT" : "NFT"}
        </span>
        <a
          href={`https://solscan.io/token/${nft.mint}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-accent transition-colors"
          aria-label="View on Solscan"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

export function NftAnalysis({ owner }: { owner: string | null }) {
  const { connection } = useConnection();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["nft-scan", owner],
    queryFn: () => scanNfts(connection.rpcEndpoint, owner!),
    enabled: !!owner,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const nfts = useMemo(() => data ?? [], [data]);
  const standard = nfts.filter((n) => !n.compressed);
  const compressed = nfts.filter((n) => n.compressed);
  const spam = nfts.filter((n) => n.likelySpam);
  // Spam and cNFT clutter first, then standard NFTs alphabetically.
  const sorted = useMemo(
    () =>
      [...nfts].sort((a, b) => {
        if (a.likelySpam !== b.likelySpam) return a.likelySpam ? -1 : 1;
        if (a.compressed !== b.compressed) return a.compressed ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [nfts],
  );

  if (!owner) return null;

  return (
    <section className="space-y-3" data-testid="nft-analysis">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground px-1">
        <Layers className="w-3.5 h-3.5 text-accent" />
        NFTs & compressed NFTs
      </div>

      {isLoading ? (
        <div className="rounded-xl bg-card shadow-card p-8 text-center">
          <Loader2 className="w-5 h-5 text-accent animate-spin mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            Scanning NFTs and compressed NFTs…
          </p>
        </div>
      ) : isError ? (
        <div className="rounded-xl bg-card shadow-card p-5 text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            {(error as Error)?.message ?? "NFT scan failed."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs text-accent hover:underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <SummaryTile label="Standard NFTs" value={standard.length} />
            <SummaryTile label="Compressed" value={compressed.length} />
            <SummaryTile label="Likely spam" value={spam.length} tone="warn" />
          </div>

          {nfts.length === 0 ? (
            <div className="rounded-xl bg-card shadow-card p-5 text-center text-xs text-muted-foreground">
              No NFTs or compressed NFTs found in this wallet.
            </div>
          ) : (
            <div className="rounded-xl bg-card shadow-card max-h-80 overflow-y-auto divide-y divide-border">
              {sorted.map((nft) => (
                <NftRow key={nft.mint} nft={nft} />
              ))}
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2.5">
            <ShieldCheck className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <span className="text-[11px] text-muted-foreground leading-relaxed">
              Read-only analysis - nothing here can be signed or burned.
              Never visit links inside NFTs marked as likely spam: they lead to
              wallet-drainer sites. NFT and cNFT burning will be added once the
              burn transactions are fully built and tested.
            </span>
          </div>
        </>
      )}
    </section>
  );
}
