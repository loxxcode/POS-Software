
import mongoose from "mongoose";

const syncJobSchema = new mongoose.Schema(
  {
    internalJobId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      maxlength: 120,
    },
    operationType: {
      type: String,
      enum: ["createCustomer", "createSalesReceipt", "createInvoice", "createReceivePayment", "updateCustomer", "updateItem"],
      default: "createSalesReceipt",
    },
    entityType: {
      type: String,
      enum: ["sale", "customerPayment", "customer", "item"],
      default: "sale",
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    direction: {
      type: String,
      enum: ["posToQuickBooks", "quickBooksToPos"],
      default: "posToQuickBooks",
    },
    payloadReference: { type: String, trim: true, default: null, maxlength: 120 },
    requestHash: { type: String, trim: true, default: null, maxlength: 64 },
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      default: null,
    },
    idempotencyKey: { type: String, trim: true, default: null, maxlength: 120 },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "succeeded",
        "synced",
        "retryable_failed",
        "failed",
        "permanent_failed",
        "outcome_unknown",
        "requires_review",
        "needs_review",
      ],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    lastAttemptAt: { type: Date, default: null },
    nextAttemptAt: { type: Date, default: null, index: true },
    lastErrorCode: { type: String, trim: true, default: null, maxlength: 100 },
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
