import { L } from "../helpers";
import type { AcademyCategory } from "../types";

export const memecoinMarketsCategory: AcademyCategory = {
  id: "memecoin-markets",
  title: "Memecoin Market Dynamics",
  icon: "rocket",
  lessons: [
    L(
      "launch-lifecycle",
      "Launch Lifecycle",
      "Memecoins often start on a bonding curve (price rises with each buy), then migrate to a DEX after graduation when a funding threshold is met. Pre-migration tokens have different liquidity rules than post-migration tokens.",
      "Understanding phases helps you know whether a token is early, migrating, or established.",
      { aliases: ["bonding curve", "migration", "graduation", "new pair"], related: { label: "Markets", path: "/markets" } },
    ),
    L(
      "liquidity-seeding",
      "Liquidity Seeding",
      "Liquidity seeding is when early funds create the DEX pool at migration. The initial pool depth affects post-migration volatility and slippage.",
      "Thin initial liquidity means early swaps may have large price impact.",
      { aliases: ["LP seeding", "initial liquidity"] },
    ),
    L(
      "wallet-distribution",
      "Wallet Distribution",
      "Dev wallet is the creator address. Bundled supply is when the dev launches with tokens spread across multiple wallets. Snipers buy immediately at launch, often with bots. Insiders get tokens before or at launch through coordination.",
      "High insider or bundled concentration increases dump risk.",
      { aliases: ["dev wallet", "sniper", "insider", "bundled supply"], callout: { type: "safety", text: "Beware of tokens where the dev or insiders hold large percentages." } },
    ),
    L(
      "top-holders",
      "Top Holders and Distribution",
      "Top holder percentage shows how much supply sits in the largest wallets. Concentrated ownership means fewer players can move the market.",
      "Diversified holder bases are generally safer from coordinated sells.",
      { aliases: ["holder distribution", "whale concentration", "top 10 holders"] },
    ),
    L(
      "burned-vs-locked",
      "Burned vs Locked Liquidity",
      "Burned liquidity is permanently destroyed. Locked liquidity is inaccessible until a time unlock. Both reduce immediate rug risk, but lock expiration matters.",
      "Verify lock duration and whether the lock provider is trustworthy.",
      { aliases: ["burned LP", "locked LP", "liquidity lock"], callout: { type: "safety", text: "Burned is permanent. Locked can unlock. Check the unlock date." } },
    ),
    L(
      "token-authorities",
      "Token Authorities",
      "Mint authority can create new supply. Freeze authority can lock token accounts. If these are not revoked, the creator retains dangerous powers.",
      "Revoked authorities reduce risk. Check token details before buying.",
      { aliases: ["mint authority", "freeze authority", "revoked authority"], callout: { type: "safety", text: "If mint or freeze authority exists, the creator can manipulate supply or freeze wallets." } },
    ),
    L(
      "token-2022",
      "Token-2022 Extensions",
      "Token-2022 is a newer Solana token standard with additional features like built-in transfer taxes, interest, and metadata. Some features can be misused.",
      "Understand what extensions a token uses before trading.",
      { aliases: ["Token22", "SPL extensions"], callout: { type: "advanced", text: "Token-2022 can enable transfer taxes or other mechanics that affect trades." } },
    ),
    L(
      "market-cap-phases",
      "Market Cap Phases",
      "Launch MC is the initial valuation. Peak MC is the highest reached. Current MC is now. Tracking these phases shows where hype peaked and where it stands relative to history.",
      "Comparing current to peak MC helps frame risk and opportunity.",
      { aliases: ["launch cap", "peak cap", "current cap"] },
    ),
    L(
      "rug-pulls",
      "Rug Pulls",
      "A rug pull is when creators abandon or drain liquidity, crashing the price. A slow rug is a gradual sell-off by insiders. Both leave later buyers holding worthless tokens.",
      "Watch for sudden liquidity removal or coordinated insider sells.",
      { aliases: ["rug", "slow rug", "soft rug"], callout: { type: "safety", text: "Rugs can happen fast. Watch liquidity, holder changes, and dev activity." } },
    ),
    L(
      "cto",
      "Community Takeover",
      "CTO (community takeover) happens when the original dev abandons a project and the community revives it. Success depends on new organizers and remaining liquidity.",
      "CTOs can recover or fail. They are high-risk revival attempts.",
      { aliases: ["CTO", "takeover"] },
    ),
    L(
      "narratives-and-rotation",
      "Narratives and Rotation",
      "A narrative is a trending theme driving attention (AI, cat coins, political tokens). Meta is the current dominant narrative. Rotation is capital moving from one narrative to another. Momentum is the strength of a trend.",
      "Narratives shift fast. Timing entries and exits around rotation is difficult.",
      { aliases: ["narrative", "meta", "rotation", "momentum"] },
    ),
    L(
      "token-size-tiers",
      "Token Size Tiers",
      "Low-cap tokens have small market caps with high volatility. Micro-caps are even smaller and riskier. Blue-chip memecoins have survived and grown large, carrying less speculation risk but also less upside.",
      "Smaller caps move faster in both directions.",
      { aliases: ["low-cap", "micro-cap", "blue chip"] },
    ),
  ],
};
