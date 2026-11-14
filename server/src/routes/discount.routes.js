import { Router } from "express";
import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import Discount from "../models/Discount.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const data = await Discount.find().sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  const { customerId = null, product = "All products", title, percent, start, end } = req.body || {};
  if (
    (customerId !== null && !mongoose.isValidObjectId(customerId)) ||
    typeof product !== "string" || !product.trim() || product.trim().length > 120 ||
    typeof title !== "string" || !title.trim() || title.trim().length > 120 ||
    !Number.isFinite(percent) || percent <= 0 || percent > 100 ||
    typeof start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    typeof end !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    end < start
  ) {
    return res.status(400).json({ success: false, message: "Enter valid discount details and date range." });
  }

  try {
    let customerName = "All customers";
    if (customerId) {
      const customer = await Customer.findById(customerId).select("name").lean();
      if (!customer) return res.status(400).json({ success: false, message: "Selected customer was not found." });
      customerName = customer.name;
    }

    const data = await Discount.create({
      customerId,
      customerName,
      product: product.trim(),
      title: title.trim(),
      percent,
      start,
      end,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid discount ID." });
  }

  try {
    const data = await Discount.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: "Discount not found." });
    res.json({ success: true, message: "Discount removed." });
  } catch (error) {
    next(error);
  }
});

export default router;
