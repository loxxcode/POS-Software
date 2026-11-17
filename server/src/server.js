
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";

import authenticate from "./middleware/authenticate.js";
import adminRoutes from "./routes/admin.routes.js";
import authRoutes from "./routes/auth.routes.js";
import productRoutes from "./routes/product.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import saleRoutes from "./routes/sale.routes.js";
import syncRoutes from "./routes/sync.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import discountRoutes from "./routes/discount.routes.js";
import requestRoutes from "./routes/request.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import proformaRoutes from "./routes/proforma.routes.js";
import auditActivity from "./middleware/auditActivity.js";
import { expireDueProformas } from "./services/proformaWorkflow.js";

dotenv.config();

const app = express();
const allowedFrontendOrigins = new Set(
  (process.env.FRONTEND_URL || "http://localhost:3000")
    .split(",")
    .map(origin => origin.trim().replace(/\/$/, ""))
    .filter(Boolean)
);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      const localDevelopmentOrigin = process.env.NODE_ENV !== "production" &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");
      if (!origin || allowedFrontendOrigins.has(origin) || localDevelopmentOrigin) {
        return callback(null, true);
      }
      return callback(new Error(`CORS origin is not allowed: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({
    name: "Library POS Backend",
    version: "1.0.0",
    status: "running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", auditActivity);
app.use("/api/auth", authRoutes);
app.use("/api/admin", authenticate, adminRoutes);
app.use("/api/settings", authenticate, settingsRoutes);
app.use("/api/products", authenticate, productRoutes);
app.use("/api/inventory", authenticate, inventoryRoutes);
app.use("/api/sales", authenticate, saleRoutes);
app.use("/api/sync", authenticate, syncRoutes);
app.use("/api/customers", authenticate, customerRoutes);
app.use("/api/discounts", authenticate, discountRoutes);
app.use("/api/requests", authenticate, requestRoutes);
app.use("/api/proformas", authenticate, proformaRoutes);

// Unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

// Central error handler
app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from .env");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected successfully");

    const expireProformas = () => {
      expireDueProformas().catch(error => {
        console.error("Unable to expire due proformas:", error);
      });
    };
    expireProformas();
    const expiryTimer = setInterval(expireProformas, 60_000);
    expiryTimer.unref();

    app.listen(PORT, () => {
      console.log(`Server: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
