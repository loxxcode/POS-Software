
import { Router } from "express";
import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import Product from "../models/Product.js";
import Sale from "../models/Sale.js";
import QuickBooksSyncSettings from "../models/QuickBooksSyncSettings.js";
import requireRole from "../middleware/requireRole.js";
import SyncJob from "../models/SyncJob.js";
import {
  getQuickBooksBridgeCapabilities,
  getQuickBooksBridgeHealth,
  getQuickBooksCompany,
  getQuickBooksPreferences,
  getQuickBooksCatalogs,
  QuickBooksBridgeError,
  updateQuickBooksCustomer,
  updateQuickBooksItem,
} from "../services/quickBooksBridge.js";
import { buildQuickBooksAutoMatchPlan } from "../services/quickBooksAutoMatch.js";
import { importQuickBooksCatalog } from "../services/quickBooksMirrorImport.js";
import { importQuickBooksProducts } from "../services/quickBooksProductImport.js";
import { syncSaleToQuickBooks } from "../services/quickBooksSaleSync.js";
import QuickBooksImportCheckpoint from "../models/QuickBooksImportCheckpoint.js";
import {
  reconcileSyncJob,
} from "../services/quickBooksSyncWorker.js";

const router = Router();
const paymentMethods = ["cash", "card", "mobile_money", "other"];

function requireQuickBooksSalesRole(request, response, next) {
  if (!["administration", "accountant"].includes(request.user?.role)) {
    return response.status(403).json({
      success: false,
      message: "Only administration or accounting staff can post sales to QuickBooks.",
    });
  }
  return next();
}

function bridgeRoute(operation) {
  return async (_request, response, next) => {
    try {
      const data = await operation();
      return response.json({ success: true, data });
    } catch (error) {
      if (error instanceof QuickBooksBridgeError) {
        return response.status(error.statusCode).json({
          success: false,
          code: error.code,
          message: error.message,
        });
      }
      return next(error);
    }
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidListId(value, nullable = false) {
  if (nullable && value === null) return true;
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 100 &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function pagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return null;
  }
  return { page, limit };
}

async function getOrCreateQuickBooksSettings() {
  return QuickBooksSyncSettings.findOneAndUpdate(
    { _id: "default" },
    { $setOnInsert: {} },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
}

async function loadQuickBooksAutoMatchPlan() {
  const catalogs = await getQuickBooksCatalogs();
  const [products, customers] = await Promise.all([
    Product.find()
      .select("_id active sku name sellingPrice quickBooksItemListId")
      .lean(),
    Customer.find()
      .select("_id name email phone address quickBooksListId")
      .lean(),
  ]);
  return {
    products,
    customers,
    plan: buildQuickBooksAutoMatchPlan({ products, customers, catalogs }),
  };
}

function publicMatch(match) {
  return {
    kind: match.kind,
    posId: match.posId,
    posName: match.posName,
    ...(match.kind === "product" ? { posSku: match.posSku, posPrice: match.posPrice } : {}),
    quickBooksListId: match.quickBooksListId,
    quickBooksName: match.quickBooksName,
    matchBy: match.matchBy,
    alreadyLinked: match.alreadyLinked,
  };
}

function matchesSnapshot(record, match) {
  if (!record) return false;
  const currentListId = match.kind === "product"
    ? record.quickBooksItemListId || null
    : record.quickBooksListId || null;
  if (
    record.name !== match.posName ||
    currentListId !== match.previousListId
  ) return false;
  return match.kind === "product"
    ? record.sku === match.posSku && record.sellingPrice === match.posPrice
    : (record.email || "") === match.posEmail &&
      (record.phone || "") === match.posPhone &&
      (record.address || "") === match.posAddress;
}

function matchFieldLimits(match) {
  if (match.kind === "product") {
    return match.posName.length <= 31 &&
      Number.isFinite(match.posPrice) &&
      match.posPrice >= 0 &&
      match.posPrice <= 1000000000
      ? null
      : "POS product name or price exceeds QuickBooks supported limits.";
  }
  return match.posName.length <= 41 &&
    match.posEmail.length <= 254 &&
    match.posPhone.length <= 30 &&
    match.posAddress.length <= 205
    ? null
    : "POS customer fields exceed QuickBooks supported limits.";
}

router.get("/quickbooks/health", requireRole("administration"), bridgeRoute(getQuickBooksBridgeHealth));
router.get("/quickbooks/capabilities", requireRole("administration"), bridgeRoute(getQuickBooksBridgeCapabilities));
router.get("/quickbooks/company", requireRole("administration"), async (_request, response, next) => {
  try {
    const company = await getQuickBooksCompany();
    const settings = await getOrCreateQuickBooksSettings();
    const mismatches = [];

    if (settings.expectedCompanyName &&
      company.companyName !== settings.expectedCompanyName) {
      mismatches.push("companyName");
    }
    if (settings.expectedLegalCompanyName &&
      company.legalCompanyName !== settings.expectedLegalCompanyName) {
      mismatches.push("legalCompanyName");
    }
    if (settings.expectedCompanyCountry &&
      company.country !== settings.expectedCompanyCountry) {
      mismatches.push("country");
    }
    if (settings.expectedCompanyIdentityKey &&
      company.companyIdentityKey !== settings.expectedCompanyIdentityKey) {
      mismatches.push("companyIdentityKey");
    }

    if (mismatches.length > 0) {
      return response.status(409).json({
        success: false,
        code: "QUICKBOOKS_COMPANY_MISMATCH",
        message: "The open QuickBooks company does not match the configured POS company.",
        mismatches,
      });
    }

    return response.json({
      success: true,
      data: {
        ...company,
        companyVerified: Boolean(
          settings.expectedCompanyIdentityKey ||
          settings.expectedCompanyName ||
          settings.expectedLegalCompanyName ||
          settings.expectedCompanyCountry
        ),
      },
    });
  } catch (error) {
    if (error instanceof QuickBooksBridgeError) {
      return response.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    return next(error);
  }
});
router.get("/quickbooks/preferences", requireRole("administration"), bridgeRoute(getQuickBooksPreferences));
router.get("/quickbooks/catalogs", requireRole("administration"), bridgeRoute(getQuickBooksCatalogs));

router.post("/quickbooks/sales/:id/post", requireQuickBooksSalesRole, async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(400).json({ success: false, message: "Invalid sale ID." });
  }
  try {
    const result = await syncSaleToQuickBooks(request.params.id);
    return response.json({
      success: true,
      message: result.duplicate
        ? "The matching QuickBooks transaction is already saved."
        : "Sale saved to QuickBooks.",
      data: result,
    });
  } catch (error) {
    if (error.statusCode || error instanceof QuickBooksBridgeError) {
      const currentSale = await Sale.findById(request.params.id).lean();
      return response.status(error.statusCode || 502).json({
        success: false,
        code: error.code || "QUICKBOOKS_SALE_SYNC_FAILED",
        message: error.message || "Unable to save the sale to QuickBooks.",
        data: { sale: currentSale },
      });
    }
    return next(error);
  }
});

router.post("/quickbooks/products/import", requireRole("administration"), async (request, response, next) => {
  try {
    const [company, catalogs, settings] = await Promise.all([
      getQuickBooksCompany(),
      getQuickBooksCatalogs(),
      getOrCreateQuickBooksSettings(),
    ]);

    if (!settings.expectedCompanyIdentityKey) {
      return response.status(409).json({
        success: false,
        code: "QUICKBOOKS_COMPANY_NOT_VERIFIED",
        message: "Verify and save the expected QuickBooks company identity before importing products.",
      });
    }

    const mismatches = [];
    if (company.companyIdentityKey !== settings.expectedCompanyIdentityKey) mismatches.push("companyIdentityKey");
    if (settings.expectedCompanyName && company.companyName !== settings.expectedCompanyName) mismatches.push("companyName");
    if (settings.expectedLegalCompanyName && company.legalCompanyName !== settings.expectedLegalCompanyName) mismatches.push("legalCompanyName");
    if (settings.expectedCompanyCountry && company.country !== settings.expectedCompanyCountry) mismatches.push("country");
    if (mismatches.length) {
      return response.status(409).json({
        success: false,
        code: "QUICKBOOKS_COMPANY_MISMATCH",
        message: "The open QuickBooks company does not match the configured POS company.",
        mismatches,
      });
    }

    if (catalogs.truncated?.items) {
      return response.status(409).json({
        success: false,
        code: "QUICKBOOKS_ITEM_CATALOG_TRUNCATED",
        message: "The QuickBooks item catalog is truncated. No products were imported.",
      });
    }
    if (!Array.isArray(catalogs.items)) {
      return response.status(502).json({
        success: false,
        code: "QUICKBOOKS_ITEM_CATALOG_INVALID",
        message: "QuickBooks returned an invalid item catalog.",
      });
    }

    const result = await importQuickBooksProducts({
      items: catalogs.items,
      performedBy: request.user.email,
    });
    return response.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof QuickBooksBridgeError) {
      return response.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    if (error.code === 11000) {
      return response.status(409).json({
        success: false,
        code: "QUICKBOOKS_PRODUCT_IMPORT_CONFLICT",
        message: "A generated QuickBooks SKU or item mapping is already in use. No products were imported; resolve the conflict and retry.",
      });
    }
    return next(error);
  }
});

router.post("/quickbooks/mirror/import", requireRole("administration"), async (_request, response, next) => {
  try {
    const [company, catalogs, settings] = await Promise.all([
      getQuickBooksCompany(),
      getQuickBooksCatalogs(),
      getOrCreateQuickBooksSettings(),
    ]);
    const mismatches = [];
    if (settings.expectedCompanyName && company.companyName !== settings.expectedCompanyName) mismatches.push("companyName");
    if (settings.expectedLegalCompanyName && company.legalCompanyName !== settings.expectedLegalCompanyName) mismatches.push("legalCompanyName");
    if (settings.expectedCompanyCountry && company.country !== settings.expectedCompanyCountry) mismatches.push("country");
    if (settings.expectedCompanyIdentityKey && company.companyIdentityKey !== settings.expectedCompanyIdentityKey) mismatches.push("companyIdentityKey");
    if (mismatches.length) {
      return response.status(409).json({
        success: false,
        code: "QUICKBOOKS_COMPANY_MISMATCH",
        message: "The open QuickBooks company does not match the configured POS company.",
        mismatches,
      });
    }

    const truncatedKeys = Object.entries(catalogs.truncated || {})
      .filter(([, truncated]) => truncated)
      .map(([key]) => key);
    if (truncatedKeys.length) {
      await QuickBooksImportCheckpoint.findOneAndUpdate(
        { operation: "initialCatalogImport" },
        {
          $set: {
            companyIdentityKey: company.companyIdentityKey,
            status: "failed",
            truncated: Object.fromEntries(
              ["items", "customers", "salesTaxCodes", "salesTaxItems", "paymentMethods", "accounts"]
                .map(key => [key, Boolean(catalogs.truncated?.[key])])
            ),
            lastErrorCode: "CATALOG_TRUNCATED",
            lastError: "The QuickBooks catalog is truncated; no partial initial mirror was accepted.",
          },
        },
        { upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      return response.status(409).json({
        success: false,
        code: "CATALOG_TRUNCATED",
        message: "The QuickBooks catalog is truncated. Retry after QuickBooks and the bridge can return the complete supported catalog.",
        truncatedKeys,
      });
    }

    const result = await importQuickBooksCatalog({
      company,
      catalogs,
      operation: "initialCatalogImport",
    });
    return response.status(result.status === "completed" ? 200 : 502).json({
      success: result.status === "completed",
      data: result,
    });
  } catch (error) {
    if (error instanceof QuickBooksBridgeError) {
      return response.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    return next(error);
  }
});

router.get("/quickbooks/mirror/import-status", requireRole("administration"), async (_request, response, next) => {
  try {
    const data = await QuickBooksImportCheckpoint.findOne({ operation: "initialCatalogImport" }).lean();
    return response.json({ success: true, data: data || null });
  } catch (error) {
    return next(error);
  }
});

router.post("/quickbooks/mappings/auto-match/preview", requireRole("administration"), async (_request, response, next) => {
  try {
    const { plan } = await loadQuickBooksAutoMatchPlan();
    return response.json({
      success: true,
      data: {
        token: plan.token,
        products: plan.products,
        customers: plan.customers,
        truncated: plan.truncated,
        matches: plan.matches.map(publicMatch),
      },
    });
  } catch (error) {
    if (error instanceof QuickBooksBridgeError) {
      return response.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    return next(error);
  }
});

router.post("/quickbooks/mappings/auto-match/apply", requireRole("administration"), async (request, response, next) => {
  const { token } = request.body || {};
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    return response.status(400).json({ success: false, message: "Create a fresh exact-match preview before applying changes." });
  }

  try {
    const { plan } = await loadQuickBooksAutoMatchPlan();
    if (token !== plan.token) {
      return response.status(409).json({
        success: false,
        code: "MATCH_PREVIEW_STALE",
        message: "POS or QuickBooks data changed after the preview. Create a new preview before applying changes.",
      });
    }

    const failures = [];
    let syncedProducts = 0;
    let syncedCustomers = 0;
    for (const match of plan.matches) {
      const fieldLimitError = matchFieldLimits(match);
      if (fieldLimitError) {
        failures.push({ kind: match.kind, posName: match.posName, message: fieldLimitError });
        continue;
      }

      try {
        if (match.kind === "product") {
          const current = await Product.findOne({ _id: match.posId, active: true })
            .select("_id active sku name sellingPrice quickBooksItemListId")
            .lean();
          if (!matchesSnapshot(current, match)) {
            failures.push({ kind: match.kind, posName: match.posName, message: "POS product changed after the preview; it was not synchronized." });
            continue;
          }
          if (!match.alreadyLinked) {
            const linked = await Product.updateOne(
              { _id: match.posId, active: true, quickBooksItemListId: match.previousListId },
              { $set: { quickBooksItemListId: match.quickBooksListId } }
            );
            if (linked.modifiedCount !== 1) {
              failures.push({ kind: match.kind, posName: match.posName, message: "POS product mapping changed before it could be linked." });
              continue;
            }
          }
          await updateQuickBooksItem(match.quickBooksListId, {
            name: match.posName,
            salesPrice: match.posPrice,
          });
          syncedProducts++;
        } else {
          const current = await Customer.findById(match.posId)
            .select("_id name email phone address quickBooksListId")
            .lean();
          if (!matchesSnapshot(current, match)) {
            failures.push({ kind: match.kind, posName: match.posName, message: "POS customer changed after the preview; it was not synchronized." });
            continue;
          }
          if (!match.alreadyLinked) {
            const linked = await Customer.updateOne(
              { _id: match.posId, quickBooksListId: match.previousListId },
              { $set: { quickBooksListId: match.quickBooksListId } }
            );
            if (linked.modifiedCount !== 1) {
              failures.push({ kind: match.kind, posName: match.posName, message: "POS customer mapping changed before it could be linked." });
              continue;
            }
          }
          await updateQuickBooksCustomer(match.quickBooksListId, {
            name: match.posName,
            email: match.posEmail,
            phone: match.posPhone,
            address: match.posAddress,
          });
          syncedCustomers++;
        }
      } catch (error) {
        if (error instanceof QuickBooksBridgeError) {
          failures.push({
            kind: match.kind,
            posName: match.posName,
            message: error.message,
            mappingSaved: !match.alreadyLinked,
          });
          continue;
        }
        if (error.code === 11000) {
          failures.push({ kind: match.kind, posName: match.posName, message: "This QuickBooks record is already linked to another POS record." });
          continue;
        }
        throw error;
      }
    }

    return response.json({
      success: true,
      data: {
        syncedProducts,
        syncedCustomers,
        failed: failures.length,
        failures,
      },
    });
  } catch (error) {
    if (error instanceof QuickBooksBridgeError) {
      return response.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    return next(error);
  }
});

router.get("/quickbooks/mappings/products", requireRole("administration"), async (request, response, next) => {
  const pageOptions = pagination(request.query);
  if (!pageOptions) {
    return response.status(400).json({ success: false, message: "Page must be positive and limit must be from 1 through 100." });
  }
  const search = typeof request.query.search === "string" ? request.query.search.trim().slice(0, 100) : "";
  const filter = { active: true };
  if (search) {
    const expression = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: expression }, { sku: expression }, { quickBooksItemListId: expression }];
  }
  try {
    const [count, data] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .select("sku name quickBooksItemListId")
        .sort({ name: 1, _id: 1 })
        .skip((pageOptions.page - 1) * pageOptions.limit)
        .limit(pageOptions.limit)
        .lean(),
    ]);
    return response.json({
      success: true,
      data: { count, page: pageOptions.page, limit: pageOptions.limit, data },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/quickbooks/mappings/customers", requireRole("administration"), async (request, response, next) => {
  const pageOptions = pagination(request.query);
  if (!pageOptions) {
    return response.status(400).json({ success: false, message: "Page must be positive and limit must be from 1 through 100." });
  }
  const search = typeof request.query.search === "string" ? request.query.search.trim().slice(0, 100) : "";
  const filter = {};
  if (search) {
    const expression = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: expression }, { quickBooksListId: expression }];
  }
  try {
    const [count, data] = await Promise.all([
      Customer.countDocuments(filter),
      Customer.find(filter)
        .select("name quickBooksListId")
        .sort({ name: 1, _id: 1 })
        .skip((pageOptions.page - 1) * pageOptions.limit)
        .limit(pageOptions.limit)
        .lean(),
    ]);
    return response.json({
      success: true,
      data: { count, page: pageOptions.page, limit: pageOptions.limit, data },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/quickbooks/mappings/products/:id", requireRole("administration"), async (request, response, next) => {
  const { listId } = request.body || {};
  if (!mongoose.isValidObjectId(request.params.id) || !isValidListId(listId, true)) {
    return response.status(400).json({ success: false, message: "Enter a valid product ID and QuickBooks ListID, or null to clear the mapping." });
  }

  const normalizedListId = typeof listId === "string" ? listId.trim() : null;
  try {
    const product = await Product.findById(request.params.id).select("_id sku name active quickBooksItemListId");
    if (!product || !product.active) {
      return response.status(404).json({ success: false, message: "Active product not found." });
    }
    if (normalizedListId) {
      const duplicate = await Product.exists({
        _id: { $ne: product._id },
        quickBooksItemListId: normalizedListId,
      });
      if (duplicate) {
        return response.status(409).json({ success: false, message: "That QuickBooks item is already mapped to another POS product." });
      }
    }
    product.quickBooksItemListId = normalizedListId;
    await product.save();
    return response.json({
      success: true,
      data: { _id: product._id, sku: product.sku, name: product.name, quickBooksItemListId: product.quickBooksItemListId },
    });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({ success: false, message: "That QuickBooks item is already mapped to another POS product." });
    }
    return next(error);
  }
});

router.patch("/quickbooks/mappings/customers/:id", requireRole("administration"), async (request, response, next) => {
  const { listId } = request.body || {};
  if (!mongoose.isValidObjectId(request.params.id) || !isValidListId(listId, true)) {
    return response.status(400).json({ success: false, message: "Enter a valid customer ID and QuickBooks ListID, or null to clear the mapping." });
  }

  const normalizedListId = typeof listId === "string" ? listId.trim() : null;
  try {
    const customer = await Customer.findById(request.params.id);
    if (!customer) {
      return response.status(404).json({ success: false, message: "Customer not found." });
    }
    if (normalizedListId) {
      const duplicate = await Customer.exists({
        _id: { $ne: customer._id },
        quickBooksListId: normalizedListId,
      });
      if (duplicate) {
        return response.status(409).json({ success: false, message: "That QuickBooks customer is already mapped to another POS customer." });
      }
    }
    customer.quickBooksListId = normalizedListId;
    await customer.save();
    return response.json({
      success: true,
      data: { _id: customer._id, name: customer.name, quickBooksListId: customer.quickBooksListId },
    });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({ success: false, message: "That QuickBooks customer is already mapped to another POS customer." });
    }
    return next(error);
  }
});

router.get("/quickbooks/mappings/config", requireRole("administration"), async (_request, response, next) => {
  try {
    const data = await getOrCreateQuickBooksSettings();
    return response.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

router.patch("/quickbooks/mappings/config", requireRole("administration"), async (request, response, next) => {
  const {
    accountsReceivableAccountListId,
    inventoryAdjustmentAccountListId,
    defaultCustomerListId,
    taxRateMappings,
    paymentMethodMappings,
    expectedCompanyName,
    expectedLegalCompanyName,
    expectedCompanyCountry,
    expectedCompanyIdentityKey,
  } = request.body || {};
  if (
    !isValidListId(accountsReceivableAccountListId, true) ||
    !isValidListId(inventoryAdjustmentAccountListId, true) ||
    (typeof defaultCustomerListId !== "undefined" &&
      !isValidListId(defaultCustomerListId, true)) ||
    !Array.isArray(taxRateMappings) ||
    taxRateMappings.length > 100 ||
    !Array.isArray(paymentMethodMappings) ||
    paymentMethodMappings.length > paymentMethods.length ||
    (typeof expectedCompanyName !== "undefined" && typeof expectedCompanyName !== "string") ||
    (typeof expectedLegalCompanyName !== "undefined" && typeof expectedLegalCompanyName !== "string") ||
    (typeof expectedCompanyCountry !== "undefined" &&
      (typeof expectedCompanyCountry !== "string" ||
        (expectedCompanyCountry.trim() !== "" && !/^[A-Za-z]{2}$/.test(expectedCompanyCountry.trim())))) ||
    (typeof expectedCompanyIdentityKey !== "undefined" &&
      (typeof expectedCompanyIdentityKey !== "string" ||
        (expectedCompanyIdentityKey.trim() !== "" &&
          !/^[a-fA-F0-9]{64}$/.test(expectedCompanyIdentityKey.trim()))))
  ) {
    return response.status(400).json({ success: false, message: "Enter valid receivables, tax-rate, and payment-method mappings." });
  }

  const normalizedTaxMappings = [];
  const mappedRates = new Set();
  for (const mapping of taxRateMappings) {
    if (
      !mapping ||
      !Number.isFinite(mapping.posTaxRate) ||
      mapping.posTaxRate < 0 ||
      mapping.posTaxRate > 100 ||
      Math.abs(mapping.posTaxRate * 100 - Math.round(mapping.posTaxRate * 100)) > 1e-8 ||
      !isValidListId(mapping.quickBooksSalesTaxCodeListId) ||
      !isValidListId(mapping.quickBooksSalesTaxItemListId, true)
    ) {
      return response.status(400).json({ success: false, message: "Each tax mapping needs a valid POS rate, QuickBooks tax code, and optional sales-tax item." });
    }
    const rateKey = Math.round(mapping.posTaxRate * 100);
    if (mappedRates.has(rateKey)) {
      return response.status(400).json({ success: false, message: "Each POS tax rate can be mapped only once." });
    }
    mappedRates.add(rateKey);
    normalizedTaxMappings.push({
      posTaxRate: mapping.posTaxRate,
      quickBooksSalesTaxCodeListId: mapping.quickBooksSalesTaxCodeListId.trim(),
      quickBooksSalesTaxItemListId: mapping.quickBooksSalesTaxItemListId
        ? mapping.quickBooksSalesTaxItemListId.trim()
        : null,
    });
  }

  const normalizedPaymentMappings = [];
  const mappedMethods = new Set();
  for (const mapping of paymentMethodMappings) {
    if (
      !mapping ||
      !paymentMethods.includes(mapping.posPaymentMethod) ||
      !isValidListId(mapping.quickBooksPaymentMethodListId) ||
      !isValidListId(mapping.quickBooksDepositAccountListId)
    ) {
      return response.status(400).json({ success: false, message: "Each payment mapping needs a valid POS method, QuickBooks payment method, and deposit account." });
    }
    if (mappedMethods.has(mapping.posPaymentMethod)) {
      return response.status(400).json({ success: false, message: "Each POS payment method can be mapped only once." });
    }
    mappedMethods.add(mapping.posPaymentMethod);
    normalizedPaymentMappings.push({
      posPaymentMethod: mapping.posPaymentMethod,
      quickBooksPaymentMethodListId: mapping.quickBooksPaymentMethodListId.trim(),
      quickBooksDepositAccountListId: mapping.quickBooksDepositAccountListId.trim(),
    });
  }

  try {
    const data = await QuickBooksSyncSettings.findOneAndUpdate(
      { _id: "default" },
      {
        $set: {
          accountsReceivableAccountListId: accountsReceivableAccountListId
            ? accountsReceivableAccountListId.trim()
            : null,
          inventoryAdjustmentAccountListId: inventoryAdjustmentAccountListId
            ? inventoryAdjustmentAccountListId.trim()
            : null,
          ...(typeof defaultCustomerListId === "undefined"
            ? {}
            : {
                defaultCustomerListId: defaultCustomerListId
                  ? defaultCustomerListId.trim()
                  : null,
              }),
          taxRateMappings: normalizedTaxMappings,
          paymentMethodMappings: normalizedPaymentMappings,
          ...(typeof expectedCompanyName === "string"
            ? { expectedCompanyName: expectedCompanyName.trim().slice(0, 120) }
            : {}),
          ...(typeof expectedLegalCompanyName === "string"
            ? { expectedLegalCompanyName: expectedLegalCompanyName.trim().slice(0, 120) }
            : {}),
          ...(typeof expectedCompanyCountry === "string"
            ? { expectedCompanyCountry: expectedCompanyCountry.trim().toUpperCase().slice(0, 2) }
            : {}),
          ...(typeof expectedCompanyIdentityKey === "string"
            ? { expectedCompanyIdentityKey: expectedCompanyIdentityKey.trim() || null }
            : {}),
          updatedBy: request.user.email,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    return response.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

// GET /api/sync/jobs?status=pending
router.get("/jobs", async (req, res, next) => {
  try {
    const allowed = [
      "pending",
      "processing",
      "succeeded",
      "synced",
      "retryable_failed",
      "failed",
      "permanent_failed",
      "outcome_unknown",
      "requires_review",
      "needs_review",
    ];
    const filter = {};

    if (req.query.status) {
      if (!allowed.includes(req.query.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid sync status",
        });
      }
      filter.status = req.query.status;
    }

    const data = await SyncJob.find(filter)
      .select("-qbxmlRequest -qbxmlResponse")
      .populate("saleId", "receiptNumber total currency createdAt")
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/sync/jobs/:id
router.get("/jobs/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sync job ID",
      });
    }

    const data = await SyncJob.findById(req.params.id)
      .select("-qbxmlRequest -qbxmlResponse")
      .populate("saleId", "receiptNumber total currency")
      .lean();

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Sync job not found",
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post("/jobs/:id/reconcile", requireRole("administration"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid sync job ID." });
    }
    const {
      quickBooksTxnId,
      quickBooksTxnType,
      note = "",
    } = req.body || {};
    if (
      quickBooksTxnId !== null &&
      (typeof quickBooksTxnId !== "string" || quickBooksTxnId.trim().length > 100)
    ) {
      return res.status(400).json({ success: false, message: "quickBooksTxnId must be null or a valid string." });
    }
    if (
      quickBooksTxnType !== null &&
      typeof quickBooksTxnType !== "string"
    ) {
      return res.status(400).json({ success: false, message: "quickBooksTxnType must be null or a valid transaction type." });
    }
    if (typeof note !== "string" || note.length > 1000) {
      return res.status(400).json({ success: false, message: "Note must be at most 1000 characters." });
    }

    const data = await reconcileSyncJob(req.params.id, {
      saleQuickBooksTxnId: typeof quickBooksTxnId === "string" ? quickBooksTxnId.trim() || null : null,
      saleQuickBooksTxnType: typeof quickBooksTxnType === "string" ? quickBooksTxnType.trim() || null : null,
      note,
    });
    if (!data) {
      return res.status(404).json({ success: false, message: "Sync job not found." });
    }
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

export default router;
