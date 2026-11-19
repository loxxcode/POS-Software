import assert from "node:assert/strict";
import test from "node:test";
import { buildQuickBooksAutoMatchPlan } from "../src/services/quickBooksAutoMatch.js";

function item(listId, name, extra = {}) {
  return {
    listId,
    name,
    fullName: name,
    type: "inventory",
    isSalesItem: true,
    ...extra,
  };
}

function catalogs({ items = [], customers = [], truncated = {} } = {}) {
  return {
    items,
    customers,
    salesTaxCodes: [],
    salesTaxItems: [],
    paymentMethods: [],
    accounts: [],
    truncated: {
      items: false,
      customers: false,
      salesTaxCodes: false,
      salesTaxItems: false,
      paymentMethods: false,
      accounts: false,
      ...truncated,
    },
  };
}

test("exact auto-match links unique product SKU/name and customer name matches", () => {
  const plan = buildQuickBooksAutoMatchPlan({
    products: [{
      _id: "product-1",
      active: true,
      sku: "BOOK-1",
      name: "Reading Book",
      sellingPrice: 500,
      quickBooksItemListId: null,
    }],
    customers: [{
      _id: "customer-1",
      name: "Jane Reader",
      email: "jane@example.test",
      phone: "12345",
      address: "Main Street",
      quickBooksListId: null,
    }],
    catalogs: catalogs({
      items: [item("item-1", "BOOK-1")],
      customers: [{ listId: "customer-qb-1", name: "Jane Reader", fullName: "Jane Reader" }],
    }),
  });

  assert.deepEqual(plan.products, { matched: 1, ambiguous: 0, unmatched: 0, conflicts: 0, unavailable: 0 });
  assert.deepEqual(plan.customers, { matched: 1, ambiguous: 0, unmatched: 0, conflicts: 0, unavailable: 0 });
  assert.deepEqual(
    plan.matches.map(({ kind, quickBooksListId, matchBy }) => ({ kind, quickBooksListId, matchBy })),
    [
      { kind: "product", quickBooksListId: "item-1", matchBy: "SKU" },
      { kind: "customer", quickBooksListId: "customer-qb-1", matchBy: "name" },
    ]
  );
  assert.match(plan.token, /^[a-f0-9]{64}$/);
});

test("ambiguous and duplicate POS matches are not auto-linked", () => {
  const plan = buildQuickBooksAutoMatchPlan({
    products: [
      { _id: "product-1", active: true, sku: "SAME", name: "First", sellingPrice: 1 },
      { _id: "product-2", active: true, sku: "SAME", name: "Second", sellingPrice: 2 },
      { _id: "product-3", active: true, sku: "OTHER", name: "Ambiguous", sellingPrice: 3 },
    ],
    customers: [],
    catalogs: catalogs({
      items: [
        item("item-1", "SAME"),
        item("item-2", "OTHER"),
        item("item-3", "Ambiguous"),
      ],
    }),
  });

  assert.equal(plan.products.matched, 0);
  assert.equal(plan.products.ambiguous, 1);
  assert.equal(plan.products.conflicts, 2);
  assert.equal(plan.matches.length, 0);
});

test("existing mappings are kept and truncated catalogs block new exact matches", () => {
  const plan = buildQuickBooksAutoMatchPlan({
    products: [
      {
        _id: "product-1",
        active: true,
        sku: "SKU-1",
        name: "Current POS name",
        sellingPrice: 500,
        quickBooksItemListId: "item-1",
      },
      { _id: "product-2", active: true, sku: "SKU-2", name: "Book Two", sellingPrice: 600 },
    ],
    customers: [{ _id: "customer-1", name: "Jane Reader", quickBooksListId: null }],
    catalogs: catalogs({
      items: [item("item-1", "Old QuickBooks name")],
      customers: [{ listId: "customer-1", name: "Jane Reader" }],
      truncated: { items: true },
    }),
  });

  assert.equal(plan.products.matched, 1);
  assert.equal(plan.products.unavailable, 1);
  assert.equal(plan.customers.matched, 1);
  assert.equal(plan.matches.find(match => match.kind === "product").matchBy, "existing link");
  assert.equal(plan.truncated.items, true);
});
