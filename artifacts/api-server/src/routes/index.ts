import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import accountRouter from "./account.js";
import tradeRouter from "./trade.js";
import liveRouter from "./live.js";
import marketsRouter from "./markets.js";
import portfolioRouter from "./portfolio.js";
import leaderboardRouter from "./leaderboard.js";
import authXRouter from "./auth-x.js";
import adminResetRouter from "./admin-reset.js";
import adminRouter from "./admin.js";
import recoveryRouter from "./recovery.js";
import settingsRouter from "./settings.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(tradeRouter);
router.use(liveRouter);
router.use(marketsRouter);
router.use(portfolioRouter);
router.use(leaderboardRouter);
router.use(authXRouter);
router.use(adminResetRouter);
router.use(adminRouter);
router.use(recoveryRouter);
router.use(settingsRouter);

export default router;
