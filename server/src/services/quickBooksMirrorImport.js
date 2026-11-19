import Customer from "../models/Customer.js";
import Product from "../models/Product.js";
import QuickBooksImportCheckpoint from "../models/QuickBooksImportCheckpoint.js";
import QuickBooksMirrorRecord from "../models/QuickBooksMirrorRecord.js";

function entityTypeForCatalog(key) {
  return {
    items: "item",
    customers: "customer",
    salesTaxCodes: "taxCode",
    salesTaxItems: "taxItem",
    paymentMethods: "paymentMethod",
    accounts: "account",
  }[key];
}

function mirrorFullName(entry) {
  return typeof entry.fullName === "string" && entry.fullName.trim()
    ? entry.fullName.trim()
    : (typeof entry.name === "string" ? entry.name.trim() : null);
}

export async function importQuickBooksCatalog({
  company,
  catalogs,
  operation = "initialCatalogImport",
}) {
  const checkpoint = await QuickBooksImportCheckpoint.findOneAndUpdate(
    { operation },
    {
      $set: {
        companyIdentityKey: company?.companyIdentityKey || null,
        status: "running",
        startedAt: new Date(),
        lastErrorCode: null,
        lastError: null,
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  const catalogKeys = [
    "items",
    "customers",
    "salesTaxCodes",
    "salesTaxItems",
    "paymentMethods",
    "accounts",
  ];
  const totals = Object.fromEntries(catalogKeys.map(key => [key, 0]));
  const skipped = {
    itemWithoutListId: 0,
    customerWithoutListId: 0,
    truncatedCatalog: 0,
  };
  const truncated = {};
  let failures = 0;

  try {
    for (const key of catalogKeys) {
      const entries = Array.isArray(catalogs[key]) ? catalogs[key] : [];
      const entityType = entityTypeForCatalog(key);
      const isTruncated = Boolean(catalogs.truncated?.[key]);
      truncated[key] = isTruncated;
      if (isTruncated) skipped.truncatedCatalog++;

      for (const entry of entries) {
        const listId = typeof entry.listId === "string" ? entry.listId.trim() : "";
        if (!listId) {
          if (key === "items") skipped.itemWithoutListId++;
          if (key === "customers") skipped.customerWithoutListId++;
          continue;
        }

        let entityId = null;
        if (key === "items") {
          const product = await Product.findOne({ quickBooksItemListId: listId })
            .select("_id")
            .lean();
          entityId = product?._id || null;
        } else if (key === "customers") {
          const customer = await Customer.findOne({ quickBooksListId: listId })
            .select("_id")
            .lean();
          entityId = customer?._id || null;
        }

        try {
          await QuickBooksMirrorRecord.findOneAndUpdate(
            { entityType, quickBooksListId: listId },
            {
              $set: {
                entityId,
                quickBooksFullName: mirrorFullName(entry),
                quickBooksEditSequence: null,
                sourceSystem: entityId ? "both" : "quickbooks",
                syncStatus: isTruncated ? "stale" : "synced",
                quickBooksSyncedAt: new Date(),
                quickBooksLastError: null,
              },
            },
            { upsert: true, runValidators: true, setDefaultsOnInsert: true }
          );
          totals[key]++;
        } catch {
          failures++;
        }
      }
    }

    const status = failures > 0 ? "failed" : "completed";
    const now = new Date();
    await QuickBooksImportCheckpoint.findByIdAndUpdate(checkpoint._id, {
      $set: {
        status,
        totals,
        skipped,
        truncated,
        completedAt: status === "completed" ? now : null,
        lastSuccessfulAt: status === "completed" ? now : checkpoint.lastSuccessfulAt,
        lastErrorCode: failures > 0 ? "MIRROR_RECORD_WRITE_FAILED" : null,
        lastError: failures > 0
          ? `${failures} mirror record write(s) failed; counts are not a success guarantee.`
          : null,
      },
    });

    return {
      status,
      companyIdentityKey: company?.companyIdentityKey || null,
      totals,
      skipped,
      truncated,
      failures,
    };
  } catch (error) {
    await QuickBooksImportCheckpoint.findByIdAndUpdate(checkpoint._id, {
      $set: {
        status: "failed",
        totals,
        skipped,
        truncated,
        lastErrorCode: error?.code ? String(error.code).slice(0, 100) : "MIRROR_IMPORT_FAILED",
        lastError: error?.message ? String(error.message).slice(0, 1000) : "Mirror import failed.",
      },
    });
    throw error;
  }
}
