import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, default: "", maxlength: 254 },
    phone: { type: String, trim: true, default: "", maxlength: 30 },
    tin: { type: String, trim: true, default: "", maxlength: 50 },
    credit: { type: Number, default: 0, min: 0 },
    address: { type: String, trim: true, default: "", maxlength: 300 },
    quickBooksListId: { type: String, trim: true, default: null, maxlength: 100 },
  },
  { timestamps: true }
);

customerSchema.index({ name: 1 });
customerSchema.index(
  { quickBooksListId: 1 },
  {
    name: "quickbooks_customer_listid_unique",
    unique: true,
    partialFilterExpression: { quickBooksListId: { $type: "string" } },
  }
);

export default mongoose.model("Customer", customerSchema);
