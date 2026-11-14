
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
    discountAmount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true },
    clientRequestId: { type: String, required: true, unique: true },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    customerName: { type: String, trim: true, default: "Walk-in customer", maxlength: 120 },
    customerPhone: { type: String, trim: true, default: "", maxlength: 30 },
    items: {
      type: [saleItemSchema],
      validate: {
        validator: (items) => items.length > 0,
        message: "A sale must contain at least one item",
      },
    },
    subtotal: { type: Number, required: true, min: 0 },
    discountTotal: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },
    paymentStatus: {
      type: String,
      enum: ["paid", "unpaid", "partial"],
      default: "paid",
    },
    appliedDiscounts: [{
      discountId: { type: mongoose.Schema.Types.ObjectId, ref: "Discount", required: true },
      title: { type: String, required: true },
      percent: { type: Number, required: true, min: 0.01, max: 100 },
      amount: { type: Number, required: true, min: 0 },
    }],
    currency: { type: String, default: "RWF", enum: ["RWF"] },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "mobile_money", "other", "credit"],
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
saleSchema.index({ customerId: 1, paymentStatus: 1, createdAt: 1 });

export default mongoose.model("Sale", saleSchema);
