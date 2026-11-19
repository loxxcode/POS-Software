import mongoose from "mongoose";

const quickBooksImportCheckpointSchema = new mongoose.Schema(
  {
    operation: {
      type: String,
      required: true,
      enum: ["initialCatalogImport", "catalogRefresh"],
      unique: true,
    },
    companyIdentityKey: {
      type: String,
      trim: true,
      default: null,
      maxlength: 64,
    },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
      index: true,
    },
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date, default: null },
    lastSuccessfulAt: { type: Date, default: null },
    totals: {
      items: { type: Number, default: 0, min: 0 },
      customers: { type: Number, default: 0, min: 0 },
      salesTaxCodes: { type: Number, default: 0, min: 0 },
      salesTaxItems: { type: Number, default: 0, min: 0 },
      paymentMethods: { type: Number, default: 0, min: 0 },
      accounts: { type: Number, default: 0, min: 0 },
    },
    skipped: {
      itemWithoutListId: { type: Number, default: 0, min: 0 },
      customerWithoutListId: { type: Number, default: 0, min: 0 },
      truncatedCatalog: { type: Number, default: 0, min: 0 },
    },
    truncated: {
      items: { type: Boolean, default: false },
      customers: { type: Boolean, default: false },
      salesTaxCodes: { type: Boolean, default: false },
      salesTaxItems: { type: Boolean, default: false },
      paymentMethods: { type: Boolean, default: false },
      accounts: { type: Boolean, default: false },
    },
    lastErrorCode: { type: String, trim: true, default: null, maxlength: 100 },
    lastError: { type: String, trim: true, default: null, maxlength: 1000 },
  },
  { timestamps: true }
);

export default mongoose.model("QuickBooksImportCheckpoint", quickBooksImportCheckpointSchema);
