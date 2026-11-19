
import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: { type: String, required: true, trim: true },
    barcode: { type: String, trim: true, default: "" },
    unit: { type: String, trim: true, default: "unit", maxlength: 30 },
    taxRate: { type: Number, default: null, min: 0, max: 100 },
    quickBooksItemListId: { type: String, trim: true, default: null, maxlength: 100 },
    itemType: {
      type: String,
      enum: ["book", "stationery", "other"],
      default: "book",
    },
    isbn: { type: String, trim: true, default: "" },
    author: { type: String, trim: true, default: "" },
    category: { type: String, trim: true, default: "General" },
    origin: { type: String, trim: true, default: "Local" },
    sellingPrice: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 },
    stockQty: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ name: "text", sku: "text", isbn: "text" });
productSchema.index(
  { quickBooksItemListId: 1 },
  {
    name: "quickbooks_product_listid_unique",
    unique: true,
    partialFilterExpression: { quickBooksItemListId: { $type: "string" } },
  }
);

export default mongoose.model("Product", productSchema);
