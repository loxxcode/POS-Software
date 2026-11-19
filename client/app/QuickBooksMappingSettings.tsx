"use client";

import { useEffect, useMemo, useState } from "react";

type CatalogEntry = {
  listId: string;
  name: string;
  fullName: string | null;
  type: string;
  isSalesItem: boolean;
  isTaxable: boolean | null;
  taxRate: number | null;
  quantityOnHand: number | null;
  salesPrice: number | null;
};
type Catalogs = {
  items: CatalogEntry[];
  customers: CatalogEntry[];
  salesTaxCodes: CatalogEntry[];
  salesTaxItems: CatalogEntry[];
  paymentMethods: CatalogEntry[];
  accounts: CatalogEntry[];
  truncated: Record<string, boolean>;
};
type CatalogListKey = Exclude<keyof Catalogs, "truncated">;
type CatalogSort = "name-asc" | "name-desc" | "type-asc";
type CatalogColumn = { label: string; value: (entry: CatalogEntry) => string };
type QuickBooksMatchCounts = {
  matched: number;
  ambiguous: number;
  unmatched: number;
  conflicts: number;
  unavailable: number;
};
type QuickBooksMatchCandidate = {
  kind: "product" | "customer";
  posId: string;
  posName: string;
  posSku?: string;
  posPrice?: number;
  quickBooksListId: string;
  quickBooksName: string;
  matchBy: string;
  alreadyLinked: boolean;
};
type QuickBooksMatchPreview = {
  token: string;
  products: QuickBooksMatchCounts;
  customers: QuickBooksMatchCounts;
  truncated: { items: boolean; customers: boolean };
  matches: QuickBooksMatchCandidate[];
};
type QuickBooksMatchApplyResult = {
  syncedProducts: number;
  syncedCustomers: number;
  failed: number;
  failures: { kind: "product" | "customer"; posName: string; message: string; mappingSaved?: boolean }[];
};
type Preferences = {
  multiCurrencyEnabled: boolean;
  homeCurrencyReferenceAvailable: boolean;
  homeCurrencyCode: string | null;
  homeCurrencyName: string | null;
};
type ProductMapping = { _id: string; sku: string; name: string; quickBooksItemListId: string | null };
type CustomerMapping = { _id: string; name: string; quickBooksListId: string | null };
type Page<T> = { count: number; page: number; limit: number; data: T[] };
type TaxMapping = {
  posTaxRate: number;
  quickBooksSalesTaxCodeListId: string;
  quickBooksSalesTaxItemListId: string | null;
};
type PaymentMapping = {
  posPaymentMethod: "cash" | "card" | "mobile_money" | "other";
  quickBooksPaymentMethodListId: string;
  quickBooksDepositAccountListId: string;
};
type MappingConfig = {
  accountsReceivableAccountListId: string | null;
  taxRateMappings: TaxMapping[];
  paymentMethodMappings: PaymentMapping[];
};
type ApiEnvelope<T> = { success: boolean; data: T; message?: string };
type SyncJob = {
  _id: string;
  internalJobId?: string;
  operationType?: string;
  status: string;
  attempts: number;
  idempotencyKey?: string | null;
  quickBooksTxnId?: string | null;
  quickBooksTxnType?: string | null;
  lastErrorCode?: string | null;
  lastError?: string | null;
  nextAttemptAt?: string | null;
  createdAt?: string;
  saleId?: { receiptNumber?: string } | string | null;
};

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000").replace(/\/$/, "");
const methods: PaymentMapping["posPaymentMethod"][] = ["cash", "card", "mobile_money", "other"];
const methodLabels: Record<PaymentMapping["posPaymentMethod"], string> = {
  cash: "Cash",
  card: "Card",
  mobile_money: "Mobile money",
  other: "Other",
};
const defaultConfig: MappingConfig = {
  accountsReceivableAccountListId: null,
  taxRateMappings: [],
  paymentMethodMappings: [],
};
const catalogListDefinitions: { key: CatalogListKey; label: string }[] = [
  { key: "items", label: "Items" },
  { key: "customers", label: "Customers" },
  { key: "salesTaxCodes", label: "Tax codes" },
  { key: "salesTaxItems", label: "Tax items" },
  { key: "paymentMethods", label: "Payment methods" },
  { key: "accounts", label: "Accounts" },
];
const catalogColumns: Record<CatalogListKey, CatalogColumn[]> = {
  items: [
    { label: "List ID", value: entry => entry.listId },
    { label: "Item name", value: entry => entry.fullName || entry.name },
    { label: "Item type", value: entry => entry.type.replaceAll("_", " ") },
    { label: "Sales item", value: entry => entry.isSalesItem ? "Yes" : "No" },
    { label: "Sales price", value: entry => typeof entry.salesPrice === "number" ? entry.salesPrice.toLocaleString("en-US") : "—" },
    { label: "On hand", value: entry => typeof entry.quantityOnHand === "number" ? entry.quantityOnHand.toLocaleString("en-US") : "—" },
  ],
  customers: [
    { label: "List ID", value: entry => entry.listId },
    { label: "Customer name", value: entry => entry.name },
    { label: "Full name", value: entry => entry.fullName || "—" },
  ],
  salesTaxCodes: [
    { label: "List ID", value: entry => entry.listId },
    { label: "Tax code", value: entry => entry.name },
    { label: "Taxable", value: entry => entry.isTaxable === null ? "Unknown" : entry.isTaxable ? "Yes" : "No" },
  ],
  salesTaxItems: [
    { label: "List ID", value: entry => entry.listId },
    { label: "Tax item", value: entry => entry.name },
    { label: "Rate", value: entry => typeof entry.taxRate === "number" ? `${entry.taxRate}%` : "—" },
  ],
  paymentMethods: [
    { label: "List ID", value: entry => entry.listId },
    { label: "Payment method", value: entry => entry.name },
    { label: "Method type", value: entry => entry.type.replaceAll("_", " ") },
  ],
  accounts: [
    { label: "List ID", value: entry => entry.listId },
    { label: "Account name", value: entry => entry.name },
    { label: "Full name", value: entry => entry.fullName || "—" },
    { label: "Account type", value: entry => entry.type.replace(/^at/, "") },
  ],
};
const catalogCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProductMapping(value: unknown): value is ProductMapping {
  return isRecord(value) &&
    typeof value._id === "string" &&
    typeof value.sku === "string" &&
    typeof value.name === "string" &&
    (value.quickBooksItemListId === null ||
      value.quickBooksItemListId === undefined ||
      typeof value.quickBooksItemListId === "string");
}

function isCustomerMapping(value: unknown): value is CustomerMapping {
  return isRecord(value) &&
    typeof value._id === "string" &&
    typeof value.name === "string" &&
    (value.quickBooksListId === null ||
      value.quickBooksListId === undefined ||
      typeof value.quickBooksListId === "string");
}

function isPage<T>(
  value: unknown,
  isItem: (item: unknown) => item is T
): value is Page<T> {
  return isRecord(value) &&
    typeof value.count === "number" &&
    Number.isSafeInteger(value.count) &&
    value.count >= 0 &&
    typeof value.page === "number" &&
    Number.isSafeInteger(value.page) &&
    value.page >= 1 &&
    typeof value.limit === "number" &&
    Number.isSafeInteger(value.limit) &&
    value.limit >= 1 &&
    Array.isArray(value.data) &&
    value.data.every(isItem);
}

function isMatchCounts(value: unknown): value is QuickBooksMatchCounts {
  return isRecord(value) &&
    ["matched", "ambiguous", "unmatched", "conflicts", "unavailable"].every(key =>
      Number.isSafeInteger(value[key]) && Number(value[key]) >= 0
    );
}

function isMatchPreview(value: unknown): value is QuickBooksMatchPreview {
  return isRecord(value) &&
    typeof value.token === "string" &&
    isMatchCounts(value.products) &&
    isMatchCounts(value.customers) &&
    isRecord(value.truncated) &&
    typeof value.truncated.items === "boolean" &&
    typeof value.truncated.customers === "boolean" &&
    Array.isArray(value.matches) &&
    value.matches.every(match =>
      isRecord(match) &&
      (match.kind === "product" || match.kind === "customer") &&
      typeof match.posId === "string" &&
      typeof match.posName === "string" &&
      (match.posSku === undefined || typeof match.posSku === "string") &&
      (match.posPrice === undefined || typeof match.posPrice === "number") &&
      typeof match.quickBooksListId === "string" &&
      typeof match.quickBooksName === "string" &&
      typeof match.matchBy === "string" &&
      typeof match.alreadyLinked === "boolean"
    );
}

function isMatchApplyResult(value: unknown): value is QuickBooksMatchApplyResult {
  return isRecord(value) &&
    Number.isSafeInteger(value.syncedProducts) &&
    Number.isSafeInteger(value.syncedCustomers) &&
    Number.isSafeInteger(value.failed) &&
    Array.isArray(value.failures) &&
    value.failures.every(failure =>
      isRecord(failure) &&
      (failure.kind === "product" || failure.kind === "customer") &&
      typeof failure.posName === "string" &&
      typeof failure.message === "string" &&
      (failure.mappingSaved === undefined || typeof failure.mappingSaved === "boolean")
    );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  let result: ApiEnvelope<T> | { success: false; message?: string };
  try {
    result = await response.json();
  } catch {
    throw new Error("The QuickBooks setup service returned an invalid response.");
  }
  if (!response.ok || result.success !== true || !("data" in result)) {
    throw new Error(result.message || "Unable to complete the QuickBooks setup request.");
  }
  return result.data;
}

function optionLabel(entry: CatalogEntry) {
  const name = entry.fullName || entry.name;
  return `${name} · ${entry.listId}`;
}

function ReconcileForm({
  job,
  reconcile,
  disabled,
}: {
  job: SyncJob;
  reconcile: (job: SyncJob, quickBooksTxnId: string, quickBooksTxnType: string) => Promise<void>;
  disabled: boolean;
}) {
  const [txnId, setTxnId] = useState(job.quickBooksTxnId || "");
  const [txnType, setTxnType] = useState(job.quickBooksTxnType || "SalesReceipt");
  return <div className="qb-reconcile-form">
    <input
      aria-label={`QuickBooks transaction ID for ${job.internalJobId || job._id}`}
      placeholder="Confirmed TxnID"
      value={txnId}
      onChange={event => setTxnId(event.target.value)}
      maxLength={100}
    />
    <select
      aria-label={`QuickBooks transaction type for ${job.internalJobId || job._id}`}
      value={txnType}
      onChange={event => setTxnType(event.target.value)}
    >
      <option value="SalesReceipt">Sales Receipt</option>
      <option value="Invoice">Invoice</option>
      <option value="ReceivePayment">Receive Payment</option>
    </select>
    <button
      type="button"
      className="button button-blue"
      disabled={disabled || !txnId.trim()}
      onClick={() => void reconcile(job, txnId, txnType)}
    >
      CONFIRM
    </button>
  </div>;
}

export default function QuickBooksMappingSettings() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [preferencesError, setPreferencesError] = useState("");
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [activeCatalogList, setActiveCatalogList] = useState<CatalogListKey>("items");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogSort, setCatalogSort] = useState<CatalogSort>("name-asc");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPageSize, setCatalogPageSize] = useState(10);
  const [config, setConfig] = useState<MappingConfig>(defaultConfig);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState("");
  const [configNotice, setConfigNotice] = useState("");
  const [products, setProducts] = useState<Page<ProductMapping>>({ count: 0, page: 1, limit: 25, data: [] });
  const [customers, setCustomers] = useState<Page<CustomerMapping>>({ count: 0, page: 1, limit: 25, data: [] });
  const [productSearch, setProductSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearchDraft, setProductSearchDraft] = useState("");
  const [customerSearchDraft, setCustomerSearchDraft] = useState("");
  const [productDrafts, setProductDrafts] = useState<Record<string, string>>({});
  const [customerDrafts, setCustomerDrafts] = useState<Record<string, string>>({});
  const [productsLoading, setProductsLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [mappingSaving, setMappingSaving] = useState("");
  const [mappingError, setMappingError] = useState("");
  const [mappingNotice, setMappingNotice] = useState("");
  const [matchPreview, setMatchPreview] = useState<QuickBooksMatchPreview | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchApplying, setMatchApplying] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [matchNotice, setMatchNotice] = useState("");
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [syncJobsLoading, setSyncJobsLoading] = useState(false);
  const [syncJobsError, setSyncJobsError] = useState("");
  const [syncJobsNotice, setSyncJobsNotice] = useState("");

  const salesItems = useMemo(
    () => catalogs?.items.filter(item =>
      item.isSalesItem && (item.type === "inventory" || item.type === "inventory_assembly")
    ) || [],
    [catalogs]
  );
  const receivableAccounts = useMemo(
    () => catalogs?.accounts.filter(account => account.type === "atAccountsReceivable") || [],
    [catalogs]
  );
  const depositAccounts = useMemo(
    () => catalogs?.accounts.filter(account =>
      account.type === "atBank" || account.type === "atOtherCurrentAsset"
    ) || [],
    [catalogs]
  );
  const activeCatalogEntries = catalogs?.[activeCatalogList] || [];
  const filteredCatalogEntries = useMemo(() => {
    const search = catalogSearch.trim().toLocaleLowerCase();
    const filtered = activeCatalogEntries.filter(entry => !search ||
      `${entry.listId} ${entry.name} ${entry.fullName || ""} ${entry.type} ${catalogColumns[activeCatalogList].map(column => column.value(entry)).join(" ")}`
        .toLocaleLowerCase()
        .includes(search)
    );
    return filtered.sort((left, right) => {
      if (catalogSort === "type-asc") {
        return catalogCollator.compare(left.type, right.type) ||
          catalogCollator.compare(left.fullName || left.name, right.fullName || right.name);
      }
      const byName = catalogCollator.compare(left.fullName || left.name, right.fullName || right.name);
      return catalogSort === "name-desc" ? -byName : byName;
    });
  }, [activeCatalogEntries, activeCatalogList, catalogSearch, catalogSort]);

  useEffect(() => {
    let active = true;
    request<Preferences>("/api/sync/quickbooks/preferences")
      .then(data => {
        if (active) setPreferences(data);
      })
      .catch(error => {
        if (active) {
          setPreferencesError(error instanceof Error ? error.message : "Unable to read QuickBooks preferences.");
        }
      });

    request<MappingConfig>("/api/sync/quickbooks/mappings/config")
      .then(data => {
        if (active) setConfig({
          accountsReceivableAccountListId: data.accountsReceivableAccountListId,
          taxRateMappings: data.taxRateMappings || [],
          paymentMethodMappings: data.paymentMethodMappings || [],
        });
      })
      .catch(error => {
        if (active) setConfigError(error instanceof Error ? error.message : "Unable to load saved mappings.");
      })
      .finally(() => {
        if (active) setConfigLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function loadCatalogs() {
    setCatalogLoading(true);
    setCatalogError("");
    setCatalogs(null);
    setMatchPreview(null);
    try {
      const data = await request<Catalogs>("/api/sync/quickbooks/catalogs");
      setCatalogs(data);
      setCatalogError("");
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Unable to load QuickBooks lists.");
    } finally {
      setCatalogLoading(false);
    }
  }

  async function previewExactMatches() {
    setMatchLoading(true);
    setMatchError("");
    setMatchNotice("");
    try {
      const data = await request<unknown>("/api/sync/quickbooks/mappings/auto-match/preview", {
        method: "POST",
      });
      if (!isMatchPreview(data)) {
        throw new Error("The server returned an invalid exact-match preview.");
      }
      setMatchPreview(data);
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : "Unable to preview exact QuickBooks matches.");
    } finally {
      setMatchLoading(false);
    }
  }

  async function applyExactMatches() {
    if (!matchPreview) return;
    setMatchApplying(true);
    setMatchError("");
    setMatchNotice("");
    try {
      const data = await request<unknown>("/api/sync/quickbooks/mappings/auto-match/apply", {
        method: "POST",
        body: JSON.stringify({ token: matchPreview.token }),
      });
      if (!isMatchApplyResult(data)) {
        throw new Error("The server returned an invalid exact-match result.");
      }
      setMatchNotice(
        `Synchronized ${data.syncedProducts} products and ${data.syncedCustomers} customers; ${data.failed} records failed.`
      );
      setMatchPreview(null);
      if (data.failures.length) {
        setMatchError(data.failures.map(failure =>
          `${failure.kind === "product" ? "Product" : "Customer"} "${failure.posName}": ${failure.message}${failure.mappingSaved ? " Its POS link was saved; retry synchronization from a fresh preview." : ""}`
        ).join(" "));
      }
      await Promise.all([
        loadProductPage(1, productSearch),
        loadCustomerPage(1, customerSearch),
        loadCatalogs(),
      ]);
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : "Unable to synchronize exact QuickBooks matches.");
    } finally {
      setMatchApplying(false);
    }
  }

  async function loadProductPage(page: number, search: string) {
    setProductsLoading(true);
    setMappingError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      const data = await request<unknown>(`/api/sync/quickbooks/mappings/products?${params}`);
      if (!isPage(data, isProductMapping)) {
        throw new Error("The server returned an invalid product mapping page.");
      }
      setProducts(data);
      setProductDrafts(Object.fromEntries(data.data.map(product => [
        product._id,
        product.quickBooksItemListId || "",
      ])));
    } catch (error) {
      setMappingError(error instanceof Error ? error.message : "Unable to load product mappings.");
    } finally {
      setProductsLoading(false);
    }
  }

  async function loadCustomerPage(page: number, search: string) {
    setCustomersLoading(true);
    setMappingError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      const data = await request<unknown>(`/api/sync/quickbooks/mappings/customers?${params}`);
      if (!isPage(data, isCustomerMapping)) {
        throw new Error("The server returned an invalid customer mapping page.");
      }
      setCustomers(data);
      setCustomerDrafts(Object.fromEntries(data.data.map(customer => [
        customer._id,
        customer.quickBooksListId || "",
      ])));
    } catch (error) {
      setMappingError(error instanceof Error ? error.message : "Unable to load customer mappings.");
    } finally {
      setCustomersLoading(false);
    }
  }

  async function loadSyncJobs() {
    setSyncJobsLoading(true);
    setSyncJobsError("");
    try {
      const data = await request<unknown>("/api/sync/jobs");
      if (!isRecord(data) || !Array.isArray(data) || !data.every(job =>
        isRecord(job) &&
        typeof job._id === "string" &&
        typeof job.status === "string" &&
        typeof job.attempts === "number"
      )) {
        throw new Error("The server returned an invalid synchronization job list.");
      }
      setSyncJobs(data as unknown as SyncJob[]);
    } catch (error) {
      setSyncJobsError(error instanceof Error ? error.message : "Unable to load synchronization jobs.");
    } finally {
      setSyncJobsLoading(false);
    }
  }

  async function reconcileSyncJob(job: SyncJob, quickBooksTxnId: string, quickBooksTxnType: string) {
    setSyncJobsLoading(true);
    setSyncJobsError("");
    setSyncJobsNotice("");
    try {
      await request<unknown>(`/api/sync/jobs/${encodeURIComponent(job._id)}/reconcile`, {
        method: "POST",
        body: JSON.stringify({
          quickBooksTxnId: quickBooksTxnId.trim() || null,
          quickBooksTxnType: quickBooksTxnType.trim() || null,
          note: "Administrator confirmed QuickBooks transaction reference.",
        }),
      });
      setSyncJobsNotice(`Reconciliation saved for job ${job.internalJobId || job._id}.`);
      await loadSyncJobs();
    } catch (error) {
      setSyncJobsError(error instanceof Error ? error.message : "Unable to reconcile synchronization job.");
      setSyncJobsLoading(false);
    }
  }

  useEffect(() => {
    loadProductPage(1, "");
    loadCustomerPage(1, "");
    void loadSyncJobs();
  }, []);

  async function saveProductMapping(product: ProductMapping) {
    const listId = productDrafts[product._id]?.trim() || null;
    setMappingSaving(`product:${product._id}`);
    setMappingError("");
    setMappingNotice("");
    try {
      const data = await request<ProductMapping>(
        `/api/sync/quickbooks/mappings/products/${encodeURIComponent(product._id)}`,
        { method: "PATCH", body: JSON.stringify({ listId }) }
      );
      setProducts(current => ({
        ...current,
        data: current.data.map(item => item._id === data._id ? data : item),
      }));
      setProductDrafts(current => ({ ...current, [data._id]: data.quickBooksItemListId || "" }));
      setMappingNotice(`Saved QuickBooks item mapping for ${data.name}.`);
    } catch (error) {
      setMappingError(error instanceof Error ? error.message : "Unable to save product mapping.");
    } finally {
      setMappingSaving("");
    }
  }

  async function saveCustomerMapping(customer: CustomerMapping) {
    const listId = customerDrafts[customer._id]?.trim() || null;
    setMappingSaving(`customer:${customer._id}`);
    setMappingError("");
    setMappingNotice("");
    try {
      const data = await request<CustomerMapping>(
        `/api/sync/quickbooks/mappings/customers/${encodeURIComponent(customer._id)}`,
        { method: "PATCH", body: JSON.stringify({ listId }) }
      );
      setCustomers(current => ({
        ...current,
        data: current.data.map(item => item._id === data._id ? data : item),
      }));
      setCustomerDrafts(current => ({ ...current, [data._id]: data.quickBooksListId || "" }));
      setMappingNotice(`Saved QuickBooks customer mapping for ${data.name}.`);
    } catch (error) {
      setMappingError(error instanceof Error ? error.message : "Unable to save customer mapping.");
    } finally {
      setMappingSaving("");
    }
  }

  async function saveConfiguration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfigSaving(true);
    setConfigError("");
    setConfigNotice("");
    try {
      const data = await request<MappingConfig>("/api/sync/quickbooks/mappings/config", {
        method: "PATCH",
        body: JSON.stringify(config),
      });
      setConfig(data);
      setConfigNotice("QuickBooks mappings saved. Transaction writes are still disabled.");
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : "Unable to save QuickBooks mappings.");
    } finally {
      setConfigSaving(false);
    }
  }

  function updateTaxMapping(index: number, update: Partial<TaxMapping>) {
    setConfig(current => ({
      ...current,
      taxRateMappings: current.taxRateMappings.map((mapping, mappingIndex) =>
        mappingIndex === index ? { ...mapping, ...update } : mapping
      ),
    }));
  }

  function updatePaymentMapping(index: number, update: Partial<PaymentMapping>) {
    setConfig(current => ({
      ...current,
      paymentMethodMappings: current.paymentMethodMappings.map((mapping, mappingIndex) =>
        mappingIndex === index ? { ...mapping, ...update } : mapping
      ),
    }));
  }

  const truncatedCatalogs = catalogs
    ? Object.entries(catalogs.truncated).filter(([, truncated]) => truncated).map(([name]) => name)
    : [];
  const productPages = Math.max(1, Math.ceil(products.count / products.limit));
  const customerPages = Math.max(1, Math.ceil(customers.count / customers.limit));
  const catalogPages = Math.max(1, Math.ceil(filteredCatalogEntries.length / catalogPageSize));
  const visibleCatalogEntries = filteredCatalogEntries.slice(
    (catalogPage - 1) * catalogPageSize,
    catalogPage * catalogPageSize
  );

  return <section className="admin-dashboard-panel qb-mapping-panel">
    <div className="admin-panel-heading qb-mapping-heading">
      <div>
        <h3>QuickBooks Desktop mapping setup</h3>
        <p>Read-only catalog access and mapping configuration. No QuickBooks transactions are created or changed.</p>
      </div>
      <button className="button button-outline" type="button" onClick={loadCatalogs} disabled={catalogLoading}>
        {catalogLoading ? "LOADING LISTS…" : catalogs ? "REFRESH QUICKBOOKS LISTS" : "LOAD QUICKBOOKS LISTS"}
      </button>
    </div>

    {preferences?.multiCurrencyEnabled === false && <div className="qb-mapping-warning" role="status">
      QuickBooks multi-currency is disabled. A home-currency reference was not returned; transaction sync must remain disabled until currency handling is confirmed.
    </div>}
    {preferences?.multiCurrencyEnabled && !preferences.homeCurrencyReferenceAvailable && <div className="qb-mapping-warning" role="status">
      QuickBooks did not return a home-currency reference. Transaction sync must remain disabled until currency handling is confirmed.
    </div>}
    {preferences?.homeCurrencyReferenceAvailable && <div className="qb-mapping-status">
      QuickBooks home currency: <strong>{preferences.homeCurrencyCode} · {preferences.homeCurrencyName}</strong>
    </div>}
    {preferencesError && <p className="login-error" role="alert">{preferencesError}</p>}
    {catalogError && <p className="login-error" role="alert">{catalogError}</p>}
    {truncatedCatalogs.length > 0 && <p className="qb-mapping-warning" role="status">
      Some QuickBooks lists reached the 1,000-record query limit: {truncatedCatalogs.join(", ")}. Confirm available options before mapping.
    </p>}
    {catalogs && <p className="qb-mapping-status">
      Loaded active QuickBooks lists: {catalogs.items.length} items, {catalogs.customers.length} customers, {catalogs.salesTaxCodes.length} tax codes, {catalogs.salesTaxItems.length} tax items, {catalogs.paymentMethods.length} payment methods, {catalogs.accounts.length} accounts.
    </p>}
    <section className="qb-sync-reconciliation" aria-label="QuickBooks synchronization reconciliation">
      <div className="qb-catalog-heading">
        <h4>Synchronization reconciliation</h4>
        <p>Pending jobs are local accounting outbox records. An unknown outcome or timeout requires manual confirmation in QuickBooks; this panel never guesses or blindly retries a transaction.</p>
      </div>
      <div className="qb-auto-match-actions">
        <button type="button" className="button button-outline" onClick={() => void loadSyncJobs()} disabled={syncJobsLoading}>
          {syncJobsLoading ? "REFRESHING…" : "REFRESH JOBS"}
        </button>
      </div>
      {syncJobsError && <p className="login-error" role="alert">{syncJobsError}</p>}
      {syncJobsNotice && <p className="qb-mapping-success" role="status">{syncJobsNotice}</p>}
      {syncJobsLoading && syncJobs.length === 0 && <p className="qb-mapping-empty">Loading synchronization jobs…</p>}
      {!syncJobsLoading && syncJobs.length === 0 && <p className="qb-mapping-empty">No synchronization jobs found.</p>}
      {syncJobs.length > 0 && <div className="qb-sync-table-wrap">
        <table className="qb-catalog-table">
          <thead><tr><th>Job</th><th>Operation</th><th>Status</th><th>Attempts</th><th>Accounting reference</th><th>Action</th></tr></thead>
          <tbody>
            {syncJobs.map(job => {
              const unresolved = ["pending", "retryable_failed", "outcome_unknown", "permanent_failed", "requires_review", "failed", "needs_review"].includes(job.status);
              return <tr key={job._id}>
                <td>{job.internalJobId || job._id}<small>{job.saleId && typeof job.saleId === "object" ? job.saleId.receiptNumber : "POS entity"}</small></td>
                <td>{job.operationType || "unknown"}</td>
                <td>{job.status}<small>{job.lastErrorCode || job.lastError || ""}</small></td>
                <td>{job.attempts}</td>
                <td>{job.quickBooksTxnId || "Not confirmed"}</td>
                <td>
                  {unresolved
                    ? <ReconcileForm job={job} reconcile={reconcileSyncJob} disabled={syncJobsLoading} />
                    : "Confirmed"}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </section>
    <section className="qb-auto-match" aria-label="Match POS data with QuickBooks">
      <div className="qb-catalog-heading">
        <h4>Match POS data with QuickBooks</h4>
        <p>Exact POS SKU or product-name matches are compared with QuickBooks inventory item names; customers match by exact name. Applying a preview links matches and updates QuickBooks names, item prices, and customer contact fields from POS. Ambiguous and unmatched records are left unchanged. Stock quantities and transactions are not synchronized.</p>
      </div>
      <div className="qb-auto-match-actions">
        <button
          type="button"
          className="button button-outline"
          disabled={!catalogs || catalogLoading || matchLoading || matchApplying}
          onClick={() => void previewExactMatches()}
        >
          {matchLoading ? "PREVIEWING…" : "PREVIEW EXACT MATCHES"}
        </button>
        {matchPreview && <button
          type="button"
          className="button button-blue"
          disabled={matchApplying || matchPreview.matches.length === 0}
          onClick={() => void applyExactMatches()}
        >
          {matchApplying ? "SYNCHRONIZING…" : `APPLY ${matchPreview.matches.length} EXACT MATCHES`}
        </button>}
      </div>
      {!catalogs && <p className="qb-mapping-empty">Load QuickBooks lists before creating a match preview.</p>}
      {matchError && <p className="login-error" role="alert">{matchError}</p>}
      {matchNotice && <p className="qb-mapping-success" role="status">{matchNotice}</p>}
      {matchPreview && <>
        <div className="qb-auto-match-summary">
          {([
            ["Products matched", matchPreview.products.matched],
            ["Customers matched", matchPreview.customers.matched],
            ["Ambiguous", matchPreview.products.ambiguous + matchPreview.customers.ambiguous],
            ["Conflicts", matchPreview.products.conflicts + matchPreview.customers.conflicts],
            ["Unmatched", matchPreview.products.unmatched + matchPreview.customers.unmatched],
            ["Unavailable", matchPreview.products.unavailable + matchPreview.customers.unavailable],
          ] as const).map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}
        </div>
        {(matchPreview.truncated.items || matchPreview.truncated.customers) && <p className="qb-mapping-warning" role="status">
          {[
            matchPreview.truncated.items ? "The QuickBooks item list is truncated; unlinked products were not auto-matched." : "",
            matchPreview.truncated.customers ? "The QuickBooks customer list is truncated; unlinked customers were not auto-matched." : "",
          ].filter(Boolean).join(" ")}
        </p>}
        <div className="qb-auto-match-table-wrap">
          <table className="qb-catalog-table">
            <thead><tr><th>POS record</th><th>QuickBooks record</th><th>Matched by</th><th>POS value to sync</th><th>Link status</th></tr></thead>
            <tbody>
              {matchPreview.matches.length === 0
                ? <tr><td className="qb-catalog-empty" colSpan={5}>No exact matches are ready to apply.</td></tr>
                : matchPreview.matches.map(match => <tr key={`${match.kind}:${match.posId}`}>
                  <td>{match.posName}{match.kind === "product" && match.posSku ? <small>{match.posSku}</small> : null}</td>
                  <td>{match.quickBooksName}<small>{match.quickBooksListId}</small></td>
                  <td>{match.matchBy}</td>
                  <td>{match.kind === "product" ? `Name and RWF ${typeof match.posPrice === "number" ? match.posPrice.toLocaleString("en-US") : "—"} price` : "Name and contact details"}</td>
                  <td>{match.alreadyLinked ? "Already linked" : "Will link"}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </>}
    </section>
    {catalogs && <section className="qb-catalog-browser" aria-label="QuickBooks active lists">
      <div className="qb-catalog-heading">
        <div><h4>Active QuickBooks lists</h4><p>Browse each loaded list. Search, sort, and change pages to find records quickly.</p></div>
      </div>
      <div className="qb-catalog-tabs" role="tablist" aria-label="QuickBooks list categories">
        {catalogListDefinitions.map(list => <button
          key={list.key}
          id={`qb-catalog-tab-${list.key}`}
          type="button"
          role="tab"
          aria-selected={activeCatalogList === list.key}
          aria-controls="qb-catalog-panel"
          onClick={() => {
            setActiveCatalogList(list.key);
            setCatalogSearch("");
            setCatalogPage(1);
          }}
        >
          {list.label} <span>{catalogs[list.key].length}</span>
        </button>)}
      </div>
      <div
        className="qb-catalog-panel"
        id="qb-catalog-panel"
        role="tabpanel"
        aria-labelledby={`qb-catalog-tab-${activeCatalogList}`}
      >
        <div className="qb-catalog-toolbar">
          <label>
            <span>Search {catalogListDefinitions.find(list => list.key === activeCatalogList)?.label}</span>
            <input
              type="search"
              aria-label={`Search ${activeCatalogList}`}
              placeholder="Search name or List ID"
              value={catalogSearch}
              onChange={event => {
                setCatalogSearch(event.target.value);
                setCatalogPage(1);
              }}
            />
          </label>
          <label>
            <span>Sort by</span>
            <select
              aria-label="Sort QuickBooks list"
              value={catalogSort}
              onChange={event => {
                setCatalogSort(event.target.value as CatalogSort);
                setCatalogPage(1);
              }}
            >
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="type-asc">Type</option>
            </select>
          </label>
          <label>
            <span>Rows</span>
            <select
              aria-label="QuickBooks rows per page"
              value={catalogPageSize}
              onChange={event => {
                setCatalogPageSize(Number(event.target.value));
                setCatalogPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>
        <div className="qb-catalog-table-wrap">
          <table className="qb-catalog-table">
            <thead><tr>{catalogColumns[activeCatalogList].map(column => <th key={column.label}>{column.label}</th>)}</tr></thead>
            <tbody>
              {visibleCatalogEntries.length === 0
                ? <tr><td className="qb-catalog-empty" colSpan={catalogColumns[activeCatalogList].length}>
                  {catalogSearch ? "No records match this search." : `No active ${catalogListDefinitions.find(list => list.key === activeCatalogList)?.label.toLowerCase()} were returned.`}
                </td></tr>
                : visibleCatalogEntries.map(entry => <tr key={entry.listId}>
                  {catalogColumns[activeCatalogList].map(column => <td key={column.label}>{column.value(entry)}</td>)}
                </tr>)}
            </tbody>
          </table>
        </div>
        <div className="qb-catalog-pagination">
          <span>
            {filteredCatalogEntries.length === 0
              ? "0 records"
              : `${(catalogPage - 1) * catalogPageSize + 1}–${Math.min(catalogPage * catalogPageSize, filteredCatalogEntries.length)} of ${filteredCatalogEntries.length}`}
          </span>
          <div>
            <button type="button" className="button button-outline" disabled={catalogPage <= 1} onClick={() => setCatalogPage(page => page - 1)}>Previous</button>
            <span>Page {catalogPage} of {catalogPages}</span>
            <button type="button" className="button button-outline" disabled={catalogPage >= catalogPages} onClick={() => setCatalogPage(page => page + 1)}>Next</button>
          </div>
        </div>
      </div>
    </section>}

    <div className="qb-mapping-grid">
      <section className="qb-mapping-section">
        <div className="admin-panel-heading"><div><h4>Product items</h4><p>Map POS products to QuickBooks inventory or assembly items so names and prices can sync safely. Stock quantities remain read-only.</p></div></div>
        <form className="qb-mapping-search" onSubmit={event => {
          event.preventDefault();
          loadProductPage(1, productSearchDraft);
          setProductSearch(productSearchDraft);
        }}>
          <input aria-label="Search POS products" placeholder="Search product name or SKU" value={productSearchDraft} onChange={event => setProductSearchDraft(event.target.value)} />
          <button type="submit" className="button button-outline" disabled={productsLoading}>Search</button>
        </form>
        <div className="qb-mapping-rows">
          {products.data.map(product => {
            const saving = mappingSaving === `product:${product._id}`;
            const selectedListId = productDrafts[product._id] || "";
            const selectedExists = salesItems.some(item => item.listId === selectedListId);
            return <div className="qb-mapping-row" key={product._id}>
              <div><strong>{product.name}</strong><small>{product.sku}</small></div>
              <select aria-label={`QuickBooks item for ${product.name}`} disabled={!catalogs || saving} value={selectedListId} onChange={event => setProductDrafts(current => ({ ...current, [product._id]: event.target.value }))}>
                <option value="">Not mapped</option>
                {selectedListId && !selectedExists && <option value={selectedListId}>Unavailable item · {selectedListId}</option>}
                {salesItems.map(item => <option value={item.listId} key={item.listId}>{optionLabel(item)} · {item.type.replaceAll("_", " ")}</option>)}
              </select>
              <button type="button" className="button button-outline" disabled={!catalogs || saving || selectedListId === (product.quickBooksItemListId || "")} onClick={() => saveProductMapping(product)}>
                {saving ? "SAVING…" : "SAVE"}
              </button>
            </div>;
          })}
          {products.data.length === 0 && <p className="qb-mapping-empty">{productsLoading ? "Loading products…" : "No products found."}</p>}
        </div>
        <div className="qb-mapping-pagination">
          <span>{products.count} active products · page {products.page} of {productPages}</span>
          <div>
            <button type="button" className="button button-outline" disabled={productsLoading || products.page <= 1} onClick={() => loadProductPage(products.page - 1, productSearch)}>Previous</button>
            <button type="button" className="button button-outline" disabled={productsLoading || products.page >= productPages} onClick={() => loadProductPage(products.page + 1, productSearch)}>Next</button>
          </div>
        </div>
      </section>

      <section className="qb-mapping-section">
        <div className="admin-panel-heading"><div><h4>Customer records</h4><p>Match POS customers to active QuickBooks customers.</p></div></div>
        <form className="qb-mapping-search" onSubmit={event => {
          event.preventDefault();
          loadCustomerPage(1, customerSearchDraft);
          setCustomerSearch(customerSearchDraft);
        }}>
          <input aria-label="Search POS customers" placeholder="Search customer name" value={customerSearchDraft} onChange={event => setCustomerSearchDraft(event.target.value)} />
          <button type="submit" className="button button-outline" disabled={customersLoading}>Search</button>
        </form>
        <div className="qb-mapping-rows">
          {customers.data.map(customer => {
            const saving = mappingSaving === `customer:${customer._id}`;
            const selectedListId = customerDrafts[customer._id] || "";
            const selectedExists = catalogs?.customers.some(item => item.listId === selectedListId) || false;
            return <div className="qb-mapping-row" key={customer._id}>
              <div><strong>{customer.name}</strong><small>POS customer</small></div>
              <select aria-label={`QuickBooks customer for ${customer.name}`} disabled={!catalogs || saving} value={selectedListId} onChange={event => setCustomerDrafts(current => ({ ...current, [customer._id]: event.target.value }))}>
                <option value="">Not mapped</option>
                {selectedListId && !selectedExists && <option value={selectedListId}>Unavailable customer · {selectedListId}</option>}
                {catalogs?.customers.map(item => <option value={item.listId} key={item.listId}>{optionLabel(item)}</option>)}
              </select>
              <button type="button" className="button button-outline" disabled={!catalogs || saving || selectedListId === (customer.quickBooksListId || "")} onClick={() => saveCustomerMapping(customer)}>
                {saving ? "SAVING…" : "SAVE"}
              </button>
            </div>;
          })}
          {customers.data.length === 0 && <p className="qb-mapping-empty">{customersLoading ? "Loading customers…" : "No customers found."}</p>}
        </div>
        <div className="qb-mapping-pagination">
          <span>{customers.count} customers · page {customers.page} of {customerPages}</span>
          <div>
            <button type="button" className="button button-outline" disabled={customersLoading || customers.page <= 1} onClick={() => loadCustomerPage(customers.page - 1, customerSearch)}>Previous</button>
            <button type="button" className="button button-outline" disabled={customersLoading || customers.page >= customerPages} onClick={() => loadCustomerPage(customers.page + 1, customerSearch)}>Next</button>
          </div>
        </div>
      </section>
    </div>
    {mappingError && <p className="login-error" role="alert">{mappingError}</p>}
    {mappingNotice && <p className="qb-mapping-success" role="status">{mappingNotice}</p>}

    <form className="qb-mapping-config" onSubmit={saveConfiguration}>
      <div className="admin-panel-heading"><div><h4>Tax and payment mappings</h4><p>These are saved for future validation only; transaction writes remain disabled.</p></div></div>
      {configError && <p className="login-error" role="alert">{configError}</p>}
      {configNotice && <p className="qb-mapping-success" role="status">{configNotice}</p>}

      <section>
        <div className="qb-mapping-subheading">
          <div><strong>POS tax rates</strong><small>Map each distinct POS rate to a QuickBooks tax code and, when applicable, a sales-tax item.</small></div>
          <button type="button" className="button button-outline" disabled={!catalogs} onClick={() => setConfig(current => ({
            ...current,
            taxRateMappings: [...current.taxRateMappings, {
              posTaxRate: 0,
              quickBooksSalesTaxCodeListId: "",
              quickBooksSalesTaxItemListId: null,
            }],
          }))}>ADD TAX RATE</button>
        </div>
        {config.taxRateMappings.map((mapping, index) => <div className="qb-tax-mapping-row" key={index}>
          <label><span>POS rate (%)</span><input type="number" min={0} max={100} step={0.01} required value={mapping.posTaxRate} onChange={event => updateTaxMapping(index, { posTaxRate: Number(event.target.value) })} /></label>
          <label><span>QuickBooks tax code</span><select required disabled={!catalogs} value={mapping.quickBooksSalesTaxCodeListId} onChange={event => updateTaxMapping(index, { quickBooksSalesTaxCodeListId: event.target.value })}>
            <option value="">Select tax code</option>
            {mapping.quickBooksSalesTaxCodeListId &&
              !catalogs?.salesTaxCodes.some(item => item.listId === mapping.quickBooksSalesTaxCodeListId) &&
              <option value={mapping.quickBooksSalesTaxCodeListId}>Unavailable tax code · {mapping.quickBooksSalesTaxCodeListId}</option>}
            {catalogs?.salesTaxCodes.map(item => <option value={item.listId} key={item.listId}>{optionLabel(item)}{item.isTaxable === false ? " · non-taxable" : ""}</option>)}
          </select></label>
          <label><span>QuickBooks sales-tax item</span><select disabled={!catalogs} value={mapping.quickBooksSalesTaxItemListId || ""} onChange={event => updateTaxMapping(index, { quickBooksSalesTaxItemListId: event.target.value || null })}>
            <option value="">Not selected</option>
            {mapping.quickBooksSalesTaxItemListId &&
              !catalogs?.salesTaxItems.some(item => item.listId === mapping.quickBooksSalesTaxItemListId) &&
              <option value={mapping.quickBooksSalesTaxItemListId}>Unavailable tax item · {mapping.quickBooksSalesTaxItemListId}</option>}
            {catalogs?.salesTaxItems.map(item => <option value={item.listId} key={item.listId}>{optionLabel(item)}{item.taxRate === null ? "" : ` · ${item.taxRate}%`}</option>)}
          </select></label>
          <button type="button" className="button button-outline" aria-label={`Remove tax rate mapping ${mapping.posTaxRate}%`} onClick={() => setConfig(current => ({
            ...current,
            taxRateMappings: current.taxRateMappings.filter((_, mappingIndex) => mappingIndex !== index),
          }))}>REMOVE</button>
        </div>)}
        {config.taxRateMappings.length === 0 && <p className="qb-mapping-empty">No tax mappings configured.</p>}
      </section>

      <section>
        <div className="qb-mapping-subheading">
          <div><strong>Payment methods</strong><small>Each POS payment method needs a QuickBooks payment method and deposit account.</small></div>
          <button type="button" className="button button-outline" disabled={!catalogs || config.paymentMethodMappings.length >= methods.length} onClick={() => {
            const nextMethod = methods.find(method => !config.paymentMethodMappings.some(mapping => mapping.posPaymentMethod === method));
            if (nextMethod) {
              setConfig(current => ({
                ...current,
                paymentMethodMappings: [...current.paymentMethodMappings, {
                  posPaymentMethod: nextMethod,
                  quickBooksPaymentMethodListId: "",
                  quickBooksDepositAccountListId: "",
                }],
              }));
            }
          }}>ADD PAYMENT METHOD</button>
        </div>
        {config.paymentMethodMappings.map((mapping, index) => <div className="qb-payment-mapping-row" key={index}>
          <label><span>POS method</span><select value={mapping.posPaymentMethod} onChange={event => updatePaymentMapping(index, { posPaymentMethod: event.target.value as PaymentMapping["posPaymentMethod"] })}>
            {methods.map(method => <option value={method} key={method} disabled={config.paymentMethodMappings.some((entry, entryIndex) => entryIndex !== index && entry.posPaymentMethod === method)}>{methodLabels[method]}</option>)}
          </select></label>
          <label><span>QuickBooks payment method</span><select required disabled={!catalogs} value={mapping.quickBooksPaymentMethodListId} onChange={event => updatePaymentMapping(index, { quickBooksPaymentMethodListId: event.target.value })}>
            <option value="">Select payment method</option>
            {mapping.quickBooksPaymentMethodListId &&
              !catalogs?.paymentMethods.some(item => item.listId === mapping.quickBooksPaymentMethodListId) &&
              <option value={mapping.quickBooksPaymentMethodListId}>Unavailable payment method · {mapping.quickBooksPaymentMethodListId}</option>}
            {catalogs?.paymentMethods.map(item => <option value={item.listId} key={item.listId}>{optionLabel(item)}</option>)}
          </select></label>
          <label><span>Deposit account</span><select required disabled={!catalogs} value={mapping.quickBooksDepositAccountListId} onChange={event => updatePaymentMapping(index, { quickBooksDepositAccountListId: event.target.value })}>
            <option value="">Select deposit account</option>
            {mapping.quickBooksDepositAccountListId &&
              !depositAccounts.some(item => item.listId === mapping.quickBooksDepositAccountListId) &&
              <option value={mapping.quickBooksDepositAccountListId}>Unavailable account · {mapping.quickBooksDepositAccountListId}</option>}
            {depositAccounts.map(item => <option value={item.listId} key={item.listId}>{optionLabel(item)} · {item.type.replace(/^at/, "")}</option>)}
          </select></label>
          <button type="button" className="button button-outline" aria-label={`Remove ${methodLabels[mapping.posPaymentMethod]} payment mapping`} onClick={() => setConfig(current => ({
            ...current,
            paymentMethodMappings: current.paymentMethodMappings.filter((_, mappingIndex) => mappingIndex !== index),
          }))}>REMOVE</button>
        </div>)}
        {config.paymentMethodMappings.length === 0 && <p className="qb-mapping-empty">No payment mappings configured.</p>}
      </section>

      <section className="qb-ar-mapping">
        <label><span>Accounts receivable account for future credit invoices</span><select disabled={!catalogs} value={config.accountsReceivableAccountListId || ""} onChange={event => setConfig(current => ({
          ...current,
          accountsReceivableAccountListId: event.target.value || null,
        }))}>
          <option value="">Not selected</option>
          {config.accountsReceivableAccountListId &&
            !receivableAccounts.some(account => account.listId === config.accountsReceivableAccountListId) &&
            <option value={config.accountsReceivableAccountListId}>Unavailable account · {config.accountsReceivableAccountListId}</option>}
          {receivableAccounts.map(item => <option value={item.listId} key={item.listId}>{optionLabel(item)}</option>)}
        </select></label>
      </section>
      <button className="button button-blue" type="submit" disabled={configLoading || configSaving || !catalogs}>
        {configSaving ? "SAVING…" : "SAVE TAX AND PAYMENT MAPPINGS"}
      </button>
      {configLoading && <p className="qb-mapping-empty">Loading saved mapping configuration…</p>}
    </form>
  </section>;
}
