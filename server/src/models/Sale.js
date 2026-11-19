
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
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true },
    clientRequestId: { type: String, required: true, unique: true },
    proformaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Proforma",
    },
    proformaNumber: { type: String, trim: true, default: null },
    proformaRevision: { type: Number, min: 1, default: null },
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
    taxTotal: { type: Number, default: 0, min: 0 },
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
    quickBooksStatus: {
      type: String,
      enum: ["pending", "processing", "synced", "failed", "needs_review"],
      default: "pending",
    },
    quickBooksTxnId: { type: String, trim: true, default: null, maxlength: 100 },
    quickBooksTxnType: {
      type: String,
      enum: ["SalesReceipt", "Invoice", "ReceivePayment"],
      default: null,
    },
    quickBooksLastError: { type: String, trim: true, default: null, maxlength: 1000 },
    quickBooksSyncedAt: { type: Date, default: null },
    quickBooksRequestId: { type: String, trim: true, default: null, maxlength: 120 },
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
saleSchema.index(
  { proformaId: 1 },
  { unique: true, partialFilterExpression: { proformaId: { $type: "objectId" } } }
);

export default mongoose.model("Sale", saleSchema);
