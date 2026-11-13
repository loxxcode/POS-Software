
import mongoose from "mongoose";

const saleItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true },
    clientRequestId: { type: String, required: true, unique: true },
    items: {
      type: [saleItemSchema],
      validate: {
        validator: (items) => items.length > 0,
        message: "A sale must contain at least one item",
      },
    },
    subtotal: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "RWF", enum: ["RWF"] },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "mobile_money", "other"],
      required: true,
    },
    status: {
      type: String,
      enum: ["completed", "refunded"],
      default: "completed",
    },
  },
  { timestamps: true }
);

saleSchema.index({ createdAt: -1 });

export default mongoose.model("Sale", saleSchema);
