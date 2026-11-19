import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();
mongoose.set("autoIndex", false);

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is missing from server/.env.");
}

const { default: SyncJob } = await import("../models/SyncJob.js");
const { default: Product } = await import("../models/Product.js");
const { default: Customer } = await import("../models/Customer.js");
const createIndex = process.argv.includes("--create-index");

try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const checks = [
    { collection: SyncJob.collection, field: "idempotencyKey", label: "idempotency key" },
    { collection: Product.collection, field: "quickBooksItemListId", label: "product ListID" },
    { collection: Customer.collection, field: "quickBooksListId", label: "customer ListID" },
  ];
  let hasDuplicates = false;
  for (const check of checks) {
    const duplicateGroups = await check.collection.aggregate([
      { $match: { [check.field]: { $type: "string" } } },
      { $group: { _id: `$${check.field}`, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: "duplicateCount" },
    ]).toArray();
    const duplicateCount = duplicateGroups[0]?.duplicateCount || 0;
    if (duplicateCount > 0) {
      console.error(
        `Found ${duplicateCount} duplicate QuickBooks ${check.label}(s). No index was created; values were not printed.`
      );
      hasDuplicates = true;
    }
  }

  if (hasDuplicates) {
    process.exitCode = 1;
  } else if (createIndex) {
    await SyncJob.collection.createIndex(
      { idempotencyKey: 1 },
      {
        name: "quickbooks_idempotency_unique",
        unique: true,
        partialFilterExpression: { idempotencyKey: { $type: "string" } },
      }
    );
    await Product.collection.createIndex(
      { quickBooksItemListId: 1 },
      {
        name: "quickbooks_product_listid_unique",
        unique: true,
        partialFilterExpression: { quickBooksItemListId: { $type: "string" } },
      }
    );
    await Customer.collection.createIndex(
      { quickBooksListId: 1 },
      {
        name: "quickbooks_customer_listid_unique",
        unique: true,
        partialFilterExpression: { quickBooksListId: { $type: "string" } },
      }
    );
    console.log("QuickBooks idempotency and mapping indexes verified or created.");
  } else {
    console.log("No duplicate QuickBooks keys or mappings found. No indexes were created; pass --create-index to apply them.");
  }
} catch (error) {
  console.error(`QuickBooks index preparation failed (${error.name || "Error"}).`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
