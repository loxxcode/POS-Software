import mongoose from "mongoose";

const appSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "pos" },
    shopName: { type: String, required: true, trim: true, maxlength: 120, default: "CARITAS HQ SHOP" },
    shopAddress: { type: String, trim: true, default: "", maxlength: 300 },
    shopPhone: { type: String, trim: true, default: "", maxlength: 30 },
    shopEmail: { type: String, trim: true, lowercase: true, default: "", maxlength: 254 },
    shopTin: { type: String, trim: true, default: "", maxlength: 50 },
    lowStockThreshold: { type: Number, required: true, min: 1, max: 10000, default: 5 },
    proformaNumberPrefix: { type: String, required: true, trim: true, maxlength: 10, default: "PF" },
    proformaValidityDays: { type: Number, required: true, min: 1, max: 365, default: 30 },
    taxTreatment: {
      type: String,
      required: true,
      enum: ["unconfigured", "exclusive", "inclusive"],
      default: "unconfigured",
    },
    proformaApprovalsEnabled: { type: Boolean, required: true, default: false },
    approvalValueThreshold: { type: Number, default: null, min: 0 },
    approvalDiscountPercent: { type: Number, default: null, min: 0, max: 100 },
    updatedBy: { type: String, trim: true, maxlength: 254, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("AppSettings", appSettingsSchema);
