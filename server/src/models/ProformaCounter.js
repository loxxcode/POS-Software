import mongoose from "mongoose";

const proformaCounterSchema = new mongoose.Schema(
  {
    year: { type: Number, required: true, unique: true },
    value: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("ProformaCounter", proformaCounterSchema);
