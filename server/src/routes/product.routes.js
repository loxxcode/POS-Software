
import { Router } from "express";
import mongoose from "mongoose";
import { createHash, randomUUID } from "node:crypto";
import InventoryLog from "../models/InventoryLog.js";
import Product from "../models/Product.js";
import SyncJob from "../models/SyncJob.js";

const router = Router();

// List and search products
router.get("/", async (req, res, next) => {
  try {
    const filter = { active: true };

    if (req.query.itemType) {
      if (!["book", "stationery", "other"].includes(req.query.itemType)) {
        return res.status(400).json({
          success: false,
          message: "Invalid itemType",
        });
      }
      filter.itemType = req.query.itemType;
    }

    if (req.query.search) {
      const term = String(req.query.search).trim().slice(0, 100);
      filter.$or = [
        { name: { $regex: term, $options: "i" } },
        { sku: { $regex: term, $options: "i" } },
        { isbn: { $regex: term, $options: "i" } },
        { barcode: { $regex: term, $options: "i" } },
      ];
    }

    const data = await Product.find(filter)
      .select("-costPrice")
      .sort({ name: 1 })
      .limit(100)
      .lean();

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
});

// Add a product
router.post("/", async (req, res, next) => {
  try {
    const {
      sku, name, barcode, unit = "unit", taxRate = null, itemType, isbn, author, category, origin,
      sellingPrice, costPrice, stockQty,
    } = req.body;

    if (
      typeof sku !== "string" || !sku.trim() ||
      typeof name !== "string" || !name.trim() ||
      !Number.isFinite(sellingPrice) || sellingPrice < 0 ||
      Math.abs(sellingPrice * 100 - Math.round(sellingPrice * 100)) > 1e-7 ||
      typeof unit !== "string" || !unit.trim() || unit.trim().length > 30 ||
      (taxRate !== null && (
        !Number.isFinite(taxRate) ||
        taxRate < 0 ||
        taxRate > 100 ||
        Math.abs(taxRate * 100 - Math.round(taxRate * 100)) > 1e-7
      ))
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid sku, name and sellingPrice are required",
      });
    }

    if (
      costPrice !== undefined &&
      (!Number.isFinite(costPrice) || costPrice < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "costPrice must be a non-negative number",
      });
    }

    if (
      stockQty !== undefined &&
      (!Number.isSafeInteger(stockQty) || stockQty < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "stockQty must be a non-negative whole number",
      });
    }

    if (
      (barcode !== undefined && typeof barcode !== "string") ||
      (origin !== undefined && typeof origin !== "string")
    ) {
      return res.status(400).json({
        success: false,
        message: "barcode and origin must be strings",
      });
    }

    const session = await mongoose.startSession();
    let product;
    try {
      await session.withTransaction(async () => {
        [product] = await Product.create(
          [{
            sku, name, barcode, unit: unit.trim(), taxRate, itemType, isbn, author, category, origin,
            sellingPrice, costPrice, stockQty,
          }],
          { session }
        );

        if (product.stockQty > 0) {
          await InventoryLog.create(
            [{
              productId: product._id,
              change: product.stockQty,
              quantityBefore: 0,
              quantityAfter: product.stockQty,
              reason: "opening_stock",
              note: "Opening balance set at product creation.",
              performedBy: req.user.email,
            }],
            { session }
          );
        }
      });
    } finally {
      await session.endSession();
    }

    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "SKU already exists",
      });
    }
    next(error);
  }
});

// Update product details without changing its stock quantity.
router.patch("/:id", async (req, res, next) => {
  const { sku, name, barcode = "", unit = "unit", category = "General", origin = "Local", sellingPrice, costPrice = 0 } = req.body || {};
  const taxRate = Object.prototype.hasOwnProperty.call(req.body || {}, "taxRate")
    ? req.body.taxRate
    : undefined;
  if (
    !mongoose.isValidObjectId(req.params.id) ||
    typeof sku !== "string" ||
    !sku.trim() ||
    typeof name !== "string" ||
    !name.trim() ||
    typeof barcode !== "string" ||
    typeof unit !== "string" || !unit.trim() || unit.trim().length > 30 ||
    (taxRate !== undefined && taxRate !== null && (
      !Number.isFinite(taxRate) ||
      taxRate < 0 ||
      taxRate > 100 ||
      Math.abs(taxRate * 100 - Math.round(taxRate * 100)) > 1e-7
    )) ||
    typeof category !== "string" ||
    typeof origin !== "string" ||
    !Number.isFinite(sellingPrice) ||
    sellingPrice < 0 ||
    Math.abs(sellingPrice * 100 - Math.round(sellingPrice * 100)) > 1e-7 ||
    !Number.isFinite(costPrice) ||
    costPrice < 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid product ID, code, name, barcode, category, origin, and non-negative prices.",
    });
  }

  try {
    const existing = await Product.findOne({
      _id: req.params.id,
      active: true,
    }).select("quickBooksItemListId").lean();
    if (!existing) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    const normalizedSku = sku.trim().toUpperCase();
    const skuConflict = await Product.exists({
      sku: normalizedSku,
      _id: { $ne: req.params.id },
    });
    if (skuConflict) {
      return res.status(409).json({ success: false, message: "A product with this code already exists." });
    }

    const data = await Product.findOneAndUpdate(
      { _id: req.params.id, active: true },
      {
        $set: {
          sku: normalizedSku,
          name: name.trim(),
          barcode: barcode.trim(),
          unit: unit.trim(),
          ...(taxRate !== undefined ? { taxRate } : {}),
          category: category.trim(),
          origin: origin.trim(),
          sellingPrice,
          costPrice,
        },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!data) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }
    if (existing.quickBooksItemListId) {
      const payloadReference = `update-pos-item:${data._id}`;
      await SyncJob.create({
        internalJobId: randomUUID(),
        operationType: "updateItem",
        entityType: "item",
        entityId: data._id,
        direction: "posToQuickBooks",
        payloadReference,
        requestHash: createHash("sha256").update(JSON.stringify({
          listId: existing.quickBooksItemListId,
          name: data.name,
          salesPrice: data.sellingPrice,
        })).digest("hex"),
        idempotencyKey: payloadReference,
        status: "pending",
      });
    }

    return res.json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "A product with this code already exists." });
    }
    return next(error);
  }
});

// Get one product
router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const data = await Product.findOne({
      _id: req.params.id,
      active: true,
    }).select("-costPrice");

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
