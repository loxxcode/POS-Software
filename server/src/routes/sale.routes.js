
import { Router } from "express";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Product from "../models/Product.js";
import Sale from "../models/Sale.js";
import SyncJob from "../models/SyncJob.js";

const router = Router();

router.post("/", async (req, res, next) => {
  const { clientRequestId, items, paymentMethod } = req.body;

  if (
    typeof clientRequestId !== "string" ||
    clientRequestId.length < 8 ||
    clientRequestId.length > 100
  ) {
    return res.status(400).json({
      success: false,
      message: "A unique clientRequestId is required",
    });
  }

  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Provide between 1 and 100 sale items",
    });
  }

  if (!["cash", "card", "mobile_money", "other"].includes(paymentMethod)) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment method",
    });
  }

  for (const item of items) {
    if (
      !mongoose.isValidObjectId(item.productId) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Each item needs a valid productId and positive whole quantity",
      });
    }
  }

  const existing = await Sale.findOne({ clientRequestId }).catch(next);
  if (existing) {
    return res.json({ success: true, duplicate: true, data: existing });
  }

  const session = await mongoose.startSession();

  try {
    let createdSale;

    await session.withTransaction(async () => {
      const saleItems = [];
      let subtotal = 0;

      for (const item of items) {
        const product = await Product.findOneAndUpdate(
          {
            _id: item.productId,
            active: true,
            stockQty: { $gte: item.quantity },
          },
          { $inc: { stockQty: -item.quantity } },
          { new: true, session }
        );

        if (!product) {
          throw Object.assign(
            new Error(
              `Product ${item.productId} not found, inactive, or insufficient stock`
            ),
            { status: 400 }
          );
        }

        const lineTotal = Number(
          (product.sellingPrice * item.quantity).toFixed(2)
        );

        subtotal = Number((subtotal + lineTotal).toFixed(2));

        saleItems.push({
          productId: product._id,
          sku: product.sku,
          name: product.name,
          quantity: item.quantity,
          unitPrice: product.sellingPrice,
          lineTotal,
        });
      }

      const [sale] = await Sale.create(
        [{
          receiptNumber: `LIB-${Date.now()}-${randomUUID().slice(0, 8)}`,
          clientRequestId,
          items: saleItems,
          subtotal,
          total: subtotal,
          paymentMethod,
          currency: "RWF",
        }],
        { session }
      );

      await SyncJob.create(
        [{ saleId: sale._id, status: "pending" }],
        { session }
      );

      createdSale = sale;
    });

    res.status(201).json({
      success: true,
      message: "Sale recorded; QuickBooks sync is pending",
      data: createdSale,
    });
  } catch (error) {
    // Handle concurrent retries of the same checkout request.
    if (error.code === 11000) {
      const existingSale = await Sale.findOne({ clientRequestId });
      if (existingSale) {
        return res.json({
          success: true,
          duplicate: true,
          data: existingSale,
        });
      }
    }

    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
});

// GET /api/sales
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
      100
    );

    const data = await Sale.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/:id
router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sale ID",
      });
    }

    const data = await Sale.findById(req.params.id).lean();

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Sale not found",
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
