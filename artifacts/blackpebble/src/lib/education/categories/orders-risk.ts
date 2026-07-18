import { L } from "../helpers";
import type { AcademyCategory } from "../types";

export const ordersRiskCategory: AcademyCategory = {
  id: "orders-risk",
  title: "Orders, Risk, and Position Management",
  icon: "shield",
  lessons: [
    L(
      "order-types",
      "Order Types",
      "A market order executes immediately at the best available price. A limit order only fills at your chosen price or better. A buy limit waits for price to fall to your target.",
      "Limits enforce discipline and avoid chasing, but may never fill if price does not return.",
      {
        aliases: ["market order", "limit order", "buy limit", "order types", "market vs limit"],
        keywords: ["fill", "slippage", "execution", "stop order"],
        shortAnswer:
          "A market order fills now at the best available price; a limit order only fills at your chosen price or better but may never fill.",
        difficulty: "beginner",
        estimatedMinutes: 5,
        chainScope: "universal",
        interactiveModules: [{ id: "order-type-challenge" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Tell market and limit orders apart",
          "Know when each order type fits a situation",
          "Understand the trade-off between certainty of fill and price control",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "A market order prioritizes speed: it fills immediately at whatever price is available, which can mean slippage in thin markets. A limit order prioritizes price: it fills only at your target or better, but might never fill.",
          },
          {
            kind: "what",
            body: "Market orders take liquidity now. Limit orders sit until price reaches your level. Stop orders trigger a market or limit order once a price is crossed, and are often used to cut losses or lock in gains.",
          },
          {
            kind: "why",
            body: "Choosing the wrong order type is a common beginner mistake. Chasing a fast mover with a market order can fill far from the price you saw; a limit order in a runaway market may leave you on the sidelines. The scenario challenge below builds this judgment.",
          },
          {
            kind: "common-mistakes",
            body: "Using a market order in a thin, fast market and getting a poor fill, or setting a limit so far away it never triggers.",
          },
        ],
        commonMistakes: [
          "Market-buying a thin token and eating large slippage.",
          "Placing a limit order and forgetting it may never fill.",
        ],
        relatedLessonSlugs: ["automated-exits", "price-impact-and-slippage", "order-outcomes"],
        related: { label: "Trading Desk", path: "/" },
        quiz: {
          id: "order-types-quiz",
          questions: [
            {
              id: "q1",
              prompt: "You want to buy only if price drops to a specific level. Which order fits best?",
              options: ["Market order", "Buy limit order", "There is no such order", "A stop loss"],
              correctIndex: 1,
              explanation:
                "A buy limit waits for price to reach your target or better before filling.",
            },
          ],
        },
      },
    ),
    L(
      "automated-exits",
      "Take Profit and Stop Loss",
      "Take profit (TP) is a planned exit when price reaches a profit target. Stop loss (SL) caps loss if price moves against you. Multi-target TP scales out at multiple profit levels.",
      "Automated exits reduce regret when memecoins reverse quickly, but stops can slip in low liquidity.",
      {
        aliases: ["TP", "SL", "multi TP", "scale out", "take profit", "stop loss", "stop-loss"],
        keywords: ["invalidation", "risk-reward", "price ladder", "target"],
        shortAnswer:
          "Take profit exits at a planned gain; stop loss caps a planned loss. Deciding both before you enter turns a trade into a plan.",
        difficulty: "beginner",
        estimatedMinutes: 6,
        chainScope: "universal",
        interactiveModules: [{ id: "stop-loss-take-profit-planner" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Set an entry, stop, and target as one plan",
          "Read downside, upside, and risk-reward from those levels",
          "Understand why stops can slip on thin liquidity",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "A stop loss defines where your idea is wrong and caps the loss. A take profit defines where you will bank a gain. Together with your entry they set your risk-reward before you commit.",
          },
          {
            kind: "what",
            body: "Entry is where you open. The stop is your invalidation level (downside). The target is your planned exit (upside). The planner below turns those three numbers into downside percentage, upside percentage, and a risk-reward ratio on a price ladder.",
          },
          {
            kind: "why",
            body: "Deciding exits in advance removes emotional decisions mid-trade. It does not guarantee the fill: in volatile memecoins, price can gap through a stop and fill worse than planned.",
          },
          {
            kind: "safety",
            body: "Stops can slip or fail to fill cleanly when liquidity collapses. Treat a stop as risk control, not a guarantee, and size positions so a slipped stop is survivable.",
          },
        ],
        commonMistakes: [
          "Setting a target without a stop, so losses run unbounded.",
          "Placing a stop so tight that normal volatility knocks you out.",
        ],
        relatedLessonSlugs: ["order-types", "risk-to-reward", "position-sizing-and-risk", "price-impact-and-slippage"],
        callout: { type: "safety", text: "Stops can slip or fail to fill cleanly when liquidity collapses. This is planning, not advice." },
        related: { label: "Trade Planner", path: "/utilities/trade-planner" },
        quiz: {
          id: "automated-exits-quiz",
          questions: [
            {
              id: "q1",
              prompt: "Entry $100, stop $90, target $120. What is the risk-to-reward?",
              options: ["1 : 1", "2 : 1", "3 : 1", "1 : 2"],
              correctIndex: 1,
              explanation: "Risk is $10, reward is $20, so reward:risk is 2 : 1.",
            },
            {
              id: "q2",
              prompt: "A stop loss guarantees you exit at exactly your stop price.",
              kind: "boolean",
              options: ["True", "False"],
              correctIndex: 1,
              explanation:
                "Stops can slip in fast or thin markets and fill worse than the stop price.",
            },
          ],
        },
      },
    ),
    L(
      "order-outcomes",
      "Order Outcomes",
      "An order fill is when an order executes. A partial fill means only part executed. Canceled orders are removed before execution. Failed orders did not complete due to price, liquidity, or system conditions.",
      "Always verify whether your exposure changed after an order attempt.",
      { aliases: ["fill", "partial fill", "canceled", "failed order"] },
    ),
    L(
      "positions",
      "Positions",
      "A position is your current exposure to a token or perp trade. A spot position is direct token ownership without borrowed leverage.",
      "Knowing your open position size is the first step in risk control.",
      { aliases: ["position", "spot"], related: { label: "Portfolio", path: "/portfolio" } },
    ),
    L(
      "leverage-basics",
      "Leverage Basics",
      "Leverage uses borrowed exposure to amplify gains and losses. Long bets price will rise. Short bets it will fall. Margin is the collateral supporting the position. Notional size is total controlled exposure.",
      "Leverage increases speed of outcomes in both directions. BlackPebble paper perps are simulated.",
      { aliases: ["leverage", "long", "short", "margin", "notional"], callout: { type: "advanced", text: "Paper perps are simulated unless clearly labeled otherwise." } },
    ),
    L(
      "liquidation-risk",
      "Liquidation Risk",
      "Liquidation is a forced position close when margin cannot support losses. Liquidation price is where this happens. Liquidations can occur quickly in volatile memecoin-linked perps.",
      "Knowing your liquidation price helps you see how close a trade is to failure.",
      { aliases: ["liquidation", "liq", "liq price"], callout: { type: "safety", text: "Leverage can wipe a position before you have time to react." } },
    ),
    L(
      "position-sizing-and-risk",
      "Position Sizing and Risk",
      "Position sizing is choosing how much to risk on one idea. Risk per trade is the maximum loss you will accept. A fixed risk per trade creates consistency.",
      "Good sizing keeps one bad trade from damaging your whole portfolio.",
      {
        aliases: ["position sizing", "risk per trade", "1% risk", "position size", "how much to buy"],
        keywords: ["account balance", "stop distance", "amount at risk", "token quantity"],
        shortAnswer:
          "Position size is how much to buy so that hitting your stop only costs a set, small share of your account (your risk per trade).",
        difficulty: "beginner",
        estimatedMinutes: 6,
        chainScope: "universal",
        interactiveModules: [{ id: "position-size-calculator" }],
        version: 1,
        updatedAt: "July 2026",
        learningObjectives: [
          "Turn a risk percentage into a position size",
          "Connect stop distance to how much you can buy",
          "See why fixed risk per trade creates consistency",
        ],
        sections: [
          {
            kind: "quick-answer",
            body: "Decide the most you will lose on a trade (risk per trade), then size the position so that hitting your stop loses exactly that amount. Wider stops mean smaller positions; tighter stops allow larger ones.",
          },
          {
            kind: "what",
            body: "Amount at risk = account balance x risk percentage. Position size = amount at risk / stop distance. The calculator below turns a simulated balance, risk percentage, entry, and stop into a position size and token quantity.",
          },
          {
            kind: "why",
            body: "Fixed risk per trade is what keeps one bad trade from dominating your account. It also makes results comparable: every trade risks a similar amount, so your edge shows over time instead of being masked by wildly different bet sizes.",
          },
          {
            kind: "common-mistakes",
            body: "Sizing by 'how much I want to make' instead of 'how much I can lose if I am wrong', or ignoring fees and slippage that make the real loss larger than the stop suggests.",
          },
        ],
        commonMistakes: [
          "Risking a large, inconsistent share of the account per trade.",
          "Forgetting that fees and slippage add to the loss at the stop.",
        ],
        relatedLessonSlugs: ["automated-exits", "risk-to-reward", "drawdown", "profit-and-loss"],
        callout: { type: "safety", text: "The calculator uses simulated values and does not read your real balances. Very high risk-per-trade settings trigger a warning." },
        related: { label: "Trade Planner", path: "/utilities/trade-planner" },
        quiz: {
          id: "position-sizing-and-risk-quiz",
          questions: [
            {
              id: "q1",
              prompt:
                "Account $1,000, risk 2% per trade. How much do you risk on one trade?",
              options: ["$2", "$20", "$200", "$100"],
              correctIndex: 1,
              explanation: "2% of $1,000 is $20.",
            },
            {
              id: "q2",
              prompt: "For a fixed risk amount, a wider stop distance means your position size should be:",
              options: ["Larger", "Smaller", "Unchanged", "Zero"],
              correctIndex: 1,
              explanation:
                "A wider stop means each token can lose more, so you buy fewer tokens to keep the same risk.",
            },
          ],
        },
      },
    ),
    L(
      "scaling",
      "Scaling In and Out",
      "Scaling in is entering a position in multiple smaller buys. Scaling out is exiting in multiple sells. Both can improve average prices but increase execution complexity.",
      "Scaling out helps capture profits while leaving room for further upside.",
      { aliases: ["scale in", "scale out", "DCA in"] },
    ),
  ],
};
