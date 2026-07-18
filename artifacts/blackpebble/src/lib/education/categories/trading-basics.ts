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
        diagrams: [{ id: "market-cap" }],
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
            kind: "stakes",
            body: "If you buy because a token 'only costs $0.0001', you can pour money into something already valued at hundreds of millions — with almost no room to grow and lots of room to fall. Ignoring market cap is how beginners overpay for 'cheap' tokens.",
          },
          {
            kind: "common-mistakes",
            body: "Assuming a low unit price means a token is 'cheap' or has more room to grow, without checking supply and market cap.",
          },
        ],
        story: {
          character: "Sam",
          setup:
            "Sam sees two memecoins. Coin A costs $0.000005; Coin B costs $2. 'A is way cheaper,' he thinks, 'so it has more upside.'",
          expectation: "He expects the $0.000005 coin to 100x more easily.",
          reality:
            "Coin A has 500 billion tokens (a $2.5M cap) — but Coin B has only 500,000 tokens (a $1M cap). The 'expensive' coin is actually the smaller, earlier one.",
          lesson:
            "Unit price tells you almost nothing. Market cap (price × supply) is the real size. Always compare caps, not sticker prices.",
          beats: [
            { label: "Coin A price", detail: "$0.000005 — looks cheap", value: "$2.5M cap", tone: "negative" },
            { label: "Coin B price", detail: "$2 — looks expensive", value: "$1M cap", tone: "positive" },
            { label: "The real question", detail: "Which is bigger? Compare caps", value: "B < A", tone: "neutral" },
          ],
        },
        tips: [
          "Before you judge if a token is 'cheap,' find its market cap — not its unit price.",
          "A tiny price with a massive supply is not the same as being early.",
          "On BlackPebble Markets, sort and compare by market cap to size things up fairly.",
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
        keywords: ["locked supply", "vesting", "dilution", "minting"],
        shortAnswer:
          "Total supply is every token that exists or can exist; circulating supply is what is tradable now.",
        difficulty: "beginner",
        estimatedMinutes: 4,
        chainScope: "universal",
        diagrams: [{ id: "fdv", placement: "top", caption: "Circulating supply is what trades now; total supply includes locked and unminted tokens." }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Tell circulating supply apart from total and max supply",
          "See why supply drives market cap",
          "Spot dilution risk from locked or unminted tokens",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "Total supply is every token that exists or can exist. Circulating supply is what is tradable right now. Locked, vested, or unminted tokens are not yet circulating.",
          },
          {
            kind: "what",
            body: "Circulating supply counts tokens people can actually trade today. Total (or max) supply also counts tokens that are locked, reserved, vesting, or not yet minted. The two can be very different.",
          },
          {
            kind: "why",
            body: "Supply is half of market cap (price × circulating supply), so you can't judge a token's size from price alone. Supply also warns you about dilution: tokens waiting to unlock can add selling pressure later.",
          },
          {
            kind: "stakes",
            body: "Ignore supply and you can badly misjudge what you're buying. A token can look tiny by price yet be huge once you multiply by a massive supply — or look small today but be set to double its circulating tokens through upcoming unlocks. Either way, the surprise usually costs the buyer.",
          },
          {
            kind: "common-mistakes",
            body: "Assuming a big supply means a low price will 'easily' rise, or ignoring how much supply is still locked and waiting to circulate.",
          },
        ],
        example: "If half the supply is locked, market cap reflects only circulating tokens.",
        story: {
          character: "Owen",
          setup:
            "Owen buys a token where only 10% of the supply is circulating, seeing a small market cap and assuming he's early.",
          expectation: "He expects the small cap to have lots of room to grow.",
          reality:
            "Over the next weeks, locked tokens unlock and flood the market. The circulating supply keeps rising, and the new selling pressure caps every rally.",
          lesson:
            "Circulating supply today isn't the whole story. Locked supply that will unlock later can dilute holders and weigh on price. Always check how much supply is still waiting.",
          beats: [
            { label: "At buy", detail: "Only 10% circulating, small cap", value: "looks early", tone: "neutral" },
            { label: "Unlocks", detail: "Locked tokens hit the market", value: "more supply", tone: "negative" },
            { label: "The lesson", detail: "Check locked/unlocking supply too", value: "dilution", tone: "neutral" },
          ],
        },
        tips: [
          "Market cap uses circulating supply, so always find that number, not just total supply.",
          "A large chunk of locked supply is future dilution waiting to happen.",
          "Big supply does not make a token 'cheap' — only market cap tells you its size.",
        ],
        relatedLessonSlugs: ["price-and-market-cap", "fdv"],
        relatedFeatures: [{ label: "Markets", path: "/markets" }],
        quiz: {
          id: "token-supply-quiz",
          questions: [
            {
              id: "q1",
              prompt: "Which supply number is used to calculate market cap?",
              options: ["Total supply", "Max supply", "Circulating supply", "Burned supply"],
              correctIndex: 2,
              explanation:
                "Market cap = price × circulating supply, the tokens actually tradable now.",
            },
            {
              id: "q2",
              prompt: "A large gap between circulating and total supply usually signals:",
              options: [
                "The token is guaranteed to rise",
                "Future dilution as locked tokens unlock",
                "There is no risk",
                "The price cannot change",
              ],
              correctIndex: 1,
              explanation:
                "Locked or unminted tokens can enter circulation later, adding potential selling pressure (dilution).",
            },
          ],
        },
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
        diagrams: [{ id: "fdv", placement: "top" }],
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
            kind: "stakes",
            body: "Judge a token by market cap alone and a big FDV gap can blindside you. You might buy something that looks 'small' while several times that value in locked tokens waits to unlock and sell. Those unlocks can quietly cap the price for months. FDV is how you see that risk coming.",
          },
          {
            kind: "common-mistakes",
            body: "Treating FDV as market cap, or ignoring the unlock schedule that determines when locked supply enters circulation.",
          },
        ],
        story: {
          character: "Grace",
          setup:
            "Grace sees a token at a $10M market cap and thinks it's tiny with room to run. She doesn't check the FDV.",
          expectation: "She expects a small token that can grow easily.",
          reality:
            "Only 25% of supply is circulating. The FDV is $40M, and scheduled unlocks keep adding sellers. Every time the price rises, freshly-unlocked tokens are sold into it.",
          lesson:
            "Market cap shows the size today; FDV shows the size if everything unlocks at this price. A big gap means dilution is coming — factor it in before assuming a token is 'small.'",
          beats: [
            { label: "Looks small", detail: "$10M market cap", value: "$10M", tone: "positive" },
            { label: "The catch", detail: "Only 25% circulating", value: "FDV $40M", tone: "negative" },
            { label: "The drag", detail: "Unlocks sell into every rally", value: "dilution", tone: "negative" },
          ],
        },
        tips: [
          "Compare market cap to FDV: a big gap means lots of supply is still locked.",
          "Check the unlock schedule — that's when locked tokens can start selling.",
          "A low circulating percentage is a dilution flag, not automatically a bargain.",
        ],
        commonMistakes: [
          "Confusing FDV with market cap.",
          "Ignoring the token unlock/vesting schedule.",
        ],
        relatedLessonSlugs: ["price-and-market-cap", "token-supply", "volume-and-liquidity"],
        relatedFeatures: [{ label: "Markets", path: "/markets" }],
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
        keywords: ["pool depth", "24h volume", "thin liquidity", "exit liquidity"],
        shortAnswer:
          "Volume is how much traded over a period; liquidity is how much sits in the pool to absorb trades without big price moves.",
        difficulty: "beginner",
        estimatedMinutes: 5,
        chainScope: "universal",
        interactiveModules: [{ id: "liquidity-price-impact-simulator" }],
        diagrams: [{ id: "liquidity-pool", placement: "top" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Tell volume and liquidity apart",
          "Explain why thin liquidity causes big price swings",
          "Check you can exit before you enter",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "Volume is the total value traded over a window (often 24 hours). Liquidity is how much value sits in the pool to absorb buys and sells without moving the price much.",
          },
          {
            kind: "what",
            body: "Think of liquidity as the depth of the pool your trades happen against. A deep pool barely moves when you trade; a thin pool swings hard. Volume tells you how much activity there is, which hints at how easy it is to find someone on the other side.",
          },
          {
            kind: "why",
            body: "Low volume or thin liquidity makes entering and exiting harder and more expensive, especially during fast dumps when everyone wants out at once. The exit is where thin liquidity hurts most.",
          },
          {
            kind: "stakes",
            body: "If you buy into a token you can't sell out of, being 'right' doesn't matter. In a thin pool your own exit can crater the price, and in a panic there may be no buyers at all. Checking liquidity before you enter is checking whether there's a door before you walk in.",
          },
          {
            kind: "common-mistakes",
            body: "Buying a token with exciting volume but shallow liquidity, then finding the exit moves price far more than expected.",
          },
        ],
        story: {
          character: "Ravi",
          setup:
            "Ravi buys a token showing big 24h volume, assuming that means he can get out easily whenever he wants.",
          expectation: "He expects a smooth exit since 'volume is high.'",
          reality:
            "The pool is actually thin — the volume came from lots of tiny trades. When he tries to sell his position, his own order tanks the price and he exits far below what he saw.",
          lesson:
            "Volume and liquidity aren't the same. High volume can hide a shallow pool. Liquidity — the depth you trade against — is what determines whether you can exit without wrecking the price.",
          beats: [
            { label: "Looks liquid", detail: "Big 24h volume number", value: "high vol", tone: "positive" },
            { label: "The reality", detail: "Thin pool, many tiny trades", value: "shallow", tone: "negative" },
            { label: "The exit", detail: "His sell tanks the price", value: "bad fill", tone: "negative" },
          ],
        },
        tips: [
          "Before you buy, ask: can I sell this size without crashing the price?",
          "High volume can still hide a thin pool — check liquidity depth, not just volume.",
          "Thin liquidity hurts most on the way out, in a rush, when you least want it.",
        ],
        relatedLessonSlugs: ["price-impact-and-slippage", "liquidity-pool", "top-holders"],
        relatedFeatures: [{ label: "Markets", path: "/markets" }],
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
            {
              id: "q2",
              prompt: "High 24h volume always means you can exit a large position easily.",
              kind: "boolean",
              options: ["True", "False"],
              correctIndex: 1,
              explanation:
                "Volume can come from many tiny trades. Liquidity (pool depth) is what determines how easily you can exit.",
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
            kind: "stakes",
            body: "Confuse unrealized gains for real money and you'll make real decisions on imaginary profit — spending, sizing up, or refusing to sell a winner that's quietly round-tripping. Paper gains can vanish entirely before you lock them in. Knowing realized from unrealized keeps your scoreboard honest.",
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
        story: {
          character: "Bea",
          setup:
            "Bea's position is up 300% on screen. She tells friends she 'made' several thousand dollars and mentally spends it, holding for a 10x.",
          expectation: "She expects to lock in that gain later, at an even higher price.",
          reality:
            "The token fades back toward her entry. Because she never sold, the 'profit' was only ever unrealized — and it disappears. Her realized PnL ends up near zero.",
          lesson:
            "Unrealized PnL is a number on a screen, not money in your pocket. It only becomes real when you sell. Deciding in advance what to realize protects gains from evaporating.",
          beats: [
            { label: "On screen", detail: "Position up 300%", value: "+300%", tone: "positive" },
            { label: "Never sold", detail: "Held for more, spent it mentally", value: "unrealized", tone: "neutral" },
            { label: "Round trip", detail: "Fades back to entry", value: "~0%", tone: "negative" },
            { label: "The lesson", detail: "Realized > unrealized", value: "sell to keep", tone: "positive" },
          ],
        },
        tips: [
          "A green number isn't profit until you sell — that's the realized/unrealized difference.",
          "Judge yourself over many trades, not one screenshot-worthy winner.",
          "Fees and slippage make real PnL lower than entry-to-exit price suggests.",
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
        keywords: ["reward to risk", "expectancy", "1:2", "planned trade"],
        shortAnswer:
          "Risk-to-reward compares how much you can lose to how much you can gain on a planned trade.",
        difficulty: "beginner",
        estimatedMinutes: 4,
        chainScope: "universal",
        diagrams: [{ id: "risk-reward", placement: "top" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Calculate risk-to-reward from entry, stop, and target",
          "See why R:R interacts with win rate",
          "Use R:R to filter trades before entering",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "Risk-to-reward compares how much you can lose (entry to stop) with how much you can gain (entry to target) on a planned trade. Aiming for at least 1:2 means winners can outweigh losers over time.",
          },
          {
            kind: "what",
            body: "Set three levels: entry, stop (where you're wrong), and target (where you'll take profit). The distance to the stop is your risk; the distance to the target is your reward. Divide them to get the ratio.",
          },
          {
            kind: "why",
            body: "R:R and win rate work together. With 1:2 risk-to-reward you can be wrong more than half the time and still come out ahead. Planning R:R before entering turns 'this could moon' into a decision you can actually evaluate.",
          },
          {
            kind: "stakes",
            body: "Trade without checking R:R and you can win most of your trades yet still lose money — because a few oversized losses erase many small wins. Poor risk-to-reward is a slow leak that discipline on entries alone can't fix.",
          },
          {
            kind: "common-mistakes",
            body: "Chasing trades with tiny upside and large downside, or moving the stop further away mid-trade so the 'reward-to-risk' you planned quietly disappears.",
          },
        ],
        story: {
          character: "Theo",
          setup:
            "Theo wins 7 of his last 10 trades and feels unstoppable. But he lets losers run and snatches small profits on winners.",
          expectation: "He expects a 70% win rate to mean he's profitable.",
          reality:
            "His average win is $20 and his average loss is $120. Three losses (-$360) swamp seven wins (+$140). He's down overall despite winning most trades.",
          lesson:
            "Win rate alone doesn't pay. Risk-to-reward decides whether your wins can outweigh your losses. Aim for reward that's a multiple of your risk, and let it run.",
          beats: [
            { label: "Win rate", detail: "7 of 10 trades green", value: "70%", tone: "positive" },
            { label: "The catch", detail: "Avg win $20, avg loss $120", value: "1:6 wrong way", tone: "negative" },
            { label: "The result", detail: "Net negative despite winning", value: "-$220", tone: "negative" },
            { label: "The fix", detail: "Aim for 1:2 or better", value: "R:R", tone: "positive" },
          ],
        },
        tips: [
          "Aiming for at least 1:2 lets you be wrong often and still profit.",
          "Never widen your stop mid-trade to avoid being stopped out — that destroys your R:R.",
          "Cutting winners early and holding losers is the opposite of good risk-to-reward.",
        ],
        relatedLessonSlugs: [
          "profit-and-loss",
          "trade-performance-metrics",
          "position-sizing-and-risk",
          "automated-exits",
        ],
        relatedFeatures: [{ label: "Trade Planner", path: "/utilities/trade-planner" }],
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
            {
              id: "q2",
              prompt: "A high win rate always means a strategy is profitable.",
              kind: "boolean",
              options: ["True", "False"],
              correctIndex: 1,
              explanation:
                "If average losses are much bigger than average wins, a high win rate can still lose money. Risk-to-reward matters too.",
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
            kind: "stakes",
            body: "Emotion is the most expensive thing in trading. FOMO buys the top, panic sells the bottom, and revenge trading turns one loss into three. You can know every concept in this Academy and still blow up if you can't follow your own plan under pressure — which is exactly when it counts.",
          },
          {
            kind: "common-mistakes",
            body: "Believing there is always one perfect trade. The goal is a sound, repeatable process and honest self-awareness, not perfection.",
          },
        ],
        story: {
          character: "Kai",
          setup:
            "Kai takes a small planned loss, then feels the urge to 'win it back' immediately. He doubles his size on the next setup — one he never actually planned.",
          expectation: "He expects to quickly erase the loss and feel in control again.",
          reality:
            "The revenge trade also loses, but now at double size. One disciplined -$20 loss has become -$60, and he's trading angrier and bigger with each attempt.",
          lesson:
            "The market doesn't owe you a comeback. Revenge trading sizes up exactly when your judgment is weakest. A pre-set plan and fixed sizing are what protect you from yourself.",
          beats: [
            { label: "Planned loss", detail: "Small, expected, fine", value: "-$20", tone: "neutral" },
            { label: "The urge", detail: "'Win it back now'", value: "revenge", tone: "negative" },
            { label: "Double size", detail: "Unplanned trade, loses again", value: "-$60", tone: "negative" },
            { label: "The lesson", detail: "Stick to plan + fixed size", value: "discipline", tone: "positive" },
          ],
        },
        tips: [
          "Losses are part of the process — you don't need to 'win them back' immediately.",
          "Write your plan before you enter, so the emotional moment has less to decide.",
          "If you feel FOMO or anger, that's the signal to step away, not to size up.",
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
