
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

dotenv.config();

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
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

app.use("/api/auth", authRoutes);
app.use("/api/admin", authenticate, adminRoutes);
app.use("/api/products", authenticate, productRoutes);
app.use("/api/inventory", authenticate, inventoryRoutes);
app.use("/api/sales", authenticate, saleRoutes);
app.use("/api/sync", authenticate, syncRoutes);
app.use("/api/customers", authenticate, customerRoutes);
app.use("/api/discounts", authenticate, discountRoutes);
app.use("/api/requests", authenticate, requestRoutes);

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

    app.listen(PORT, () => {
      console.log(`Server: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
