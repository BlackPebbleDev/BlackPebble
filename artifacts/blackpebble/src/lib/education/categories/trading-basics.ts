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
      "profit-and-loss",
      "Profit and Loss",
      "PnL measures how much you gained or lost. Realized PnL is locked in after closing. Unrealized PnL is on open positions and can disappear if prices reverse.",
      "Tracking PnL helps you judge process quality, not just one lucky outcome.",
      { aliases: ["PnL", "P&L", "realized", "unrealized"] },
    ),
    L(
      "returns-and-multiples",
      "Returns and Multiples",
      "ROI expresses gain or loss as a percentage. A multiple (2x, 10x) shows how many times your entry value became. Both help compare trades of different sizes.",
      "Memecoin culture talks in multiples, but sample size and exit timing still matter.",
      { aliases: ["ROI", "2x", "10x", "multiple", "X return"] },
    ),
    L(
      "trade-performance-metrics",
      "Trade Performance Metrics",
      "Win rate is the percentage of profitable trades. Profit factor is gross profits divided by gross losses. Average winner and loser sizes reveal whether your edge is real.",
      "A high win rate can still lose money if average losses exceed average wins.",
      { aliases: ["win rate", "profit factor", "avg win", "avg loss"], example: "Winning 70% but with large losers can produce negative expectancy." },
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
      { aliases: ["DD", "max drawdown"] },
    ),
    L(
      "risk-to-reward",
      "Risk-to-Reward Ratio",
      "Risk-to-reward compares potential loss to potential gain on a planned trade. Positive expectancy often requires either a strong win rate or favorable R:R, sometimes both.",
      "Planning your R:R before entering helps enforce discipline.",
      { aliases: ["R:R", "risk reward"], related: { label: "Trade Planner", path: "/utilities/trade-planner" } },
    ),
  ],
};
