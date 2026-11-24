
import { Router } from "express";
import mongoose from "mongoose";
import { createHash, randomUUID } from "node:crypto";
import Product from "../models/Product.js";
import InventoryLog from "../models/InventoryLog.js";
import SyncJob from "../models/SyncJob.js";
import QuickBooksSyncSettings from "../models/QuickBooksSyncSettings.js";
import {
  getQuickBooksCatalogs,
  QuickBooksBridgeError,
  adjustQuickBooksInventory,
} from "../services/quickBooksBridge.js";

const router = Router();

// GET /api/inventory
router.get("/", async (req, res, next) => {
  try {
    const data = await Product.find({ active: true })
      .select("sku name barcode unit taxRate itemType category origin stockQty sellingPrice costPrice quickBooksItemListId")
      .sort({ name: 1 })
      .limit(2000)
      .lean();

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
});

router.get("/quickbooks", async (_req, res, next) => {
  try {
    const catalogs = await getQuickBooksCatalogs();
    return res.json({
      success: true,
      data: {
        items: catalogs.items.map(item => ({
          listId: item.listId,
          name: item.fullName || item.name,
          type: item.type,
          quantityOnHand: Number.isFinite(item.quantityOnHand) ? item.quantityOnHand : null,
          salesPrice: Number.isFinite(item.salesPrice) ? item.salesPrice : null,
        })),
        truncated: catalogs.truncated.items,
      },
    });
  } catch (error) {
    if (error instanceof QuickBooksBridgeError) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    return next(error);
  }
});

// POST /api/inventory/adjust
router.post("/adjust", async (req, res, next) => {
  const { productId, change, expectedQuantity, reason, note = "" } = req.body || {};

  const validReasons = [
    "restock",
    "damage",
    "loss",
    "correction",
  ];

  if (
    !mongoose.isValidObjectId(productId) ||
    !Number.isSafeInteger(change) ||
    change === 0 ||
    !Number.isSafeInteger(expectedQuantity) ||
    expectedQuantity < 0 ||
    !validReasons.includes(reason) ||
    typeof note !== "string" ||
    note.length > 500 ||
    (reason === "restock" && change < 0) ||
    ((reason === "damage" || reason === "loss") && change > 0)
  ) {
    return res.status(400).json({
      success: false,
    message: "Choose a valid adjustment reason and direction, product, non-zero change, and note of at most 500 characters.",
    });
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const product = await Product.findOne({
        _id: productId,
        active: true,
      }).session(session);

      if (!product) {
        throw Object.assign(new Error("Product not found"), {
          status: 404,
        });
      }

      if (product.stockQty !== expectedQuantity) {
        throw Object.assign(
          new Error("Stock changed since you loaded inventory. Review the updated quantity and retry."),
          { status: 409 }
        );
      }

      const before = product.stockQty;
      const after = before + change;

      if (!Number.isSafeInteger(after) || after < 0) {
        throw Object.assign(
          new Error("Stock cannot become negative"),
          { status: 400 }
        );
      }

      product.stockQty = after;
      await product.save({ session });

      const [log] = await InventoryLog.create(
        [{
          productId: product._id,
          change,
          quantityBefore: before,
          quantityAfter: after,
          reason,
          note,
          performedBy: req.user.email,
        }],
        { session }
      );

      result = {
        productId: product._id,
        stockBefore: before,
        stockAfter: after,
        logId: log._id,
      };

      if (product.quickBooksItemListId) {
        await SyncJob.create(
          [{
            internalJobId: randomUUID(),
            operationType: "adjustInventory",
            entityType: "inventoryAdjustment",
            entityId: product._id,
            direction: "posToQuickBooks",
            payloadReference: `inventory-adjustment:${log._id}`,
            requestHash: createHash("sha256").update(`inventory-adjustment:${log._id}`).digest("hex"),
            idempotencyKey: `inventory-adjustment:${log._id}`,
            status: "pending",
          }],
          { session }
        );
      }
    });

    const adjustedProduct = await Product.findById(productId)
      .select("quickBooksItemListId")
      .lean();
    const settings = await QuickBooksSyncSettings.findById("default").lean();
    if (settings?.inventoryAdjustmentAccountListId && adjustedProduct?.quickBooksItemListId) {
      try {
        const accountingResult = await adjustQuickBooksInventory({
          accountListId: settings.inventoryAdjustmentAccountListId,
          itemListId: adjustedProduct.quickBooksItemListId,
          quantityDifference: change,
          refNumber: String(result.logId).slice(-11),
          memo: `POS inventory adjustment ${reason}${note ? `: ${note}` : ""}`,
        });
        await SyncJob.findOneAndUpdate(
          { idempotencyKey: `inventory-adjustment:${result.logId}` },
          {
            $set: {
              status: "synced",
              quickBooksTxnId: accountingResult.txnId,
              processedAt: new Date(),
              lastErrorCode: null,
              lastError: null,
            },
          }
        );
        result.quickBooksTxnId = accountingResult.txnId;
      } catch (error) {
        await SyncJob.findOneAndUpdate(
          { idempotencyKey: `inventory-adjustment:${result.logId}` },
          {
            $set: {
              status: error instanceof QuickBooksBridgeError && error.code === "BRIDGE_TIMEOUT"
                ? "outcome_unknown"
                : "retryable_failed",
              lastErrorCode: error?.code || "QUICKBOOKS_INVENTORY_SYNC_FAILED",
              lastError: error?.message ? String(error.message).slice(0, 1000) : "QuickBooks inventory synchronization failed.",
            },
          }
        );
      }
    }

    res.json({ success: true, data: result });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  } finally {
    await session.endSession();
  }
});

export default router;
