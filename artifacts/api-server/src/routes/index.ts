import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import statsRouter from "./stats.js";
import paperRouter from "./paper.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(statsRouter);
router.use(paperRouter);

export default router;
