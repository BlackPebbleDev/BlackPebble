import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import statsRouter from "./stats.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(statsRouter);

export default router;
