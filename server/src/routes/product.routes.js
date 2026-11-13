
import { Router } from "express";
import mongoose from "mongoose";
import Product from "../models/Product.js";

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
      sku, name, itemType, isbn, author, category,
      sellingPrice, costPrice, stockQty,
    } = req.body;

    if (
      typeof sku !== "string" || !sku.trim() ||
      typeof name !== "string" || !name.trim() ||
      !Number.isFinite(sellingPrice) || sellingPrice < 0
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

    const product = await Product.create({
      sku, name, itemType, isbn, author, category,
      sellingPrice, costPrice, stockQty,
    });

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
