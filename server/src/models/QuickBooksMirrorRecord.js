import mongoose from "mongoose";

const quickBooksMirrorRecordSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      required: true,
      enum: ["customer", "item", "account", "taxCode", "taxItem", "paymentMethod", "salesReceipt", "invoice", "receivePayment"],
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    quickBooksListId: {
      type: String,
      trim: true,
      default: null,
      maxlength: 100,
    },
    quickBooksTxnId: {
      type: String,
      trim: true,
      default: null,
      maxlength: 100,
    },
    quickBooksFullName: {
      type: String,
      trim: true,
      default: null,
      maxlength: 300,
    },
    quickBooksEditSequence: {
      type: String,
      trim: true,
      default: null,
      maxlength: 100,
    },
    sourceSystem: {
      type: String,
      enum: ["pos", "quickbooks", "both"],
      default: "both",
    },
    syncStatus: {
      type: String,
      enum: ["pending", "synced", "stale", "missing", "failed", "requires_review"],
      default: "pending",
      index: true,
    },
    quickBooksSyncedAt: { type: Date, default: null },
    quickBooksLastError: {
      type: String,
      trim: true,
      default: null,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

quickBooksMirrorRecordSchema.index(
  { entityType: 1, entityId: 1 },
  {
    name: "quickbooks_mirror_entity_unique",
    unique: true,
    partialFilterExpression: { entityId: { $type: "objectId" } },
  }
);
quickBooksMirrorRecordSchema.index(
  { quickBooksListId: 1, entityType: 1 },
  {
    name: "quickbooks_mirror_listid_unique",
    unique: true,
    partialFilterExpression: { quickBooksListId: { $type: "string" } },
  }
);
quickBooksMirrorRecordSchema.index(
  { quickBooksTxnId: 1, entityType: 1 },
  {
    name: "quickbooks_mirror_txnid_unique",
    unique: true,
    partialFilterExpression: { quickBooksTxnId: { $type: "string" } },
  }
);

export default mongoose.model("QuickBooksMirrorRecord", quickBooksMirrorRecordSchema);
