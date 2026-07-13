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
      { aliases: ["slippage", "spread", "price impact"] },
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
