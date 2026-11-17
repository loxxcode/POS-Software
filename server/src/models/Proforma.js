import mongoose from "mongoose";

const customerSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    address: { type: String, trim: true, default: "", maxlength: 300 },
    email: { type: String, trim: true, default: "", maxlength: 254 },
    phone: { type: String, trim: true, default: "", maxlength: 30 },
    tin: { type: String, trim: true, default: "", maxlength: 50 },
  },
  { _id: false }
);

const proformaItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true, trim: true },
    barcode: { type: String, trim: true, default: "" },
    name: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true, default: "unit" },
    quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    unitPrice: { type: mongoose.Schema.Types.Decimal128, required: true },
    discountId: { type: mongoose.Schema.Types.ObjectId, ref: "Discount", default: null },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: mongoose.Schema.Types.Decimal128, required: true, min: 0 },
    taxRate: { type: Number, default: null, min: 0, max: 100 },
    taxAmount: { type: mongoose.Schema.Types.Decimal128, required: true },
    lineTotal: { type: mongoose.Schema.Types.Decimal128, required: true },
    stockQtyAtQuote: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const proformaSchema = new mongoose.Schema(
  {
    proformaNumber: { type: String, required: true, trim: true },
    clientRequestId: { type: String, trim: true, maxlength: 100 },
    latestRevision: { type: Boolean, required: true, default: true },
    renewedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Proforma", default: null },
    revisedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Proforma", default: null },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    customerSnapshot: { type: customerSnapshotSchema, required: true },
    items: {
      type: [proformaItemSchema],
      validate: {
        validator: items => items.length > 0,
        message: "A proforma must contain at least one item.",
      },
    },
    subtotal: { type: mongoose.Schema.Types.Decimal128, required: true },
    discountTotal: { type: mongoose.Schema.Types.Decimal128, required: true },
    manualDiscountPercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
    taxTotal: { type: mongoose.Schema.Types.Decimal128, required: true },
    otherCharges: { type: mongoose.Schema.Types.Decimal128, required: true, default: "0.00" },
    grandTotal: { type: mongoose.Schema.Types.Decimal128, required: true },
    taxTreatment: { type: String, required: true, enum: ["unconfigured", "exclusive", "inclusive"], default: "unconfigured" },
    currency: { type: String, required: true, enum: ["RWF"], default: "RWF" },
    status: {
      type: String,
      required: true,
      enum: ["draft", "issued", "accepted", "rejected", "converted", "expired", "cancelled", "revised"],
      default: "draft",
      index: true,
    },
    approvalStatus: {
      type: String,
      required: true,
      enum: ["not_required", "pending", "approved", "rejected"],
      default: "not_required",
    },
    approvalRequired: { type: Boolean, required: true, default: false },
    issueDate: { type: Date, default: null },
    validUntil: { type: Date, required: true },
    notes: { type: String, trim: true, default: "", maxlength: 2000 },
    terms: { type: String, trim: true, default: "", maxlength: 2000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdByEmail: { type: String, required: true, trim: true, maxlength: 254 },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    issuedByEmail: { type: String, trim: true, default: "" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedByEmail: { type: String, trim: true, default: "" },
    acceptedByEmail: { type: String, trim: true, default: "" },
    rejectedByEmail: { type: String, trim: true, default: "" },
    cancelledByEmail: { type: String, trim: true, default: "" },
    revisionNumber: { type: Number, required: true, min: 1, default: 1 },
    convertedSaleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sale", default: null },
  },
  { timestamps: true }
);

proformaSchema.index({ proformaNumber: 1, revisionNumber: 1 }, { unique: true });
proformaSchema.index({ proformaNumber: 1, latestRevision: 1 });
proformaSchema.index({ clientRequestId: 1 }, { unique: true, sparse: true });
proformaSchema.index({ createdAt: -1 });
proformaSchema.index({ status: 1, validUntil: 1, latestRevision: 1 });
proformaSchema.index({ createdBy: 1, createdAt: -1 });

export default mongoose.model("Proforma", proformaSchema);
