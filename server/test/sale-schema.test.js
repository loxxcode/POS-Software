import assert from "node:assert/strict";
import test from "node:test";
import Sale from "../src/models/Sale.js";

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
