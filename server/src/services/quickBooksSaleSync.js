import { createHash, randomUUID } from "node:crypto";
import Customer from "../models/Customer.js";
import Product from "../models/Product.js";
import QuickBooksSyncSettings from "../models/QuickBooksSyncSettings.js";
import Sale from "../models/Sale.js";
import SyncJob from "../models/SyncJob.js";
import {
  createQuickBooksSalesTransaction,
  getQuickBooksCompany,
  getQuickBooksPreferences,
  QuickBooksBridgeError,
} from "./quickBooksBridge.js";

const unknownOutcomeCodes = new Set([
  "BRIDGE_TIMEOUT",
  "BRIDGE_RESPONSE_INCOMPLETE",
  "BRIDGE_INVALID_RESPONSE",
  "QUICKBOOKS_COM_ERROR",
]);
const retryableCodes = new Set(["BRIDGE_UNAVAILABLE"]);

function syncError(code, message, statusCode = 409) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function getReferenceNumber(sale) {
  const requestId = sale.quickBooksRequestId || String(sale._id);
  const digest = createHash("sha256").update(requestId).digest("hex").slice(0, 16);
  const referenceValue = BigInt(`0x${digest}`) % (36n ** 11n);
  return referenceValue.toString(36).padStart(11, "0").toUpperCase();
}

function taxMappingFor(settings, taxRate) {
  const rateKey = Math.round(Number(taxRate) * 100);
  return (settings.taxRateMappings || []).find(mapping => Math.round(mapping.posTaxRate * 100) === rateKey);
}

export function buildQuickBooksSalePayload({ sale, customer, products, settings }) {
  const isInvoice = sale.paymentStatus !== "paid";
  const transactionType = isInvoice ? "Invoice" : "SalesReceipt";
  if (isInvoice && !sale.customerId) {
    throw syncError("QUICKBOOKS_CUSTOMER_MAPPING_REQUIRED", "Credit-sale invoices require a saved POS customer mapped to QuickBooks.");
  }
  if (!customer?.quickBooksListId) {
    throw syncError("QUICKBOOKS_CUSTOMER_MAPPING_REQUIRED", sale.customerId
      ? "Map this sale's customer to a QuickBooks customer before posting."
      : "Choose a default QuickBooks customer for walk-in sales in the mapping settings.");
  }
  if (!["inclusive", "exclusive"].includes(sale.taxTreatment)) {
    throw syncError("QUICKBOOKS_TAX_TREATMENT_REQUIRED", "Set and save the POS tax treatment before posting this sale.");
  }
  if (isInvoice && !settings.accountsReceivableAccountListId) {
    throw syncError("QUICKBOOKS_AR_ACCOUNT_REQUIRED", "Map a QuickBooks accounts receivable account before posting invoices.");
  }

  const paymentMapping = isInvoice
    ? null
    : (settings.paymentMethodMappings || []).find(mapping => mapping.posPaymentMethod === sale.paymentMethod);
  if (!isInvoice && !paymentMapping) {
    throw syncError("QUICKBOOKS_PAYMENT_MAPPING_REQUIRED", `Map the ${sale.paymentMethod} payment method to QuickBooks before posting this sales receipt.`);
  }

  const productsById = new Map(products.map(product => [String(product._id), product]));
  const taxItemListIds = new Set();
  const lines = sale.items.map(item => {
    const product = productsById.get(String(item.productId));
    if (!product?.quickBooksItemListId) {
      throw syncError("QUICKBOOKS_ITEM_MAPPING_REQUIRED", `Map POS product ${item.sku} to a QuickBooks item before posting this sale.`);
    }

    const taxRate = item.taxRate ?? 0;
    const taxMapping = taxMappingFor(settings, taxRate);
    if (!taxMapping) {
      throw syncError("QUICKBOOKS_TAX_MAPPING_REQUIRED", `Map the ${taxRate}% tax rate to QuickBooks before posting this sale.`);
    }
    if (Number(item.taxAmount || 0) > 0) {
      if (!taxMapping.quickBooksSalesTaxItemListId) {
        throw syncError("QUICKBOOKS_TAX_ITEM_REQUIRED", `Map a QuickBooks sales-tax item for the ${taxRate}% rate.`);
      }
      taxItemListIds.add(taxMapping.quickBooksSalesTaxItemListId);
    }

    const grossMinor = Math.round(Number(item.unitPrice) * Number(item.quantity) * 100);
    const discountMinor = Math.round(Number(item.discountAmount || 0) * 100);
    const amountMinor = grossMinor - discountMinor;
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
      throw syncError("QUICKBOOKS_SALE_AMOUNT_INVALID", `The sale amount for ${item.sku} is invalid.`);
    }

    return {
      itemListId: product.quickBooksItemListId,
      description: item.name,
      quantity: item.quantity,
      amount: amountMinor / 100,
      taxCodeListId: taxMapping.quickBooksSalesTaxCodeListId,
    };
  });

  if (taxItemListIds.size > 1) {
    throw syncError("QUICKBOOKS_MULTIPLE_TAX_ITEMS_UNSUPPORTED", "A QuickBooks transaction cannot apply multiple sales-tax items. Review the tax mappings for this sale.");
  }

  const transactionDate = new Date(sale.createdAt);
  if (Number.isNaN(transactionDate.getTime())) {
    throw syncError("QUICKBOOKS_SALE_DATE_INVALID", "The sale date is invalid and cannot be posted.");
  }

  return {
    transactionType,
    customerListId: customer.quickBooksListId,
    accountsReceivableAccountListId: settings.accountsReceivableAccountListId || "",
    paymentMethodListId: paymentMapping?.quickBooksPaymentMethodListId || "",
    depositAccountListId: paymentMapping?.quickBooksDepositAccountListId || "",
    itemSalesTaxListId: [...taxItemListIds][0] || "",
    taxTreatment: sale.taxTreatment,
    refNumber: getReferenceNumber(sale),
    memo: `POS sale ${sale._id}`,
    transactionDate: transactionDate.toISOString(),
    expectedTotal: Number(sale.total),
    lines,
  };
}

async function loadAndVerifyCompany(settings) {
  if (!settings.expectedCompanyIdentityKey) {
    throw syncError("QUICKBOOKS_COMPANY_NOT_VERIFIED", "Verify and save the expected QuickBooks company before posting sales.");
  }

  const [company, preferences] = await Promise.all([
    getQuickBooksCompany(),
    getQuickBooksPreferences(),
  ]);
  if (
    company.isSampleCompany ||
    company.companyIdentityKey !== settings.expectedCompanyIdentityKey ||
    (settings.expectedCompanyName && company.companyName !== settings.expectedCompanyName) ||
    (settings.expectedLegalCompanyName && company.legalCompanyName !== settings.expectedLegalCompanyName) ||
    (settings.expectedCompanyCountry && company.country !== settings.expectedCompanyCountry)
  ) {
    throw syncError("QUICKBOOKS_COMPANY_MISMATCH", "The open QuickBooks company does not match the verified POS company.");
  }
  if (preferences.multiCurrencyEnabled && preferences.homeCurrencyCode !== "RWF") {
    throw syncError("QUICKBOOKS_CURRENCY_MISMATCH", "The QuickBooks home currency must be RWF before posting POS sales.");
  }
}

function jobFailureState(error) {
  if (unknownOutcomeCodes.has(error?.code)) return "outcome_unknown";
  if (retryableCodes.has(error?.code)) return "retryable_failed";
  return "permanent_failed";
}

export async function syncSaleToQuickBooks(saleId) {
  const sale = await Sale.findById(saleId).lean();
  if (!sale) throw syncError("SALE_NOT_FOUND", "Sale not found.", 404);
  if (sale.quickBooksStatus === "synced" && sale.quickBooksTxnId) {
    return { sale, duplicate: true };
  }

  let job = await SyncJob.findOne({
    saleId: sale._id,
    operationType: { $in: ["createSalesReceipt", "createInvoice"] },
  }).sort({ createdAt: -1 });
  if (!job) throw syncError("SALE_SYNC_JOB_NOT_FOUND", "The sale has no QuickBooks sync job. Reconcile the sale before posting.");
  if (["requires_review", "needs_review"].includes(job.status)) {
    throw syncError("SALE_SYNC_REQUIRES_REVIEW", "This sale's QuickBooks result requires manual reconciliation before another post.");
  }

  const now = new Date();
  if (job.status === "processing" && job.claimedAt && now.getTime() - job.claimedAt.getTime() < 300000) {
    throw syncError("SALE_SYNC_IN_PROGRESS", "This sale is already being posted to QuickBooks.", 409);
  }

  const claimToken = randomUUID();
  const claimed = await SyncJob.findOneAndUpdate(
    { _id: job._id, status: job.status, claimToken: job.claimToken },
    {
      $set: {
        status: "processing",
        operationType: sale.paymentStatus === "paid" ? "createSalesReceipt" : "createInvoice",
        quickBooksTxnType: sale.paymentStatus === "paid" ? "SalesReceipt" : "Invoice",
        claimToken,
        claimedAt: now,
        lastAttemptAt: now,
        nextAttemptAt: null,
      },
      $inc: { attempts: 1 },
    },
    { new: true }
  );
  if (!claimed) throw syncError("SALE_SYNC_IN_PROGRESS", "This sale is already being posted to QuickBooks.", 409);

  await Sale.findByIdAndUpdate(sale._id, {
    $set: { quickBooksStatus: "processing", quickBooksLastError: null },
  });

  try {
    const settings = await QuickBooksSyncSettings.findById("default").lean();
    if (!settings) throw syncError("QUICKBOOKS_SETTINGS_NOT_FOUND", "Configure QuickBooks mappings before posting sales.");
    await loadAndVerifyCompany(settings);

    const [mappedCustomer, products] = await Promise.all([
      sale.customerId ? Customer.findById(sale.customerId).select("quickBooksListId").lean() : null,
      Product.find({ _id: { $in: sale.items.map(item => item.productId) } })
        .select("_id quickBooksItemListId")
        .lean(),
    ]);
    const customer = sale.customerId
      ? mappedCustomer
      : settings.defaultCustomerListId
        ? { quickBooksListId: settings.defaultCustomerListId }
        : null;
    const payload = buildQuickBooksSalePayload({ sale, customer, products, settings });
    const result = await createQuickBooksSalesTransaction(payload);

    if (
      result.refNumber !== payload.refNumber ||
      result.customerListId !== payload.customerListId ||
      result.memo !== payload.memo
    ) {
      const error = syncError("QUICKBOOKS_REFERENCE_CONFLICT", "The QuickBooks reference number is already used by a different transaction.");
      error.syncState = "requires_review";
      throw error;
    }
    if (
      !Number.isFinite(result.totalAmount) ||
      !Number.isFinite(payload.expectedTotal) ||
      Math.abs(result.totalAmount - payload.expectedTotal) > 0.01
    ) {
      const error = syncError("QUICKBOOKS_TOTAL_MISMATCH", "QuickBooks saved a transaction, but its total does not match the POS sale. Review it in QuickBooks before continuing.");
      error.syncState = "requires_review";
      error.txnId = result.txnId;
      throw error;
    }

    const syncedAt = new Date();
    const txnType = payload.transactionType;
    await Promise.all([
      SyncJob.findOneAndUpdate(
        { _id: claimed._id, claimToken },
        {
          $set: {
            status: "synced",
            quickBooksTxnId: result.txnId,
            quickBooksTxnType: txnType,
            claimToken: null,
            claimedAt: null,
            nextAttemptAt: null,
            lastErrorCode: null,
            lastError: null,
            processedAt: syncedAt,
          },
        }
      ),
      Sale.findByIdAndUpdate(sale._id, {
        $set: {
          quickBooksStatus: "synced",
          quickBooksTxnId: result.txnId,
          quickBooksTxnType: txnType,
          quickBooksSyncedAt: syncedAt,
          quickBooksLastError: null,
        },
      }, { new: true }),
    ]);

    return {
      sale: await Sale.findById(sale._id).lean(),
      duplicate: result.existing,
    };
  } catch (error) {
    const jobState = error.syncState || jobFailureState(error);
    const saleState = jobState === "requires_review" || jobState === "outcome_unknown"
      ? "needs_review"
      : "failed";
    await Promise.all([
      SyncJob.findOneAndUpdate(
        { _id: claimed._id, claimToken },
        {
          $set: {
            status: jobState,
            quickBooksTxnId: error.txnId || null,
            claimToken: null,
            claimedAt: null,
            nextAttemptAt: null,
            lastErrorCode: String(error.code || "QUICKBOOKS_SALE_SYNC_FAILED").slice(0, 100),
            lastError: String(error.message || "QuickBooks sale synchronization failed.").slice(0, 1000),
            processedAt: jobState === "requires_review" ? new Date() : null,
          },
        }
      ),
      Sale.findByIdAndUpdate(sale._id, {
        $set: {
          quickBooksStatus: saleState,
          quickBooksTxnId: error.txnId || null,
          quickBooksLastError: String(error.message || "QuickBooks sale synchronization failed.").slice(0, 1000),
        },
      }),
    ]);

    if (error instanceof QuickBooksBridgeError && !error.statusCode) error.statusCode = 502;
    if (!error.statusCode) error.statusCode = 409;
    throw error;
  }
}
