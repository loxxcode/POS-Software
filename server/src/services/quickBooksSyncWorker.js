import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import SyncJob from "../models/SyncJob.js";
import Sale from "../models/Sale.js";

export const SyncState = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  SUCCEEDED: "succeeded",
  RETRYABLE_FAILED: "retryable_failed",
  PERMANENT_FAILED: "permanent_failed",
  OUTCOME_UNKNOWN: "outcome_unknown",
  REQUIRES_REVIEW: "requires_review",
});

const retryCodes = new Set([
  "BRIDGE_UNAVAILABLE",
  "SESSION_CLOSE_ERROR",
  "CONNECTION_CLOSE_ERROR",
]);

export function calculateRetryDelayMs(attempt, randomValue = Math.random()) {
  const safeAttempt = Number.isSafeInteger(attempt) ? Math.max(0, attempt) : 0;
  const exponential = Math.min(300_000, 1000 * (2 ** safeAttempt));
  const boundedJitter = Math.min(1, Math.max(0, randomValue));
  return Math.floor(exponential * (0.75 + boundedJitter * 0.5));
}

export function classifySyncFailure(error) {
  const code = typeof error?.code === "string" ? error.code : "UNKNOWN_SYNC_ERROR";
  if (["BRIDGE_TIMEOUT", "BRIDGE_RESPONSE_INCOMPLETE", "BRIDGE_INVALID_RESPONSE", "QUICKBOOKS_COM_ERROR"].includes(code)) {
    return SyncState.OUTCOME_UNKNOWN;
  }
  if (retryCodes.has(code)) return SyncState.RETRYABLE_FAILED;
  return SyncState.PERMANENT_FAILED;
}

export async function claimSyncJob({ staleAfterMs = 300_000 } = {}) {
  const claimToken = randomUUID();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - staleAfterMs);
  const candidate = await SyncJob.findOne({
    status: { $in: [SyncState.PENDING, SyncState.RETRYABLE_FAILED, SyncState.OUTCOME_UNKNOWN] },
    $and: [
      { $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
      {
        $or: [
          { status: { $ne: SyncState.PROCESSING } },
          { claimedAt: { $lte: staleBefore } },
          { claimToken: null },
        ],
      },
    ],
  }).sort({ createdAt: 1 });
  if (!candidate) return null;

  const claimed = await SyncJob.findOneAndUpdate(
    {
      _id: candidate._id,
      status: candidate.status,
      claimToken: candidate.claimToken,
    },
    {
      $set: {
        status: SyncState.PROCESSING,
        claimToken,
        claimedAt: now,
        lastAttemptAt: now,
      },
      $inc: { attempts: 1 },
    },
    { new: true }
  );
  return claimed;
}

export async function markSyncJobRetryable(jobId, error) {
  const state = classifySyncFailure(error);
  const job = await SyncJob.findById(jobId).select("attempts");
  const attempts = job?.attempts || 0;
  const nextAttemptAt = state === SyncState.OUTCOME_UNKNOWN
    ? null
    : new Date(Date.now() + calculateRetryDelayMs(attempts, Math.random()));
  const code = typeof error?.code === "string" ? error.code.slice(0, 100) : "UNKNOWN_SYNC_ERROR";

  return SyncJob.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: state,
        claimToken: null,
        claimedAt: null,
        nextAttemptAt,
        lastErrorCode: code,
        lastError: typeof error?.message === "string"
          ? error.message.slice(0, 1000)
          : "QuickBooks synchronization failed.",
      },
    },
    { new: true }
  );
}

export async function reconcileSyncJob(jobId, { saleQuickBooksTxnId = null, saleQuickBooksTxnType = null, note = "" } = {}) {
  if (!mongoose.isValidObjectId(jobId)) return null;
  const job = await SyncJob.findById(jobId);
  if (!job) return null;

  if (!saleQuickBooksTxnId) {
    return SyncJob.findByIdAndUpdate(
      jobId,
      {
        $set: {
          status: SyncState.REQUIRES_REVIEW,
          claimToken: null,
          claimedAt: null,
          nextAttemptAt: null,
          lastErrorCode: "MANUAL_RECONCILIATION_REQUIRED",
          lastError: note.trim().slice(0, 1000) || "No confirmed QuickBooks transaction was supplied.",
        },
      },
      { new: true }
    );
  }

  const saleUpdate = {
    $set: {
      quickBooksStatus: "synced",
      quickBooksTxnId: saleQuickBooksTxnId,
      quickBooksTxnType: saleQuickBooksTxnType,
      quickBooksSyncedAt: new Date(),
      quickBooksLastError: null,
    },
  };
  const [updatedJob] = await Promise.all([
    SyncJob.findByIdAndUpdate(
      jobId,
      {
        $set: {
          status: "synced",
          quickBooksTxnId: saleQuickBooksTxnId,
          quickBooksTxnType: saleQuickBooksTxnType,
          claimToken: null,
          claimedAt: null,
          nextAttemptAt: null,
          lastErrorCode: null,
          lastError: null,
          processedAt: new Date(),
        },
      },
      { new: true }
    ),
    Sale.findByIdAndUpdate(job.saleId, saleUpdate),
  ]);
  return updatedJob;
}

export function createStableRequestHash(value) {
  const serialized = typeof value === "string"
    ? value
    : JSON.stringify(value);
  return createHash("sha256").update(serialized).digest("hex");
}
