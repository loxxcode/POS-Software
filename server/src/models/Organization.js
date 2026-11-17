import mongoose from "mongoose";

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    branch: { type: String, required: true, trim: true, maxlength: 120 },
    manager: { type: String, required: true, trim: true, maxlength: 120 },
    location: { type: String, trim: true, maxlength: 160, default: "" },
    status: {
      type: String,
      enum: ["active", "monitoring", "inactive"],
      default: "active",
    },
    createdBy: { type: String, required: true, trim: true, maxlength: 254 },
  },
  { timestamps: true }
);

organizationSchema.index({ name: 1, branch: 1 }, { unique: true });

export default mongoose.model("Organization", organizationSchema);
