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
      { aliases: ["market order", "limit order", "buy limit"], related: { label: "Trading Desk", path: "/" } },
    ),
    L(
      "automated-exits",
      "Take Profit and Stop Loss",
      "Take profit (TP) is a planned exit when price reaches a profit target. Stop loss (SL) caps loss if price moves against you. Multi-target TP scales out at multiple profit levels.",
      "Automated exits reduce regret when memecoins reverse quickly, but stops can slip in low liquidity.",
      { aliases: ["TP", "SL", "multi TP", "scale out"], callout: { type: "safety", text: "Stops can slip or fail to fill cleanly when liquidity collapses." } },
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
      { aliases: ["position sizing", "risk per trade", "1% risk"], related: { label: "Trade Planner", path: "/utilities/trade-planner" } },
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
