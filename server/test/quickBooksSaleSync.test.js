import assert from "node:assert/strict";
import test from "node:test";
import { buildQuickBooksSalePayload } from "../src/services/quickBooksSaleSync.js";

const sale = {
  _id: "507f1f77bcf86cd799439011",
  quickBooksRequestId: "pos-sale:507f1f77bcf86cd799439011",
  customerId: "507f1f77bcf86cd799439012",
  customerName: "Example Customer",
  paymentMethod: "credit",
  paymentStatus: "unpaid",
  taxTreatment: "exclusive",
  createdAt: "2025-01-15T10:00:00.000Z",
  total: 209,
  items: [{
    productId: "507f1f77bcf86cd799439013",
    sku: "SKU-1",
    name: "Example item",
    quantity: 2,
    unitPrice: 100,
    discountAmount: 10,
    taxRate: 10,
    taxAmount: 19,
  }],
};
const customer = { quickBooksListId: "customer-list-id" };
const products = [{
  _id: "507f1f77bcf86cd799439013",
  quickBooksItemListId: "item-list-id",
}];
const settings = {
  accountsReceivableAccountListId: "ar-account-id",
  taxRateMappings: [{
    posTaxRate: 10,
    quickBooksSalesTaxCodeListId: "tax-code-id",
    quickBooksSalesTaxItemListId: "tax-item-id",
  }],
  paymentMethodMappings: [{
    posPaymentMethod: "cash",
    quickBooksPaymentMethodListId: "cash-method-id",
    quickBooksDepositAccountListId: "deposit-account-id",
  }],
};

test("builds an invoice payload from mapped sale data and discounts", () => {
  const payload = buildQuickBooksSalePayload({ sale, customer, products, settings });

  assert.equal(payload.transactionType, "Invoice");
  assert.equal(payload.customerListId, "customer-list-id");
  assert.equal(payload.accountsReceivableAccountListId, "ar-account-id");
  assert.equal(payload.lines[0].amount, 190);
  assert.equal(payload.lines[0].taxCodeListId, "tax-code-id");
  assert.equal(payload.itemSalesTaxListId, "tax-item-id");
  assert.equal(payload.expectedTotal, 209);
  assert.equal(payload.refNumber.length, 11);
});

test("keeps a tax-free proforma conversion total tax-free in its QuickBooks invoice", () => {
  const taxFreeSale = {
    ...sale,
    total: 190,
    items: [{ ...sale.items[0], taxRate: 0, taxAmount: 0 }],
  };
  const taxFreeSettings = {
    ...settings,
    taxRateMappings: [
      ...settings.taxRateMappings,
      { posTaxRate: 0, quickBooksSalesTaxCodeListId: "non-taxable-code-id" },
    ],
  };
  const payload = buildQuickBooksSalePayload({
    sale: taxFreeSale,
    customer,
    products,
    settings: taxFreeSettings,
  });

  assert.equal(payload.taxTreatment, "exclusive");
  assert.equal(payload.lines[0].taxCodeListId, "non-taxable-code-id");
  assert.equal(payload.itemSalesTaxListId, "");
  assert.equal(payload.expectedTotal, 190);
});

test("builds a sales receipt payload with payment and deposit mappings", () => {
  const paidSale = { ...sale, paymentStatus: "paid", paymentMethod: "cash" };
  const payload = buildQuickBooksSalePayload({ sale: paidSale, customer, products, settings });

  assert.equal(payload.transactionType, "SalesReceipt");
  assert.equal(payload.paymentMethodListId, "cash-method-id");
  assert.equal(payload.depositAccountListId, "deposit-account-id");
});

test("supports a mapped default customer for walk-in receipts but not credit invoices", () => {
  const walkInSale = {
    ...sale,
    customerId: null,
    paymentStatus: "paid",
    paymentMethod: "cash",
  };
  const payload = buildQuickBooksSalePayload({
    sale: walkInSale,
    customer: { quickBooksListId: "walk-in-customer-id" },
    products,
    settings,
  });
  assert.equal(payload.customerListId, "walk-in-customer-id");
  assert.throws(
    () => buildQuickBooksSalePayload({
      sale: { ...walkInSale, paymentStatus: "unpaid" },
      customer: { quickBooksListId: "walk-in-customer-id" },
      products,
      settings,
    }),
    error => error.code === "QUICKBOOKS_CUSTOMER_MAPPING_REQUIRED"
  );
});

test("refuses to post without customer, item, tax, or payment mappings", () => {
  assert.throws(
    () => buildQuickBooksSalePayload({ sale, customer: null, products, settings }),
    error => error.code === "QUICKBOOKS_CUSTOMER_MAPPING_REQUIRED"
  );
  assert.throws(
    () => buildQuickBooksSalePayload({ sale, customer, products: [], settings }),
    error => error.code === "QUICKBOOKS_ITEM_MAPPING_REQUIRED"
  );
  assert.throws(
    () => buildQuickBooksSalePayload({ sale: { ...sale, items: [{ ...sale.items[0], taxRate: 5 }] }, customer, products, settings }),
    error => error.code === "QUICKBOOKS_TAX_MAPPING_REQUIRED"
  );
  assert.throws(
    () => buildQuickBooksSalePayload({
      sale: { ...sale, paymentStatus: "paid", paymentMethod: "card" },
      customer,
      products,
      settings,
    }),
    error => error.code === "QUICKBOOKS_PAYMENT_MAPPING_REQUIRED"
  );
});
