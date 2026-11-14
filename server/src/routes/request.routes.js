import { Router } from "express";
import mongoose from "mongoose";
import requireRole from "../middleware/requireRole.js";
import StockRequest from "../models/StockRequest.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const data = await StockRequest.find().sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  const { items } = req.body || {};
  if (typeof items !== "string" || !items.trim() || items.trim().length > 1000) {
    return res.status(400).json({ success: false, message: "Enter the requested items." });
  }

  try {
    const data = await StockRequest.create({ items: items.trim(), operator: req.user.name });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("daf"), async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid request ID." });
  }
  const { status } = req.body || {};
  if (!["Approved", "Rejected"].includes(status)) {
    return res.status(400).json({ success: false, message: "Choose Approved or Rejected." });
  }

  try {
    const data = await StockRequest.findOneAndUpdate(
      { _id: req.params.id, status: "Pending" },
      { status },
      { new: true, runValidators: true }
    );
    if (!data) {
      const exists = await StockRequest.exists({ _id: req.params.id });
      return res.status(exists ? 409 : 404).json({
        success: false,
        message: exists ? "This request has already been decided." : "Request not found.",
      });
    }
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
