
import { Router } from "express";
import mongoose from "mongoose";
import SyncJob from "../models/SyncJob.js";

const router = Router();

// GET /api/sync/jobs?status=pending
router.get("/jobs", async (req, res, next) => {
  try {
    const allowed = ["pending", "processing", "synced", "failed"];
    const filter = {};

    if (req.query.status) {
      if (!allowed.includes(req.query.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid sync status",
        });
      }
      filter.status = req.query.status;
    }

    const data = await SyncJob.find(filter)
      .populate("saleId", "receiptNumber total currency createdAt")
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/sync/jobs/:id
router.get("/jobs/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sync job ID",
      });
    }

    const data = await SyncJob.findById(req.params.id)
      .populate("saleId", "receiptNumber total currency")
      .lean();

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Sync job not found",
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
