import express from "express";
import cors from "cors";
import helmet from "helmet";
import { router as healthRouter } from "./routes/health.js";
import { router as authRouter } from "./routes/auth.js";
import { router as settingsRouter } from "./routes/settings.js";
import { router as zonesRouter } from "./routes/zones.js";
import { router as blocksRouter } from "./routes/blocks.js";
import { router as bookingsRouter } from "./routes/bookings.js";

const app = express();

// ─── Middleware ──────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

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
      ...(process.env.NODE_ENV === "development" && { detail: err.message }),
    });
  }
);

export default app;
