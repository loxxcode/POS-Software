
import mongoose from "mongoose";

const syncJobSchema = new mongoose.Schema(
  {
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      required: true,
      unique: true,
    },
    idempotencyKey: { type: String, trim: true, default: null, maxlength: 120 },
    status: {
      type: String,
      enum: ["pending", "processing", "synced", "failed", "needs_review"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    lastAttemptAt: { type: Date, default: null },
    claimToken: { type: String, default: null, maxlength: 120 },
    claimedAt: { type: Date, default: null },
    quickBooksTxnType: {
      type: String,
      enum: ["SalesReceipt", "Invoice", "ReceivePayment"],
      default: null,
    },
    qbxmlRequest: { type: String, default: null },
    qbxmlResponse: { type: String, default: null },
    quickBooksTxnId: { type: String, default: null },
    lastError: { type: String, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

syncJobSchema.index(
  { idempotencyKey: 1 },
  {
    name: "quickbooks_idempotency_unique",
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);

export default mongoose.model("SyncJob", syncJobSchema);
