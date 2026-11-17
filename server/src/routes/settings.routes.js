import { Router } from "express";
import AppSettings from "../models/AppSettings.js";
import requireRole from "../middleware/requireRole.js";

const router = Router();

async function getOrCreateSettings() {
  return AppSettings.findOneAndUpdate(
    { _id: "pos" },
    { $setOnInsert: { shopName: "CARITAS HQ SHOP", lowStockThreshold: 5 } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
}

router.get("/", async (_request, response, next) => {
  try {
    const data = await getOrCreateSettings();
    return response.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

router.patch("/", requireRole("administration"), async (request, response, next) => {
  const {
    shopName,
    shopAddress = "",
    shopPhone = "",
    shopEmail = "",
    shopTin = "",
    lowStockThreshold,
    proformaNumberPrefix = "PF",
    proformaValidityDays = 30,
    taxTreatment = "unconfigured",
    proformaApprovalsEnabled = false,
    approvalValueThreshold = null,
    approvalDiscountPercent = null,
  } = request.body || {};
  if (
    typeof shopName !== "string" ||
    !shopName.trim() ||
    shopName.trim().length > 120 ||
    typeof shopAddress !== "string" ||
    shopAddress.length > 300 ||
    typeof shopPhone !== "string" ||
    shopPhone.length > 30 ||
    (shopPhone.trim() && !/^[+()\d\s-]{7,30}$/.test(shopPhone.trim())) ||
    typeof shopEmail !== "string" ||
    shopEmail.length > 254 ||
    (shopEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shopEmail.trim())) ||
    typeof shopTin !== "string" ||
    shopTin.length > 50 ||
    !Number.isSafeInteger(lowStockThreshold) ||
    lowStockThreshold < 1 ||
    lowStockThreshold > 10000 ||
    typeof proformaNumberPrefix !== "string" ||
    !/^[A-Z0-9-]{1,10}$/i.test(proformaNumberPrefix.trim()) ||
    !Number.isSafeInteger(proformaValidityDays) ||
    proformaValidityDays < 1 ||
    proformaValidityDays > 365 ||
    !["unconfigured", "exclusive", "inclusive"].includes(taxTreatment) ||
    typeof proformaApprovalsEnabled !== "boolean" ||
    (approvalValueThreshold !== null &&
      (!Number.isFinite(approvalValueThreshold) || approvalValueThreshold < 0)) ||
    (approvalDiscountPercent !== null &&
      (!Number.isFinite(approvalDiscountPercent) ||
        approvalDiscountPercent < 0 ||
        approvalDiscountPercent > 100)) ||
    (proformaApprovalsEnabled &&
      (approvalValueThreshold === null || approvalDiscountPercent === null))
  ) {
    return response.status(400).json({
      success: false,
      message: "Enter valid shop settings, proforma numbering and validity values, and both approval thresholds when approvals are enabled.",
    });
  }

  try {
    const data = await AppSettings.findOneAndUpdate(
      { _id: "pos" },
      {
        $set: {
          shopName: shopName.trim(),
          shopAddress: shopAddress.trim(),
          shopPhone: shopPhone.trim(),
          shopEmail: shopEmail.trim().toLowerCase(),
          shopTin: shopTin.trim(),
          lowStockThreshold,
          proformaNumberPrefix: proformaNumberPrefix.trim().toUpperCase(),
          proformaValidityDays,
          taxTreatment,
          proformaApprovalsEnabled,
          approvalValueThreshold,
          approvalDiscountPercent,
          updatedBy: request.user.email,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    return response.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

export default router;
