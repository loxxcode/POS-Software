import assert from "node:assert/strict";
import test from "node:test";
import { createProformaPdf } from "../src/services/proformaPdf.js";

test("renders a complete proforma PDF before the route sends a response", async () => {
  const pdf = await createProformaPdf({
    proformaNumber: "PF-2026-000001",
    revisionNumber: 1,
    status: "issued",
    issueDate: new Date("2026-11-17T00:00:00.000Z"),
    validUntil: new Date("2026-12-17T23:59:59.999Z"),
    customerSnapshot: { name: "Test customer", address: "", phone: "", email: "", tin: "" },
    items: [{
      name: "Test product",
      sku: "TEST-1",
      quantity: 1,
      unit: "each",
      unitPrice: "100.00",
      discountPercent: 0,
      lineTotal: "100.00",
    }],
    subtotal: "100.00",
    discountTotal: "0.00",
    taxTotal: "0.00",
    otherCharges: "0.00",
    grandTotal: "100.00",
    taxTreatment: "exclusive",
    terms: "",
    notes: "",
  }, { shopName: "Test shop" });

  assert.ok(pdf.length > 0);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});
