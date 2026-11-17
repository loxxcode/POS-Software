"use client";

import { useEffect, useMemo, useState } from "react";

type Role = "cashier" | "accountant" | "daf" | "administration";
type Product = {
  id: string;
  code: string;
  name: string;
  barcode: string;
  unit: string;
  price: number;
  vat: number | null;
  quantity: number;
};
type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  tin: string;
  address: string;
};
type Discount = {
  id: string;
  product: string;
  reason: string;
  percent: number;
  start: string;
  end: string;
};
type ProformaItem = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: string;
  discountId: string | null;
  discountPercent: number;
  discountAmount: string;
  taxRate: number | null;
  taxAmount: string;
  lineTotal: string;
};
type Proforma = {
  _id: string;
  proformaNumber: string;
  revisionNumber: number;
  latestRevision: boolean;
  status: "draft" | "issued" | "accepted" | "rejected" | "converted" | "expired" | "cancelled" | "revised";
  approvalStatus: "not_required" | "pending" | "approved" | "rejected";
  customer: string | null;
  customerSnapshot: Customer;
  items: ProformaItem[];
  subtotal: string;
  discountTotal: string;
  manualDiscountPercent: number;
  taxTotal: string;
  otherCharges: string;
  grandTotal: string;
  taxTreatment: "unconfigured" | "exclusive" | "inclusive";
  validUntil: string;
  issueDate: string | null;
  notes: string;
  terms: string;
  createdByEmail: string;
  createdAt: string;
};
type SaleApiDocument = {
  _id: string;
  receiptNumber: string;
  proformaNumber?: string | null;
};
type ProformaWorkspaceProps = {
  role: Role;
  email: string;
  products: Product[];
  customers: Customer[];
  discounts: Discount[];
  taxTreatment: "unconfigured" | "exclusive" | "inclusive";
  onConverted: (sale: SaleApiDocument) => void;
  onInventoryRefresh: () => Promise<void>;
};
type DraftForm = {
  id?: string;
  customerId: string;
  customerName: string;
  address: string;
  email: string;
  phone: string;
  tin: string;
  items: { productId: string; quantity: number }[];
  discountId: string;
  manualDiscountPercent: string;
  validUntil: string;
  notes: string;
  terms: string;
};
type ApiErrorDetails = { priceChanges?: { name: string; previousUnitPrice?: string; currentUnitPrice?: string }[] };

class ProformaApiError extends Error {
  status: number;
  details?: ApiErrorDetails;

  constructor(message: string, status: number, details?: ApiErrorDetails) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000").replace(/\/$/, "");
const dateOnly = (value: string) => value.slice(0, 10);
const money = (value: string | number) => `RWF ${Number(value || 0).toLocaleString("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  let result: { success?: boolean; message?: string; data?: T; details?: ApiErrorDetails };
  try {
    result = await response.json();
  } catch {
    throw new Error("The proforma service returned an invalid response.");
  }
  if (!response.ok) {
    throw new ProformaApiError(result.message || "The proforma request failed.", response.status, result.details);
  }
  if (result.data === undefined) throw new Error("The proforma service returned no data.");
  return result.data;
}

function blankDraft(): DraftForm {
  return {
    customerId: "",
    customerName: "",
    address: "",
    email: "",
    phone: "",
    tin: "",
    items: [],
    discountId: "",
    manualDiscountPercent: "",
    validUntil: "",
    notes: "",
    terms: "",
  };
}

export default function ProformaWorkspace({
  role,
  email,
  products,
  customers,
  discounts,
  taxTreatment,
  onConverted,
  onInventoryRefresh,
}: ProformaWorkspaceProps) {
  const [documents, setDocuments] = useState<Proforma[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState<DraftForm | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20", status: statusFilter, q: query });
    fetch(`${apiBaseUrl}/api/proformas?${params}`, { credentials: "include" })
      .then(async response => {
        const result = await response.json() as { data?: Proforma[]; pages?: number; message?: string };
        if (!response.ok) throw new Error(result.message || "Unable to load proformas.");
        if (!Array.isArray(result.data)) throw new Error("The proforma list response was invalid.");
        if (active) {
          setDocuments(result.data);
          setPages(Math.max(result.pages || 1, 1));
        }
      })
      .catch(reason => {
        if (!active) return;
        setError(reason instanceof TypeError
          ? `Unable to reach the proforma API at ${apiBaseUrl}. Check that the server is running and this site's origin is allowed.`
          : reason instanceof Error ? reason.message : "Unable to load proformas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [page, query, refreshKey, statusFilter]);

  const activeDiscounts = useMemo(() => discounts.filter(discount =>
    discount.start <= new Date().toISOString().slice(0, 10) &&
    discount.end >= new Date().toISOString().slice(0, 10)
  ), [discounts]);
  const selectedCustomer = customers.find(customer => customer.id === form?.customerId);
  const matchingProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    return term
      ? products.filter(product =>
        product.quantity > 0 &&
        `${product.name} ${product.code} ${product.barcode}`.toLowerCase().includes(term)
      ).slice(0, 8)
      : [];
  }, [productSearch, products]);
  const formItems = (form?.items || []).flatMap(item => {
    const product = products.find(candidate => candidate.id === item.productId);
    return product ? [{ ...item, product }] : [];
  });
  const formSubtotal = formItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const selectedDiscount = activeDiscounts.find(discount => discount.id === form?.discountId);
  const manualDiscountRate = Number(form?.manualDiscountPercent || 0);
  const estimatedDiscount = formItems.reduce((sum, item) => {
    const discountProduct = selectedDiscount?.product.trim().toLowerCase();
    const applies = manualDiscountRate > 0 ||
      Boolean(selectedDiscount && (
        discountProduct === "all products" ||
        discountProduct === item.product.code.toLowerCase() ||
        discountProduct === item.product.name.toLowerCase()
      ));
    const rate = manualDiscountRate > 0 ? manualDiscountRate : applies ? selectedDiscount?.percent || 0 : 0;
    return sum + item.product.price * item.quantity * rate / 100;
  }, 0);
  const estimatedTotal = Math.max(0, formSubtotal - estimatedDiscount);

  function refresh() {
    setRefreshKey(current => current + 1);
  }

  function editDraft(document?: Proforma) {
    if (!document) {
      setForm(blankDraft());
      setProductSearch("");
      return;
    }
    setForm({
      id: document._id,
      customerId: document.customer || "",
      customerName: document.customerSnapshot.name,
      address: document.customerSnapshot.address || "",
      email: document.customerSnapshot.email || "",
      phone: document.customerSnapshot.phone || "",
      tin: document.customerSnapshot.tin || "",
      items: document.items.map(item => ({ productId: item.productId, quantity: item.quantity })),
      discountId: document.items.find(item => item.discountId)?.discountId || "",
      manualDiscountPercent: String(document.manualDiscountPercent || ""),
      validUntil: dateOnly(document.validUntil),
      notes: document.notes || "",
      terms: document.terms || "",
    });
    setProductSearch("");
  }

  function updateForm(key: keyof DraftForm, value: string) {
    setForm(current => current ? { ...current, [key]: value } : current);
  }

  function addProduct(productId: string) {
    if (!form || !productId) return;
    const product = products.find(item => item.id === productId);
    if (!product) return;
    setForm(current => {
      if (!current) return current;
      const existing = current.items.find(item => item.productId === product.id);
      return {
        ...current,
        items: existing
          ? current.items.map(item => item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item)
          : [...current.items, { productId: product.id, quantity: 1 }],
      };
    });
    setProductSearch("");
  }

  function updateQuantity(id: string, value: number) {
    setForm(current => current ? {
      ...current,
      items: current.items.map(item => item.productId === id ? { ...item, quantity: value } : item),
    } : current);
  }

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !form.items.length) {
      setError("Add at least one product before saving this proforma.");
      return;
    }
    if (!form.customerId && !form.customerName.trim()) {
      setError("Enter a customer name or select a saved customer.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const customer = form.customerId ? undefined : {
        name: form.customerName.trim(),
        address: form.address.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        tin: form.tin.trim(),
      };
      const payload = {
        ...(form.id ? {} : { clientRequestId: globalThis.crypto.randomUUID() }),
        customerId: form.customerId || null,
        customer,
        items: form.items,
        discountId: form.discountId || null,
        manualDiscountPercent: Number(form.manualDiscountPercent || 0),
        validUntil: form.validUntil || undefined,
        notes: form.notes,
        terms: form.terms,
      };
      const saved = await request<Proforma>(
        `/api/proformas${form.id ? `/${encodeURIComponent(form.id)}` : ""}`,
        { method: form.id ? "PATCH" : "POST", body: JSON.stringify(payload) }
      );
      setForm(null);
      setNotice(`Draft ${saved.proformaNumber} saved. Prices and tax are calculated by the server.`);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the proforma draft.");
    } finally {
      setBusy(false);
    }
  }

  async function issue(document: Proforma) {
    setBusy(true);
    setError("");
    try {
      try {
        await request<Proforma>(`/api/proformas/${encodeURIComponent(document._id)}/issue`, {
          method: "POST",
          body: JSON.stringify({ validUntil: dateOnly(document.validUntil) }),
        });
      } catch (reason) {
        if (!(reason instanceof ProformaApiError) || !reason.details?.priceChanges?.length) throw reason;
        const changes = reason.details.priceChanges
          .map(change => `${change.name}: ${money(change.previousUnitPrice || 0)} → ${money(change.currentUnitPrice || 0)}`)
          .join("\n");
        if (!window.confirm(`Prices or tax rules changed. Review these changes before issuing:\n\n${changes}\n\nIssue using the current prices?`)) return;
        await request<Proforma>(`/api/proformas/${encodeURIComponent(document._id)}/issue`, {
          method: "POST",
          body: JSON.stringify({ validUntil: dateOnly(document.validUntil), confirmPriceChanges: true }),
        });
      }
      setNotice("Proforma issued or sent for approval.");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to issue the proforma.");
    } finally {
      setBusy(false);
    }
  }

  async function postAction(document: Proforma, action: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const result = await request<Proforma>(`/api/proformas/${encodeURIComponent(document._id)}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setNotice(`${result.proformaNumber} updated.`);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Unable to ${action} this proforma.`);
    } finally {
      setBusy(false);
    }
  }

  async function convert(document: Proforma) {
    if (paymentMethod === "mobile_money") {
      setError("Mobile money conversion is unavailable until payment confirmation is connected to the server.");
      return;
    }
    if (paymentMethod !== "credit" &&
      !window.confirm(`Confirm that ${money(document.grandTotal)} was received before creating the sale invoice.`)) return;
    setBusy(true);
    setError("");
    try {
      const sale = await request<SaleApiDocument>(`/api/proformas/${encodeURIComponent(document._id)}/convert`, {
        method: "POST",
        body: JSON.stringify({
          clientRequestId: globalThis.crypto.randomUUID(),
          paymentMethod,
          paymentConfirmed: paymentMethod !== "credit",
        }),
      });
      onConverted(sale);
      setNotice(`Converted ${document.proformaNumber} to invoice ${sale.receiptNumber}.`);
      refresh();
      try {
        await onInventoryRefresh();
      } catch {
        setNotice("Sale was created, but inventory could not be refreshed.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to convert the proforma.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf(document: Proforma) {
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/proformas/${encodeURIComponent(document._id)}/pdf`, {
        credentials: "include",
      });
      if (!response.ok) {
        let message = "Unable to download the proforma PDF.";
        try {
          const result = await response.json();
          message = result.message || message;
        } catch {
          throw new Error("The proforma service returned an invalid PDF response.");
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${document.proformaNumber}-r${document.revisionNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to download the proforma PDF.");
    }
  }

  async function showHistory(document: Proforma) {
    setError("");
    try {
      const result = await request<Record<string, unknown>[]>(`/api/proformas/${encodeURIComponent(document._id)}/history`);
      setHistory(result);
      setHistoryFor(document._id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load proforma history.");
    }
  }

  async function convertRevision(document: Proforma, action: "revise" | "renew") {
    const reason = action === "revise" ? window.prompt("Why is this proforma being revised?") : "";
    if (action === "revise" && !reason?.trim()) return;
    setBusy(true);
    setError("");
    try {
      const next = await request<Proforma>(`/api/proformas/${encodeURIComponent(document._id)}/${action}`, {
        method: "POST",
        body: JSON.stringify({ ...(reason ? { reason } : {}) }),
      });
      setNotice(`Created draft revision ${next.proformaNumber}, revision ${next.revisionNumber}.`);
      refresh();
      editDraft(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : `Unable to ${action} this proforma.`);
    } finally {
      setBusy(false);
    }
  }

  return <section className="proforma-workspace">
    <div className="proforma-heading">
      <div><span className="report-eyebrow">CUSTOMER QUOTATIONS</span><h2>Proforma invoices</h2><p>Prepare, approve, issue, and convert quotations without reserving stock.</p></div>
      {(role === "cashier" || role === "administration") &&
        <button className="button button-blue" onClick={() => editDraft()}>＋ NEW PROFORMA</button>}
    </div>
    <div className="proforma-notice" role="note">
      <strong>Proforma invoice — not a payment receipt</strong>
      <span>{taxTreatment === "unconfigured"
        ? "Tax treatment is not configured. Drafts can be prepared, but issuing is blocked until tax settings and product rates are configured."
        : "Prices are recalculated and verified by the server when a proforma is issued."}</span>
    </div>
    {notice && <p className="proforma-success" role="status">{notice}</p>}
    {error && <p className="proforma-error" role="alert">{error}</p>}
    <div className="proforma-filters">
      <input aria-label="Search proformas" placeholder="Search number, customer, or creator" value={query} onChange={event => {
        setQuery(event.target.value);
        setPage(1);
      }} />
      <select aria-label="Filter proforma status" value={statusFilter} onChange={event => {
        setStatusFilter(event.target.value);
        setPage(1);
      }}>
        <option value="all">All statuses</option>
        {["draft", "issued", "accepted", "rejected", "converted", "expired", "cancelled", "revised"].map(status =>
          <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
      </select>
      <button className="button button-muted" onClick={refresh} disabled={loading || busy}>Refresh</button>
    </div>
    <div className="table-frame proforma-table">
      <table>
        <thead><tr><th>PROFORMA</th><th>CUSTOMER</th><th>TYPE</th><th>TOTAL</th><th>VALID UNTIL</th><th>STATUS</th><th>APPROVAL</th><th>ACTIONS</th></tr></thead>
        <tbody>
          {loading && <tr><td className="proforma-empty" colSpan={8}>Loading proformas…</td></tr>}
          {!loading && !documents.length && <tr><td className="proforma-empty" colSpan={8}>No proformas match this filter.</td></tr>}
          {documents.map(document => {
            const isOwner = document.createdByEmail.toLowerCase() === email.toLowerCase();
            const canManageOwn = isOwner || role === "administration";
            return <tr key={document._id}>
              <td><strong>{document.proformaNumber}</strong><small>Revision {document.revisionNumber}</small></td>
              <td>{document.customerSnapshot.name}</td>
              <td><span className="proforma-type-badge">Proforma</span></td>
              <td>{money(document.grandTotal)}</td>
              <td>{dateOnly(document.validUntil)}</td>
              <td><span className={`proforma-status status-${document.status}`}>{document.status}</span></td>
              <td>{document.approvalStatus === "pending" ? <span className="proforma-status status-pending">Pending</span> : document.approvalStatus.replaceAll("_", " ")}</td>
              <td><div className="proforma-actions">
                <button onClick={() => void downloadPdf(document)} disabled={busy}>PDF</button>
                <button onClick={() => void showHistory(document)} disabled={busy}>History</button>
                {document.status === "draft" && canManageOwn &&
                  <><button onClick={() => editDraft(document)} disabled={busy}>Edit</button>
                    {document.approvalStatus !== "pending" && (role === "cashier" || role === "administration") &&
                      <button onClick={() => void issue(document)} disabled={busy || taxTreatment === "unconfigured"}>Issue</button>}</>}
                {document.status === "draft" && document.approvalStatus === "pending" &&
                  (role === "daf" || role === "administration") &&
                  <><button onClick={() => void postAction(document, "approve")} disabled={busy}>Approve</button>
                    <button onClick={() => {
                      const reason = window.prompt("Reason for rejecting approval?");
                      if (reason?.trim()) void postAction(document, "reject-approval", { reason });
                    }} disabled={busy}>Reject approval</button></>}
                {document.status === "issued" && (role === "cashier" || role === "administration") &&
                  <><button onClick={() => void postAction(document, "accept")} disabled={busy}>Mark accepted</button>
                    <button onClick={() => void postAction(document, "reject")} disabled={busy}>Mark rejected</button></>}
                {document.status === "accepted" && (role === "cashier" || role === "administration") &&
                  <><select aria-label={`Payment method for ${document.proformaNumber}`} value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)}>
                    <option value="cash">Cash received</option><option value="card">Card received</option>
                    <option value="other">Other payment received</option><option value="credit">Customer credit</option>
                    <option value="mobile_money">Mobile money</option>
                  </select><button onClick={() => void convert(document)} disabled={busy || paymentMethod === "mobile_money"}>Convert to sale</button></>}
                {["issued", "accepted"].includes(document.status) && canManageOwn &&
                  <button onClick={() => void convertRevision(document, "revise")} disabled={busy}>Revise</button>}
                {document.status === "expired" && canManageOwn &&
                  <button onClick={() => void convertRevision(document, "renew")} disabled={busy}>Renew</button>}
                {["draft", "issued", "accepted"].includes(document.status) &&
                  ((document.status === "draft" && canManageOwn) || role === "daf" || role === "administration") &&
                  <button onClick={() => {
                    const reason = window.prompt("Reason for cancellation?") || "";
                    void postAction(document, "cancel", { reason });
                  }} disabled={busy}>Cancel</button>}
              </div></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <div className="proforma-pagination"><span>Page {page} of {pages}</span>
      <div><button className="button button-muted" disabled={page <= 1 || loading} onClick={() => setPage(current => current - 1)}>Previous</button>
        <button className="button button-muted" disabled={page >= pages || loading} onClick={() => setPage(current => current + 1)}>Next</button></div>
    </div>

    {form && <div className="proforma-editor-backdrop">
      <form className="proforma-editor" onSubmit={event => void saveDraft(event)}>
        <header><div><span className="report-eyebrow">{form.id ? "EDIT DRAFT" : "NEW DOCUMENT"}</span><h2>{form.id ? "Edit proforma draft" : "Create proforma draft"}</h2></div>
          <button type="button" className="modal-close" aria-label="Close proforma editor" onClick={() => setForm(null)}>×</button></header>
        <p>Drafts do not reserve stock. The server validates current prices, discounts, stock, and tax when issuing.</p>
        <div className="proforma-editor-grid">
          <label className="field"><span>Saved customer (optional)</span><select value={form.customerId} onChange={event => {
            const customer = customers.find(item => item.id === event.target.value);
            setForm(current => current ? {
              ...current,
              customerId: event.target.value,
              customerName: customer?.name || "",
              address: customer?.address || "",
              email: customer?.email || "",
              phone: customer?.phone || "",
              tin: customer?.tin || "",
            } : current);
          }}><option value="">Enter customer details manually</option>
            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select></label>
          <label className="field"><span>Customer name</span><input required maxLength={120} value={selectedCustomer?.name || form.customerName} readOnly={Boolean(selectedCustomer)} onChange={event => updateForm("customerName", event.target.value)} /></label>
          {!selectedCustomer && <>
            <label className="field"><span>Address</span><input maxLength={300} value={form.address} onChange={event => updateForm("address", event.target.value)} /></label>
            <label className="field"><span>Email</span><input type="email" maxLength={254} value={form.email} onChange={event => updateForm("email", event.target.value)} /></label>
            <label className="field"><span>Phone</span><input type="tel" maxLength={30} value={form.phone} onChange={event => updateForm("phone", event.target.value)} /></label>
            <label className="field"><span>TIN</span><input maxLength={50} value={form.tin} onChange={event => updateForm("tin", event.target.value)} /></label>
          </>}
          <label className="field"><span>Valid until (optional)</span><input type="date" value={form.validUntil} onChange={event => updateForm("validUntil", event.target.value)} /></label>
          <label className="field"><span>Saved discount rule (optional)</span><select value={form.discountId} onChange={event => {
            setForm(current => current ? { ...current, discountId: event.target.value, manualDiscountPercent: "" } : current);
          }}>
            <option value="">No discount</option>{activeDiscounts.map(discount =>
              <option key={discount.id} value={discount.id}>{discount.reason} · {discount.percent}% · {discount.product}</option>)}
          </select></label>
          <label className="field"><span>One-off discount (%)</span><input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={form.manualDiscountPercent} onChange={event => {
            const value = event.target.value;
            setForm(current => current ? {
              ...current,
              manualDiscountPercent: value,
              discountId: Number(value) > 0 ? "" : current.discountId,
            } : current);
          }} placeholder="0.00" /></label>
        </div>
        <div className="proforma-add-product">
          <div className="proforma-product-search">
            <input aria-label="Search proforma products" placeholder="Search product name, code, or barcode" value={productSearch} onChange={event => setProductSearch(event.target.value)} />
            {productSearch.trim() && <div className="proforma-product-results" role="listbox" aria-label="Matching products">
              {matchingProducts.length
                ? matchingProducts.map(product => <button type="button" role="option" aria-selected="false" key={product.id} onClick={() => addProduct(product.id)}>
                  <span><strong>{product.name}</strong><small>{product.code}{product.barcode ? ` · ${product.barcode}` : ""} · {product.quantity} in stock</small></span>
                  <b>{money(product.price)}</b>
                </button>)
                : <p>No in-stock products match that search.</p>}
            </div>}
          </div>
        </div>
        <div className="proforma-line-items">
          {!formItems.length && <p>Add products to start this quotation.</p>}
          {formItems.map(item => <div className="proforma-line" key={item.productId}>
            <span><strong>{item.product.name}</strong><small>{item.product.code} · {money(item.product.price)} / {item.product.unit}</small></span>
            <label>Qty <input type="number" min="1" step="1" max={item.product.quantity} value={item.quantity} onChange={event => updateQuantity(item.productId, Math.max(1, Number(event.target.value) || 1))} /></label>
            <strong>{money(item.product.price * item.quantity)}</strong>
            <button type="button" aria-label={`Remove ${item.product.name}`} onClick={() => setForm(current => current ? {
              ...current,
              items: current.items.filter(line => line.productId !== item.productId),
            } : current)}>Remove</button>
          </div>)}
        </div>
        <div className="proforma-editor-grid">
          <label className="field"><span>Payment terms</span><textarea maxLength={2000} value={form.terms} onChange={event => updateForm("terms", event.target.value)} placeholder="Payment due according to the agreed terms" /></label>
          <label className="field"><span>Notes</span><textarea maxLength={2000} value={form.notes} onChange={event => updateForm("notes", event.target.value)} /></label>
        </div>
        <div className="proforma-estimate"><span>Estimated discount: {money(estimatedDiscount)} · Total before tax: {money(estimatedTotal)}. Server calculates final values.</span><strong>{money(estimatedTotal)}</strong></div>
        {error && <p className="proforma-error" role="alert">{error}</p>}
        <footer><button type="button" className="button button-muted" onClick={() => setForm(null)}>Close</button>
          <button type="submit" className="button button-blue" disabled={busy || !form.items.length}>{busy ? "Saving…" : "Save draft"}</button></footer>
      </form>
    </div>}
    {historyFor && <div className="proforma-editor-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) setHistoryFor(null);
    }}><section className="proforma-history">
      <header><h2>Proforma history</h2><button className="modal-close" aria-label="Close history" onClick={() => setHistoryFor(null)}>×</button></header>
      {history.length ? history.map((entry, index) => <article key={`${String(entry._id || index)}`}>
        <strong>{String(entry.action || "Update").replaceAll("_", " ")}</strong>
        <span>{String(entry.actorEmail || "System")} · {entry.createdAt ? new Date(String(entry.createdAt)).toLocaleString() : ""}</span>
        {typeof entry.reason === "string" && entry.reason && <p>{entry.reason}</p>}
      </article>) : <p>No history events.</p>}
    </section></div>}
  </section>;
}
