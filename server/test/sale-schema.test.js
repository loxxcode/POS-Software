import assert from "node:assert/strict";
import test from "node:test";
import Customer from "../src/models/Customer.js";
import Product from "../src/models/Product.js";
import Sale from "../src/models/Sale.js";
import SyncJob from "../src/models/SyncJob.js";

test("regular sales are excluded from the unique proforma conversion index", () => {
  assert.equal(Sale.schema.path("proformaId").defaultValue, undefined);
  const [key, options] = Sale.schema.indexes().find(([fields]) => fields.proformaId === 1);
  assert.deepEqual(key, { proformaId: 1 });
  assert.deepEqual(options.partialFilterExpression, { proformaId: { $type: "objectId" } });
});

test("converted sales retain their proforma number and revision", () => {
  assert.ok(Sale.schema.path("proformaNumber"));
  assert.ok(Sale.schema.path("proformaRevision"));
});

test("sales and sync jobs retain separate QuickBooks synchronization metadata", () => {
  assert.equal(Sale.schema.path("quickBooksStatus").defaultValue, "pending");
  assert.ok(Sale.schema.path("quickBooksTxnId"));
  assert.ok(Sale.schema.path("quickBooksTxnType"));
  assert.ok(Sale.schema.path("quickBooksLastError"));
  assert.ok(Sale.schema.path("quickBooksSyncedAt"));
  assert.ok(Sale.schema.path("quickBooksRequestId"));

  assert.ok(Product.schema.path("quickBooksItemListId"));
  assert.ok(Customer.schema.path("quickBooksListId"));
  const [key, options] = SyncJob.schema.indexes()
    .find(([fields]) => fields.idempotencyKey === 1);
  assert.deepEqual(key, { idempotencyKey: 1 });
  assert.equal(options.unique, true);
  assert.deepEqual(options.partialFilterExpression, {
    idempotencyKey: { $type: "string" },
  });
});
