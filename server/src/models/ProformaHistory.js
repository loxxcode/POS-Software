import mongoose from "mongoose";

const proformaHistorySchema = new mongoose.Schema(
  {
    proformaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Proforma",
      required: true,
      index: true,
    },
    proformaNumber: { type: String, required: true, trim: true },
    action: {
      type: String,
      required: true,
      enum: [
        "draft_created", "draft_updated", "approval_requested", "approved",
        "approval_rejected", "issued", "accepted", "rejected", "revised",
        "renewed", "cancelled", "expired", "converted",
      ],
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorEmail: { type: String, required: true, trim: true, maxlength: 254 },
    actorRole: { type: String, required: true, enum: ["cashier", "accountant", "daf", "administration", "system"] },
    reason: { type: String, trim: true, default: "", maxlength: 1000 },
    revisionNumber: { type: Number, required: true, min: 1 },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

proformaHistorySchema.index({ proformaId: 1, createdAt: -1 });

export default mongoose.model("ProformaHistory", proformaHistorySchema);
