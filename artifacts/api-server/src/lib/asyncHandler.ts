import type { Request, Response } from "express";
import { logger } from "./logger.js";

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

/** Wraps a route handler so rejected promises become a clean 500 JSON response. */
export function asyncHandler(fn: Handler) {
  return (req: Request, res: Response): void => {
    Promise.resolve(fn(req, res)).catch((err) => {
      logger.error({ err, url: req.url }, "Route handler error");
      if (!res.headersSent) {
        res.status(500).json({ error: "Something went wrong. Please try again." });
      }
    });
  };
}
