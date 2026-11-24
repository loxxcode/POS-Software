import { Router } from "express";
import mongoose from "mongoose";
import AppSettings from "../models/AppSettings.js";
import Proforma from "../models/Proforma.js";
import ProformaHistory from "../models/ProformaHistory.js";
import requireProformaPermission from "../middleware/requireProformaPermission.js";
import { convertProformaToSale } from "../services/proformaConversion.js";
import { createProformaPdf } from "../services/proformaPdf.js";
import {
  approveProforma,
  cancelProforma,
  createProformaDraft,
  decideCustomerProforma,
  issueProforma,
  rejectProformaApproval,
  renewProforma,
  reviseProforma,
  serializeProforma,
  updateProformaDraft,
} from "../services/proformaWorkflow.js";

const router = Router();
const statuses = ["draft", "issued", "accepted", "rejected", "converted", "expired", "cancelled", "revised"];
const sortFields = new Set(["createdAt", "updatedAt", "validUntil", "grandTotal", "proformaNumber"]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sendError(response, next, error) {
  if (error.status) {
    return response.status(error.status).json({
      success: false,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }
  return next(error);
}

function actorFrom(request) {
  return {
    id: request.user.id,
    email: request.user.email,
    role: request.user.role,
  };
}

function canManageAny(request) {
  return request.user.role === "administration";
}

function canCancelAny(request) {
  return request.user.role === "administration" || request.user.role === "daf";
}

router.get(
  "/reports/summary",
  requireProformaPermission("reports"),
  async (_request, response, next) => {
    try {
      const groups = await Proforma.aggregate([
        { $match: { latestRevision: true } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            grandTotal: { $sum: "$grandTotal" },
          },
        },
      ]);
      const summary = Object.fromEntries(statuses.map(status => [
        status,
        { count: 0, grandTotal: "0.00" },
      ]));
      for (const group of groups) {
        summary[group._id] = {
          count: group.count,
          grandTotal: group.grandTotal?.toString() || "0.00",
        };
      }
      return response.json({ success: true, data: summary });
    } catch (error) {
      return next(error);
    }
  }
);

router.get("/", requireProformaPermission("view"), async (request, response, next) => {
  const page = Math.max(Number.parseInt(request.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(request.query.limit, 10) || 20, 1), 100);
  const sortBy = sortFields.has(request.query.sortBy) ? request.query.sortBy : "createdAt";
  const sortOrder = request.query.sortOrder === "asc" ? 1 : -1;
  const filter = { latestRevision: true };
  if (request.query.status && request.query.status !== "all") {
    if (!statuses.includes(request.query.status)) {
      return response.status(400).json({ success: false, message: "Invalid proforma status." });
    }
    filter.status = request.query.status;
  }
  if (request.query.approvalStatus) {
    if (!["not_required", "pending", "approved", "rejected"].includes(request.query.approvalStatus)) {
      return response.status(400).json({ success: false, message: "Invalid approval status." });
    }
    filter.approvalStatus = request.query.approvalStatus;
  }
  if (typeof request.query.q === "string" && request.query.q.trim()) {
    const term = escapeRegex(request.query.q.trim().slice(0, 100));
    filter.$or = [
      { proformaNumber: { $regex: term, $options: "i" } },
      { "customerSnapshot.name": { $regex: term, $options: "i" } },
      { createdByEmail: { $regex: term, $options: "i" } },
    ];
  }
  if (request.user.role === "cashier") {
    filter.$and = [
      ...(filter.$and || []),
      { $or: [{ status: { $ne: "draft" } }, { createdBy: request.user.id }] },
    ];
  }
  try {
    const [documents, total] = await Promise.all([
      Proforma.find(filter)
        .sort({ [sortBy]: sortOrder, _id: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Proforma.countDocuments(filter),
    ]);
    return response.json({
      success: true,
      data: documents.map(serializeProforma),
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireProformaPermission("create"), async (request, response, next) => {
  try {
    const result = await createProformaDraft(request.body || {}, actorFrom(request));
    return response.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: result.duplicate,
      data: serializeProforma(result.proforma),
    });
  } catch (error) {
    return sendError(response, next, error);
  }
});

router.get("/:id/history", requireProformaPermission("view"), async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(400).json({ success: false, message: "Invalid proforma ID." });
  }
  try {
    const proforma = await Proforma.findById(request.params.id).select("_id");
    if (!proforma) return response.status(404).json({ success: false, message: "Proforma not found." });
    const data = await ProformaHistory.find({ proformaId: proforma._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return response.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/pdf", requireProformaPermission("view"), async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(400).json({ success: false, message: "Invalid proforma ID." });
  }
  try {
    const [proforma, settings] = await Promise.all([
      Proforma.findById(request.params.id).lean(),
      AppSettings.findById("pos").lean(),
    ]);
    if (!proforma) return response.status(404).json({ success: false, message: "Proforma not found." });
    const pdf = await createProformaPdf(proforma, settings);
    const filename = `${proforma.proformaNumber}-r${proforma.revisionNumber}.pdf`;
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.setHeader("Cache-Control", "no-store");
    return response.send(pdf);
  } catch (error) {
    if (response.headersSent) return next(error);
    return sendError(response, next, error);
  }
});

router.get("/:id", requireProformaPermission("view"), async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(400).json({ success: false, message: "Invalid proforma ID." });
  }
  try {
    const data = await Proforma.findById(request.params.id).lean();
    if (!data) return response.status(404).json({ success: false, message: "Proforma not found." });
    return response.json({ success: true, data: serializeProforma(data) });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", requireProformaPermission("editOwnDraft"), async (request, response, next) => {
  try {
    const data = await updateProformaDraft(
      request.params.id,
      request.body || {},
      actorFrom(request),
      canManageAny(request)
    );
    return response.json({ success: true, data: serializeProforma(data) });
  } catch (error) {
    return sendError(response, next, error);
  }
});

router.post("/:id/issue", requireProformaPermission("issueOwnDraft"), async (request, response, next) => {
  try {
    const result = await issueProforma(
      request.params.id,
      request.body || {},
      actorFrom(request),
      canManageAny(request)
    );
    return response.json({
      success: true,
      awaitingApproval: result.awaitingApproval,
      data: serializeProforma(result.proforma),
    });
  } catch (error) {
    return sendError(response, next, error);
  }
});

router.post("/:id/approve", requireProformaPermission("approve"), async (request, response, next) => {
  try {
    const data = await approveProforma(request.params.id, actorFrom(request), request.body?.reason || "");
    return response.json({ success: true, data: serializeProforma(data) });
  } catch (error) {
    return sendError(response, next, error);
  }
});

router.post("/:id/reject-approval", requireProformaPermission("approve"), async (request, response, next) => {
  try {
    const data = await rejectProformaApproval(request.params.id, actorFrom(request), request.body?.reason || "");
    return response.json({ success: true, data: serializeProforma(data) });
  } catch (error) {
    return sendError(response, next, error);
  }
});

router.post("/:id/accept", requireProformaPermission("customerDecision"), async (request, response, next) => {
  try {
    const data = await decideCustomerProforma(request.params.id, "accepted", actorFrom(request), request.body?.reason || "");
    return response.json({ success: true, data: serializeProforma(data) });
  } catch (error) {
    return sendError(response, next, error);
  }
});

router.post("/:id/reject", requireProformaPermission("customerDecision"), async (request, response, next) => {
  try {
    const data = await decideCustomerProforma(request.params.id, "rejected", actorFrom(request), request.body?.reason || "");
    return response.json({ success: true, data: serializeProforma(data) });
  } catch (error) {
    return sendError(response, next, error);
  }
});

router.post("/:id/revise", requireProformaPermission("reviseOwn"), async (request, response, next) => {
  try {
    const data = await reviseProforma(
      request.params.id,
      request.body || {},
      actorFrom(request),
      canManageAny(request)
    );
    return response.status(201).json({ success: true, data: serializeProforma(data) });
  } catch (error) {
    return sendError(response, next, error);
  }
});

router.post("/:id/renew", requireProformaPermission("renewOwn"), async (request, response, next) => {
  try {
    const data = await renewProforma(
      request.params.id,
      request.body || {},
      actorFrom(request),
      canManageAny(request)
    );
    return response.status(201).json({ success: true, data: serializeProforma(data) });
  } catch (error) {
    return sendError(response, next, error);
  }
});

router.post("/:id/cancel", requireProformaPermission("cancel"), async (request, response, next) => {
  try {
    const data = await cancelProforma(
      request.params.id,
      actorFrom(request),
      request.body?.reason || "",
      canCancelAny(request)
    );
    return response.json({ success: true, data: serializeProforma(data) });
  } catch (error) {
    return sendError(response, next, error);
  }
});

router.post("/:id/convert", requireProformaPermission("convert"), async (request, response, next) => {
  try {
    const result = await convertProformaToSale(request.params.id, request.body || {}, actorFrom(request));
    return response.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: result.duplicate,
      data: result.sale,
    });
  } catch (error) {
    return sendError(response, next, error);
  }
});

export default router;
