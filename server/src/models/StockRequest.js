import mongoose from "mongoose";

const stockRequestSchema = new mongoose.Schema(
  {
    items: { type: String, required: true, trim: true, maxlength: 1000 },
    operator: { type: String, required: true, trim: true, maxlength: 120 },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

stockRequestSchema.index({ createdAt: -1 });

export default mongoose.model("StockRequest", stockRequestSchema);
