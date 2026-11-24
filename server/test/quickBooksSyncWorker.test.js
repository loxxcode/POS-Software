import assert from "node:assert/strict";
import test from "node:test";
import SyncJob from "../src/models/SyncJob.js";
import {
  calculateRetryDelayMs,
  classifySyncFailure,
  createStableRequestHash,
  SyncState,
} from "../src/services/quickBooksSyncWorker.js";

test("sync worker uses bounded exponential backoff", () => {
  assert.ok(calculateRetryDelayMs(0, 0) >= 750);
  assert.ok(calculateRetryDelayMs(0, 1) <= 1500);
  assert.ok(calculateRetryDelayMs(20, 1) <= 375000);
  assert.ok(calculateRetryDelayMs(-1, 0.5) >= 750);
});

test("sync worker classifies timeout as unknown outcome", () => {
  assert.equal(
    classifySyncFailure({ code: "BRIDGE_TIMEOUT", message: "timed out" }),
    SyncState.OUTCOME_UNKNOWN
  );
  assert.equal(
    classifySyncFailure({ code: "BRIDGE_UNAVAILABLE", message: "unavailable" }),
    SyncState.RETRYABLE_FAILED
  );
  assert.equal(
    classifySyncFailure({ code: "BRIDGE_RESPONSE_INCOMPLETE", message: "incomplete" }),
    SyncState.OUTCOME_UNKNOWN
  );
  assert.equal(
    classifySyncFailure({ code: "INVALID_MAPPING", message: "invalid" }),
    SyncState.PERMANENT_FAILED
  );
});

test("sync worker creates stable SHA-256 request hashes", () => {
  const payload = { saleId: "sale-1", total: 1250 };
  assert.equal(createStableRequestHash(payload), createStableRequestHash(payload));
  assert.match(createStableRequestHash(payload), /^[a-f0-9]{64}$/);
  assert.notEqual(
    createStableRequestHash(payload),
    createStableRequestHash({ ...payload, total: 1251 })
  );
});

test("sync job schema supports explicit queue states and retry metadata", () => {
  const job = new SyncJob({
    saleId: "507f1f77bcf86cd799439011",
    idempotencyKey: "pos-sale:test",
    status: SyncState.OUTCOME_UNKNOWN,
    operationType: "createSalesReceipt",
    entityType: "sale",
    entityId: "507f1f77bcf86cd799439012",
    direction: "posToQuickBooks",
    requestHash: "a".repeat(64),
    attempts: 2,
  });

  assert.equal(job.status, SyncState.OUTCOME_UNKNOWN);
  assert.equal(job.operationType, "createSalesReceipt");
  assert.equal(job.requestHash, "a".repeat(64));
});
