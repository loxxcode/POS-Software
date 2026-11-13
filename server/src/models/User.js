import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    role: {
      type: String,
      required: true,
      enum: ["cashier", "accountant", "daf", "administration"],
    },
    passwordSalt: { type: String, required: true, select: false },
    passwordHash: { type: String, required: true, select: false },
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
