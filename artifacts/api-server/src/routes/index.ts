import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import accountRouter from "./account.js";
import tradeRouter from "./trade.js";
import liveRouter from "./live.js";
import marketsRouter from "./markets.js";
import portfolioRouter from "./portfolio.js";
import leaderboardRouter from "./leaderboard.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(tradeRouter);
router.use(liveRouter);
router.use(marketsRouter);
router.use(portfolioRouter);
router.use(leaderboardRouter);

export default router;
