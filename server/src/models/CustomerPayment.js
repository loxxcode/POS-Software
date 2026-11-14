import mongoose from "mongoose";

const allocationSchema = new mongoose.Schema(
  {
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      required: true,
    },
    receiptNumber: { type: String, required: true },
    amount: { type: Number, required: true, min: 0.01 },
  },
  { _id: false }
);

const customerPaymentSchema = new mongoose.Schema(
  {
    clientRequestId: { type: String, required: true, unique: true },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    customerName: { type: String, required: true, trim: true, maxlength: 120 },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "mobile_money", "other"],
      required: true,
    },
    balanceBefore: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    receivedBy: { type: String, required: true, trim: true, maxlength: 254 },
    allocations: { type: [allocationSchema], default: [] },
  },
  { timestamps: true }
);

customerPaymentSchema.index({ customerId: 1, createdAt: -1 });

export default mongoose.model("CustomerPayment", customerPaymentSchema);
