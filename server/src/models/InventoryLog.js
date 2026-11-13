
import mongoose from "mongoose";

const inventoryLogSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    change: {
      type: Number,
      required: true,
      validate: Number.isInteger,
    },
    quantityBefore: {
      type: Number,
      required: true,
      min: 0,
    },
    quantityAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      enum: [
        "opening_stock",
        "restock",
        "damage",
        "loss",
        "correction",
      ],
      required: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    // Will be populated from authenticated staff in a later stage.
    performedBy: {
      type: String,
      default: "development",
    },
  },
  { timestamps: true }
);

export default mongoose.model("InventoryLog", inventoryLogSchema);
