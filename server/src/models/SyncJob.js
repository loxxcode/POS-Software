
import mongoose from "mongoose";

const syncJobSchema = new mongoose.Schema(
  {
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "synced", "failed"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    qbxmlRequest: { type: String, default: null },
    qbxmlResponse: { type: String, default: null },
    quickBooksTxnId: { type: String, default: null },
    lastError: { type: String, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("SyncJob", syncJobSchema);
