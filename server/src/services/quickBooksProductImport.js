import mongoose from "mongoose";
import InventoryLog from "../models/InventoryLog.js";
import Product from "../models/Product.js";

const supportedItemTypes = new Set(["inventory", "inventory_assembly"]);

export function prepareQuickBooksProduct(entry) {
  const type = typeof entry?.type === "string" ? entry.type.trim() : "";
  if (!supportedItemTypes.has(type)) {
    return { product: null, reason: "unsupportedItemType" };
  }

  const listId = typeof entry.listId === "string" ? entry.listId.trim() : "";
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  if (!listId || listId.length > 100 || !name) {
    return { product: null, reason: "missingIdentity" };
  }

  const quantity = entry.quantityOnHand;
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    return { product: null, reason: "unsupportedQuantity" };
  }

  const price = entry.salesPrice;
  if (
    !Number.isFinite(price) ||
    price < 0 ||
    price > 1_000_000_000 ||
    Math.abs(price * 100 - Math.round(price * 100)) > 1e-7
  ) {
    return { product: null, reason: "unsupportedSalesPrice" };
  }

  return {
    product: {
      sku: `QB-${listId}`,
      name,
      unit: "unit",
      taxRate: null,
      itemType: "other",
      category: "QuickBooks",
      origin: "QuickBooks",
      sellingPrice: price,
      stockQty: quantity,
      quickBooksItemListId: listId,
    },
    reason: null,
  };
}

export async function importQuickBooksProducts({ items, performedBy }) {
  const prepared = items.map(prepareQuickBooksProduct);
  const skipped = {};
  const importable = [];

  for (const result of prepared) {
    if (result.product) {
      importable.push(result.product);
    } else {
      skipped[result.reason] = (skipped[result.reason] || 0) + 1;
    }
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      let imported = 0;
      let alreadyImported = 0;
      const seenListIds = new Set();
      const listIds = importable.map(product => product.quickBooksItemListId);
      const existingProducts = await Product.find({
        quickBooksItemListId: { $in: listIds },
      })
        .select("quickBooksItemListId")
        .session(session)
        .lean();
      for (const product of existingProducts) {
        seenListIds.add(product.quickBooksItemListId);
      }

      for (const productData of importable) {
        if (seenListIds.has(productData.quickBooksItemListId)) {
          alreadyImported++;
          continue;
        }

        const [product] = await Product.create([productData], { session });
        if (product.stockQty > 0) {
          await InventoryLog.create(
            [{
              productId: product._id,
              change: product.stockQty,
              quantityBefore: 0,
              quantityAfter: product.stockQty,
              reason: "opening_stock",
              note: "Opening stock imported from QuickBooks Desktop.",
              performedBy,
            }],
            { session }
          );
        }
        seenListIds.add(productData.quickBooksItemListId);
        imported++;
      }

      result = { imported, alreadyImported, skipped };
    });
  } finally {
    await session.endSession();
  }

  return result;
}
