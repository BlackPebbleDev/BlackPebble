import { L } from "../helpers";
import type { AcademyCategory } from "../types";

export const startHereCategory: AcademyCategory = {
  id: "start-here",
  title: "Start Here",
  icon: "compass",
  lessons: [
    L(
      "what-is-blackpebble",
      "What BlackPebble Is",
      "BlackPebble is a Solana memecoin trading intelligence platform combining live-data paper trading, portfolio analytics, public trader profiles, calls, thesis posts, reputation, Trading Intelligence, Community Campaigns, and wallet utilities.",
      "Understanding what is simulated versus what touches your real wallet helps you use the platform confidently.",
      {
        example:
          "Paper trade BONK with virtual SOL on the Trading Desk, then separately connect a wallet to scan for recoverable rent in Wallet Cleanup.",
        related: { label: "Features overview", path: "/features" },
        callout: {
          type: "beginner",
          text: "Paper trading uses simulated balances. Wallet utilities may create real on-chain transactions only after you review and sign.",
        },
      },
    ),
    L(
      "paper-vs-real-trading",
      "Paper Trading vs Real Trading",
      "Paper trading uses simulated funds to practice at live market prices. Real wallet actions like SOL recovery or token burns require your signature and spend real network fees.",
      "Confusing paper results with real money, or treating real wallet prompts like practice, is how beginners get hurt.",
      {
        aliases: ["simulated trading", "virtual trading"],
        example:
          "A +40% paper trade does not move real SOL. Closing an empty token account in Wallet Cleanup does move real SOL after you approve.",
        related: { label: "Trading Desk", path: "/" },
        callout: {
          type: "safety",
          text: "Connecting a wallet is not the same as signing a transaction. Review every prompt before approving.",
        },
      },
    ),
    L(
      "use-blackpebble-safely",
      "How to Use BlackPebble Safely",
      "Never enter a seed phrase or private key. Review every wallet prompt. Use a burner wallet when testing wallet tools. Verify the token contract address. Start with small amounts for real on-chain tools.",
      "Basic safety habits protect your funds even when a tool or interface looks polished.",
      {
        related: { label: "Wallet Safety", path: "/safety" },
        callout: {
          type: "safety",
          text: "BlackPebble never needs your seed phrase. If any site asks for it, leave immediately.",
        },
      },
    ),
    L(
      "beginner-learning-path",
      "Beginner Learning Path",
      "Start with wallet safety, then understand market cap and liquidity, try paper trading, learn limit orders with TP and SL, review portfolio analytics, explore calls and thesis posts, use wallet tools cautiously, then explore advanced features.",
      "A structured path reduces overwhelm and helps you build skills before taking on higher-risk actions.",
      {
        related: { label: "Wallet Safety", path: "/safety" },
        callout: {
          type: "beginner",
          text: "Focus on safety and paper trading before real wallet actions.",
        },
      },
    ),
  ],
};
