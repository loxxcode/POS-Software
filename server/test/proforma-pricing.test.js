import assert from "node:assert/strict";
import test from "node:test";
import { priceProformaItems } from "../src/services/proformaPricing.js";

test("rejects invalid one-off proforma discount percentages", async () => {
  await assert.rejects(
    priceProformaItems({
      items: [{ productId: "507f1f77bcf86cd799439011", quantity: 1 }],
      manualDiscountPercent: 100.01,
      taxTreatment: "exclusive",
    }),
    error => error.status === 400 && /One-off discount/.test(error.message)
  );
});

test("does not allow a saved discount and one-off discount together", async () => {
  await assert.rejects(
    priceProformaItems({
      items: [{ productId: "507f1f77bcf86cd799439011", quantity: 1 }],
      discountId: "507f1f77bcf86cd799439012",
      manualDiscountPercent: 5,
      taxTreatment: "exclusive",
    }),
    error => error.status === 400 && /either a saved discount or a one-off/.test(error.message)
  );
});
