
import { Router } from "express";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import InventoryLog from "../models/InventoryLog.js";

const router = Router();

// GET /api/inventory
router.get("/", async (req, res, next) => {
  try {
    const data = await Product.find({ active: true })
      .select("sku name itemType category stockQty sellingPrice")
      .sort({ name: 1 })
      .limit(500)
      .lean();

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
});

// POST /api/inventory/adjust
router.post("/adjust", async (req, res, next) => {
  const { productId, change, reason, note = "" } = req.body;

  const validReasons = [
    "opening_stock",
    "restock",
    "damage",
    "loss",
    "correction",
  ];

  if (
    !mongoose.isValidObjectId(productId) ||
    !Number.isSafeInteger(change) ||
    change === 0 ||
    !validReasons.includes(reason) ||
    typeof note !== "string" ||
    note.length > 500
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid productId, change, reason or note",
    });
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const product = await Product.findOne({
        _id: productId,
        active: true,
      }).session(session);

      if (!product) {
        throw Object.assign(new Error("Product not found"), {
          status: 404,
        });
      }

      const before = product.stockQty;
      const after = before + change;

      if (!Number.isSafeInteger(after) || after < 0) {
        throw Object.assign(
          new Error("Stock cannot become negative"),
          { status: 400 }
        );
      }

      product.stockQty = after;
      await product.save({ session });

      const [log] = await InventoryLog.create(
        [{
          productId: product._id,
          change,
          quantityBefore: before,
          quantityAfter: after,
          reason,
          note,
        }],
        { session }
      );

      result = {
        productId: product._id,
        stockBefore: before,
        stockAfter: after,
        logId: log._id,
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
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

export default router;
