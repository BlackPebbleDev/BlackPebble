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
      {
        aliases: ["price", "MC", "mcap", "market cap", "crypto market cap"],
        keywords: ["circulating supply", "valuation", "market capitalization"],
        shortAnswer:
          "Market cap = price x circulating supply. It measures total value far better than price alone.",
        difficulty: "beginner",
        estimatedMinutes: 5,
        chainScope: "universal",
        interactiveModules: [{ id: "market-cap-calculator" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Compute market cap from price and circulating supply",
          "Explain why price alone is misleading",
          "Compare two tokens by market cap, not price",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "Market cap equals price multiplied by circulating supply. A low price with a huge supply can be worth more than a high price with a tiny supply.",
          },
          {
            kind: "what",
            body: "Price is the cost of one token. Circulating supply is how many tokens are currently tradable. Market cap combines them into a single measure of size.",
          },
          {
            kind: "why",
            body: "Two tokens at the same price can have wildly different market caps. Judging value by price alone leads to the '$0.001 is cheap' trap. Always compare market cap.",
          },
          {
            kind: "common-mistakes",
            body: "Assuming a low unit price means a token is 'cheap' or has more room to grow, without checking supply and market cap.",
          },
        ],
        examples: [
          "Token A: $0.001 x 100,000,000,000 = $100M cap. Token B: $10 x 1,000,000 = $10M cap. The 'cheaper' token is actually 10x larger.",
        ],
        commonMistakes: [
          "Comparing tokens by unit price instead of market cap.",
          "Assuming increasing supply raises the price on its own.",
        ],
        relatedLessonSlugs: ["token-supply", "fdv", "volume-and-liquidity"],
        relatedFeatures: [{ label: "Markets", path: "/markets" }],
        quiz: {
          id: "price-and-market-cap-quiz",
          questions: [
            {
              id: "q1",
              prompt:
                "A token trades at $1 with 10,000,000 circulating tokens. What is its market cap?",
              options: ["$1,000,000", "$10,000,000", "$100,000", "$10"],
              correctIndex: 1,
              explanation: "$1 x 10,000,000 = $10,000,000.",
            },
            {
              id: "q2",
              prompt: "Which is the better way to compare two tokens' size?",
              options: ["Unit price", "Market cap", "The logo", "Token name length"],
              correctIndex: 1,
              explanation:
                "Market cap accounts for supply; unit price alone is misleading.",
            },
          ],
        },
      },
    ),
    L(
      "token-supply",
      "Token Supply",
      "Total supply is how many tokens exist or can exist. Circulating supply is what is currently tradable. Locked, vested, or unminted tokens are not yet circulating.",
      "Understanding supply helps you see dilution risk and why market cap matters more than price.",
      {
        aliases: ["supply", "circulating supply", "total supply", "token supply", "max supply"],
        shortAnswer:
          "Total supply is every token that exists or can exist; circulating supply is what is tradable now.",
        difficulty: "beginner",
        estimatedMinutes: 4,
        chainScope: "universal",
        example: "If half the supply is locked, market cap reflects only circulating tokens.",
        relatedLessonSlugs: ["price-and-market-cap", "fdv"],
      },
    ),
    L(
      "fdv",
      "Fully Diluted Valuation (FDV)",
      "Fully Diluted Valuation (FDV) is what the market cap would be if every token — including locked, vested, and unminted supply — were circulating at the current price. Market cap uses only circulating supply; FDV uses total or maximum supply.",
      "A large gap between market cap and FDV means many tokens are not yet circulating, and future unlocks can add selling pressure.",
      {
        aliases: ["FDV", "fully diluted valuation", "fdv meaning", "market cap vs fdv", "diluted valuation"],
        keywords: ["unlock", "vesting", "dilution", "circulating percentage"],
        shortAnswer:
          "FDV is the valuation if all tokens circulated at today's price. A big market-cap-to-FDV gap signals future dilution risk.",
        difficulty: "beginner",
        estimatedMinutes: 5,
        chainScope: "universal",
        interactiveModules: [{ id: "market-cap-fdv-simulator" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Define FDV and how it differs from market cap",
          "Read the circulating percentage",
          "Recognize dilution risk from locked supply",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "FDV = price x total (or maximum) supply. Market cap = price x circulating supply. When most supply is locked, FDV can be far larger than market cap.",
          },
          {
            kind: "what",
            body: "Circulating supply is tradable now; total or maximum supply includes tokens that are locked, vested, or not yet minted. FDV applies the current price to all of them.",
          },
          {
            kind: "why",
            body: "A token can look small by market cap but carry a very large FDV. As locked tokens unlock and circulate, they can add selling pressure. This is context, not a prediction.",
          },
          {
            kind: "common-mistakes",
            body: "Treating FDV as market cap, or ignoring the unlock schedule that determines when locked supply enters circulation.",
          },
        ],
        commonMistakes: [
          "Confusing FDV with market cap.",
          "Ignoring the token unlock/vesting schedule.",
        ],
        relatedLessonSlugs: ["price-and-market-cap", "token-supply", "volume-and-liquidity"],
        quiz: {
          id: "fdv-quiz",
          questions: [
            {
              id: "q1",
              prompt:
                "Price is $0.05, circulating supply 100M, total supply 1B. What is FDV?",
              options: ["$5,000,000", "$50,000,000", "$100,000,000", "$500,000"],
              correctIndex: 1,
              explanation: "$0.05 x 1,000,000,000 = $50,000,000.",
            },
            {
              id: "q2",
              prompt: "A large market-cap-to-FDV gap usually means:",
              options: [
                "The token is guaranteed to rise",
                "Much supply is not yet circulating",
                "There is no risk",
                "The price is fixed",
              ],
              correctIndex: 1,
              explanation:
                "A big gap means locked/unminted supply may enter circulation later, a dilution consideration.",
            },
          ],
        },
      },
    ),
    L(
      "volume-and-liquidity",
      "Volume and Liquidity",
      "Volume is total traded value over a window (often 24 hours). Liquidity is how much value sits in the trading pool to absorb buys and sells without large price moves.",
      "Low volume or thin liquidity can make entries and exits harder, especially during fast dumps.",
      {
        aliases: ["24h volume", "liquidity", "crypto liquidity", "liquidity meaning", "pool depth"],
        shortAnswer:
          "Volume is how much traded over a period; liquidity is how much sits in the pool to absorb trades without big price moves.",
        difficulty: "beginner",
        estimatedMinutes: 5,
        chainScope: "universal",
        interactiveModules: [{ id: "liquidity-price-impact-simulator" }],
        version: 1,
        updatedAt: "July 2026",
        relatedLessonSlugs: ["price-impact-and-slippage", "liquidity-pool", "top-holders"],
        related: { label: "Markets", path: "/markets" },
        quiz: {
          id: "volume-and-liquidity-quiz",
          questions: [
            {
              id: "q1",
              prompt: "Deeper liquidity means a given trade will:",
              options: [
                "Move price more",
                "Move price less",
                "Always fail",
                "Have higher fees",
              ],
              correctIndex: 1,
              explanation:
                "Deeper pools absorb trades with less price movement (lower impact).",
            },
          ],
        },
      },
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
        aliases: ["R:R", "risk reward", "risk-reward", "risk to reward"],
        shortAnswer:
          "Risk-to-reward compares how much you can lose to how much you can gain on a planned trade.",
        difficulty: "beginner",
        estimatedMinutes: 4,
        chainScope: "universal",
        relatedLessonSlugs: [
          "profit-and-loss",
          "trade-performance-metrics",
          "position-sizing-and-risk",
          "automated-exits",
        ],
        related: { label: "Trade Planner", path: "/utilities/trade-planner" },
        quiz: {
          id: "risk-to-reward-quiz",
          questions: [
            {
              id: "q1",
              prompt:
                "Entry $100, stop $90, target $130. What is the risk-to-reward ratio?",
              options: ["1 : 1", "2 : 1", "3 : 1", "1 : 3"],
              correctIndex: 2,
              explanation:
                "Risk is $10, reward is $30, so reward:risk is 3 : 1.",
            },
          ],
        },
      },
    ),
    L(
      "trading-psychology",
      "Trading Psychology Basics",
      "Trading psychology is how emotions like fear and greed drive decisions. FOMO pushes you to chase pumps, revenge trading pushes you to risk more after a loss, and panic selling locks in losses at the worst time. A repeatable process beats reacting to emotion.",
      "Most avoidable losses come from behavior, not from a lack of information. Managing yourself is a core trading skill.",
      {
        aliases: [
          "psychology",
          "FOMO",
          "revenge trading",
          "panic selling",
          "overtrading",
          "trading psychology",
        ],
        keywords: ["discipline", "emotions", "selling winners early", "holding losers"],
        shortAnswer:
          "Trading psychology is managing emotions like FOMO, revenge trading, and panic so a repeatable process drives decisions.",
        difficulty: "beginner",
        estimatedMinutes: 6,
        chainScope: "universal",
        interactiveModules: [{ id: "trading-psychology-scenarios" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Name common emotional biases in trading",
          "Recognize FOMO, revenge trading, and panic selling",
          "Favor process over impulse",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "Trading psychology is how emotions influence your decisions. Recognizing FOMO, revenge trading, panic selling, and overtrading helps you stick to a plan.",
          },
          {
            kind: "what",
            body: "Fear and greed create predictable patterns: chasing green candles (FOMO), sizing up to win back a loss (revenge), dumping at the bottom (panic), and trading too often (overtrading). Selling winners too early and holding losers too long are two sides of the same bias.",
          },
          {
            kind: "why",
            body: "Two traders with the same information can get very different results based on behavior. A defined entry, stop, target, and position size removes many emotional decisions in the moment.",
          },
          {
            kind: "common-mistakes",
            body: "Believing there is always one perfect trade. The goal is a sound, repeatable process and honest self-awareness, not perfection.",
          },
        ],
        commonMistakes: [
          "Chasing a pump without a plan (FOMO).",
          "Increasing size to recover a loss (revenge trading).",
          "Panic selling at the bottom of a normal pullback.",
        ],
        relatedLessonSlugs: ["risk-to-reward", "position-sizing-and-risk", "profit-and-loss"],
        relatedFeatures: [
          { label: "Paper Trading", path: "/" },
          { label: "Trading Intelligence", path: "/utilities/trading-analysis" },
        ],
        quiz: {
          id: "trading-psychology-quiz",
          questions: [
            {
              id: "q1",
              prompt:
                "You take a loss and immediately want to place a larger trade to win it back. This is:",
              options: ["Disciplined", "Revenge trading", "A limit order", "Diversification"],
              correctIndex: 1,
              explanation:
                "Sizing up to recover a loss is revenge trading, which usually increases risk when judgment is weakest.",
            },
            {
              id: "q2",
              prompt: "Which habits describe a repeatable process? (Select all that apply.)",
              kind: "multiple",
              options: [
                "Pre-defined entry, stop, and target",
                "Consistent position sizing",
                "Holding losers and hoping",
                "Chasing every pump",
              ],
              correctIndices: [0, 1],
              explanation:
                "A repeatable process relies on plans and consistent sizing, not hope or FOMO.",
            },
          ],
        },
      },
    ),
  ],
};
