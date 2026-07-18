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
        aliases: ["blackpebble", "what is blackpebble", "about blackpebble"],
        shortAnswer:
          "BlackPebble is a Solana memecoin trading-intelligence platform where you paper trade with simulated funds and use optional wallet tools that only touch real funds after you review and sign.",
        difficulty: "beginner",
        estimatedMinutes: 4,
        chainScope: "solana",
        example:
          "Paper trade BONK with virtual SOL on the Trading Desk, then separately connect a wallet to scan for recoverable rent in Wallet Cleanup.",
        relatedLessonSlugs: ["paper-vs-real-trading", "use-blackpebble-safely"],
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
        aliases: ["simulated trading", "virtual trading", "paper trading", "practice trading"],
        keywords: ["paper trade", "live prices", "real funds", "practice"],
        shortAnswer:
          "Paper trading practices at live prices with simulated funds; real wallet actions spend real SOL and require your signature. Never confuse the two.",
        difficulty: "beginner",
        estimatedMinutes: 4,
        chainScope: "universal",
        example:
          "A +40% paper trade does not move real SOL. Closing an empty token account in Wallet Cleanup does move real SOL after you approve.",
        relatedLessonSlugs: ["what-is-blackpebble", "use-blackpebble-safely", "connecting-vs-signing"],
        related: { label: "Trading Desk", path: "/" },
        callout: {
          type: "safety",
          text: "Connecting a wallet is not the same as signing a transaction. Review every prompt before approving.",
        },
        quiz: {
          id: "paper-vs-real-trading-quiz",
          questions: [
            {
              id: "q1",
              prompt: "A profitable paper trade means:",
              options: [
                "Real SOL was added to your wallet",
                "You practiced at live prices with simulated funds",
                "You signed a transaction",
                "You paid network fees",
              ],
              correctIndex: 1,
              explanation:
                "Paper trading uses simulated funds at live prices; no real SOL moves and no signature is required.",
            },
          ],
        },
      },
    ),
    L(
      "use-blackpebble-safely",
      "How to Use BlackPebble Safely",
      "Never enter a seed phrase or private key. Review every wallet prompt. Use a burner wallet when testing wallet tools. Verify the token contract address. Start with small amounts for real on-chain tools.",
      "Basic safety habits protect your funds even when a tool or interface looks polished.",
      {
        aliases: ["safety", "use safely", "safety habits", "stay safe"],
        shortAnswer:
          "Never share your seed phrase, review every wallet prompt, use a burner for testing tools, verify contract addresses, and start small with real on-chain actions.",
        difficulty: "beginner",
        estimatedMinutes: 4,
        chainScope: "universal",
        relatedLessonSlugs: ["connecting-vs-signing", "private-key-and-seed", "paper-vs-real-trading"],
        related: { label: "Wallet Safety", path: "/safety" },
        callout: {
          type: "safety",
          text: "BlackPebble never needs your seed phrase. If any site asks for it, leave immediately.",
        },
        quiz: {
          id: "use-blackpebble-safely-quiz",
          questions: [
            {
              id: "q1",
              prompt: "Which habit best protects you when testing a new wallet tool?",
              options: [
                "Use your main wallet with everything in it",
                "Use a burner wallet with limited funds",
                "Share your seed phrase with support",
                "Approve unlimited token spending",
              ],
              correctIndex: 1,
              explanation:
                "A burner wallet limits exposure if a tool or site turns out to be unsafe.",
            },
          ],
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
