import mongoose from "mongoose";

const discountSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    customerName: { type: String, required: true, trim: true, maxlength: 120 },
    product: { type: String, required: true, trim: true, maxlength: 120 },
    reason: { type: String, trim: true, maxlength: 500 },
    title: { type: String, trim: true, maxlength: 120 },
    percent: { type: Number, required: true, min: 0.01, max: 100 },
    start: { type: String, required: true },
    end: { type: String, required: true },
  },
  { timestamps: true }
);

discountSchema.index({ createdAt: -1 });

export default mongoose.model("Discount", discountSchema);
