import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import QuickBooksMirrorRecord from "../src/models/QuickBooksMirrorRecord.js";

test("QuickBooks mirror records preserve stable references and revision metadata", async () => {
  const record = new QuickBooksMirrorRecord({
    entityType: "customer",
    entityId: new mongoose.Types.ObjectId(),
    quickBooksListId: "80000001",
    quickBooksFullName: "Example Customer",
    quickBooksEditSequence: "1730000000",
    sourceSystem: "both",
    syncStatus: "synced",
  });

  await assert.doesNotReject(record.validate());
  assert.equal(record.quickBooksListId, "80000001");
  assert.equal(record.quickBooksEditSequence, "1730000000");
  assert.equal(record.syncStatus, "synced");
});

test("QuickBooks mirror records reject unsupported sync states", async () => {
  const record = new QuickBooksMirrorRecord({
    entityType: "item",
    entityId: new mongoose.Types.ObjectId(),
    syncStatus: "completed",
  });

  await assert.rejects(record.validate());
});

test("QuickBooks mirror indexes prevent duplicate entity and accounting references", () => {
  const indexes = QuickBooksMirrorRecord.schema.indexes();
  assert.ok(indexes.some(([fields, options]) =>
    fields.entityType === 1 &&
    fields.entityId === 1 &&
    options.unique === true
  ));
  assert.ok(indexes.some(([fields, options]) =>
    fields.quickBooksListId === 1 &&
    fields.entityType === 1 &&
    options.unique === true
  ));
  assert.ok(indexes.some(([fields, options]) =>
    fields.quickBooksTxnId === 1 &&
    fields.entityType === 1 &&
    options.unique === true
  ));
});
