import mongoose from "mongoose";

const taxRateMappingSchema = new mongoose.Schema(
  {
    posTaxRate: { type: Number, required: true, min: 0, max: 100 },
    quickBooksSalesTaxCodeListId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    quickBooksSalesTaxItemListId: {
      type: String,
      trim: true,
      default: null,
      maxlength: 100,
    },
  },
  { _id: false }
);

const paymentMethodMappingSchema = new mongoose.Schema(
  {
    posPaymentMethod: {
      type: String,
      required: true,
      enum: ["cash", "card", "mobile_money", "other"],
    },
    quickBooksPaymentMethodListId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    quickBooksDepositAccountListId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
  },
  { _id: false }
);

const quickBooksSyncSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "default" },
    accountsReceivableAccountListId: {
      type: String,
      trim: true,
      default: null,
      maxlength: 100,
    },
    taxRateMappings: {
      type: [taxRateMappingSchema],
      default: [],
      validate: {
        validator(mappings) {
          const rates = mappings.map(mapping => Math.round(mapping.posTaxRate * 100));
          return new Set(rates).size === rates.length;
        },
        message: "POS tax rates must be unique in the QuickBooks mapping.",
      },
    },
    paymentMethodMappings: {
      type: [paymentMethodMappingSchema],
      default: [],
      validate: {
        validator(mappings) {
          const methods = mappings.map(mapping => mapping.posPaymentMethod);
          return new Set(methods).size === methods.length;
        },
        message: "POS payment methods must be unique in the QuickBooks mapping.",
      },
    },
    updatedBy: { type: String, trim: true, maxlength: 254, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("QuickBooksSyncSettings", quickBooksSyncSettingsSchema);
