import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ---------------------------------------------------------------------------
// Security headers - helmet sets safe defaults for Content-Type, HSTS, etc.
// CSP and COEP are disabled: the frontend is a separate Vite app and the API
// only serves JSON; imposing a CSP here would not protect the client.
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

// ---------------------------------------------------------------------------
// CORS - allow known origins in production, all origins in development.
// In production, FRONTEND_URL is always included automatically.
// Add CORS_ALLOWED_ORIGINS (comma-separated) for extra allowed origins.
// Example: "https://blackpebble.fun,https://blackpebble.replit.app"
// ---------------------------------------------------------------------------
const isProduction = process.env["NODE_ENV"] === "production";

let allowedOrigins: string[] | null = null;
if (isProduction) {
  const rawAllowedOrigins = process.env["CORS_ALLOWED_ORIGINS"];
  const extra = rawAllowedOrigins
    ? rawAllowedOrigins.split(",").map((o) => o.trim()).filter(Boolean)
    : [];
  const frontendUrl = process.env["FRONTEND_URL"];
  if (frontendUrl) extra.push(frontendUrl);
  allowedOrigins = extra.length > 0 ? [...new Set(extra)] : null;
}

app.use(
  cors({
    origin: allowedOrigins
      ? (origin, callback) => {
          // Allow same-origin / non-browser requests (curl, server-to-server)
          if (!origin || allowedOrigins!.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error(`CORS: origin "${origin}" is not allowed`));
          }
        }
      : true, // development: allow all origins
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// Structured request logging
// ---------------------------------------------------------------------------
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Rate limiting - applied to all /api routes.
// 300 requests / minute per IP is generous for normal use but blocks scrapers.
// The health-check endpoint is excluded so uptime monitors are never blocked.
// ---------------------------------------------------------------------------
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests - please slow down." },
  skip: (req) => req.path === "/healthz",
});

app.use("/api", apiLimiter);
app.use("/api", router);

export default app;
