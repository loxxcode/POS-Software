import assert from "node:assert/strict";
import test from "node:test";
import Product from "../src/models/Product.js";
import { priceProformaItems } from "../src/services/proformaPricing.js";

test("tax-free proforma pricing ignores configured product tax rates", async () => {
  const originalFind = Product.find;
  Product.find = () => ({
    session() {
      return this;
    },
    lean: async () => [{
      _id: "507f1f77bcf86cd799439011",
      sku: "TEST-1",
      name: "Test product",
      sellingPrice: "100.00",
      taxRate: 18,
      stockQty: 4,
    }],
  });

  try {
    const pricing = await priceProformaItems({
      items: [{ productId: "507f1f77bcf86cd799439011", quantity: 2 }],
      taxTreatment: "unconfigured",
      ignoreProductTaxRates: true,
    });

    assert.equal(pricing.taxTotal, "0.00");
    assert.equal(pricing.items[0].taxRate, null);
    assert.equal(pricing.items[0].taxAmount, "0.00");
    assert.equal(pricing.grandTotal, "200.00");
  } finally {
    Product.find = originalFind;
  }
});

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
