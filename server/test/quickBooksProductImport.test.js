import assert from "node:assert/strict";
import test from "node:test";
import { prepareQuickBooksProduct } from "../src/services/quickBooksProductImport.js";

test("QuickBooks inventory and assembly items map to deterministic POS products", () => {
  for (const type of ["inventory", "inventory_assembly"]) {
    const result = prepareQuickBooksProduct({
      listId: "80000001-123",
      name: "Example item",
      type,
      quantityOnHand: 12,
      salesPrice: 125.5,
    });

    assert.equal(result.reason, null);
    assert.deepEqual(result.product, {
      sku: "QB-80000001-123",
      name: "Example item",
      unit: "unit",
      taxRate: null,
      itemType: "other",
      category: "QuickBooks",
      origin: "QuickBooks",
      sellingPrice: 125.5,
      stockQty: 12,
      quickBooksItemListId: "80000001-123",
    });
  }
});

test("QuickBooks product import excludes untracked, fractional, and incomplete items", () => {
  assert.equal(prepareQuickBooksProduct({
    listId: "service-1",
    name: "Consulting",
    type: "service",
    quantityOnHand: null,
    salesPrice: 10,
  }).reason, "unsupportedItemType");
  assert.equal(prepareQuickBooksProduct({
    listId: "item-1",
    name: "Fractional stock",
    type: "inventory",
    quantityOnHand: 1.5,
    salesPrice: 10,
  }).reason, "unsupportedQuantity");
  assert.equal(prepareQuickBooksProduct({
    listId: "item-2",
    name: "Missing price",
    type: "inventory",
    quantityOnHand: 1,
    salesPrice: null,
  }).reason, "unsupportedSalesPrice");
});
