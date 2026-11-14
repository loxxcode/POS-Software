import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, default: "", maxlength: 254 },
    phone: { type: String, trim: true, default: "", maxlength: 30 },
    tin: { type: String, trim: true, default: "", maxlength: 50 },
    credit: { type: Number, default: 0, min: 0 },
    address: { type: String, trim: true, default: "", maxlength: 300 },
  },
  { timestamps: true }
);

customerSchema.index({ name: 1 });

export default mongoose.model("Customer", customerSchema);
