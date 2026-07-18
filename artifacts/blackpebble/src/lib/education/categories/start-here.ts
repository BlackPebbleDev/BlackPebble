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
        interactiveModules: [{ id: "concept-reveal", config: {
          prompt: "Guess before you reveal each card. Knowing what is simulated versus real is the single most important thing on BlackPebble.",
          cards: [
            { front: "Paper trading a token — does this spend real SOL?", back: "Simulated. Live prices, virtual funds, zero risk. Nothing leaves your wallet." },
            { front: "Wallet Cleanup closing accounts — does this touch the chain?", back: "Real. It creates on-chain transactions — but only after you review and sign each one." },
            { front: "Viewing a trader's profile or calls — read or write?", back: "Read-only. You are looking at public history, not moving anything." },
          ],
        } }],
        diagrams: [{ id: "paper-trading", placement: "top" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Describe what BlackPebble is in one sentence",
          "Tell simulated features apart from real-wallet features",
          "Know where to start as a complete beginner",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "BlackPebble is a place to learn and practice Solana memecoin trading safely. You paper trade with simulated funds at live prices, study real traders, and use optional wallet tools that only ever touch real funds after you review and sign.",
          },
          {
            kind: "what",
            body: "It brings several things together: live-data paper trading, portfolio analytics, public trader profiles, calls and thesis posts, reputation, Trading Intelligence, Community Campaigns, and wallet utilities. Think of it as a flight simulator for crypto plus a set of real, opt-in tools.",
          },
          {
            kind: "why",
            body: "New traders usually lose money learning on real funds. BlackPebble lets you build the exact same skills — reading a chart, sizing a trade, spotting a scam — before a single real dollar is at risk.",
          },
          {
            kind: "stakes",
            body: "If you do not know which parts are simulated and which touch your real wallet, you can either treat a real signing prompt like a harmless game, or panic over a paper loss that never cost you anything. Knowing the difference is what keeps you safe here.",
          },
          {
            kind: "try-in-blackpebble",
            body: "Open the Trading Desk and place a paper trade — no wallet needed. When you are ready to explore real tools, Wallet Cleanup and others always show you exactly what they will do before you approve.",
          },
        ],
        examples: [
          "Paper trade BONK with virtual SOL on the Trading Desk, then separately connect a wallet to scan for recoverable rent in Wallet Cleanup.",
        ],
        tips: [
          "Start with paper trading. You cannot lose real money doing it.",
          "If anything asks you to sign, slow down and read what it does — that is the only place real funds move.",
          "You do not need a wallet at all to learn here.",
        ],
        relatedLessonSlugs: ["paper-vs-real-trading", "use-blackpebble-safely"],
        relatedFeatures: [
          { label: "Trading Desk", path: "/" },
          { label: "Features overview", path: "/features" },
        ],
        related: { label: "Features overview", path: "/features" },
        callout: {
          type: "beginner",
          text: "Paper trading uses simulated balances. Wallet utilities may create real on-chain transactions only after you review and sign.",
        },
        quiz: {
          id: "what-is-blackpebble-quiz",
          questions: [
            {
              id: "q1",
              prompt: "When you paper trade on BlackPebble, what happens to your real SOL?",
              options: [
                "It is spent at live prices",
                "Nothing — paper trading uses simulated funds",
                "It is locked until you close the trade",
                "It is sent to the token creator",
              ],
              correctIndex: 1,
              explanation:
                "Paper trading uses simulated funds at live prices. No real SOL moves and no signature is required.",
            },
            {
              id: "q2",
              prompt: "Which BlackPebble action can create a real on-chain transaction?",
              options: [
                "Viewing a trader profile",
                "Placing a paper trade",
                "Closing empty accounts in Wallet Cleanup (after you sign)",
                "Reading a thesis post",
              ],
              correctIndex: 2,
              explanation:
                "Wallet utilities like Wallet Cleanup can create real transactions — but only after you review and sign them.",
            },
          ],
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
        diagrams: [{ id: "paper-trading", placement: "top" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Explain what paper trading simulates and what it does not",
          "Identify which actions require a real signature",
          "Use paper trading to build skill before risking funds",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "Paper trading practices at live market prices using simulated funds — nothing leaves your wallet. Real wallet actions (like recovering SOL or burning tokens) spend real SOL and require your signature.",
          },
          {
            kind: "what",
            body: "A paper trade behaves like the real thing: real prices, real charts, real spreads. The only difference is the money is virtual. Real wallet tools are separate and always ask you to sign before anything happens on-chain.",
          },
          {
            kind: "why",
            body: "Practicing first lets you make your beginner mistakes for free. You learn how it feels to hold through a dip, take profit too early, or size too big — without paying tuition in real losses.",
          },
          {
            kind: "stakes",
            body: "Two dangerous mix-ups: treating a paper gain like real money you can spend, and treating a real signing prompt like a harmless practice tap. The first leads to overconfidence; the second is exactly how people get drained.",
          },
          {
            kind: "try-in-blackpebble",
            body: "Place a paper trade on the Trading Desk right now. Watch how the price moves against you when you buy, and how your PnL updates live. It costs nothing.",
          },
        ],
        examples: [
          "A +40% paper trade does not move real SOL. Closing an empty token account in Wallet Cleanup does move real SOL after you approve.",
        ],
        story: {
          character: "Maya",
          setup:
            "Maya's first week paper trading goes great — she's up 60% on virtual funds and feels ready for the real thing.",
          expectation: "She assumes real trading will feel exactly the same.",
          reality:
            "With real money, a normal 20% dip suddenly feels terrifying. She panic-sells at the bottom — something she never did on paper, where losses didn't sting.",
          lesson:
            "Paper trading teaches the mechanics perfectly, but real emotion is a separate skill. Use paper trading to practice a plan you can actually stick to when it's real.",
          beats: [
            { label: "Paper week", detail: "Up 60% on virtual funds", value: "no fear", tone: "positive" },
            { label: "First real dip", detail: "A normal -20% pullback", value: "panic", tone: "negative" },
            { label: "The lesson", detail: "Practice the plan, not just the buttons", value: "process", tone: "neutral" },
          ],
        },
        tips: [
          "Treat paper trades seriously — pretend the virtual money is real so the habits transfer.",
          "A green paper number is practice, not profit. Nothing is real until real SOL moves.",
          "Before your first real trade, re-read the wallet safety lessons.",
        ],
        relatedLessonSlugs: ["what-is-blackpebble", "use-blackpebble-safely", "connecting-vs-signing"],
        relatedFeatures: [
          { label: "Trading Desk", path: "/" },
          { label: "Portfolio", path: "/portfolio" },
        ],
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
        diagrams: [{ id: "connect-vs-sign", placement: "top" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Follow the core safety habits every time",
          "Recognize a seed-phrase request as an instant red flag",
          "Limit exposure when trying new tools",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "A few habits protect you even when everything looks polished: never enter a seed phrase, read every wallet prompt, use a burner wallet for testing, verify contract addresses, and start small with real on-chain actions.",
          },
          {
            kind: "what",
            body: "Safety on BlackPebble is mostly about your wallet, not the app. Connecting is read-only. Signing can move funds. A burner is a spare wallet with little in it. A contract address uniquely identifies a token so you don't buy an impostor.",
          },
          {
            kind: "why",
            body: "Almost every serious loss traces back to a broken habit: a leaked seed phrase, a blindly-approved signature, or buying a fake token with a copycat name. Good habits cost you nothing and stop the disasters that can't be undone.",
          },
          {
            kind: "stakes",
            body: "Blockchain transactions are final. There is no bank to call and no undo button. If you sign a malicious approval or paste your seed phrase into a fake site, the funds are simply gone. That is why these habits are non-negotiable.",
          },
          {
            kind: "try-in-blackpebble",
            body: "When you use any real wallet tool here, it shows you exactly what you're approving first. Start with a burner wallet and a tiny amount until the flow feels familiar.",
          },
        ],
        tips: [
          "No real service — including BlackPebble — will ever ask for your seed phrase.",
          "Keep a separate 'burner' wallet for experimenting with new tools.",
          "Always match the token's contract address, not just its name or logo.",
          "When in doubt on a signing prompt, reject it. You can always try again.",
        ],
        relatedLessonSlugs: ["connecting-vs-signing", "private-key-and-seed", "paper-vs-real-trading"],
        relatedFeatures: [
          { label: "Wallet Safety", path: "/safety" },
          { label: "Wallet Cleanup", path: "/utilities/wallet-cleaner" },
        ],
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
