// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuickBooksMappingSettings from "./QuickBooksMappingSettings";

function installFetch(productResponse: unknown, catalogResponse: unknown = null, matchResponses?: {
  preview: unknown;
  apply: unknown;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    let body: unknown;
    if (path === "/api/sync/quickbooks/preferences") {
      body = {
        success: true,
        data: {
          multiCurrencyEnabled: false,
          homeCurrencyReferenceAvailable: false,
          homeCurrencyCode: null,
          homeCurrencyName: null,
        },
      };
    } else if (path === "/api/sync/quickbooks/mappings/config") {
      body = {
        success: true,
        data: {
          accountsReceivableAccountListId: null,
          taxRateMappings: [],
          paymentMethodMappings: [],
        },
      };
    } else if (path === "/api/sync/quickbooks/mappings/products") {
      body = productResponse;
    } else if (path === "/api/sync/quickbooks/mappings/customers") {
      body = {
        success: true,
        data: { count: 0, page: 1, limit: 25, data: [] },
      };
    } else if (path === "/api/sync/quickbooks/catalogs") {
      body = { success: true, data: catalogResponse };
    } else if (path === "/api/sync/quickbooks/mappings/auto-match/preview") {
      body = matchResponses?.preview;
    } else if (path === "/api/sync/quickbooks/mappings/auto-match/apply") {
      body = matchResponses?.apply;
    } else if (path === "/api/sync/jobs") {
      body = { success: true, count: 0, data: [] };
    } else {
      throw new Error(`Unexpected request: ${path}`);
    }

    return { ok: true, json: async () => body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("QuickBooksMappingSettings", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders mapping rows from the paginated API envelope", async () => {
    installFetch({
      success: true,
      data: {
        count: 1,
        page: 1,
        limit: 25,
        data: [{
          _id: "product-1",
          sku: "BOOK-1",
          name: "History textbook",
          quickBooksItemListId: null,
        }],
      },
    });

    render(<QuickBooksMappingSettings />);

    expect(await screen.findByText("History textbook")).toBeTruthy();
  });

  it("reports an invalid mapping response instead of crashing", async () => {
    installFetch({
      success: true,
      count: 1,
      page: 1,
      limit: 25,
      data: [{
        _id: "product-1",
        sku: "BOOK-1",
        name: "History textbook",
        quickBooksItemListId: null,
      }],
    });

    render(<QuickBooksMappingSettings />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The server returned an invalid product mapping page.");
  });

  it("browses every loaded QuickBooks list with search and pagination", async () => {
    installFetch({
      success: true,
      data: { count: 0, page: 1, limit: 25, data: [] },
    }, {
      items: [{
        listId: "item-1",
        name: "Reader",
        fullName: "Books:Reader",
        type: "inventory",
        isSalesItem: true,
        isTaxable: true,
        taxRate: null,
        quantityOnHand: 12,
        salesPrice: 500,
      }],
      customers: [{
        listId: "customer-1",
        name: "Jane Reader",
        fullName: "Jane Reader",
        type: "customer",
        isSalesItem: false,
        isTaxable: null,
        taxRate: null,
        quantityOnHand: null,
        salesPrice: null,
      }],
      salesTaxCodes: [],
      salesTaxItems: [],
      paymentMethods: [],
      accounts: [
        {
          listId: "account-1",
          name: "Cash",
          fullName: "Cash",
          type: "atBank",
          isSalesItem: false,
          isTaxable: null,
          taxRate: null,
          quantityOnHand: null,
          salesPrice: null,
        },
        {
          listId: "account-2",
          name: "Office expenses",
          fullName: "Expenses:Office",
          type: "atExpense",
          isSalesItem: false,
          isTaxable: null,
          taxRate: null,
          quantityOnHand: null,
          salesPrice: null,
        },
        ...Array.from({ length: 10 }, (_, index) => ({
          listId: `account-${index + 3}`,
          name: `Ledger ${String(index + 1).padStart(2, "0")}`,
          fullName: `Ledger ${String(index + 1).padStart(2, "0")}`,
          type: "atOtherCurrentAsset",
          isSalesItem: false,
          isTaxable: null,
          taxRate: null,
          quantityOnHand: null,
          salesPrice: null,
        })),
      ],
      truncated: {
        items: false,
        customers: false,
        salesTaxCodes: false,
        salesTaxItems: false,
        paymentMethods: false,
        accounts: false,
      },
    });

    render(<QuickBooksMappingSettings />);
    fireEvent.click(screen.getByRole("button", { name: "LOAD QUICKBOOKS LISTS" }));

    expect(await screen.findByText("Loaded active QuickBooks lists: 1 items, 1 customers, 0 tax codes, 0 tax items, 0 payment methods, 12 accounts.")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Items 1" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Customers 1" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Tax codes 0" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Tax items 0" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Payment methods 0" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Accounts 12" }));
    const catalogPanel = within(screen.getByRole("tabpanel"));
    const table = catalogPanel.getByRole("table");
    expect(within(table).getAllByText("Cash")).toHaveLength(2);
    expect(within(table).getByText("Office expenses")).toBeTruthy();
    expect(catalogPanel.getByText("Page 1 of 2")).toBeTruthy();
    fireEvent.click(catalogPanel.getByRole("button", { name: "Next" }));
    expect(catalogPanel.getByText("Page 2 of 2")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search accounts" }), {
      target: { value: "Office" },
    });
    expect(catalogPanel.getByText("Page 1 of 1")).toBeTruthy();
    expect(within(table).getByText("Office expenses")).toBeTruthy();
    expect(within(table).queryByText("Cash")).toBeNull();
  });

  it("previews exact POS matches before applying QuickBooks updates", async () => {
    const fetchMock = installFetch(
      { success: true, data: { count: 0, page: 1, limit: 25, data: [] } },
      {
        items: [],
        customers: [],
        salesTaxCodes: [],
        salesTaxItems: [],
        paymentMethods: [],
        accounts: [],
        truncated: {},
      },
      {
        preview: {
          success: true,
          data: {
            token: "a".repeat(64),
            products: { matched: 1, ambiguous: 0, unmatched: 0, conflicts: 0, unavailable: 0 },
            customers: { matched: 0, ambiguous: 0, unmatched: 1, conflicts: 0, unavailable: 0 },
            truncated: { items: false, customers: false },
            matches: [{
              kind: "product",
              posId: "product-1",
              posName: "Book One",
              posSku: "BOOK-1",
              posPrice: 500,
              quickBooksListId: "item-1",
              quickBooksName: "BOOK-1",
              matchBy: "SKU",
              alreadyLinked: false,
            }],
          },
        },
        apply: {
          success: true,
          data: { syncedProducts: 1, syncedCustomers: 0, failed: 0, failures: [] },
        },
      }
    );

    render(<QuickBooksMappingSettings />);
    fireEvent.click(screen.getByRole("button", { name: "LOAD QUICKBOOKS LISTS" }));
    expect(await screen.findByText("Loaded active QuickBooks lists: 0 items, 0 customers, 0 tax codes, 0 tax items, 0 payment methods, 0 accounts.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "PREVIEW EXACT MATCHES" }));
    expect(await screen.findByText("Book One")).toBeTruthy();
    expect(screen.getByText("Name and RWF 500 price")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "APPLY 1 EXACT MATCHES" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByText("Synchronized 1 products and 0 customers; 0 records failed.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([input]) =>
      new URL(String(input)).pathname === "/api/sync/quickbooks/mappings/auto-match/apply"
    )).toBe(true);
  });

  it("renders unresolved synchronization jobs and prevents blank TxnID confirmation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/sync/jobs") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            count: 1,
            data: [{
              _id: "job-1",
              internalJobId: "job-uuid",
              operationType: "createSalesReceipt",
              status: "outcome_unknown",
              attempts: 1,
              quickBooksTxnId: null,
              lastErrorCode: "BRIDGE_TIMEOUT",
              saleId: { receiptNumber: "LIB-TEST" },
            }],
          }),
        };
      }
      if (path === "/api/sync/quickbooks/preferences") {
        return { ok: true, json: async () => ({ success: true, data: { multiCurrencyEnabled: false, homeCurrencyReferenceAvailable: false, homeCurrencyCode: null, homeCurrencyName: null } }) };
      }
      if (path === "/api/sync/quickbooks/mappings/config") {
        return { ok: true, json: async () => ({ success: true, data: { accountsReceivableAccountListId: null, taxRateMappings: [], paymentMethodMappings: [] } }) };
      }
      if (path === "/api/sync/quickbooks/mappings/products") {
        return { ok: true, json: async () => ({ success: true, data: { count: 0, page: 1, limit: 25, data: [] } }) };
      }
      if (path === "/api/sync/quickbooks/mappings/customers") {
        return { ok: true, json: async () => ({ success: true, data: { count: 0, page: 1, limit: 25, data: [] } }) };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuickBooksMappingSettings />);

    expect(await screen.findByText("Synchronization reconciliation")).toBeTruthy();
    expect(await screen.findByText("outcome_unknown")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "CONFIRM" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "QuickBooks transaction ID for job-uuid" }), {
      target: { value: "txn-confirmed" },
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
  });
});
