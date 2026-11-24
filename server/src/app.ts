import express from "express";
import cors from "cors";
import helmet from "helmet";
import { router as healthRouter } from "./routes/health.js";
import { router as authRouter } from "./routes/auth.js";
import { router as settingsRouter } from "./routes/settings.js";
import { router as zonesRouter } from "./routes/zones.js";
import { router as blocksRouter } from "./routes/blocks.js";
import { router as bookingsRouter } from "./routes/bookings.js";
import { env } from "./lib/env.js";
import { requestLogger } from "./middleware/request-logger.js";

const app = express();

// Sau reverse proxy (Caddy) phải tin X-Forwarded-For để lấy đúng IP khách (rate limit, log)
app.set("trust proxy", env.TRUST_PROXY);
app.disable("x-powered-by");

// ─── Middleware ──────────────────────────────────────

app.use(requestLogger({ enabled: env.LOG_REQUESTS, json: env.isProduction }));
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_ORIGINS,
    credentials: true,
  })
);
app.use(express.json({ limit: "100kb" }));

// ─── Routes ─────────────────────────────────────────

app.use("/api", healthRouter);
app.use("/api", authRouter);
app.use("/api", settingsRouter);
app.use("/api", zonesRouter);
app.use("/api", blocksRouter);
app.use("/api", bookingsRouter);

// ─── Error handler ──────────────────────────────────

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("❌ Unhandled error:", err.message);
    res.status(500).json({
      error: "Internal server error",
      ...(env.NODE_ENV === "development" && { detail: err.message }),
    });
  }
);

export default app;
