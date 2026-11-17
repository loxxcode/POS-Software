import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actorEmail: { type: String, required: true, trim: true, maxlength: 254 },
    actorRole: { type: String, required: true, enum: ["cashier", "accountant", "daf", "administration"] },
    method: { type: String, required: true, enum: ["POST", "PUT", "PATCH", "DELETE"] },
    path: { type: String, required: true, trim: true, maxlength: 300 },
    resource: { type: String, required: true, trim: true, maxlength: 100 },
    action: { type: String, required: true, trim: true, maxlength: 160 },
    statusCode: { type: Number, required: true, min: 100, max: 599 },
    outcome: { type: String, required: true, enum: ["Success", "Failed"] },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
