import { L } from "../helpers";
import type { AcademyCategory } from "../types";

export const tradingBasicsCategory: AcademyCategory = {
  id: "trading-basics",
  title: "Trading Basics",
  icon: "trending",
  lessons: [
    L(
      "price-and-market-cap",
      "Price and Market Cap",
      "Price is the cost to buy one token unit. Market cap equals price times circulating supply and estimates total token value. Memecoins with tiny prices can still have huge market caps if supply is in the trillions.",
      "Market cap gives better size context than price alone when comparing memecoins.",
      { aliases: ["price", "MC", "mcap"], example: "Two tokens at the same price can have very different market caps if supply differs." },
    ),
    L(
      "token-supply",
      "Token Supply and FDV",
      "Total supply is how many tokens exist or can exist. Circulating supply is what is currently tradable. Fully Diluted Valuation (FDV) shows what market cap would be if all tokens circulated at the current price.",
      "Understanding supply helps you see dilution risk and why market cap matters more than price.",
      { aliases: ["supply", "FDV", "circulating supply"], example: "If half the supply is locked, market cap reflects only circulating tokens." },
    ),
    L(
      "volume-and-liquidity",
      "Volume and Liquidity",
      "Volume is total traded value over a window (often 24 hours). Liquidity is how much value sits in the trading pool to absorb buys and sells without large price moves.",
      "Low volume or thin liquidity can make entries and exits harder, especially during fast dumps.",
      { aliases: ["24h volume", "liquidity", "pool depth"], related: { label: "Markets", path: "/markets" } },
    ),
    L(
      "entries-and-exits",
      "Entries and Exits",
      "Entry price is where you opened a position. Exit price is where you closed it. Average entry is the blended price after multiple buys. Clear rules for when to buy and sell help avoid emotional decisions.",
      "Exit quality often matters more than entry quality over many trades.",
      { aliases: ["entry", "exit", "avg entry", "DCA"], related: { label: "Trading Desk", path: "/" } },
    ),
    L(
      "position-size",
      "Position Size",
      "Position size is how much capital you allocate to one trade. Good sizing prevents one bad trade from dominating your portfolio.",
      "Controlling position size is the most basic form of risk management.",
      { related: { label: "Trade Planner", path: "/utilities/trade-planner" } },
    ),
    L(
      "cost-basis",
      "Cost Basis",
      "Cost basis is what you actually paid to acquire a position, including fees. With multiple buys it becomes a weighted average across all of them.",
      "Your cost basis is the reference point every PnL number is measured against, so getting it right matters.",
      {
        aliases: ["cost basis", "average cost", "break even", "breakeven"],
        shortAnswer:
          "Cost basis is the total you paid for a position, fees included; PnL is measured against it.",
        difficulty: "beginner",
        estimatedMinutes: 4,
        chainScope: "universal",
        example:
          "Buy 1,000 tokens at $0.02 and 1,000 more at $0.04. Your average cost basis is $0.03 per token.",
        relatedLessonSlugs: ["profit-and-loss", "returns-and-multiples"],
        callout: {
          type: "methodology",
          text: "Partial sells reduce cost basis proportionally, not all at once.",
        },
      },
    ),
    L(
      "profit-and-loss",
      "Profit and Loss",
      "PnL measures how much a trade or portfolio has gained or lost. Realized PnL is locked in after you close a position. Unrealized PnL is the paper gain or loss on what you still hold, and it can disappear if price reverses.",
      "Tracking PnL honestly helps you judge process quality across many trades, not just one lucky outcome.",
      {
        aliases: ["PnL", "P&L", "realized", "unrealized", "profit and loss"],
        shortAnswer:
          "Profit and loss (PnL) is how much a position has gained or lost: realized once you sell, unrealized while you still hold.",
        difficulty: "beginner",
        estimatedMinutes: 6,
        chainScope: "universal",
        interactiveModule: "pnl-simulator",
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Tell realized and unrealized PnL apart",
          "Calculate combined PnL and percentage return",
          "See how fees, slippage, and partial exits change the result",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "Profit and loss (PnL) is how much a position has gained or lost. It is realized once you sell and unrealized while you still hold.",
          },
          {
            kind: "what",
            body: "Realized PnL is the gain or loss locked in when you close part or all of a position. Unrealized PnL is the paper gain or loss on tokens you still hold at the current price. Combined PnL adds the two together.",
          },
          {
            kind: "why",
            body: "Unrealized gains are not money you have kept until you sell. Judging performance on realized results across many trades, rather than one open position, gives a far more honest picture of skill.",
          },
          {
            kind: "how",
            body: "Percentage return compares combined PnL to what you invested, including fees. If you sell only part of a position, the cost basis is split between the portion you sold and the portion you keep, so realized and unrealized PnL stay consistent.",
          },
          {
            kind: "advanced",
            advanced: true,
            body: "Every PnL figure is measured against your cost basis. Trading fees apply on both the buy and the sell, and slippage reduces the price your exit actually fills at. On thin memecoin liquidity, slippage can be a large share of a small trade, so realized PnL is often lower than a naive entry-to-exit price difference implies.",
          },
        ],
        examples: [
          "Invest $1,000 at $0.02 and the price rises to $0.05. Selling half realizes profit on that portion while the rest stays unrealized until you sell it.",
        ],
        commonMistakes: [
          "Treating unrealized PnL as money you already have. It can disappear if price reverses.",
          "Ignoring fees and slippage, which make real PnL lower than a simple price difference suggests.",
          "Judging skill from a single lucky trade instead of results across many trades.",
        ],
        relatedLessonSlugs: [
          "cost-basis",
          "returns-and-multiples",
          "trade-performance-metrics",
          "risk-to-reward",
          "drawdown",
        ],
        relatedFeatures: [
          { label: "Paper Trading", path: "/" },
          { label: "Portfolio", path: "/portfolio" },
          { label: "Trading Intelligence", path: "/utilities/trading-analysis" },
        ],
        callouts: [
          {
            type: "methodology",
            text: "The interactive calculator uses simulated values, excludes taxes, and describes only the scenario you enter. It does not predict future prices.",
          },
        ],
      },
    ),
    L(
      "returns-and-multiples",
      "Returns and Multiples",
      "ROI expresses gain or loss as a percentage. A multiple (2x, 10x) shows how many times your entry value became. Both help compare trades of different sizes.",
      "Memecoin culture talks in multiples, but sample size and exit timing still matter.",
      {
        aliases: ["ROI", "2x", "10x", "multiple", "X return"],
        difficulty: "beginner",
        estimatedMinutes: 4,
        chainScope: "universal",
        relatedLessonSlugs: ["profit-and-loss", "trade-performance-metrics"],
      },
    ),
    L(
      "trade-performance-metrics",
      "Trade Performance Metrics",
      "Win rate is the percentage of profitable trades. Profit factor is gross profits divided by gross losses. Average winner and loser sizes reveal whether your edge is real. Expectancy combines win rate and average win versus loss into the amount you can expect per trade.",
      "A high win rate can still lose money if average losses exceed average wins.",
      {
        aliases: [
          "win rate",
          "profit factor",
          "avg win",
          "avg loss",
          "expectancy",
        ],
        difficulty: "intermediate",
        estimatedMinutes: 6,
        chainScope: "universal",
        example: "Winning 70% but with large losers can produce negative expectancy.",
        relatedLessonSlugs: ["profit-and-loss", "risk-to-reward", "drawdown"],
        relatedFeatures: [
          { label: "Trading Intelligence", path: "/utilities/trading-analysis" },
        ],
      },
    ),
    L(
      "hold-time",
      "Hold Time",
      "Hold time is how long a position stays open. Your average hold time reveals whether you cut winners early or hold losers too long.",
      "Hold time patterns often reveal behavioral mistakes before PnL does.",
      { aliases: ["avg hold"], related: { label: "Trading Intelligence", path: "/utilities/trading-analysis" } },
    ),
    L(
      "drawdown",
      "Drawdown",
      "Drawdown is the peak-to-trough decline in equity during a losing stretch. A 30% drawdown requires roughly a 43% gain just to recover.",
      "Your drawdown tolerance should guide position sizing and leverage decisions.",
      {
        aliases: ["DD", "max drawdown"],
        difficulty: "intermediate",
        estimatedMinutes: 4,
        chainScope: "universal",
        relatedLessonSlugs: ["profit-and-loss", "trade-performance-metrics"],
      },
    ),
    L(
      "risk-to-reward",
      "Risk-to-Reward Ratio",
      "Risk-to-reward compares potential loss to potential gain on a planned trade. Positive expectancy often requires either a strong win rate or favorable R:R, sometimes both.",
      "Planning your R:R before entering helps enforce discipline.",
      {
        aliases: ["R:R", "risk reward"],
        difficulty: "intermediate",
        estimatedMinutes: 4,
        chainScope: "universal",
        relatedLessonSlugs: ["profit-and-loss", "trade-performance-metrics"],
        related: { label: "Trade Planner", path: "/utilities/trade-planner" },
      },
    ),
  ],
};
