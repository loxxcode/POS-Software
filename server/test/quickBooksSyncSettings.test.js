import assert from "node:assert/strict";
import test from "node:test";
import QuickBooksSyncSettings from "../src/models/QuickBooksSyncSettings.js";

test("QuickBooks mapping settings accept distinct tax rates and payment methods", async () => {
  const settings = new QuickBooksSyncSettings({
    accountsReceivableAccountListId: "ar-account",
    defaultCustomerListId: "walk-in-customer",
    taxRateMappings: [
      {
        posTaxRate: 0,
        quickBooksSalesTaxCodeListId: "non-taxable-code",
        quickBooksSalesTaxItemListId: null,
      },
      {
        posTaxRate: 18,
        quickBooksSalesTaxCodeListId: "taxable-code",
        quickBooksSalesTaxItemListId: "vat-item",
      },
    ],
    paymentMethodMappings: [
      {
        posPaymentMethod: "cash",
        quickBooksPaymentMethodListId: "cash-method",
        quickBooksDepositAccountListId: "cash-account",
      },
      {
        posPaymentMethod: "card",
        quickBooksPaymentMethodListId: "card-method",
        quickBooksDepositAccountListId: "bank-account",
      },
    ],
  });

  await assert.doesNotReject(settings.validate());
  assert.equal(settings.defaultCustomerListId, "walk-in-customer");
});

test("QuickBooks mapping settings reject duplicate POS tax rates and payment methods", async () => {
  const settings = new QuickBooksSyncSettings({
    taxRateMappings: [
      { posTaxRate: 18, quickBooksSalesTaxCodeListId: "code-1" },
      { posTaxRate: 18, quickBooksSalesTaxCodeListId: "code-2" },
    ],
    paymentMethodMappings: [
      {
        posPaymentMethod: "cash",
        quickBooksPaymentMethodListId: "cash-method-1",
        quickBooksDepositAccountListId: "cash-account",
      },
      {
        posPaymentMethod: "cash",
        quickBooksPaymentMethodListId: "cash-method-2",
        quickBooksDepositAccountListId: "other-account",
      },
    ],
  });

  await assert.rejects(settings.validate(), error =>
    Boolean(error.errors.taxRateMappings) &&
    Boolean(error.errors.paymentMethodMappings)
  );
});

test("QuickBooks mapping settings store company identity metadata", async () => {
  const settings = new QuickBooksSyncSettings({
    expectedCompanyName: "Test Company",
    expectedLegalCompanyName: "Test Company LLC",
    expectedCompanyCountry: "us",
    expectedCompanyIdentityKey: "a".repeat(64),
  });

  await assert.doesNotReject(settings.validate());
  assert.equal(settings.expectedCompanyCountry, "US");
  assert.equal(settings.expectedCompanyIdentityKey, "a".repeat(64));
});
