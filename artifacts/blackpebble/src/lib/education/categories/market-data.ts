import { L } from "../helpers";
import type { AcademyCategory } from "../types";

export const marketDataCategory: AcademyCategory = {
  id: "market-data",
  title: "Market Data and Token Metrics",
  icon: "bar-chart",
  lessons: [
    L(
      "contract-address",
      "Contract Address",
      "The contract address (token mint) is the unique on-chain identifier for a Solana token. Symbols like BONK can be reused by unrelated tokens, but the mint is the true identifier.",
      "Always verify the mint before buying or contributing. Scammers copy popular symbols.",
      { aliases: ["CA", "mint", "token mint"], callout: { type: "safety", text: "Never trust a symbol alone. Confirm the mint from a trusted source." } },
    ),
    L(
      "liquidity-pool",
      "Liquidity Pool",
      "The liquidity pool is the on-chain reserve where buyers and sellers trade against pooled assets. Pool depth describes how much liquidity sits near the current price.",
      "Deep pools absorb trades with less slippage. Thin pools can make exits costly.",
      { aliases: ["LP", "pool", "pool depth"] },
    ),
    L(
      "holder-distribution",
      "Holder Distribution",
      "Holder count is the number of wallets holding the token. Top holder concentration shows how much supply is controlled by the largest wallets.",
      "High concentration increases dump risk if large holders sell together.",
      { aliases: ["holders", "whale concentration", "top holders"] },
    ),
    L(
      "ath-and-atl",
      "ATH and ATL",
      "ATH (all-time high) is the highest price or market cap reached. ATL (all-time low) is the lowest. Current price vs ATH shows how far the token has fallen from peak hype.",
      "ATH context helps frame whether a bounce is early recovery or just a dead-cat action.",
      { aliases: ["ATH", "ATL", "all-time high", "all-time low"] },
    ),
    L(
      "ath-from-call",
      "ATH From Call",
      "ATH from call is the highest verified market cap reached after a public call was posted on BlackPebble. BlackPebble prioritizes this because memecoins often spike then fade.",
      "The peak reached after a call can be more informative than current price alone.",
      { aliases: ["call ATH"], related: { label: "Feed", path: "/feed" }, callout: { type: "why", text: "A call that hit 8x ATH but is now flat still shows the opportunity existed." } },
    ),
    L(
      "price-impact-and-slippage",
      "Price Impact and Slippage",
      "Price impact is how much your order moves the price. Slippage is the difference between expected and executed price due to liquidity and speed. Spread is the gap between best buy and sell prices.",
      "High slippage can turn a good idea into a bad fill, especially in thin pools.",
      {
        aliases: [
          "slippage",
          "stop-loss",
          "spread",
          "price impact",
          "price-impact",
          "slippage tolerance",
        ],
        keywords: ["slippage tolerance", "executed price", "amm", "thin liquidity"],
        shortAnswer:
          "Price impact is the move your own trade causes; slippage is the gap between the expected and executed price; slippage tolerance is the maximum move you accept.",
        difficulty: "beginner",
        estimatedMinutes: 6,
        chainScope: "universal",
        interactiveModules: [{ id: "slippage-simulator" }],
        diagrams: [
          { id: "slippage", placement: "top" },
          { id: "price-impact", placement: "inline", caption: "The bigger your order relative to the pool, the more the price moves against you before it fills." },
        ],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Separate price impact, slippage, and slippage tolerance",
          "See why thin liquidity causes larger moves",
          "Understand when a trade may fail or fill at a worse price",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "Price impact is how far your own order moves the price. Slippage is the difference between the price you expected and the price you actually got. Slippage tolerance is the maximum move you tell the app you will accept.",
          },
          {
            kind: "what",
            body: "In a pool-based market, every trade shifts the balance of reserves and therefore the price. A larger trade relative to the pool causes larger price impact. Slippage is the realized version of that gap by the time your trade settles, which also depends on how fast the market is moving.",
          },
          {
            kind: "why",
            body: "On thin memecoin liquidity, price impact can be a large share of a small trade. A good idea can still lose money if the fill is poor, and exiting can be as costly as entering.",
          },
          {
            kind: "stakes",
            body: "If you ignore slippage, the price you see is not the price you pay. On a thin token you can lose several percent the instant you buy — and several percent again when you sell — turning a 'winning' idea into a loss before the market even moves. Set a tolerance so a bad fill cancels instead of costing you.",
          },
          {
            kind: "common-mistakes",
            body: "Setting a very high slippage tolerance to force a fill can lead to a much worse price. Confusing tolerance (a setting) with actual slippage (an outcome) leads to surprises.",
          },
        ],
        story: {
          character: "Trevor",
          setup:
            "Trevor spots a thin new token and market-buys what he expects to be $100 worth.",
          expectation: "He expects to pay about $100 for his tokens.",
          reality:
            "His own order is large compared to the tiny pool, so it pushes the price up as it fills. He actually pays $108 — an 8% loss before the token has moved at all.",
          lesson:
            "In a thin pool your own buy moves the price against you (price impact), and the gap between expected and paid is slippage. A slippage tolerance caps that gap; smaller orders and deeper pools shrink it.",
          beats: [
            { label: "Expected", detail: "Market-buy ~$100 of a token", value: "$100", tone: "neutral" },
            { label: "Reality", detail: "Thin pool + big order moves price", value: "$108", tone: "negative" },
            { label: "The gap", detail: "8% slippage, paid before any move", value: "-8%", tone: "negative" },
            { label: "The fix", detail: "Cap it with a slippage tolerance", value: "safer", tone: "positive" },
          ],
        },
        tips: [
          "The price you see is a quote, not a promise — slippage is the gap to what you actually pay.",
          "On thin tokens, split a big order into smaller pieces to reduce impact.",
          "Set a slippage tolerance so a bad fill cancels the trade instead of soaking the loss.",
        ],
        commonMistakes: [
          "Treating slippage tolerance as if it were the actual slippage.",
          "Ignoring how trade size compares to pool liquidity.",
          "Using a very high tolerance just to make a trade go through.",
        ],
        relatedLessonSlugs: ["volume-and-liquidity", "liquidity-pool", "order-types"],
        relatedFeatures: [{ label: "Trading Desk", path: "/" }],
        callout: {
          type: "safety",
          text: "If estimated impact exceeds your tolerance, the trade may fail or fill at a worse price. Splitting a large order or using deeper liquidity reduces impact.",
        },
        quiz: {
          id: "price-impact-and-slippage-quiz",
          questions: [
            {
              id: "q1",
              prompt: "What causes higher price impact for the same trade size?",
              options: [
                "Deeper liquidity",
                "Thinner liquidity",
                "A higher slippage tolerance",
                "A limit order",
              ],
              correctIndex: 1,
              explanation:
                "Thinner liquidity means the same trade moves price more, so impact is higher.",
            },
            {
              id: "q2",
              prompt: "Slippage tolerance is best described as:",
              options: [
                "The slippage that actually happened",
                "The maximum price move you will accept",
                "The pool's total liquidity",
                "The trading fee",
              ],
              correctIndex: 1,
              explanation:
                "Tolerance is a setting for the maximum acceptable move; actual slippage is the realized outcome.",
            },
          ],
        },
      },
    ),
    L(
      "token-age",
      "Token and Pair Age",
      "Token age is how long ago the token was created. Pair age is how long the trading market has existed on a DEX. Very new tokens can move fast and carry higher unknown risks.",
      "Fresh pairs are often volatile during early discovery and migration phases.",
      { aliases: ["age", "pair age", "pool age"] },
    ),
    L(
      "dex-and-routing",
      "DEX Pair and Routing",
      "A DEX pair is the trading market linking a token to SOL or another base asset. Routing is the path a swap takes across pools. Complex routing can affect price, fees, and failure risk.",
      "Pair address and liquidity source matter when verifying where price data comes from.",
      { aliases: ["trading pair", "swap route", "routing"] },
    ),
  ],
};
