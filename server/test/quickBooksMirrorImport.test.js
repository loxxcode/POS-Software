import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import QuickBooksMirrorRecord from "../src/models/QuickBooksMirrorRecord.js";
import QuickBooksImportCheckpoint from "../src/models/QuickBooksImportCheckpoint.js";

test("QuickBooks mirror import cache allows POS-unmapped QuickBooks records", async () => {
  const record = new QuickBooksMirrorRecord({
    entityType: "item",
    entityId: null,
    quickBooksListId: "item-1",
    quickBooksFullName: "Example Item",
    sourceSystem: "quickbooks",
    syncStatus: "synced",
  });

  await assert.doesNotReject(record.validate());
  assert.equal(record.entityId, null);
});

test("QuickBooks mirror import cache retains POS mapping when mapped", async () => {
  const entityId = new mongoose.Types.ObjectId();
  const record = new QuickBooksMirrorRecord({
    entityType: "customer",
    entityId,
    quickBooksListId: "customer-1",
    quickBooksFullName: "Example Customer",
    sourceSystem: "both",
    syncStatus: "synced",
  });

  await assert.doesNotReject(record.validate());
  assert.equal(String(record.entityId), String(entityId));
  assert.equal(record.sourceSystem, "both");
});

test("QuickBooks import checkpoint records totals, truncation and failure state", async () => {
  const checkpoint = new QuickBooksImportCheckpoint({
    operation: "initialCatalogImport",
    companyIdentityKey: "a".repeat(64),
    status: "failed",
    totals: {
      items: 10,
      customers: 5,
      salesTaxCodes: 2,
      salesTaxItems: 2,
      paymentMethods: 3,
      accounts: 8,
    },
    skipped: {
      itemWithoutListId: 1,
      customerWithoutListId: 0,
      truncatedCatalog: 1,
    },
    truncated: {
      items: true,
    },
    lastErrorCode: "CATALOG_TRUNCATED",
  });

  await assert.doesNotReject(checkpoint.validate());
  assert.equal(checkpoint.status, "failed");
  assert.equal(checkpoint.totals.items, 10);
  assert.equal(checkpoint.truncated.items, true);
});
