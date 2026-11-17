"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import CameraBarcodeScanner from "./CameraBarcodeScanner";
import ProformaWorkspace from "./ProformaWorkspace";
import { buildMtnMomoPaymentPayload } from "./payment";

type Screen = "Dashboard" | "Inventory" | "Sales" | "Proformas" | "Discount" | "Customer" | "Request" | "Report" | "Users" | "Organizations" | "Transactions" | "Financial Overview" | "Audit Logs" | "Settings" | "Notifications" | "Profile" | "Chart of Accounts" | "Income" | "Expenses" | "Journal Entries" | "Invoices" | "Bank Reconciliation" | "Financial Statements" | "Transaction Review" | "Approvals" | "Budgets" | "Audit & Compliance" | "Cash Flow" | "Activity Logs";
type Role = "cashier" | "accountant" | "daf" | "administration";
type UserSession = { role: Role; name: string; email: string };
type StaffRole = Exclude<Role, "administration">;
type ManagedUser = { _id: string; email: string; role: StaffRole; createdAt: string };
type Organization = { _id: string; name: string; branch: string; manager: string; location: string; status: "active" | "monitoring" | "inactive"; createdAt: string };
type AuditEvent = { _id: string; actorEmail: string; actorRole: Role; method: string; path: string; resource: string; action: string; statusCode: number; outcome: "Success" | "Failed"; createdAt: string };
type AdminSettings = {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  shopEmail: string;
  shopTin: string;
  lowStockThreshold: number;
  proformaNumberPrefix: string;
  proformaValidityDays: number;
  taxTreatment: "unconfigured" | "exclusive" | "inclusive";
  proformaApprovalsEnabled: boolean;
  approvalValueThreshold: number | null;
  approvalDiscountPercent: number | null;
  updatedAt?: string;
};
type Product = { id: string; code: string; name: string; barcode: string; unit: string; purchase: number; margin: number; price: number; vat: number | null; category: string; origin: string; quantity: number };
type InventoryApiProduct = { _id: string; sku: string; name: string; barcode?: string; unit?: string; taxRate?: number | null; category?: string; origin?: string; stockQty: number; sellingPrice: number; costPrice?: number };
type Customer = { id: string; name: string; email: string; phone: string; tin: string; credit: number; address: string };
type Discount = { id: string; customerId: string | null; customer: string; product: string; reason: string; percent: number; start: string; end: string };
type Request = { id: string; date: string; createdAt: string; status: string; items: string; operator: string };
type CustomerApiDocument = { _id: string; name: string; email: string; phone: string; tin: string; credit: number; address: string };
type DiscountApiDocument = { _id: string; customerId: string | null; customerName: string; product: string; reason?: string; title?: string; percent?: number; start: string; end: string };
type RequestApiDocument = { _id: string; createdAt: string; status: string; items: string; operator: string };
type CustomerPayment = { id: string; createdAt: string; amount: number; paymentMethod: string; balanceBefore: number; balanceAfter: number; receivedBy: string };
type CustomerPaymentApiDocument = { _id: string; createdAt: string; amount: number; paymentMethod: string; balanceBefore: number; balanceAfter: number; receivedBy: string };
type SaleLineItem = { productId: string; sku: string; name: string; quantity: number; unitPrice: number; lineTotal: number; discountAmount?: number; taxRate?: number; taxAmount?: number };
type Sale = { id: number; receiptNumber: string; proformaNumber: string | null; date: string; customer: string; customerPhone: string; paymentMethod: string; total: number; subtotal: number; discountTotal: number; taxTotal: number; amountPaid: number; paymentStatus: string; items: number; credit: number; lineItems: SaleLineItem[] };
type SaleApiDocument = { _id: string; receiptNumber: string; proformaNumber?: string | null; createdAt: string; customerId?: string | null; customerName?: string; customerPhone?: string; paymentMethod: string; total: number; subtotal?: number; discountTotal?: number; taxTotal?: number; amountPaid?: number; balanceDue?: number; paymentStatus?: string; items: SaleLineItem[] };
type DashboardAction = (screen: Screen) => void;
const defaultAdminSettings: AdminSettings = {
  shopName: "CARITAS HQ SHOP",
  shopAddress: "",
  shopPhone: "",
  shopEmail: "",
  shopTin: "",
  lowStockThreshold: 5,
  proformaNumberPrefix: "PF",
  proformaValidityDays: 30,
  taxTreatment: "unconfigured",
  proformaApprovalsEnabled: false,
  approvalValueThreshold: null,
  approvalDiscountPercent: null,
};

type NavigationItem = { label: string; screen: Screen | "Logout"; icon: string };
const navItems: NavigationItem[] = [
  { label: "Dashboard", screen: "Dashboard", icon: "⌂" },
  { label: "Inventory", screen: "Inventory", icon: "▤" },
  { label: "Sales", screen: "Sales", icon: "▧" },
  { label: "Proformas", screen: "Proformas", icon: "▢" },
  { label: "Customer", screen: "Customer", icon: "♙" },
  { label: "Discount", screen: "Discount", icon: "%" },
  { label: "Request", screen: "Request", icon: "▣" },
  { label: "Report", screen: "Report", icon: "▥" },
  { label: "Logout", screen: "Logout", icon: "↪" },
];
const adminNavItems: NavigationItem[] = [
  { label: "Dashboard", screen: "Dashboard", icon: "⌂" },
  { label: "Financial Overview", screen: "Financial Overview", icon: "◫" },
  { label: "Users", screen: "Users", icon: "♙" },
  // { label: "Organizations", screen: "Organizations", icon: "⌂" },
  { label: "Transactions", screen: "Transactions", icon: "▧" },
  { label: "Proformas", screen: "Proformas", icon: "▢" },
  { label: "Reports", screen: "Report", icon: "▥" },
  // { label: "Audit Logs", screen: "Audit Logs", icon: "▤" },
  { label: "Settings", screen: "Settings", icon: "⚙" },
  { label: "Notifications", screen: "Notifications", icon: "♢" },
  { label: "Profile", screen: "Profile", icon: "♙" },
];
const accountantNavItems: NavigationItem[] = [
  { label: "Dashboard", screen: "Dashboard", icon: "⌂" },
  { label: "Chart of Accounts", screen: "Chart of Accounts", icon: "▤" },
  { label: "Income", screen: "Income", icon: "↗" },
  { label: "Expenses", screen: "Expenses", icon: "↘" },
  { label: "Journal Entries", screen: "Journal Entries", icon: "▧" },
  { label: "Invoices", screen: "Invoices", icon: "▣" },
  { label: "Proformas", screen: "Proformas", icon: "▢" },
  { label: "Bank Reconciliation", screen: "Bank Reconciliation", icon: "◫" },
  { label: "Financial Statements", screen: "Financial Statements", icon: "▥" },
  { label: "Reports", screen: "Report", icon: "▥" },
  { label: "Profile", screen: "Profile", icon: "♙" },
];
const dafNavItems: NavigationItem[] = [
  { label: "Dashboard", screen: "Dashboard", icon: "⌂" },
  { label: "Financial Overview", screen: "Financial Overview", icon: "◫" },
  { label: "Transaction Review", screen: "Transaction Review", icon: "▧" },
  { label: "Approvals", screen: "Approvals", icon: "✓" },
  { label: "Proformas", screen: "Proformas", icon: "▢" },
  { label: "Budgets", screen: "Budgets", icon: "▤" },
  { label: "Financial Statements", screen: "Financial Statements", icon: "▥" },
  { label: "Audit & Compliance", screen: "Audit & Compliance", icon: "▣" },
  { label: "Cash Flow", screen: "Cash Flow", icon: "↔" },
  { label: "Reports", screen: "Report", icon: "▥" },
  { label: "Activity Logs", screen: "Activity Logs", icon: "◷" },
  { label: "Profile", screen: "Profile", icon: "♙" },
];

const reportTypes = [
  "Daily Sales Summary", "Detailed Sales", "Sales by Product", "Sales by Category",
  "Stock Requests", "Inventory On Hand", "Low Stock", "Out of Stock",
];
type ReportData = {
  headers: string[];
  rows: string[][];
  metrics: { label: string; value: string; detail: string }[];
  emptyMessage: string;
};
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000").replace(/\/$/, "");
const mtnMerchantCode = "1616913";
const roleNames: Record<Role, string> = {
  cashier: "Cashier",
  accountant: "Accountant",
  daf: "DAF",
  administration: "Administration",
};
const staffRoleNames: Record<StaffRole, string> = {
  cashier: "Cashier",
  accountant: "Accountant",
  daf: "DAF",
};
const screenSubtitles: Record<Screen, string> = {
  Dashboard: "Your role-based workspace",
  Inventory: "Review products, quantities, and stock changes.",
  Sales: "Review transactions and start a checkout.",
  Proformas: "Prepare, approve, and track customer quotations.",
  Discount: "Create and review active discount rules.",
  Customer: "Manage customer details and sales activity.",
  Request: "Review and submit stock requests.",
  Report: "Preview and export sales, inventory, and request reports.",
  Users: "Manage staff accounts and assigned roles.",
  Organizations: "Organization management and account structure.",
  Transactions: "Review and manage sales transactions.",
  "Financial Overview": "Review sales totals and recorded credit.",
  "Audit Logs": "Review administrative and operational activity.",
  Settings: "Manage application preferences and configuration.",
  Notifications: "Review stock and request alerts.",
  Profile: "Review your signed-in account details.",
  "Chart of Accounts": "Review the accounting categories and account codes.",
  Income: "Review recorded sales income for the selected date.",
  Expenses: "Review and record business expenses.",
  "Journal Entries": "Review balanced entries posted to the general ledger.",
  Invoices: "Review invoices created from recorded sales.",
  "Bank Reconciliation": "Match bank statement activity against recorded transactions.",
  "Financial Statements": "Review the shop's financial position and performance.",
  "Transaction Review": "Review sales transactions recorded in this session.",
  Approvals: "Review and decide pending operational requests.",
  Budgets: "Review planned budgets and spending limits.",
  "Audit & Compliance": "Review audit evidence and compliance controls.",
  "Cash Flow": "Review cash receipts, payments, and balances.",
  "Activity Logs": "Review recorded user and system activity.",
};
const money = (value: number) => `RWF ${Math.round(value).toLocaleString("en-US")}`;
const today = () => new Date().toISOString().slice(0, 10);
const toMinorUnits = (value: number) => Math.round(value * 100);
function roundRatio(numerator: number, denominator: number) {
  return Math.round(numerator / denominator);
}
function clientTaxMinorUnits(amountMinor: number, ratePercent: number, treatment: AdminSettings["taxTreatment"]) {
  const rateBasisPoints = Math.round(ratePercent * 100);
  return treatment === "inclusive"
    ? roundRatio(amountMinor * rateBasisPoints, 10000 + rateBasisPoints)
    : roundRatio(amountMinor * rateBasisPoints, 10000);
}
function toInventoryProduct(product: InventoryApiProduct): Product {
  const purchase = product.costPrice || 0;
  return {
    id: product._id,
    code: product.sku,
    name: product.name,
    barcode: product.barcode || "—",
    unit: product.unit || "unit",
    purchase,
    margin: purchase > 0 ? Math.round(((product.sellingPrice - purchase) / purchase) * 100) : 0,
    price: product.sellingPrice,
    vat: product.taxRate ?? null,
    category: product.category || "General",
    origin: product.origin || "Local",
    quantity: product.stockQty,
  };
}
async function fetchInventoryProducts(): Promise<Product[]> {
  const response = await fetch(`${apiBaseUrl}/api/inventory`, { credentials: "include" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "Unable to load inventory.");
  if (!Array.isArray(result.data)) throw new Error("The inventory response was invalid.");
  return result.data.map(toInventoryProduct);
}
async function fetchBusinessData<T>(resource: string): Promise<T[]> {
  const response = await fetch(`${apiBaseUrl}/api/${resource}`, { credentials: "include" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || `Unable to load ${resource}.`);
  if (!Array.isArray(result.data)) throw new Error(`The ${resource} response was invalid.`);
  return result.data;
}
function toCustomer(document: CustomerApiDocument): Customer {
  return {
    id: document._id,
    name: document.name,
    email: document.email || "",
    phone: document.phone || "",
    tin: document.tin || "",
    credit: document.credit || 0,
    address: document.address || "",
  };
}
function toDiscount(document: DiscountApiDocument): Discount {
  return {
    id: document._id,
    customerId: document.customerId,
    customer: document.customerName,
    product: document.product,
    reason: document.reason || document.title || "",
    percent: document.percent || 0,
    start: document.start,
    end: document.end,
  };
}
function discountProductMatches(discount: Discount, product: Product) {
  const target = discount.product.trim().toLowerCase();
  return target === "all products" || target === product.code.toLowerCase() || target === product.name.toLowerCase();
}
function toCustomerPayment(document: CustomerPaymentApiDocument): CustomerPayment {
  return {
    id: document._id,
    createdAt: document.createdAt,
    amount: document.amount,
    paymentMethod: document.paymentMethod,
    balanceBefore: document.balanceBefore,
    balanceAfter: document.balanceAfter,
    receivedBy: document.receivedBy,
  };
}
function toRequest(document: RequestApiDocument): Request {
  const createdAt = new Date(document.createdAt);
  return {
    id: document._id,
    date: Number.isNaN(createdAt.getTime()) ? today() : createdAt.toISOString().slice(0, 10),
    createdAt: document.createdAt,
    status: document.status,
    items: document.items,
    operator: document.operator,
  };
}
function toSale(document: SaleApiDocument): Sale {
  const createdAt = new Date(document.createdAt);
  return {
    id: createdAt.getTime(),
    receiptNumber: document.receiptNumber,
    proformaNumber: document.proformaNumber || null,
    date: Number.isNaN(createdAt.getTime()) ? today() : createdAt.toISOString().slice(0, 10),
    customer: document.customerName || "Walk-in customer",
    customerPhone: document.customerPhone || "",
    paymentMethod: document.paymentMethod,
    total: document.total,
    subtotal: document.subtotal ?? document.total,
    discountTotal: document.discountTotal || 0,
    taxTotal: document.taxTotal || 0,
    amountPaid: document.amountPaid ?? document.total,
    paymentStatus: document.paymentStatus || "paid",
    items: document.items.reduce((count, item) => count + item.quantity, 0),
    credit: document.balanceDue || 0,
    lineItems: document.items,
  };
}
function isStaffRole(value: string): value is StaffRole {
  return Object.hasOwn(staffRoleNames, value);
}

export default function Home() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [authStatus, setAuthStatus] = useState<"checking" | "signed-in" | "signed-out">("checking");
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [screen, setScreen] = useState<Screen>("Dashboard");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersRefreshKey, setUsersRefreshKey] = useState(0);
  const [userQuery, setUserQuery] = useState("");
  const [userSaving, setUserSaving] = useState(false);
  const [userFormError, setUserFormError] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventorySaving, setInventorySaving] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesRefreshKey, setSalesRefreshKey] = useState(0);
  const [salesLoading, setSalesLoading] = useState(false);
  const [saleSaving, setSaleSaving] = useState(false);
  const [businessSaving, setBusinessSaving] = useState(false);
  const [saleError, setSaleError] = useState("");
  const [paymentQrOpen, setPaymentQrOpen] = useState(false);
  const [printSale, setPrintSale] = useState<Sale | null>(null);
  const [modal, setModal] = useState<"product" | "adjust" | "customer" | "discount" | "request" | "sale" | "credit-payment" | "user" | "organization" | null>(null);
  const [message, setMessage] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsRefreshKey, setOrganizationsRefreshKey] = useState(0);
  const [organizationSaving, setOrganizationSaving] = useState(false);
  const [organizationFormError, setOrganizationFormError] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditEventsLoading, setAuditEventsLoading] = useState(false);
  const [auditEventsRefreshKey, setAuditEventsRefreshKey] = useState(0);
  const [auditQuery, setAuditQuery] = useState("");
  const [auditOutcomeFilter, setAuditOutcomeFilter] = useState("All outcomes");
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(defaultAdminSettings);
  const [settingsDraft, setSettingsDraft] = useState<AdminSettings>(defaultAdminSettings);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [inventoryCategory, setInventoryCategory] = useState("Stock family");
  const [customerQuery, setCustomerQuery] = useState("");
  const [reportType, setReportType] = useState("");
  const [reportStartDate, setReportStartDate] = useState(today());
  const [reportEndDate, setReportEndDate] = useState(today());
  const [requestStatusFilter, setRequestStatusFilter] = useState("All statuses");
  const [saleDate, setSaleDate] = useState(today());
  const [selectedSaleReceipt, setSelectedSaleReceipt] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const saleRequestId = useRef<string | null>(null);
  const creditPaymentRequestId = useRef<string | null>(null);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [creditPaymentError, setCreditPaymentError] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editingProductDetails, setEditingProductDetails] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${apiBaseUrl}/api/auth/session`, { credentials: "include" })
      .then(async response => {
        if (response.ok) {
          const result = await response.json();
          if (active) {
            setSession(result.user);
            setAuthStatus("signed-in");
          }
        } else if (active) {
          setAuthStatus("signed-out");
        }
      })
      .catch(() => {
        if (active) {
          setAuthError("Unable to reach the sign-in service. Check that the POS server is running.");
          setAuthStatus("signed-out");
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (session?.role !== "administration") return;
    let active = true;
    setUsersLoading(true);
    fetch(`${apiBaseUrl}/api/admin/users`, { credentials: "include" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to load staff accounts.");
        if (active) setUsers(result.users);
      })
      .catch(error => {
        if (active) setMessage(error instanceof Error ? error.message : "Unable to load staff accounts.");
      })
      .finally(() => {
        if (active) setUsersLoading(false);
      });
    return () => { active = false; };
  }, [session?.role, usersRefreshKey]);

  useEffect(() => {
    if (session?.role !== "administration") return;
    let active = true;
    setOrganizationsLoading(true);
    fetch(`${apiBaseUrl}/api/admin/organizations`, { credentials: "include" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to load organizations.");
        if (!Array.isArray(result.data)) throw new Error("The organization response was invalid.");
        if (active) setOrganizations(result.data);
      })
      .catch(error => {
        if (active) setMessage(error instanceof Error ? error.message : "Unable to load organizations.");
      })
      .finally(() => {
        if (active) setOrganizationsLoading(false);
      });
    return () => { active = false; };
  }, [session?.role, organizationsRefreshKey]);

  useEffect(() => {
    if (session?.role !== "administration") return;
    let active = true;
    setAuditEventsLoading(true);
    fetch(`${apiBaseUrl}/api/admin/audit-logs?limit=500`, { credentials: "include" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to load audit logs.");
        if (!Array.isArray(result.data)) throw new Error("The audit log response was invalid.");
        if (active) setAuditEvents(result.data);
      })
      .catch(error => {
        if (active) setMessage(error instanceof Error ? error.message : "Unable to load audit logs.");
      })
      .finally(() => {
        if (active) setAuditEventsLoading(false);
      });
    return () => { active = false; };
  }, [session?.role, auditEventsRefreshKey]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setSettingsLoading(true);
    fetch(`${apiBaseUrl}/api/settings`, { credentials: "include" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to load application settings.");
        if (!result.data || typeof result.data.shopName !== "string" || !Number.isSafeInteger(result.data.lowStockThreshold)) {
          throw new Error("The settings response was invalid.");
        }
        if (active) {
          const loaded: AdminSettings = {
            ...defaultAdminSettings,
            ...result.data,
            approvalValueThreshold: result.data.approvalValueThreshold ?? null,
            approvalDiscountPercent: result.data.approvalDiscountPercent ?? null,
          };
          setAdminSettings(loaded);
          setSettingsDraft(loaded);
        }
      })
      .catch(error => {
        if (active) {
          const message = error instanceof Error ? error.message : "Unable to load application settings.";
          setSettingsError(message);
          setMessage(message);
        }
      })
      .finally(() => {
        if (active) setSettingsLoading(false);
      });
    return () => { active = false; };
  }, [session?.email]);

  useEffect(() => {
    if (!session) {
      setProducts([]);
      setSales([]);
      setCustomers([]);
      setDiscounts([]);
      setRequests([]);
      setInventoryError("");
      setInventoryLoading(false);
      setSalesLoading(false);
      return;
    }

    let active = true;
    setInventoryLoading(true);
    setInventoryError("");
    setProducts([]);
    fetchInventoryProducts()
      .then(data => {
        if (active) setProducts(data);
      })
      .catch(error => {
        if (active) setInventoryError(error instanceof Error ? error.message : "Unable to load inventory.");
      })
      .finally(() => {
        if (active) setInventoryLoading(false);
      });
    return () => { active = false; };
  }, [session?.email]);

  useEffect(() => {
    if (!session) return;

    let active = true;
    Promise.all([
      fetchBusinessData<CustomerApiDocument>("customers"),
      fetchBusinessData<DiscountApiDocument>("discounts"),
      fetchBusinessData<RequestApiDocument>("requests"),
    ])
      .then(([customerData, discountData, requestData]) => {
        if (!active) return;
        setCustomers(customerData.map(toCustomer));
        setDiscounts(discountData.map(toDiscount));
        setRequests(requestData.map(toRequest));
      })
      .catch(error => {
        if (active) setMessage(error instanceof Error ? error.message : "Unable to load customer, discount, and request data.");
      });
    return () => { active = false; };
  }, [session?.email]);

  useEffect(() => {
    if (!session) return;

    let active = true;
    setSalesLoading(true);
    fetch(`${apiBaseUrl}/api/sales?limit=100`, { credentials: "include" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to load invoices.");
        if (!Array.isArray(result.data)) throw new Error("The invoice response was invalid.");
        if (active) setSales(result.data.map(toSale));
      })
      .catch(error => {
        if (active) setMessage(error instanceof Error ? error.message : "Unable to load invoices.");
      })
      .finally(() => {
        if (active) setSalesLoading(false);
      });
    return () => { active = false; };
  }, [session?.email, salesRefreshKey]);

  useEffect(() => {
    if (!printSale) return;
    const clearPrintSale = () => setPrintSale(null);
    window.addEventListener("afterprint", clearPrintSale, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", clearPrintSale);
  }, [printSale]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAuthError(result.message || "Sign-in failed. Check your email and password.");
        return;
      }
      setSession(result.user);
      setAuthStatus("signed-in");
      setPassword("");
    } catch {
      setAuthError("Unable to reach the sign-in service. Check that the POS server is running.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        setMessage("Sign-out failed. Please try again.");
        return;
      }
      setSession(null);
      setAuthStatus("signed-out");
      setScreen("Dashboard");
      setMessage("");
      setAuthError("");
    } catch {
      setMessage("Unable to reach the sign-in service. You are still signed in.");
    }
  }

  async function saveUser() {
    const newEmail = form.email?.trim() || "";
    const role = form.role || "";
    const newPassword = form.password || "";
    if (
      !newEmail ||
      !isStaffRole(role) ||
      (!editingUserId && newPassword.length < 12) ||
      (newPassword.length > 0 && newPassword.length < 12)
    ) {
      setUserFormError("Enter a valid email and role. A new password must be at least 12 characters.");
      return;
    }

    setUserSaving(true);
    setUserFormError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/admin/users${editingUserId ? `/${encodeURIComponent(editingUserId)}` : ""}`, {
        method: editingUserId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, role, ...(newPassword ? { password: newPassword } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) {
        setUserFormError(result.message || `Unable to ${editingUserId ? "update" : "create"} the account.`);
        return;
      }
      setModal(null);
      setForm({});
      setEditingUserId(null);
      setMessage(`Staff account ${editingUserId ? "updated" : "created"} for ${result.user.email}.`);
      setUsersRefreshKey(current => current + 1);
    } catch {
      setUserFormError(`Unable to ${editingUserId ? "update" : "create"} the account. Please try again.`);
    } finally {
      setUserSaving(false);
    }
  }

  function openOrganizationEditor() {
    setForm({ name: "", branch: "", manager: "", location: "" });
    setOrganizationFormError("");
    setModal("organization");
    setMessage("");
  }

  async function saveOrganization() {
    const organization = {
      name: form.name?.trim() || "",
      branch: form.branch?.trim() || "",
      manager: form.manager?.trim() || "",
      location: form.location?.trim() || "",
    };
    if (!organization.name || !organization.branch || !organization.manager) {
      setOrganizationFormError("Organization name, branch, and manager are required.");
      return;
    }

    setOrganizationSaving(true);
    setOrganizationFormError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/admin/organizations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(organization),
      });
      const result = await response.json();
      if (!response.ok) {
        setOrganizationFormError(result.message || "Unable to create the organization.");
        return;
      }
      setOrganizations(current => [result.data, ...current]);
      setOrganizationsRefreshKey(current => current + 1);
      setModal(null);
      setForm({});
      setMessage(`Organization ${result.data.name} was added.`);
    } catch {
      setOrganizationFormError("Unable to reach the organization service. Please try again.");
    } finally {
      setOrganizationSaving(false);
    }
  }

  async function saveAdminSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const shopName = settingsDraft.shopName.trim();
    const lowStockThreshold = Number(settingsDraft.lowStockThreshold);
    const approvalValueThreshold = settingsDraft.approvalValueThreshold;
    const approvalDiscountPercent = settingsDraft.approvalDiscountPercent;
    if (
      !shopName ||
      !Number.isSafeInteger(lowStockThreshold) ||
      lowStockThreshold < 1 ||
      lowStockThreshold > 10000 ||
      !/^[A-Z0-9-]{1,10}$/i.test(settingsDraft.proformaNumberPrefix.trim()) ||
      !Number.isSafeInteger(settingsDraft.proformaValidityDays) ||
      settingsDraft.proformaValidityDays < 1 ||
      settingsDraft.proformaValidityDays > 365 ||
      (settingsDraft.shopEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settingsDraft.shopEmail)) ||
      (settingsDraft.shopPhone && !/^[+()\d\s-]{7,30}$/.test(settingsDraft.shopPhone)) ||
      (settingsDraft.proformaApprovalsEnabled &&
        (approvalValueThreshold === null ||
          approvalDiscountPercent === null ||
          !Number.isFinite(approvalValueThreshold) ||
          approvalValueThreshold < 0 ||
          Math.abs(approvalValueThreshold * 100 - Math.round(approvalValueThreshold * 100)) > 1e-7 ||
          !Number.isFinite(approvalDiscountPercent) ||
          approvalDiscountPercent < 0 ||
          approvalDiscountPercent > 100))
    ) {
      setSettingsError("Review shop details, proforma numbering and validity, tax treatment, and approval thresholds.");
      return;
    }

    setSettingsSaving(true);
    setSettingsError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settingsDraft,
          shopName,
          lowStockThreshold,
          proformaNumberPrefix: settingsDraft.proformaNumberPrefix.trim().toUpperCase(),
          shopAddress: settingsDraft.shopAddress.trim(),
          shopPhone: settingsDraft.shopPhone.trim(),
          shopEmail: settingsDraft.shopEmail.trim(),
          shopTin: settingsDraft.shopTin.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setSettingsError(result.message || "Unable to save application settings.");
        return;
      }
      const saved: AdminSettings = {
        ...defaultAdminSettings,
        ...result.data,
        approvalValueThreshold: result.data.approvalValueThreshold ?? null,
        approvalDiscountPercent: result.data.approvalDiscountPercent ?? null,
      };
      setAdminSettings(saved);
      setSettingsDraft(saved);
      setMessage("Application settings saved.");
    } catch {
      setSettingsError("Unable to reach the settings service. Please try again.");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function removeUser(user: ManagedUser) {
    if (user.email === session?.email) {
      setMessage("You cannot remove your own account while signed in.");
      return;
    }
    if (!window.confirm(`Remove the ${roleNames[user.role]} account for ${user.email}?`)) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/admin/users/${encodeURIComponent(user._id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.message || "Unable to remove the account.");
        return;
      }
      setMessage(result.message || "Staff account removed.");
      setUsersRefreshKey(current => current + 1);
    } catch {
      setMessage("Unable to reach the account service. Please try again.");
    }
  }

  const filteredProducts = useMemo(() => products.filter(product =>
    (inventoryCategory === "Stock family" || product.category === inventoryCategory) &&
    `${product.code} ${product.name} ${product.barcode}`.toLowerCase().includes(productQuery.toLowerCase())
  ), [inventoryCategory, products, productQuery]);
  const selectedInventoryProduct = filteredProducts.find(product => product.id === selectedProductId) || null;
  const adjustmentProduct = products.find(product => product.id === editingProduct) || null;
  const adjustmentReason = form.adjustmentReason || "correction";
  const adjustmentQuantity = form.quantity?.trim() ? Number(form.quantity) : null;
  const adjustmentChange = adjustmentProduct && adjustmentQuantity !== null
    ? adjustmentReason === "restock"
      ? adjustmentQuantity
      : adjustmentReason === "damage" || adjustmentReason === "loss"
        ? -adjustmentQuantity
        : adjustmentQuantity - adjustmentProduct.quantity
    : null;
  const adjustmentResultQuantity = adjustmentProduct && adjustmentChange !== null
    ? adjustmentProduct.quantity + adjustmentChange
    : null;
  const adjustmentReasonError = adjustmentQuantity !== null && adjustmentReason !== "correction" && adjustmentQuantity === 0
    ? "Enter a quantity greater than zero."
    : adjustmentQuantity !== null && (adjustmentReason === "damage" || adjustmentReason === "loss") && adjustmentProduct && adjustmentQuantity > adjustmentProduct.quantity
      ? "The quantity removed cannot exceed current stock."
      : "";
  const filteredCustomers = useMemo(() => customers.filter(customer =>
    `${customer.name} ${customer.email} ${customer.phone}`.toLowerCase().includes(customerQuery.toLowerCase())
  ), [customers, customerQuery]);
  const filteredUsers = useMemo(() => users.filter(user =>
    `${user.email} ${roleNames[user.role]}`.toLowerCase().includes(userQuery.toLowerCase())
  ), [users, userQuery]);
  const filteredAuditEvents = useMemo(() => auditEvents.filter(event => {
    const matchesQuery = `${event.actorEmail} ${event.action} ${event.resource} ${event.path} ${event.actorRole}`
      .toLowerCase()
      .includes(auditQuery.toLowerCase());
    const matchesOutcome = auditOutcomeFilter === "All outcomes" || event.outcome === auditOutcomeFilter;
    return matchesQuery && matchesOutcome;
  }), [auditEvents, auditOutcomeFilter, auditQuery]);
  const lowStock = products.filter(product => product.quantity > 0 && product.quantity <= adminSettings.lowStockThreshold).length;
  const outOfStock = products.filter(product => product.quantity === 0).length;
  const lowStockProducts = products.filter(product => product.quantity > 0 && product.quantity <= adminSettings.lowStockThreshold);
  const unitsInStock = products.reduce((sum, product) => sum + product.quantity, 0);
  const inventoryCostValue = products.reduce((sum, product) => sum + product.purchase * product.quantity, 0);
  const cartSubtotalMinor = products.reduce(
    (sum, product) => sum + toMinorUnits(product.price) * (cart[product.id] || 0),
    0
  );
  const activeSaleDiscounts = discounts.filter(discount =>
    discount.percent > 0 &&
    discount.start <= today() &&
    discount.end >= today() &&
    (!discount.customerId || discount.customerId === form.customerId) &&
    products.some(product => (cart[product.id] || 0) > 0 && discountProductMatches(discount, product))
  );
  const selectedSaleDiscount = activeSaleDiscounts.find(discount => discount.id === form.discountId);
  const saleDiscountMinor = selectedSaleDiscount
    ? products.reduce((total, product) => {
        const quantity = cart[product.id] || 0;
        if (!quantity || !discountProductMatches(selectedSaleDiscount, product)) return total;
        const lineTotalMinor = toMinorUnits(product.price) * quantity;
        return total + roundRatio(lineTotalMinor * Math.round(selectedSaleDiscount.percent * 100), 10000);
      }, 0)
    : 0;
  const saleTaxMinor = adminSettings.taxTreatment === "unconfigured"
    ? 0
    : products.reduce((total, product) => {
        const quantity = cart[product.id] || 0;
        if (!quantity) return total;
        const lineGrossMinor = toMinorUnits(product.price) * quantity;
        const lineDiscountMinor = selectedSaleDiscount && discountProductMatches(selectedSaleDiscount, product)
          ? roundRatio(lineGrossMinor * Math.round(selectedSaleDiscount.percent * 100), 10000)
          : 0;
        return total + clientTaxMinorUnits(
          lineGrossMinor - lineDiscountMinor,
          product.vat ?? 0,
          adminSettings.taxTreatment
        );
      }, 0);
  const cartTotal = cartSubtotalMinor / 100;
  const saleDiscountTotal = saleDiscountMinor / 100;
  const saleTaxTotal = saleTaxMinor / 100;
  const saleTotalMinor = cartSubtotalMinor - saleDiscountMinor +
    (adminSettings.taxTreatment === "exclusive" ? saleTaxMinor : 0);
  const saleTotal = saleTotalMinor / 100;
  const saleSearchTerm = (form.saleSearch || "").trim().toLowerCase();
  const saleSearchProducts = saleSearchTerm
    ? products.filter(product =>
      `${product.name} ${product.code} ${product.barcode}`.toLowerCase().includes(saleSearchTerm)
    ).slice(0, 8)
    : [];
  const saleCartProducts = products.filter(product => (cart[product.id] || 0) > 0);
  const inventoryPurchasePreview = Number(form.purchase) || 0;
  const inventoryPricePreview = Number(form.price) || 0;
  const inventoryMarginPreview = inventoryPurchasePreview > 0
    ? ((inventoryPricePreview - inventoryPurchasePreview) / inventoryPurchasePreview) * 100
    : 0;
  const mtnPayment = buildMtnMomoPaymentPayload(saleTotal, mtnMerchantCode);
  const todaysSales = sales.filter(sale => sale.date === today());
  const todaysRevenue = todaysSales.reduce((sum, sale) => sum + sale.total, 0);
  const pendingRequests = requests.filter(request => request.status === "Pending").length;
  const selectedDateSales = sales.filter(sale => sale.date === saleDate);
  const visibleSales = selectedDateSales;
  const selectedSale = visibleSales.find(sale => sale.receiptNumber === selectedSaleReceipt) || null;
  const selectedDateRevenue = selectedDateSales.reduce((sum, sale) => sum + sale.total, 0);
  const selectedDateCredit = selectedDateSales.reduce((sum, sale) => sum + sale.credit, 0);
  const averageSale = selectedDateSales.length ? selectedDateRevenue / selectedDateSales.length : 0;
  const recentSales = [...sales].sort((left, right) => right.id - left.id).slice(0, 5);
  const recentRequests = [...requests].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  ).slice(0, 5);
  const reportUsesDateRange = [
    "Daily Sales Summary", "Detailed Sales", "Sales by Product", "Sales by Category", "Stock Requests",
  ].includes(reportType);
  const reportDateRangeInvalid = reportUsesDateRange && reportStartDate > reportEndDate;
  const reportData = useMemo<ReportData | null>(() => {
    if (!reportType) return null;

    const rangedSales = sales.filter(sale => sale.date >= reportStartDate && sale.date <= reportEndDate);
    const rangedRequests = requests.filter(request => request.date >= reportStartDate && request.date <= reportEndDate);
    const unitsSold = rangedSales.reduce(
      (total, sale) => total + sale.lineItems.reduce((lineTotal, item) => lineTotal + item.quantity, 0),
      0
    );
    const revenue = rangedSales.reduce((total, sale) => total + sale.total, 0);
    const salesMetrics = [
      { label: "Transactions", value: String(rangedSales.length), detail: "Completed invoices in range" },
      { label: "Units sold", value: unitsSold.toLocaleString("en-US"), detail: "Items across all invoices" },
      { label: "Sales total", value: money(revenue), detail: "Recorded invoice value" },
    ];

    if (reportType === "Daily Sales Summary") {
      const byDate = new Map<string, { transactions: number; units: number; revenue: number }>();
      rangedSales.forEach(sale => {
        const totals = byDate.get(sale.date) || { transactions: 0, units: 0, revenue: 0 };
        totals.transactions += 1;
        totals.units += sale.items;
        totals.revenue += sale.total;
        byDate.set(sale.date, totals);
      });
      return {
        headers: ["DATE", "TRANSACTIONS", "UNITS SOLD", "REVENUE"],
        rows: [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, totals]) => [
          date, String(totals.transactions), String(totals.units), money(totals.revenue),
        ]),
        metrics: salesMetrics,
        emptyMessage: "No sales were recorded in this date range.",
      };
    }

    if (reportType === "Detailed Sales") {
      return {
        headers: ["DATE", "INVOICE", "CUSTOMER", "PRODUCT", "SKU", "QTY", "UNIT PRICE", "LINE TOTAL"],
        rows: rangedSales.flatMap(sale => sale.lineItems.map(item => [
          sale.date, sale.receiptNumber, sale.customer, item.name, item.sku,
          String(item.quantity), money(item.unitPrice), money(item.lineTotal),
        ])),
        metrics: salesMetrics,
        emptyMessage: "No sale line items were recorded in this date range.",
      };
    }

    if (reportType === "Sales by Product") {
      const byProduct = new Map<string, { name: string; sku: string; quantity: number; revenue: number }>();
      rangedSales.forEach(sale => sale.lineItems.forEach(item => {
        const totals = byProduct.get(item.productId) || {
          name: item.name, sku: item.sku, quantity: 0, revenue: 0,
        };
        totals.quantity += item.quantity;
        totals.revenue += item.lineTotal;
        byProduct.set(item.productId, totals);
      }));
      const rows = [...byProduct.values()]
        .sort((left, right) => right.revenue - left.revenue)
        .map(item => [item.sku, item.name, String(item.quantity), money(item.revenue)]);
      return {
        headers: ["SKU", "PRODUCT", "UNITS SOLD", "REVENUE"],
        rows,
        metrics: [
          { label: "Products sold", value: String(rows.length), detail: "Unique products in sales" },
          { label: "Units sold", value: unitsSold.toLocaleString("en-US"), detail: "Items across all invoices" },
          { label: "Sales total", value: money(revenue), detail: "Recorded invoice value" },
        ],
        emptyMessage: "No products were sold in this date range.",
      };
    }

    if (reportType === "Sales by Category") {
      const categories = new Map(products.map(product => [product.id, product.category]));
      const byCategory = new Map<string, { quantity: number; revenue: number }>();
      rangedSales.forEach(sale => sale.lineItems.forEach(item => {
        const category = categories.get(item.productId) || "Uncategorized";
        const totals = byCategory.get(category) || { quantity: 0, revenue: 0 };
        totals.quantity += item.quantity;
        totals.revenue += item.lineTotal;
        byCategory.set(category, totals);
      }));
      const rows = [...byCategory.entries()]
        .sort(([, left], [, right]) => right.revenue - left.revenue)
        .map(([category, totals]) => [category, String(totals.quantity), money(totals.revenue)]);
      return {
        headers: ["CATEGORY", "UNITS SOLD", "REVENUE"],
        rows,
        metrics: [
          { label: "Categories", value: String(rows.length), detail: "Categories represented in sales" },
          { label: "Units sold", value: unitsSold.toLocaleString("en-US"), detail: "Items across all invoices" },
          { label: "Sales total", value: money(revenue), detail: "Recorded invoice value" },
        ],
        emptyMessage: "No category sales were recorded in this date range.",
      };
    }

    if (reportType === "Stock Requests") {
      const pending = rangedRequests.filter(request => request.status === "Pending").length;
      const approved = rangedRequests.filter(request => request.status === "Approved").length;
      return {
        headers: ["DATE", "STATUS", "ITEMS REQUESTED", "OPERATOR"],
        rows: rangedRequests.map(request => [request.date, request.status, request.items, request.operator]),
        metrics: [
          { label: "Requests", value: String(rangedRequests.length), detail: "Submitted in date range" },
          { label: "Pending", value: String(pending), detail: "Awaiting review" },
          { label: "Approved", value: String(approved), detail: "Approved requests" },
        ],
        emptyMessage: "No stock requests were submitted in this date range.",
      };
    }

    const inventoryRows = reportType === "Low Stock"
      ? products.filter(product => product.quantity > 0 && product.quantity <= adminSettings.lowStockThreshold)
      : reportType === "Out of Stock"
        ? products.filter(product => product.quantity === 0)
        : [...products];
    const totalUnits = inventoryRows.reduce((total, product) => total + product.quantity, 0);
    const stockAtCost = inventoryRows.reduce((total, product) => total + product.purchase * product.quantity, 0);
    return {
      headers: ["SKU", "PRODUCT", "CATEGORY", "ON HAND", "UNIT PRICE", "STOCK AT COST"],
      rows: inventoryRows
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(product => [
          product.code, product.name, product.category, String(product.quantity),
          money(product.price), money(product.purchase * product.quantity),
        ]),
      metrics: [
        { label: "Products", value: String(inventoryRows.length), detail: "Matching inventory items" },
        { label: "Units on hand", value: totalUnits.toLocaleString("en-US"), detail: "Available stock quantity" },
        { label: "Stock at cost", value: money(stockAtCost), detail: "Purchase cost × quantity" },
      ],
      emptyMessage: reportType === "Low Stock"
        ? "No products are currently low on stock."
        : reportType === "Out of Stock"
          ? "No products are currently out of stock."
          : "No inventory products are available.",
    };
  }, [adminSettings.lowStockThreshold, products, reportEndDate, reportStartDate, reportType, requests, sales]);
  const filteredRequests = requests.filter(request =>
    requestStatusFilter === "All statuses" || request.status === requestStatusFilter
  );
  const dashboardSubtitle = session?.role === "cashier"
    ? "Checkout, recent transactions, and stock alerts."
    : session?.role === "accountant"
      ? "Daily sales totals and account summaries."
      : session?.role === "daf"
        ? "Shop operations, stock health, and pending requests."
        : "Administration overview and staff controls.";

  if (authStatus === "checking") {
    return <main className="auth-loading" aria-live="polite">Checking your sign-in…</main>;
  }
  if (authStatus === "signed-out") {
    return <LoginScreen
      email={email}
      password={password}
      error={authError}
      busy={authBusy}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={signIn}
    />;
  }

  function openModal(kind: typeof modal, values: Record<string, string> = {}) {
    setForm(kind === "sale" ? { paymentMethod: "mobile_money", ...values } : values);
    setEditingProductDetails(null);
    setEditingDiscountId(null);
    if (kind === "sale") {
      setSaleError("");
      setPaymentQrOpen(false);
    }
    if (kind === "user") {
      setUserFormError("");
      setEditingUserId(null);
    }
    setEditingProduct(kind === "adjust" && values.id ? values.id : null);
    if (kind === "customer") setEditingCustomer(null);
    setModal(kind);
    setMessage("");
  }

  function closeModal() {
    setModal(null);
    setEditingProduct(null);
    setEditingProductDetails(null);
    setEditingDiscountId(null);
    setInventoryError("");
  }

  function openUserEditor(user?: ManagedUser) {
    setForm(user
      ? { email: user.email, role: user.role, password: "" }
      : { email: "", role: "", password: "" });
    setEditingUserId(user?._id || null);
    setUserFormError("");
    setModal("user");
  }

  function openProductEditor(product: Product) {
    setForm({
      code: product.code,
      name: product.name,
      barcode: product.barcode === "—" ? "" : product.barcode,
      unit: product.unit,
      taxRate: product.vat === null ? "" : String(product.vat),
      purchase: String(product.purchase),
      price: String(product.price),
      category: product.category,
      origin: product.origin,
    });
    setEditingProduct(null);
    setEditingProductDetails(product.id);
    setInventoryError("");
    setModal("product");
    setMessage("");
  }

  async function saveProduct() {
    const name = form.name?.trim() || "";
    const code = form.code?.trim() || "";
    const quantity = Number(form.quantity);
    const price = Number(form.price);
    const purchase = form.purchase ? Number(form.purchase) : 0;
    const taxRate = form.taxRate?.trim() ? Number(form.taxRate) : null;
    if (editingProduct !== null) {
      const reason = form.adjustmentReason || "correction";
      if (!form.quantity?.trim() || !Number.isSafeInteger(quantity) || quantity < 0 || (reason !== "correction" && quantity === 0)) {
        setInventoryError(reason === "correction"
          ? "Enter the counted stock as a whole number greater than or equal to zero."
          : "Enter an adjustment quantity as a whole number greater than zero.");
        return;
      }
    } else if (!name || !code || (editingProductDetails === null && (!form.quantity?.trim() || !Number.isSafeInteger(quantity) || quantity < 0)) || !form.price?.trim() || !Number.isFinite(price) || price < 0 || Math.abs(price * 100 - Math.round(price * 100)) > 1e-7 || !Number.isFinite(purchase) || purchase < 0 || (taxRate !== null && (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || Math.abs(taxRate * 100 - Math.round(taxRate * 100)) > 1e-7))) {
      setInventoryError(editingProductDetails !== null
        ? "Enter a product code, name, prices with at most two decimals, and an optional tax rate from 0 to 100."
        : "Enter a product code, name, prices with at most two decimals, quantity, and optional tax rate from 0 to 100.");
      return;
    }
    setInventoryError("");
    setInventorySaving(true);
    try {
      if (editingProduct !== null) {
        const product = products.find(item => item.id === editingProduct);
        if (!product) throw new Error("Select a valid product to adjust.");
        const reason = form.adjustmentReason || "correction";
        const change = reason === "restock"
          ? quantity
          : reason === "damage" || reason === "loss"
            ? -quantity
            : quantity - product.quantity;
        if (change === 0) {
          setModal(null);
          setInventoryError("");
          setMessage("No stock change was needed.");
          return;
        }
        if (product.quantity + change < 0) {
          setInventoryError("The quantity removed cannot exceed current stock.");
          return;
        }
        const response = await fetch(`${apiBaseUrl}/api/inventory/adjust`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: editingProduct,
            change,
            expectedQuantity: product.quantity,
            reason,
            note: form.adjustmentNote?.trim() || "",
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 409) {
            setProducts(await fetchInventoryProducts());
            throw new Error(result.message || "Stock changed while you were adjusting it. Inventory has been refreshed.");
          }
          throw new Error(result.message || "Unable to adjust stock.");
        }
        setProducts(current => current.map(item => item.id === editingProduct
          ? { ...item, quantity: result.data.stockAfter }
          : item));
        setMessage(`${product.name}: stock changed by ${change > 0 ? "+" : ""}${change} and is now ${result.data.stockAfter}.`);
      } else {
        const isEditing = editingProductDetails !== null;
        const response = await fetch(`${apiBaseUrl}/api/products${isEditing ? `/${encodeURIComponent(editingProductDetails)}` : ""}`, {
          method: isEditing ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku: code,
            name,
            barcode: form.barcode?.trim() || "",
            unit: form.unit?.trim() || "unit",
            taxRate,
            category: form.category?.trim() || "General",
            origin: form.origin?.trim() || "Local",
            sellingPrice: price,
            costPrice: purchase,
            ...(!isEditing ? { stockQty: quantity } : {}),
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || `Unable to ${isEditing ? "update" : "add"} product.`);
        const savedProduct = toInventoryProduct(result.data);
        setProducts(current => (isEditing
          ? current.map(item => item.id === savedProduct.id ? savedProduct : item)
          : [...current, savedProduct]).sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedProductId(savedProduct.id);
        setMessage(isEditing ? `${savedProduct.name} updated.` : "Product added.");
      }
      setModal(null);
      setEditingProductDetails(null);
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : "Unable to save inventory changes.");
    } finally {
      setInventorySaving(false);
    }
  }

  async function saveCustomer() {
    if (!form.name?.trim()) { setMessage("Enter a customer name."); return; }
    setBusinessSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/customers${editingCustomer ? `/${encodeURIComponent(editingCustomer)}` : ""}`, {
        method: editingCustomer ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email?.trim() || "",
          phone: form.phone?.trim() || "",
          tin: form.tin?.trim() || "",
          credit: Number(form.credit) || 0,
          address: form.address?.trim() || "",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to save customer.");
      const customer = toCustomer(result.data);
      setCustomers(current => editingCustomer
        ? current.map(item => item.id === editingCustomer ? customer : item)
        : [...current, customer]);
      setEditingCustomer(null);
      setModal(null);
      setMessage(`Customer ${editingCustomer ? "updated" : "added"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save customer.");
    } finally {
      setBusinessSaving(false);
    }
  }

  async function saveDiscount() {
    if (!form.reason?.trim()) { setMessage("Enter a reason for the discount."); return; }
    const percent = Number(form.percent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      setMessage("Enter a discount percentage greater than 0 and no more than 100.");
      return;
    }
    const customer = form.customerId
      ? customers.find(item => item.id === form.customerId)
      : undefined;
    if (form.customerId && !customer) {
      setMessage("Select a customer from the customer list.");
      return;
    }
    setBusinessSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/discounts${editingDiscountId ? `/${encodeURIComponent(editingDiscountId)}` : ""}`, {
        method: editingDiscountId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer?.id || null,
          product: form.product?.trim() || "All products",
          reason: form.reason.trim(),
          percent,
          start: form.start || today(),
          end: form.end || today(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to save discount.");
      const savedDiscount = toDiscount(result.data);
      setDiscounts(current => editingDiscountId
        ? current.map(discount => discount.id === editingDiscountId ? savedDiscount : discount)
        : [savedDiscount, ...current]);
      const wasEditing = Boolean(editingDiscountId);
      setEditingDiscountId(null);
      setModal(null);
      setMessage(wasEditing ? "Discount updated." : "Discount added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save discount.");
    } finally {
      setBusinessSaving(false);
    }
  }

  function openDiscountEditor(discount: Discount) {
    openModal("discount", {
      reason: discount.reason,
      customerId: discount.customerId || "",
      product: discount.product,
      percent: String(discount.percent),
      start: discount.start,
      end: discount.end,
    });
    setEditingDiscountId(discount.id);
  }

  async function saveRequest() {
    if (!form.items?.trim()) { setMessage("Enter the requested items."); return; }
    setBusinessSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/requests`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: form.items.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to save request.");
      setRequests(current => [toRequest(result.data), ...current]);
      setModal(null);
      setMessage("Request added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save request.");
    } finally {
      setBusinessSaving(false);
    }
  }

  function selectSaleCustomer(customerId: string) {
    const customer = customers.find(item => item.id === customerId);
    setForm(current => ({
      ...current,
      customerId: customer?.id || "",
      customerName: customer?.name || "",
      customerPhone: customer?.phone || "",
      discountId: "",
    }));
  }

  async function openCreditPayment(customer: Customer) {
    setForm({ customerId: customer.id, amount: "", paymentMethod: "cash" });
    setCustomerPayments([]);
    setCreditPaymentError("");
    setPaymentHistoryLoading(true);
    setModal("credit-payment");
    setMessage("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/customers/${encodeURIComponent(customer.id)}/payments`, {
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to load payment history.");
      if (!Array.isArray(result.data)) throw new Error("The payment history response was invalid.");
      setCustomerPayments(result.data.map(toCustomerPayment));
    } catch (error) {
      setCreditPaymentError(error instanceof Error ? error.message : "Unable to load payment history.");
    } finally {
      setPaymentHistoryLoading(false);
    }
  }

  async function saveCreditPayment() {
    const customer = customers.find(item => item.id === form.customerId);
    const amount = Number(form.amount);
    if (!customer) { setCreditPaymentError("Select a valid customer to record a payment."); return; }
    if (!Number.isFinite(amount) || amount <= 0 || amount > customer.credit) {
      setCreditPaymentError("Enter a payment greater than zero and no more than the outstanding credit.");
      return;
    }

    setBusinessSaving(true);
    setCreditPaymentError("");
    try {
      const requestId = creditPaymentRequestId.current || globalThis.crypto.randomUUID();
      creditPaymentRequestId.current = requestId;
      const response = await fetch(`${apiBaseUrl}/api/customers/${encodeURIComponent(customer.id)}/payments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: requestId,
          amount,
          paymentMethod: form.paymentMethod || "cash",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to record credit payment.");
      if (!result.data?.customer || !result.data?.payment) {
        throw new Error("The server did not return the saved credit payment.");
      }

      const updatedCustomer = toCustomer(result.data.customer);
      setCustomers(current => current.map(item => item.id === updatedCustomer.id ? updatedCustomer : item));
      const savedPayment = toCustomerPayment(result.data.payment);
      setCustomerPayments(current => [savedPayment, ...current.filter(item => item.id !== savedPayment.id)]);
      if (Array.isArray(result.data.updatedSales)) {
        const updatedSales = new Map<string, Sale>(
          result.data.updatedSales.map((sale: SaleApiDocument) => {
            const mappedSale = toSale(sale);
            return [mappedSale.receiptNumber, mappedSale];
          })
        );
        setSales(current => current.map(sale => updatedSales.get(sale.receiptNumber) || sale));
      }
      creditPaymentRequestId.current = null;
      setForm(current => ({ ...current, amount: "" }));
      setMessage(`Payment of ${money(savedPayment.amount)} recorded. Remaining credit: ${money(updatedCustomer.credit)}.`);
    } catch (error) {
      setCreditPaymentError(error instanceof Error ? error.message : "Unable to record credit payment.");
    } finally {
      setBusinessSaving(false);
    }
  }

  async function removeCustomer() {
    if (!selectedCustomer) return;
    setBusinessSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/customers/${encodeURIComponent(selectedCustomer)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to remove customer.");
      setCustomers(current => current.filter(item => item.id !== selectedCustomer));
      setSelectedCustomer(null);
      setMessage(result.message || "Customer removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove customer.");
    } finally {
      setBusinessSaving(false);
    }
  }

  async function removeDiscount(discountId: string) {
    setBusinessSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/discounts/${encodeURIComponent(discountId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to remove discount.");
      setDiscounts(current => current.filter(item => item.id !== discountId));
      setMessage(result.message || "Discount removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove discount.");
    } finally {
      setBusinessSaving(false);
    }
  }

  async function decideRequest(requestId: string, status: "Approved" | "Rejected") {
    try {
      const response = await fetch(`${apiBaseUrl}/api/requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to update request.");
      const updatedRequest = toRequest(result.data);
      setRequests(current => current.map(request => request.id === requestId ? updatedRequest : request));
      setMessage(`Request ${status.toLowerCase()}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update request.");
    }
  }

  function exportReportCsv() {
    if (!reportData || reportData.rows.length === 0) return;
    const escapeCell = (value: string) => {
      const safeValue = /^[=+\-@]/.test(value.trim()) ? `'${value}` : value;
      return `"${safeValue.replaceAll('"', '""')}"`;
    };
    const csv = [reportData.headers, ...reportData.rows]
      .map(row => row.map(escapeCell).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const reportSlug = reportType.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    link.href = url;
    link.download = `${reportSlug}-${reportStartDate}-to-${reportEndDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function addSaleProductByCode(value: string) {
    const code = value.trim().toLowerCase();
    if (!code) return;
    const product = products.find(item =>
      item.code.toLowerCase() === code || item.barcode.trim().toLowerCase() === code
    );
    if (!product) {
      setSaleError(`No product found for code or barcode "${value.trim()}".`);
      return;
    }

    const quantity = cart[product.id] || 0;
    if (quantity >= product.quantity) {
      setSaleError(`${product.name} has no more stock available.`);
      return;
    }

    setCart(current => ({ ...current, [product.id]: (current[product.id] || 0) + 1 }));
    setForm(current => ({ ...current, productCode: "" }));
    setSaleError("");
  }

  function showMtnPaymentQr() {
    const itemCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
    if (!itemCount) { setSaleError("Add at least one product before requesting payment."); return; }
    if (saleTotal <= 0) { setSaleError("The invoice total must be greater than zero to request payment."); return; }
    if (form.creditSale === "true" && !customers.some(customer => customer.id === form.customerId)) {
      setSaleError("Select a saved customer for this credit sale.");
      return;
    }
    if (!form.customerName?.trim()) { setSaleError("Enter the customer name before requesting payment."); return; }
    if (!/^[+()\d\s-]{7,30}$/.test(form.customerPhone?.trim() || "")) {
      setSaleError("Enter a valid customer phone number before requesting payment.");
      return;
    }
    setSaleError("");
    setPaymentQrOpen(true);
  }

  async function finishSale() {
    const itemCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
    const isCreditSale = form.creditSale === "true";
    const selectedSaleCustomer = form.customerId
      ? customers.find(customer => customer.id === form.customerId)
      : undefined;
    const customerName = selectedSaleCustomer?.name.trim() || form.customerName?.trim() || "";
    const customerPhone = form.customerPhone?.trim() || "";
    const paymentMethod = isCreditSale ? "credit" : form.paymentMethod || "cash";
    if (!itemCount) { setSaleError("Add at least one product to the invoice."); return; }
    if ((isCreditSale || form.customerId) && !selectedSaleCustomer) {
      setSaleError("Select a valid saved customer.");
      return;
    }
    if (form.discountId && !selectedSaleDiscount) {
      setSaleError("The selected discount is no longer active or does not match this sale.");
      return;
    }
    if (!customerName) { setSaleError("Enter the customer name."); return; }
    if (
      (!isCreditSale || paymentMethod === "mobile_money" || customerPhone) &&
      !/^[+()\d\s-]{7,30}$/.test(customerPhone)
    ) {
      setSaleError("Enter a valid customer phone number.");
      return;
    }

    setSaleSaving(true);
    setSaleError("");
    try {
      const requestId = saleRequestId.current || globalThis.crypto.randomUUID();
      saleRequestId.current = requestId;
      const response = await fetch(`${apiBaseUrl}/api/sales`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: requestId,
          saleType: isCreditSale ? "credit" : "paid",
          customerId: selectedSaleCustomer?.id || null,
          customerName,
          customerPhone,
          discountId: selectedSaleDiscount?.id || null,
          paymentMethod,
          items: Object.entries(cart)
            .filter(([, quantity]) => quantity > 0)
            .map(([productId, quantity]) => ({ productId, quantity })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to save the sale.");
      if (!result.data) throw new Error("The server did not return the saved invoice.");

      const savedSale = toSale(result.data);
      setSales(current => [savedSale, ...current.filter(sale => sale.receiptNumber !== savedSale.receiptNumber)]);
      if (isCreditSale && selectedSaleCustomer) {
        setCustomers(current => current.map(customer => customer.id === selectedSaleCustomer.id
          ? { ...customer, credit: Number((customer.credit + savedSale.credit).toFixed(2)) }
          : customer));
      }
      setCart({});
      setForm({});
      setModal(null);
      setSaleError("");
      setMessage(`${isCreditSale ? "Credit sale" : "Invoice"} ${savedSale.receiptNumber} saved. Opening print dialog…`);
      setSelectedSaleReceipt(savedSale.receiptNumber);
      saleRequestId.current = null;
      setPrintSale(savedSale);

      try {
        setProducts(await fetchInventoryProducts());
      } catch (error) {
        setInventoryError(error instanceof Error ? error.message : "Sale saved, but inventory could not be refreshed.");
      }
    } catch (error) {
      setSaleError(error instanceof Error ? error.message : "Unable to save the sale. Please try again.");
    } finally {
      setSaleSaving(false);
    }
  }

  function printInvoice(sale: Sale) {
    setPrintSale(sale);
  }

  function setField(key: string, value: string) {
    setForm(current => ({ ...current, [key]: value }));
  }

  return <div className="app-window">
    <div className="app-shell">
      <aside className={`sidebar ${session?.role === "administration" ? "admin-sidebar" : session?.role === "accountant" ? "accountant-sidebar" : session?.role === "daf" ? "daf-sidebar" : ""}`}>
        <div className="shop-brand">
          <div className="crest">✥</div>
          <div><strong>{adminSettings.shopName}</strong><small>Point of Sale</small></div>
        </div>
        <nav aria-label="Main navigation">
          {(session?.role === "administration" ? adminNavItems : session?.role === "accountant" ? accountantNavItems : session?.role === "daf" ? dafNavItems : navItems).map(item => <button key={item.label} className={`nav-item ${screen === item.screen ? "selected" : ""}`} onClick={() => {
            if (item.screen === "Logout") { void signOut(); return; }
            setScreen(item.screen);
            setMessage("");
          }}>
            <span className="nav-icon">{item.icon}</span>{item.label}
          </button>)}
        </nav>
        <div className="sidebar-credit">Developed by Loxxcode</div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-heading">
            <h1>{screen === "Report" ? "Reports" : screen === "Users" ? "User Management" : screen}</h1>
            <p>{screen === "Dashboard" ? dashboardSubtitle : screenSubtitles[screen]}</p>
          </div>
          <div className="account">
            <span className="account-avatar">{session?.name.charAt(0)}</span>
            <span><strong>{session?.email}</strong><small>{session?.name}</small></span>
            <button className="account-menu" onClick={() => void signOut()} aria-label="Sign out">↪</button>
          </div>
        </header>
        {message && <div className="message" role="status">{message}<button aria-label="Dismiss message" onClick={() => setMessage("")}>×</button></div>}

        <section className="screen-content">
          {screen === "Dashboard" && session?.role === "administration" && <div className="admin-dashboard">
            <section className="admin-dashboard-hero">
              <div>
                <span>ADMINISTRATION OVERVIEW</span>
                <h2>Shop control center</h2>
                <p>Monitor staff, inventory, and today&apos;s activity from one place.</p>
              </div>
              <span className="admin-dashboard-date">{new Date().toLocaleDateString()}</span>
            </section>

            <div className="admin-stat-grid">
              <section className="admin-stat-card">
                <span>Staff accounts</span>
                <strong>{usersLoading ? "…" : users.length}</strong>
                <small>Cashier, accountant, and DAF</small>
              </section>
              <section className="admin-stat-card">
                <span>Products</span><strong>{products.length}</strong><small>In the current workspace</small>
              </section>
              <section className="admin-stat-card">
                <span>Sales today</span><strong>{money(todaysRevenue)}</strong><small>{todaysSales.length} completed in this session</small>
              </section>
              <section className="admin-stat-card">
                <span>Pending requests</span><strong>{pendingRequests}</strong><small>Awaiting review</small>
              </section>
            </div>

            <div className="admin-dashboard-grid">
              <section className="admin-dashboard-panel">
                <div className="admin-panel-heading">
                  <div><h3>Staff overview</h3><p>Accounts by role</p></div>
                  <button className="admin-text-action" onClick={() => setScreen("Users")}>Manage staff</button>
                </div>
                {(["cashier", "accountant", "daf"] as StaffRole[]).map(role => {
                  const count = users.filter(user => user.role === role).length;
                  return <div className="admin-role-row" key={role}>
                    <span className={`role-badge role-${role}`}>{staffRoleNames[role]}</span>
                    <div className="admin-role-bar"><i style={{ width: `${users.length ? (count / users.length) * 100 : 0}%` }} /></div>
                    <strong>{count}</strong>
                  </div>;
                })}
                <p className="admin-panel-note">{usersLoading ? "Loading staff accounts…" : `${users.length} non-administrator account${users.length === 1 ? "" : "s"}`}</p>
              </section>

              <section className="admin-dashboard-panel">
                <div className="admin-panel-heading">
                  <div><h3>Store health</h3><p>Inventory attention items</p></div>
                  <button className="admin-text-action" onClick={() => setScreen("Notifications")}>View alerts</button>
                </div>
                <div className="admin-health-row"><span><i className="health-dot health-warning" />Low stock</span><strong>{lowStock}</strong></div>
                <div className="admin-health-row"><span><i className="health-dot health-critical" />Out of stock</span><strong>{outOfStock}</strong></div>
                <div className="admin-health-row"><span><i className="health-dot health-neutral" />Products tracked</span><strong>{products.length}</strong></div>
              </section>
            </div>

            <section className="admin-quick-actions">
              <h3>Quick actions</h3>
              <div>
                <button onClick={() => openUserEditor()}><span>＋</span><strong>Add staff account</strong><small>Create a role-based sign-in</small></button>
                <button onClick={() => setScreen("Transactions")}><span>▧</span><strong>Review sales</strong><small>Open the transactions workspace</small></button>
                <button onClick={() => setScreen("Report")}><span>▥</span><strong>View reports</strong><small>Open the report generator</small></button>
              </div>
            </section>
          </div>}

          {screen === "Dashboard" && session?.role === "cashier" && <CashierDashboard
            products={products}
            todaySales={todaysSales}
            todayRevenue={todaysRevenue}
            lowStockProducts={lowStockProducts}
            onStartSale={() => openModal("sale")}
            onStartInvoice={() => setScreen("Proformas")}
            onOpenScreen={setScreen}
          />}
          {screen === "Dashboard" && session?.role === "accountant" && <AccountantDashboard
            saleDate={saleDate}
            sales={selectedDateSales}
            revenue={selectedDateRevenue}
            credit={selectedDateCredit}
            averageSale={averageSale}
            onDateChange={setSaleDate}
            onOpenScreen={target => setScreen(target === "Sales" ? "Income" : target)}
          />}
          {screen === "Dashboard" && session?.role === "daf" && <DafDashboard
            products={products}
            lowStockProducts={lowStockProducts}
            unitsInStock={unitsInStock}
            inventoryCostValue={inventoryCostValue}
            pendingRequests={pendingRequests}
            recentRequests={recentRequests}
            onOpenScreen={setScreen}
          />}

          {screen === "Proformas" && session && <ProformaWorkspace
            role={session.role}
            email={session.email}
            products={products}
            customers={customers}
            discounts={discounts}
            taxTreatment={adminSettings.taxTreatment}
            onConverted={() => setSalesRefreshKey(current => current + 1)}
            onInventoryRefresh={async () => setProducts(await fetchInventoryProducts())}
          />}

          {(screen === "Income" || screen === "Invoices") && session?.role === "accountant" && <AccountantSalesLedger
            title={screen}
            saleDate={saleDate}
            sales={selectedDateSales}
            onDateChange={setSaleDate}
          />}
          {screen === "Chart of Accounts" && session?.role === "accountant" && <AdminInfoPage
            workspace="ACCOUNTING"
            title="Chart of Accounts"
            description="Account codes and ledger categories are not configured in this POS prototype."
            detail="Chart of accounts is not configured"
          />}
          {screen === "Expenses" && session?.role === "accountant" && <AdminInfoPage
            workspace="ACCOUNTING"
            title="Expenses"
            description="Expense records and payment details are not connected to the application yet."
            detail="Expense tracking is not configured"
          />}
          {screen === "Journal Entries" && session?.role === "accountant" && <AdminInfoPage
            workspace="ACCOUNTING"
            title="Journal Entries"
            description="No general ledger or journal-entry records are connected to the application yet."
            detail="Journal posting is not configured"
          />}
          {screen === "Bank Reconciliation" && session?.role === "accountant" && <AdminInfoPage
            workspace="ACCOUNTING"
            title="Bank Reconciliation"
            description="Bank statements and reconciliation records are not connected to the application yet."
            detail="Bank reconciliation is not configured"
          />}
          {screen === "Financial Statements" && session?.role === "accountant" && <AdminInfoPage
            workspace="ACCOUNTING"
            title="Financial Statements"
            description="A balance sheet and income statement require configured accounts and recorded expenses."
            detail="Financial statements are not available"
          />}

          {screen === "Inventory" && <>
            <div className="inventory-toolbar">
              <select aria-label="Shop"><option>{adminSettings.shopName}</option></select>
              <select aria-label="Stock family" value={inventoryCategory} onChange={event => {
                setInventoryCategory(event.target.value);
                setSelectedProductId(null);
              }}><option>Stock family</option>{Array.from(new Set(products.map(product => product.category))).map(category => <option key={category}>{category}</option>)}</select>
              <div className="search-box"><span>⌕</span><input aria-label="Search inventory" placeholder="Search by code, name, or barcode" value={productQuery} onChange={event => {
                setProductQuery(event.target.value);
                setSelectedProductId(null);
              }} /></div>
              <button className="button button-orange" disabled={!productQuery} onClick={() => {
                setProductQuery("");
                setSelectedProductId(null);
              }}>Clear</button>
              <button className="button button-rose" disabled={!selectedInventoryProduct} onClick={() => setSelectedProductId(null)}>Clear selection</button>
              <button className="button button-muted" disabled={!selectedInventoryProduct} onClick={() => {
                if (!selectedInventoryProduct) return;
                openModal("adjust", {
                  id: selectedInventoryProduct.id,
                  name: selectedInventoryProduct.name,
                  code: selectedInventoryProduct.code,
                  price: String(selectedInventoryProduct.price),
                  quantity: String(selectedInventoryProduct.quantity),
                });
              }}>Adjust selected</button>
              <button className="button button-teal" disabled={!selectedInventoryProduct} onClick={() => {
                if (selectedInventoryProduct) openProductEditor(selectedInventoryProduct);
              }}>Edit selected</button>
              <button className="button button-blue" onClick={() => openModal("product")}>＋ ADD</button>
            </div>
            {inventoryError && <p className="inventory-error" role="alert">{inventoryError}</p>}
            <p className="hint">Select a row to edit product details or adjust its stock.</p>
            <Table headers={["CODE", "NAME", "PURCHASE C...", "MARGIN %", "SALE PRICE", "VAT", "CATEGORY", "ORIGIN", "QUANTITY"]}>
              {inventoryLoading && <tr><td colSpan={9}>Loading inventory…</td></tr>}
              {!inventoryLoading && !inventoryError && filteredProducts.length === 0 && <tr><td colSpan={9}>{products.length ? "No products match your search." : "No products in inventory yet."}</td></tr>}
              {filteredProducts.map(product => <tr
                key={product.id}
                className={`${selectedProductId === product.id ? "row-selected " : ""}inventory-row-selectable`}
                aria-selected={selectedProductId === product.id}
                tabIndex={0}
                onClick={() => setSelectedProductId(product.id)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedProductId(product.id);
                  }
                }}
              >
                <td>{product.code}</td><td>{product.name}</td><td>{money(product.purchase)}</td>
                <td>{product.margin}%</td><td>{money(product.price)}</td><td>{product.vat === null ? "Not configured" : `${product.vat}%`}</td><td>{product.category}</td><td>{product.origin}</td><td>{product.quantity}</td>
              </tr>)}
            </Table>
            <div className="table-footer"><span>Page 1 of 1</span><span>Item per page &nbsp; <select aria-label="Items per page"><option>20</option><option>50</option><option>100</option></select></span></div>
          </>}

          {(screen === "Sales" || screen === "Transactions") && <>
            <div className="sales-toolbar">
              <span className="section-label">{selectedSale ? `Selected: ${selectedSale.receiptNumber}` : screen === "Transactions" ? "Select a transaction" : "Select a sale"}</span>
              <input aria-label="Sales date" type="date" value={saleDate} onChange={event => {
                setSaleDate(event.target.value);
                setSelectedSaleReceipt(null);
              }} />
              <button className="button button-rose" disabled={!selectedSale} onClick={() => setSelectedSaleReceipt(null)}>Clear selection</button>
              <button className="button button-muted" disabled={!selectedSale} onClick={() => selectedSale && printInvoice(selectedSale)}>Print selected</button>
              <button className="button button-muted" onClick={() => setScreen("Proformas")}>Proformas</button>
              <button className="button button-blue" onClick={() => openModal("sale")}>▣ &nbsp; SELL</button>
            </div>
            <Table headers={["INVOICE", "CLIENT", "PHONE", "ITEMS", "PRICE PER ITEM", "TOTAL PRICE", "DATE", "TYPE", "PAYMENT", "OPERATOR", ""]}>
              {salesLoading && <tr><td colSpan={11}>Loading invoices…</td></tr>}
              {!salesLoading && visibleSales.length === 0 && <tr><td colSpan={11}>No invoices for this date.</td></tr>}
              {visibleSales.map(sale => <tr
                key={sale.receiptNumber}
                className={`${selectedSaleReceipt === sale.receiptNumber ? "row-selected " : ""}sale-row-selectable`}
                aria-selected={selectedSaleReceipt === sale.receiptNumber}
                tabIndex={0}
                onClick={() => setSelectedSaleReceipt(sale.receiptNumber)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedSaleReceipt(sale.receiptNumber);
                  }
                }}
              >
                <td>{sale.receiptNumber}</td>
                <td>{sale.customer}</td>
                <td>{sale.customerPhone || "—"}</td>
                <td>{sale.items}</td>
                <td>{money(sale.total / sale.items)}</td>
                <td>{money(sale.total)}</td>
                <td>{sale.date}</td>
                <td>{sale.proformaNumber ? <span className="proforma-type-badge">Proforma {sale.proformaNumber}</span> : "Sale"}</td>
                <td>{sale.paymentMethod}</td>
                <td>{session?.name}</td>
                <td><button className="table-action invoice-print-action" onClick={() => printInvoice(sale)}>Print</button></td>
              </tr>)}
            </Table>
            <div className="sales-summary"><span><i className="legend-red" /> Cancelled invoice</span><span>Proforma-linked sales are labeled in the Type column.</span><strong>Total amount: {money(sales.reduce((sum, sale) => sum + sale.total, 0))} &nbsp; | &nbsp; Total credit: RWF 0 (RWF 0 paid)</strong></div>
          </>}

          {screen === "Discount" && <>
            <div className="section-toolbar discount-toolbar"><div><span className="section-label">Discounts</span><p>Review discount rules, their reason, and validity period.</p></div><button className="button button-blue" onClick={() => openModal("discount")}>＋ ADD DISCOUNT</button></div>
            <Table className="discount-table" headers={["CUSTOMER", "PRODUCT", "REASON", "RATE", "START DATE", "END DATE", "ACTIONS"]}>
              {discounts.length
                ? discounts.map(discount => <tr key={discount.id}>
                  <td className="discount-customer-cell">{discount.customer}</td>
                  <td className="discount-product-cell">{discount.product.trim().toLowerCase() === "all products"
                    ? "All products"
                    : products.find(product => product.code.trim().toLowerCase() === discount.product.trim().toLowerCase())?.name || discount.product}</td>
                  <td className="discount-reason-cell">{discount.reason || "—"}</td>
                  <td><span className="discount-rate">{discount.percent}%</span></td>
                  <td className="discount-date-cell">{discount.start}</td>
                  <td className="discount-date-cell">{discount.end}</td>
                  <td><div className="discount-row-actions">
                    <button className="discount-update-action" disabled={businessSaving} onClick={() => openDiscountEditor(discount)}>Update</button>
                    <button className="discount-remove-action" disabled={businessSaving} onClick={() => void removeDiscount(discount.id)}>Delete</button>
                  </div></td>
                </tr>)
                : <tr><td className="discount-empty-cell" colSpan={7}>No discount rules yet. Add a discount to get started.</td></tr>}
            </Table>
          </>}

          {screen === "Customer" && <>
            <div className="customer-toolbar">
              <span className="section-label">Customers</span>
              <div className="customer-search"><span>⌕</span><input aria-label="Search customers" value={customerQuery} onChange={event => setCustomerQuery(event.target.value)} /></div>
              <span className="sort-label">Sort</span><select aria-label="Customer page size"><option>20</option><option>50</option></select>
              <button className="button button-orange" onClick={() => {
                const customer = customers.find(item => item.id === selectedCustomer);
                openModal("sale", {
                  creditSale: "true",
                  paymentMethod: "credit",
                  ...(customer ? {
                    customerId: customer.id,
                    customerName: customer.name,
                    customerPhone: customer.phone,
                  } : {}),
                });
              }}>Credit sale</button>
              <button className="button button-muted" disabled={!selectedCustomer || !customers.some(customer => customer.id === selectedCustomer && customer.credit > 0) || businessSaving} onClick={() => {
                const customer = customers.find(item => item.id === selectedCustomer);
                if (customer) void openCreditPayment(customer);
              }}>Pay credit</button>
              <button className="button button-teal" disabled={!selectedCustomer} onClick={() => {
                const customer = customers.find(item => item.id === selectedCustomer);
                if (!customer) return;
                setForm({ name: customer.name, email: customer.email, phone: customer.phone, tin: customer.tin, credit: String(customer.credit), address: customer.address });
                setEditingCustomer(customer.id);
                setModal("customer");
              }}>Edit</button>
              <button className="button button-rose" disabled={!selectedCustomer || businessSaving} onClick={() => void removeCustomer()}>Remove</button>
              <button className="button button-blue" onClick={() => openModal("customer")}>＋ ADD</button>
            </div>
            <Table headers={["NAME", "EMAIL", "PHONE", "TIN", "CREDITS RWF", "ADDRESS"]}>
              {filteredCustomers.map(customer => <tr key={customer.id} className={selectedCustomer === customer.id ? "row-selected" : ""} onClick={() => setSelectedCustomer(customer.id)}><td>{customer.name}</td><td>{customer.email || "—"}</td><td>{customer.phone || "—"}</td><td>{customer.tin || "—"}</td><td>{money(customer.credit)}</td><td>{customer.address || "—"}</td></tr>)}
            </Table>
            <div className="table-footer"><span>Page 1 of 1 (total records: {customers.length})</span></div>
          </>}

          {screen === "Request" && <>
            <div className="request-toolbar">
              <span className="section-label">Stock requests</span>
              <label className="request-status-filter">Status
                <select aria-label="Filter requests" value={requestStatusFilter} onChange={event => setRequestStatusFilter(event.target.value)}>
                  <option>All statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option>
                </select>
              </label>
              <button className="button button-blue" onClick={() => openModal("request")}>＋ NEW REQUEST</button>
            </div>
            <div className="request-summary">
              <span>{filteredRequests.length} {requestStatusFilter === "All statuses" ? "total" : requestStatusFilter.toLowerCase()} request{filteredRequests.length === 1 ? "" : "s"}</span>
              <span>{requests.filter(request => request.status === "Pending").length} awaiting review</span>
            </div>
            <Table headers={["DATE", "STATUS", "ITEMS REQUESTED", "OPERATOR"]}>
              {filteredRequests.length
                ? filteredRequests.map(request => <tr key={request.id}><td>{request.date}</td><td><span className={`request-status ${request.status.toLowerCase()}`}>{request.status}</span></td><td className="request-items-cell">{request.items}</td><td>{request.operator}</td></tr>)
                : <tr><td className="empty-cell" colSpan={4}>{requests.length ? "No requests match this status." : "No stock requests yet. Create one to start the review process."}</td></tr>}
            </Table>
            <div className="table-footer"><span>Page 1 of 1 (total records: {requests.length})</span></div>
          </>}

          {screen === "Users" && session?.role === "administration" && <>
            <div className="user-admin-header">
              <div>
                <h2>Staff accounts</h2>
                <p>Create staff sign-ins and manage their roles.</p>
              </div>
              <button className="button button-blue" onClick={() => openUserEditor()}>＋ ADD USER</button>
            </div>
            <div className="user-admin-summary">
              <div><span>Staff accounts</span><strong>{users.length}</strong></div>
              {(["cashier", "accountant", "daf"] as StaffRole[]).map(role => <div key={role}><span>{staffRoleNames[role]}</span><strong>{users.filter(user => user.role === role).length}</strong></div>)}
              <p>Administrator accounts are managed separately.</p>
            </div>
            <div className="user-admin-toolbar">
              <div className="search-box"><span>⌕</span><input aria-label="Search staff accounts" placeholder="Search by email or role" value={userQuery} onChange={event => setUserQuery(event.target.value)} /></div>
              <span>{usersLoading ? "Loading accounts…" : `${users.length} account${users.length === 1 ? "" : "s"}`}</span>
            </div>
            <Table headers={["EMAIL", "ROLE", "CREATED", "ACTIONS"]}>
              {filteredUsers.map(user => <tr key={user._id}>
                <td>{user.email}{user.email === session.email && <span className="user-you-label">You</span>}</td>
                <td><span className={`role-badge role-${user.role}`}>{roleNames[user.role]}</span></td>
                <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                <td>{user.email === session.email
                  ? <span className="user-protected-label">Current account</span>
                  : <div className="user-actions">
                    <button className="user-edit-action" onClick={() => openUserEditor(user)}>Edit</button>
                    <button className="table-action" onClick={() => void removeUser(user)}>Remove</button>
                  </div>}</td>
              </tr>)}
            </Table>
            {!usersLoading && users.length === 0 && <p className="user-admin-empty">No staff accounts were returned.</p>}
          </>}

          {screen === "Financial Overview" && session?.role === "administration" && <AccountantDashboard
            saleDate={saleDate}
            sales={selectedDateSales}
            revenue={selectedDateRevenue}
            credit={selectedDateCredit}
            averageSale={averageSale}
            eyebrow="ADMIN FINANCIAL OVERVIEW"
            onDateChange={setSaleDate}
            onOpenScreen={target => setScreen(target === "Sales" ? "Transactions" : target)}
          />}
          {screen === "Financial Overview" && session?.role === "daf" && <AccountantDashboard
            saleDate={saleDate}
            sales={selectedDateSales}
            revenue={selectedDateRevenue}
            credit={selectedDateCredit}
            averageSale={averageSale}
            eyebrow="DAF FINANCIAL OVERVIEW"
            onDateChange={setSaleDate}
            onOpenScreen={target => setScreen(target === "Sales" ? "Transaction Review" : target)}
          />}
          {screen === "Transaction Review" && session?.role === "daf" && <AccountantSalesLedger
            title="Transaction Review"
            saleDate={saleDate}
            sales={selectedDateSales}
            onDateChange={setSaleDate}
          />}
          {screen === "Approvals" && session?.role === "daf" && <DafApprovals
            requests={requests}
            onDecision={(requestId, status) => void decideRequest(requestId, status)}
          />}
          {screen === "Budgets" && session?.role === "daf" && <AdminInfoPage
            workspace="DAF WORKSPACE"
            title="Budgets"
            description="Budget plans and spending limits are not configured in this POS prototype."
            detail="Budget management is not configured"
          />}
          {screen === "Financial Statements" && session?.role === "daf" && <AdminInfoPage
            workspace="DAF WORKSPACE"
            title="Financial Statements"
            description="Complete statements require configured accounts, expenses, and reconciled payments."
            detail="Financial statements are not available"
          />}
          {screen === "Audit & Compliance" && session?.role === "daf" && <AdminInfoPage
            workspace="DAF WORKSPACE"
            title="Audit & Compliance"
            description="Audit evidence and compliance controls are not connected to this POS prototype."
            detail="Audit and compliance tracking is not configured"
          />}
          {screen === "Cash Flow" && session?.role === "daf" && <AdminInfoPage
            workspace="DAF WORKSPACE"
            title="Cash Flow"
            description="Payments, bank balances, and expenses are not recorded, so cash flow cannot be calculated."
            detail="Cash flow data is not available"
          />}
          {screen === "Activity Logs" && session?.role === "daf" && <AdminInfoPage
            workspace="DAF WORKSPACE"
            title="Activity Logs"
            description="User and system actions are not being recorded in an activity log yet."
            detail="Activity logging is not configured"
          />}
          {screen === "Organizations" && session?.role === "administration" && <OrganizationOverviewPage
            organizations={organizations}
            loading={organizationsLoading}
            onAdd={openOrganizationEditor}
          />}
          {screen === "Audit Logs" && session?.role === "administration" && <AuditLogsPage
            events={filteredAuditEvents}
            totalEvents={auditEvents.length}
            loading={auditEventsLoading}
            query={auditQuery}
            outcomeFilter={auditOutcomeFilter}
            onQueryChange={setAuditQuery}
            onOutcomeChange={setAuditOutcomeFilter}
            onRefresh={() => setAuditEventsRefreshKey(current => current + 1)}
          />}
          {screen === "Settings" && session?.role === "administration" && <AdminSettingsPage
            settings={settingsDraft}
            savedSettings={adminSettings}
            loading={settingsLoading}
            saving={settingsSaving}
            error={settingsError}
            onChange={setSettingsDraft}
            onSave={saveAdminSettings}
          />}
          {screen === "Notifications" && session?.role === "administration" && <AdminNotifications
            lowStockProducts={lowStockProducts}
            products={products}
            requests={requests}
          />}
          {screen === "Profile" && (session?.role === "administration" || session?.role === "accountant" || session?.role === "daf") && <AccountProfile
            session={session}
            onSignOut={() => void signOut()}
          />}

          {screen === "Report" && <section className="report-page">
            <header className="report-page-header">
              <div><span className="report-eyebrow">HQ SHOP · REPORTS</span><h2>Report generator</h2><p>Select a report and date range to preview saved sales, inventory, or request data.</p></div>
              <button className="button button-blue" disabled={!reportData?.rows.length || reportDateRangeInvalid} onClick={exportReportCsv}>Export CSV</button>
            </header>
            <div className="report-controls">
              <label className="field"><span>Report type</span>
                <select id="report-type" value={reportType} onChange={event => setReportType(event.target.value)}>
                  <option value="">Choose a report</option>{reportTypes.map(type => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label className="field"><span>From</span>
                <input aria-label="Report start date" type="date" value={reportStartDate} disabled={!reportUsesDateRange} aria-invalid={reportDateRangeInvalid} onChange={event => setReportStartDate(event.target.value)} />
              </label>
              <label className="field"><span>To</span>
                <input aria-label="Report end date" type="date" value={reportEndDate} disabled={!reportUsesDateRange} aria-invalid={reportDateRangeInvalid} onChange={event => setReportEndDate(event.target.value)} />
              </label>
            </div>
            {!reportType
              ? <div className="report-empty-state"><span>▤</span><strong>Choose a report to get started</strong><p>Preview and export summaries from the records available in this shop.</p></div>
              : <>
                <div className="report-result-heading"><div><h3>{reportType}</h3><span>{["Inventory On Hand", "Low Stock", "Out of Stock"].includes(reportType) ? "Current inventory snapshot" : `${reportStartDate} to ${reportEndDate}`}</span></div><span>{reportData?.rows.length || 0} rows</span></div>
                {reportDateRangeInvalid && <p className="report-range-error" role="alert">The start date must be on or before the end date.</p>}
                <div className="report-metrics">{reportData?.metrics.map(metric =>
                  <article className="report-metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>
                )}</div>
                {reportData && <Table headers={reportData.headers}>
                  {reportData.rows.length
                    ? reportData.rows.map((row, index) => <tr key={`${reportType}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}</tr>)
                    : <tr><td className="empty-cell" colSpan={reportData.headers.length}>{reportData.emptyMessage}</td></tr>}
                </Table>}
                <p className="report-data-note">Report data reflects the records currently loaded for this account.</p>
              </>}
          </section>}
        </section>

        {(session?.role === "cashier" || (session?.role === "administration" && screen === "Transactions")) && <footer className="bottom-actions">
          <button className="invoice-button" onClick={() => setScreen("Proformas")}>PROFORMA INVOICE</button>
          <button className="sale-button" onClick={() => openModal("sale")}>SALE</button>
        </footer>}
      </main>
    </div>

    {modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeModal(); }}>
      <section className={`modal ${modal === "sale" ? "modal-sale" : modal === "product" ? "modal-inventory" : modal === "adjust" ? "modal-adjust" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-heading">
        <button className="modal-close" aria-label="Close dialog" onClick={closeModal}>×</button>
        {modal === "product" && <form className="inventory-product-form" onSubmit={event => { event.preventDefault(); void saveProduct(); }}>
          <header className="form-dialog-heading"><span className="form-dialog-icon">▤</span><div>
            <span className="form-eyebrow">{editingProductDetails ? "PRODUCT DETAILS" : "INVENTORY SETUP"}</span>
            <h2 id="modal-heading">{editingProductDetails ? "Edit product" : "Add a product"}</h2>
            <p>{editingProductDetails ? "Update the catalog details and pricing." : `Add a product to ${adminSettings.shopName}.`}</p>
          </div></header>
          <section className="inventory-form-section">
            <div className="form-section-heading"><div><h3>Product identity</h3><p>Use a unique code to find this item at checkout.</p></div><span>01</span></div>
            <div className="inventory-form-grid">
              <FormField label="Product name" value={form.name || ""} onChange={value => setField("name", value)} />
              <FormField label="Product code / SKU" value={form.code || ""} onChange={value => setField("code", value)} autoComplete="off" placeholder="Enter or scan a code" />
              {/* <FormField label="Barcode (optional)" value={form.barcode || ""} onChange={value => setField("barcode", value)} autoComplete="off" placeholder="Barcode for checkout" /> */}
              
            </div>
            <small className="form-section-hint">{editingProductDetails
              ? "Product code and barcode can be scanned or typed."
              : "A barcode is optional. Product code, name, and unit are used across inventory and sales."}</small>
          </section>
          <section className="inventory-form-section">
            <div className="form-section-heading"><div><h3>Pricing and tax</h3><p>Enter values in RWF. Prices support up to two decimals.</p></div><span>02</span></div>
            <div className="inventory-form-grid inventory-pricing-grid">
              <FormField label="Purchase cost (RWF)" type="number" value={form.purchase || ""} onChange={value => setField("purchase", value)} placeholder="0.00" />
              <FormField label="Sale price (RWF)" type="number" value={form.price || ""} onChange={value => setField("price", value)} placeholder="0.00" />
              <FormField label="Tax rate (%)" type="number" value={form.taxRate || ""} onChange={value => setField("taxRate", value)} placeholder="Leave blank if unknown" />
            </div>
            <div className="inventory-preview-grid">
              <div><span>Gross margin</span><strong>{inventoryPurchasePreview > 0 ? `${inventoryMarginPreview.toFixed(1)}%` : "—"}</strong></div>
              <div><span>Tax rate</span><strong>{form.taxRate?.trim() ? `${form.taxRate}%` : "Not configured"}</strong></div>
              <div><span>Tax treatment</span><strong>{adminSettings.taxTreatment === "unconfigured" ? "Not configured" : adminSettings.taxTreatment}</strong></div>
            </div>
          </section>
          <section className="inventory-form-section">
            <div className="form-section-heading"><div><h3>Stock and organization</h3><p>Keep this product easy to locate in inventory.</p></div><span>03</span></div>
            <div className="inventory-form-grid">
              {!editingProductDetails && <FormField label="Opening quantity" type="number" value={form.quantity || ""} onChange={value => setField("quantity", value)} placeholder="0" />}
              <FormField label="Category" value={form.category || ""} onChange={value => setField("category", value)} placeholder="General" />
              <FormField label="Origin" value={form.origin || ""} onChange={value => setField("origin", value)} placeholder="Local" />
              <FormField label="Unit" value={form.unit || "unit"} onChange={value => setField("unit", value)} placeholder="e.g. each, pack, book" />
            </div>
          </section>
          {inventoryError && <p className="inventory-error" role="alert">{inventoryError}</p>}
          <footer className="form-dialog-actions">
            <button type="button" className="button button-muted" onClick={closeModal}>Cancel</button>
            <button type="submit" className="button button-blue" disabled={inventorySaving}>{inventorySaving ? "Saving…" : editingProductDetails ? "Save product changes" : "Add product"}</button>
          </footer>
        </form>}
        {modal === "adjust" && <form className="inventory-adjust-form" onSubmit={event => { event.preventDefault(); void saveProduct(); }}>
          <header className="form-dialog-heading"><span className="form-dialog-icon">↕</span><div>
            <span className="form-eyebrow">STOCK CONTROL</span><h2 id="modal-heading">Adjust inventory</h2>
            <p>Record a delivery, loss, damage, or stock count correction.</p>
          </div></header>
          {!editingProduct && <label className="field"><span>Product</span><select value={form.id || ""} onChange={event => {
            const product = products.find(item => String(item.id) === event.target.value);
            setForm(product ? {
              id: product.id,
              name: product.name,
              code: product.code,
              price: String(product.price),
              quantity: String(product.quantity),
              adjustmentReason: "correction",
              adjustmentNote: "",
            } : {});
            setEditingProduct(product?.id || null);
            setInventoryError("");
          }}><option value="">Select product</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>}
          {adjustmentProduct && <div className="adjust-stock-identity">
            <div><span>Product name</span><strong>{adjustmentProduct.name}</strong></div>
            <div><span>Product code</span><strong>{adjustmentProduct.code}</strong></div>
          </div>}
          {adjustmentProduct && <div className="adjust-stock-current"><span>Current quantity</span><strong>{adjustmentProduct.quantity}</strong></div>}
          <section className="inventory-adjust-fields"><label className="field"><span>Reason</span><select value={form.adjustmentReason || "correction"} onChange={event => {
            setField("adjustmentReason", event.target.value);
            setField("quantity", event.target.value === "correction" && adjustmentProduct ? String(adjustmentProduct.quantity) : "");
            setInventoryError("");
          }}>
            <option value="correction">Stock count correction</option>
            <option value="restock">New delivery received</option>
            <option value="damage">Damaged or expired stock</option>
            <option value="loss">Stock loss</option>
          </select></label>
          <FormField
            label={adjustmentReason === "restock" ? "Quantity received" : adjustmentReason === "damage" || adjustmentReason === "loss" ? "Quantity removed" : "Counted available quantity"}
            type="number"
            value={form.quantity || ""}
            onChange={value => setField("quantity", value)}
          />
          <TextAreaField label="Note (optional)" value={form.adjustmentNote || ""} onChange={value => setField("adjustmentNote", value)} placeholder="Add context for this adjustment" maxLength={500} />
          </section>
          {adjustmentProduct && adjustmentChange !== null && adjustmentQuantity !== null && Number.isSafeInteger(adjustmentQuantity) && adjustmentQuantity >= 0 && adjustmentResultQuantity !== null && adjustmentResultQuantity >= 0 && <p className="adjust-stock-preview">
            {adjustmentReason === "restock"
              ? `Receive ${adjustmentQuantity} unit${adjustmentQuantity === 1 ? "" : "s"}: stock increases from ${adjustmentProduct.quantity} to ${adjustmentResultQuantity}.`
              : adjustmentReason === "damage" || adjustmentReason === "loss"
                ? `Remove ${adjustmentQuantity} unit${adjustmentQuantity === 1 ? "" : "s"}: stock decreases from ${adjustmentProduct.quantity} to ${adjustmentResultQuantity}.`
                : `Stock changes by ${adjustmentChange > 0 ? "+" : ""}${adjustmentChange} to ${adjustmentResultQuantity}.`}
          </p>}
          {adjustmentReasonError && <p className="inventory-error" role="alert">{adjustmentReasonError}</p>}
          {inventoryError && <p className="inventory-error" role="alert">{inventoryError}</p>}
          <footer className="form-dialog-actions">
            <button type="button" className="button button-muted" onClick={closeModal}>Cancel</button>
            <button type="submit" className="button button-blue" disabled={inventorySaving || !adjustmentProduct || adjustmentQuantity === null || !Number.isSafeInteger(adjustmentQuantity) || adjustmentQuantity < 0 || (adjustmentReason !== "correction" && adjustmentQuantity === 0) || adjustmentResultQuantity === null || adjustmentResultQuantity < 0 || adjustmentChange === 0 || Boolean(adjustmentReasonError)}>{inventorySaving ? "Saving…" : "Save adjustment"}</button>
          </footer>
        </form>}
        {modal === "customer" && <>
          <h2 id="modal-heading">{editingCustomer === null ? "Add customer" : "Edit customer"}</h2><p>Customer details</p>
          <FormField label="Name" value={form.name || ""} onChange={value => setField("name", value)} />
          <FormField label="Email" value={form.email || ""} onChange={value => setField("email", value)} />
          <FormField label="Phone" value={form.phone || ""} onChange={value => setField("phone", value)} />
          <FormField label="TIN" value={form.tin || ""} onChange={value => setField("tin", value)} />
          <FormField label="Address" value={form.address || ""} onChange={value => setField("address", value)} />
          <button className="button button-blue modal-submit" disabled={businessSaving} onClick={() => void saveCustomer()}>{businessSaving ? "Saving…" : editingCustomer === null ? "Save customer" : "Save changes"}</button>
        </>}
        {modal === "discount" && <>
          <h2 id="modal-heading">{editingDiscountId ? "Update discount" : "Add discount"}</h2><p>Create a percentage rule. Active rules can be selected at checkout.</p>
          <label className="field"><span>Customer</span><select aria-label="Discount customer" value={form.customerId || ""} onChange={event => setField("customerId", event.target.value)}>
            <option value="">All customers</option>
            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}
          </select></label>
          <label className="field"><span>Product</span><select aria-label="Discount product" value={form.product || "All products"} onChange={event => setField("product", event.target.value)}>
            <option value="All products">All products</option>
            {products.map(product => <option key={product.id} value={product.code}>{product.name} · {product.code}</option>)}
          </select></label>
          <FormField label="Discount percentage" type="number" value={form.percent || ""} onChange={value => setField("percent", value)} placeholder="e.g. 10" />
          <FormField label="Start on" type="date" value={form.start || today()} onChange={value => setField("start", value)} />
          <FormField label="End on" type="date" value={form.end || today()} onChange={value => setField("end", value)} />
            <TextAreaField label="Reason" value={form.reason || ""} onChange={value => setField("reason", value)} placeholder="Why is this discount being offered?" maxLength={500} />
          <button className="button button-blue modal-submit" disabled={businessSaving} onClick={() => void saveDiscount()}>{businessSaving ? "Saving…" : editingDiscountId ? "Update discount" : "Save discount"}</button>
        </>}
        {modal === "request" && <>
          <h2 id="modal-heading">New stock request</h2><p>List each item and quantity needed for {adminSettings.shopName}. The DAF team can review and approve the request.</p>
          <TextAreaField
            label="Items and quantities"
            value={form.items || ""}
            onChange={value => setField("items", value)}
            placeholder={"Example:\n12 notebooks\n6 blue pens"}
            maxLength={1000}
          />
          <small className="request-form-hint">Use one item per line and include the quantity. {form.items?.length || 0}/1000 characters.</small>
          <button className="button button-blue modal-submit" disabled={businessSaving} onClick={() => void saveRequest()}>{businessSaving ? "Saving…" : "Save request"}</button>
        </>}
        {modal === "sale" && <div className="sale-form">
          <header className="form-dialog-heading sale-dialog-heading"><span className="form-dialog-icon">▣</span><div>
            <span className="form-eyebrow">{form.creditSale === "true" ? "CUSTOMER CREDIT" : "CHECKOUT"}</span>
            <h2 id="modal-heading">{form.creditSale === "true" ? "New credit sale" : "New sale"}</h2>
            <p>Add products, review the order, then complete customer and payment details.</p>
          </div></header>
          <div className="sale-form-layout">
            <section className="sale-form-catalog">
              <div className="form-section-heading"><div><h3>Order items</h3><p>Scan a code or search the product catalog.</p></div><span>{saleCartProducts.reduce((count, product) => count + cart[product.id], 0)} items</span></div>
              <form className="sale-code-entry" onSubmit={event => { event.preventDefault(); addSaleProductByCode(form.productCode || ""); }}>
                <label className="field"><span>Product code or barcode</span><input autoFocus autoComplete="off" aria-label="Product code or barcode" placeholder="Scan or type code, then press Enter" value={form.productCode || ""} onChange={event => setField("productCode", event.target.value)} /></label>
                <button type="submit" className="button button-blue" disabled={!form.productCode?.trim()}>Add</button>
              </form>
              <label className="field sale-catalog-search"><span>Search products</span><input aria-label="Search sale products" placeholder="Type a name, SKU, or barcode" value={form.saleSearch || ""} onChange={event => setField("saleSearch", event.target.value)} /></label>
              {saleSearchTerm && <div className="sale-product-suggestions" role="listbox" aria-label="Matching sale products">
                {saleSearchProducts.length
                  ? saleSearchProducts.map(product => <button key={product.id} type="button" role="option" aria-selected="false" disabled={cart[product.id] >= product.quantity} onClick={() => {
                    addSaleProductByCode(product.code);
                    setField("saleSearch", "");
                  }}>
                    <span><strong>{product.name}</strong><small>{product.code} · {product.quantity} available</small></span>
                    <b>{money(product.price)}</b>
                  </button>)
                  : <p>No matching products found.</p>}
              </div>}
              <div className="sale-cart-list">
                {!saleCartProducts.length
                  ? <div className="sale-cart-empty"><span>▣</span><strong>Your order is empty</strong><small>Scan a product code or search the catalog to add items.</small></div>
                  : saleCartProducts.map(product => <article className="sale-cart-item" key={product.id}>
                    <div className="sale-cart-product"><strong>{product.name}</strong><small>{product.code} · {money(product.price)} each</small></div>
                    <div className="sale-quantity-control">
                      <button type="button" aria-label={`Remove one ${product.name}`} disabled={!cart[product.id]} onClick={() => setCart(current => ({ ...current, [product.id]: Math.max(0, (current[product.id] || 0) - 1) }))}>−</button>
                      <strong>{cart[product.id]}</strong>
                      <button type="button" aria-label={`Add one ${product.name}`} disabled={cart[product.id] >= product.quantity} onClick={() => setCart(current => ({ ...current, [product.id]: (current[product.id] || 0) + 1 }))}>＋</button>
                    </div>
                    <b className="sale-cart-line-total">{money(product.price * cart[product.id])}</b>
                  </article>)}
              </div>
              {saleCartProducts.length > 0 && <div className="sale-cart-subtotal"><span>Items subtotal</span><strong>{money(cartTotal)}</strong></div>}
            </section>
            <section className="sale-form-checkout">
              <div className="form-section-heading"><div><h3>Customer and payment</h3><p>Complete invoice details to finish checkout.</p></div><span>Details</span></div>
              {form.creditSale === "true"
                ? <label className="field"><span>Choose existing customer</span><select aria-label="Credit sale customer" required value={form.customerId || ""} onChange={event => selectSaleCustomer(event.target.value)}>
                    <option value="">Select a saved customer</option>
                    {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}
                  </select></label>
                : <>
                  <label className="field"><span>Saved customer (optional)</span><select aria-label="Sale customer" value={form.customerId || ""} onChange={event => selectSaleCustomer(event.target.value)}>
                    <option value="">Enter customer manually</option>
                    {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}
                  </select></label>
                  {form.customerId
                    ? <label className="field"><span>Customer name</span><input value={customers.find(customer => customer.id === form.customerId)?.name || ""} readOnly /></label>
                    : <FormField label="Customer name" value={form.customerName || ""} onChange={value => setField("customerName", value)} />}
                </>}
              {form.creditSale === "true" && customers.length === 0 && <small className="request-form-hint">Add a customer before creating a credit sale.</small>}
              {activeSaleDiscounts.length > 0 && <label className="field"><span>Discount (optional)</span><select aria-label="Apply discount" value={selectedSaleDiscount?.id || ""} onChange={event => setField("discountId", event.target.value)}>
                <option value="">No discount</option>
                {activeSaleDiscounts.map(discount => <option key={discount.id} value={discount.id}>{discount.reason} · {discount.percent}% · {discount.product}</option>)}
              </select></label>}
              {form.discountId && !selectedSaleDiscount && <p className="inventory-error" role="alert">This discount no longer matches the customer or items in the cart.</p>}
              <FormField label="Customer phone number" type="tel" value={form.customerPhone || ""} onChange={value => setField("customerPhone", value)} />
              {form.creditSale === "true"
                ? <p className="credit-sale-note">No payment is collected now. The discounted total will be added to this customer&apos;s outstanding balance.</p>
                : <label className="field"><span>Payment method</span><select value={form.paymentMethod || "cash"} onChange={event => {
                  setField("paymentMethod", event.target.value);
                  setPaymentQrOpen(false);
                }}><option value="cash">Cash</option><option value="card">Card</option><option value="mobile_money">MTN Mobile Money</option><option value="other">Other</option></select></label>}
              {form.paymentMethod === "mobile_money" && paymentQrOpen && <section className="payment-qr-panel" aria-label="MTN Mobile Money payment QR">
                <h3>Pay CARITAS SHOP with MTN Mobile Money</h3>
                <p>Scan the QR and tap the call prompt. MTN will open its payment confirmation flow. Complete the payment and confirm receipt before saving the invoice.</p>
                <QRCodeSVG value={mtnPayment.qrValue} size={192} level="M" includeMargin />
                <code>{mtnPayment.ussdCode}</code>
                <small>Merchant: CARITAS SHOP · Amount: {money(saleTotal)}</small>
              </section>}
              {saleError && <p className="inventory-error" role="alert">{saleError}</p>}
              <div className="sale-checkout-summary">
                <div><span>Subtotal</span><strong>{money(cartTotal)}</strong></div>
                {saleDiscountTotal > 0 && <div><span>Discount</span><strong>−{money(saleDiscountTotal)}</strong></div>}
                {saleTaxTotal > 0 && <div><span>Tax</span><strong>{money(saleTaxTotal)}</strong></div>}
                <div className="sale-checkout-total"><span>{form.creditSale === "true" ? "Credit due" : "Total due"}</span><strong>{money(saleTotal)}</strong></div>
              </div>
              {form.creditSale === "true"
                ? <button className="button button-blue modal-submit" disabled={!saleCartProducts.length || !form.customerId || saleSaving} onClick={() => void finishSale()}>{saleSaving ? "Saving credit sale…" : "Save credit sale"}</button>
                : form.paymentMethod === "mobile_money"
                ? <button className="button button-blue modal-submit" disabled={!saleCartProducts.length || saleSaving} onClick={() => paymentQrOpen ? void finishSale() : showMtnPaymentQr()}>{saleSaving ? "Saving invoice…" : paymentQrOpen ? "Payment received — Save & print invoice" : "Pay with MTN MoMo — Show QR"}</button>
                : <button className="button button-blue modal-submit" disabled={!saleCartProducts.length || saleSaving} onClick={() => void finishSale()}>{saleSaving ? "Saving invoice…" : "Save & print invoice"}</button>}
            </section>
          </div>
        </div>}
        {modal === "user" && <>
          <h2 id="modal-heading">{editingUserId ? "Edit staff account" : "Add staff account"}</h2>
          <p>{editingUserId ? "Update this account's email, role, or password." : "New accounts can sign in as soon as they are created."}</p>
          <form onSubmit={event => { event.preventDefault(); void saveUser(); }}>
            <label className="field"><span>Email</span><input type="email" autoComplete="off" required maxLength={254} value={form.email || ""} onChange={event => setField("email", event.target.value)} /></label>
            <label className="field"><span>Role</span><select required value={form.role || ""} onChange={event => setField("role", event.target.value)}>
              <option value="">Choose a role</option>
              {(Object.keys(staffRoleNames) as StaffRole[]).map(role => <option key={role} value={role}>{staffRoleNames[role]}</option>)}
            </select></label>
            <label className="field"><span>{editingUserId ? "New password (optional)" : "Password"}</span><input type="password" autoComplete="new-password" required={!editingUserId} minLength={form.password ? 12 : (editingUserId ? 0 : 12)} maxLength={1024} value={form.password || ""} onChange={event => setField("password", event.target.value)} /></label>
            <p className="user-password-hint">{editingUserId ? "Leave blank to keep the current password. If set, use at least 12 characters." : "Use at least 12 characters and share the password securely."}</p>
            {userFormError && <p className="login-error" role="alert">{userFormError}</p>}
            <button className="button button-blue modal-submit" type="submit" disabled={userSaving}>{userSaving ? "Saving account…" : editingUserId ? "Save changes" : "Create account"}</button>
          </form>
        </>}
        {modal === "organization" && <>
          <h2 id="modal-heading">Add organization</h2>
          <p>Save an organization and its branch details to the database.</p>
          <form onSubmit={event => { event.preventDefault(); void saveOrganization(); }}>
            <label className="field"><span>Organization name</span><input autoFocus required maxLength={120} value={form.name || ""} onChange={event => setField("name", event.target.value)} /></label>
            <label className="field"><span>Branch</span><input required maxLength={120} value={form.branch || ""} onChange={event => setField("branch", event.target.value)} /></label>
            <label className="field"><span>Manager</span><input required maxLength={120} value={form.manager || ""} onChange={event => setField("manager", event.target.value)} /></label>
            <label className="field"><span>Location (optional)</span><input maxLength={160} value={form.location || ""} onChange={event => setField("location", event.target.value)} /></label>
            {organizationFormError && <p className="login-error" role="alert">{organizationFormError}</p>}
            <button className="button button-blue modal-submit" type="submit" disabled={organizationSaving}>{organizationSaving ? "Saving organization…" : "Add organization"}</button>
          </form>
        </>}
      </section>
    </div>}
    {printSale && <InvoicePrintView sale={printSale} shopName={adminSettings.shopName} />}
  </div>;
}

function InvoicePrintView({ sale, shopName }: { sale: Sale; shopName: string }) {
  const soldAt = new Date(sale.id);
  const date = Number.isNaN(soldAt.getTime()) ? sale.date : soldAt.toLocaleDateString("en-GB");
  const time = Number.isNaN(soldAt.getTime()) ? "" : soldAt.toLocaleTimeString("en-GB");
  const amount = (value: number) => value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return <section id="print-invoice" aria-label="Invoice to print">
    <header className="receipt-header">
      <strong>{shopName}</strong>
      <span>SALES INVOICE</span>
      <h1>FACTURE / SALES INVOICE</h1>
      <span>INVOICE NO: {sale.receiptNumber}</span>
      {sale.proformaNumber && <span>PROFORMA REF: {sale.proformaNumber}</span>}
    </header>
    <div className="receipt-divider" />
    <div className="receipt-customer">
      <div><span>CUSTOMER NAME:</span><strong>{sale.customer}</strong></div>
      <div><span>PHONE:</span><strong>{sale.customerPhone || "—"}</strong></div>
    </div>
    <div className="receipt-divider" />
    <div className="receipt-items">
      {sale.lineItems.map(item => <article className="receipt-item" key={`${item.productId}-${item.sku}`}>
        <strong>{item.name}</strong>
        <span>{item.sku}</span>
        <div><span>{amount(item.unitPrice)} x {item.quantity}</span><strong>{amount(item.lineTotal)}</strong></div>
        {Boolean(item.discountAmount) && <small>Discount: −{amount(item.discountAmount || 0)}</small>}
        {Boolean(item.taxAmount) && <small>Tax ({item.taxRate || 0}%): {amount(item.taxAmount || 0)}</small>}
      </article>)}
    </div>
    <div className="receipt-divider" />
    <div className="receipt-totals">
      <div><span>Subtotal</span><strong>{amount(sale.subtotal)}</strong></div>
      <div><span>Discount</span><strong>−{amount(sale.discountTotal)}</strong></div>
      <div><span>Tax</span><strong>{amount(sale.taxTotal)}</strong></div>
      <div><strong>TOTAL RWF</strong><strong>{amount(sale.total)}</strong></div>
    </div>
    <div className="receipt-divider" />
    <div className="receipt-payment">
      <div><span>Payment method</span><strong>{sale.paymentMethod.replaceAll("_", " ").toUpperCase()}</strong></div>
      <div><span>Payment status</span><strong>{sale.paymentStatus.toUpperCase()}</strong></div>
      <div><span>Amount paid</span><strong>{amount(sale.amountPaid)}</strong></div>
      <div><span>Balance due</span><strong>{amount(sale.credit)}</strong></div>
      <div><span>ITEMS NUMBER</span><strong>{sale.items}</strong></div>
    </div>
    <div className="receipt-divider" />
    <footer className="receipt-footer">
      <strong>RECEIPT DETAILS</strong>
      <span>Date: {date}{time ? `  Time: ${time}` : ""}</span>
      <span>Invoice number: {sale.receiptNumber}</span>
      <p>Thank you for shopping with us.</p>
      <span>Sales invoice only — tax receipt details are not configured.</span>
    </footer>
  </section>;
}

function AdminInfoPage({ title, description, detail, workspace = "ADMINISTRATION" }: { title: string; description: string; detail: string; workspace?: string }) {
  return <section className="admin-info-page">
    <div className="admin-info-icon">◇</div>
    <span className="admin-info-kicker">{workspace}</span>
    <h2>{title}</h2>
    <p>{description}</p>
    <div className="admin-info-status"><span />{detail}</div>
  </section>;
}

function OrganizationOverviewPage({ organizations, loading, onAdd }: { organizations: Organization[]; loading: boolean; onAdd: () => void }) {
  const activeCount = organizations.filter(organization => organization.status === "active").length;
  const monitoringCount = organizations.filter(organization => organization.status === "monitoring").length;
  return <section className="admin-standalone-page">
    <div className="admin-section-intro">
      <div><span>ADMINISTRATION</span><h2>Organizations</h2><p>Manage organization records and branch locations.</p></div>
      <button className="button button-blue" onClick={onAdd}>＋ ADD ORGANIZATION</button>
    </div>

    <div className="admin-stat-grid">
      <div className="admin-stat-card">
        <span>Organizations</span>
        <strong>{loading ? "…" : organizations.length}</strong>
        <small>Saved organization records</small>
      </div>
      <div className="admin-stat-card">
        <span>Active</span>
        <strong>{loading ? "…" : activeCount}</strong>
        <small>Active organization records</small>
      </div>
      <div className="admin-stat-card">
        <span>Monitoring</span>
        <strong>{loading ? "…" : monitoringCount}</strong>
        <small>Marked for follow-up</small>
      </div>
      <div className="admin-stat-card">
        <span>Branches</span>
        <strong>{loading ? "…" : new Set(organizations.map(organization => organization.branch.toLowerCase())).size}</strong>
        <small>Unique branch records</small>
      </div>
    </div>

    <section className="admin-dashboard-panel admin-table-panel">
      <div className="admin-panel-heading">
        <div><h3>Organization directory</h3><p>Records saved in the database</p></div>
      </div>
      <Table headers={["ORGANIZATION", "BRANCH", "MANAGER", "LOCATION", "STATUS", "CREATED"]}>
        {organizations.length
          ? organizations.map(organization => <tr key={organization._id}>
            <td>{organization.name}</td>
            <td>{organization.branch}</td>
            <td>{organization.manager}</td>
            <td>{organization.location || "—"}</td>
            <td><span className={`request-status ${organization.status === "active" ? "approved" : "pending"}`}>{organization.status}</span></td>
            <td>{new Date(organization.createdAt).toLocaleDateString()}</td>
          </tr>)
          : <tr><td className="empty-cell" colSpan={6}>{loading ? "Loading organizations…" : "No organizations have been added yet."}</td></tr>}
      </Table>
    </section>
  </section>;
}

function AuditLogsPage({ events, totalEvents, loading, query, outcomeFilter, onQueryChange, onOutcomeChange, onRefresh }: {
  events: AuditEvent[];
  totalEvents: number;
  loading: boolean;
  query: string;
  outcomeFilter: string;
  onQueryChange: (value: string) => void;
  onOutcomeChange: (value: string) => void;
  onRefresh: () => void;
}) {
  const failedCount = events.filter(event => event.outcome === "Failed").length;
  const successfulCount = events.filter(event => event.outcome === "Success").length;
  return <section className="admin-standalone-page">
    <div className="admin-section-intro">
      <div><span>ADMINISTRATION</span><h2>Audit logs</h2><p>Authenticated changes recorded by the application.</p></div>
      <button className="button button-blue" onClick={onRefresh} disabled={loading}>{loading ? "REFRESHING…" : "↻ REFRESH"}</button>
    </div>

    <div className="admin-stat-grid">
      <div className="admin-stat-card">
        <span>Events loaded</span>
        <strong>{loading ? "…" : totalEvents}</strong>
        <small>Most recent 500 records</small>
      </div>
      <div className="admin-stat-card">
        <span>Successful changes</span>
        <strong>{loading ? "…" : successfulCount}</strong>
        <small>In the loaded records</small>
      </div>
      <div className="admin-stat-card">
        <span>Failed changes</span>
        <strong>{loading ? "…" : failedCount}</strong>
        <small>Requests returning an error</small>
      </div>
      <div className="admin-stat-card">
        <span>Visible results</span>
        <strong>{loading ? "…" : events.length}</strong>
        <small>Matching current filters</small>
      </div>
    </div>

    <section className="admin-dashboard-panel admin-table-panel">
      <div className="admin-panel-heading">
        <div><h3>Recent activity</h3><p>Actor, change type, and server response</p></div>
        <div className="audit-filters">
          <input aria-label="Search audit logs" placeholder="Search user, action, or route" value={query} onChange={event => onQueryChange(event.target.value)} />
          <select aria-label="Filter audit outcome" value={outcomeFilter} onChange={event => onOutcomeChange(event.target.value)}>
            <option>All outcomes</option><option>Success</option><option>Failed</option>
          </select>
        </div>
      </div>
      <Table headers={["DATE / TIME", "ACTOR", "ROLE", "ACTION", "ROUTE", "RESULT"]}>
        {events.length
          ? events.map(event => <tr key={event._id}>
            <td>{new Date(event.createdAt).toLocaleString()}</td>
            <td>{event.actorEmail}</td>
            <td>{roleNames[event.actorRole]}</td>
            <td>{event.action}</td>
            <td>{event.method} {event.path}</td>
            <td><span className={`request-status ${event.outcome === "Success" ? "approved" : "pending"}`}>{event.outcome} · {event.statusCode}</span></td>
          </tr>)
          : <tr><td className="empty-cell" colSpan={6}>{loading ? "Loading audit records…" : "No audit records match the selected filters."}</td></tr>}
      </Table>
    </section>
  </section>;
}

function AdminSettingsPage({ settings, savedSettings, loading, saving, error, onChange, onSave }: {
  settings: AdminSettings;
  savedSettings: AdminSettings;
  loading: boolean;
  saving: boolean;
  error: string;
  onChange: (settings: AdminSettings) => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return <section className="admin-standalone-page">
    <div className="admin-section-intro">
      <div><span>ADMINISTRATION</span><h2>Settings</h2><p>Configure saved shop details and inventory alert thresholds.</p></div>
      <span className="settings-badge success">{loading ? "Loading" : "Database-backed"}</span>
    </div>

    <div className="admin-settings-layout">
      <form className="admin-dashboard-panel admin-settings-form" onSubmit={onSave}>
        <div className="admin-panel-heading"><div><h3>Shop configuration</h3><p>Business identity and proforma rules are saved to the application database.</p></div></div>
        <label className="field">
          <span>Shop name</span>
          <input required disabled={loading || saving} maxLength={120} value={settings.shopName} onChange={event => onChange({ ...settings, shopName: event.target.value })} />
        </label>
        <label className="field">
          <span>Shop address</span>
          <input disabled={loading || saving} maxLength={300} value={settings.shopAddress} onChange={event => onChange({ ...settings, shopAddress: event.target.value })} />
        </label>
        <label className="field">
          <span>Shop phone</span>
          <input disabled={loading || saving} maxLength={30} value={settings.shopPhone} onChange={event => onChange({ ...settings, shopPhone: event.target.value })} />
        </label>
        <label className="field">
          <span>Shop email</span>
          <input type="email" disabled={loading || saving} maxLength={254} value={settings.shopEmail} onChange={event => onChange({ ...settings, shopEmail: event.target.value })} />
        </label>
        <label className="field">
          <span>Shop TIN</span>
          <input disabled={loading || saving} maxLength={50} value={settings.shopTin} onChange={event => onChange({ ...settings, shopTin: event.target.value })} />
        </label>
        <label className="field">
          <span>Low-stock alert threshold</span>
          <input type="number" min={1} max={10000} step={1} required disabled={loading || saving} value={settings.lowStockThreshold} onChange={event => onChange({ ...settings, lowStockThreshold: Number(event.target.value) })} />
        </label>
        <div className="admin-panel-heading"><div><h3>Proforma rules</h3><p>Documents are quotations and never payments or completed sales.</p></div></div>
        <label className="field">
          <span>Proforma number prefix</span>
          <input required disabled={loading || saving} maxLength={10} value={settings.proformaNumberPrefix} onChange={event => onChange({ ...settings, proformaNumberPrefix: event.target.value.toUpperCase() })} />
        </label>
        <label className="field">
          <span>Default validity (days)</span>
          <input type="number" min={1} max={365} step={1} required disabled={loading || saving} value={settings.proformaValidityDays} onChange={event => onChange({ ...settings, proformaValidityDays: Number(event.target.value) })} />
        </label>
        <label className="field">
          <span>Tax treatment</span>
          <select disabled={loading || saving} value={settings.taxTreatment} onChange={event => onChange({ ...settings, taxTreatment: event.target.value as AdminSettings["taxTreatment"] })}>
            <option value="unconfigured">Not configured — issuing is disabled</option>
            <option value="exclusive">Tax is added to listed prices</option>
            <option value="inclusive">Tax is included in listed prices</option>
          </select>
        </label>
        <small className="admin-data-note">Each product must have an explicit tax rate, including 0% where approved, before issue. Blank product tax rates are not treated as tax exempt.</small>
        <label className="field admin-proforma-approval-toggle">
          <span><input type="checkbox" disabled={loading || saving} checked={settings.proformaApprovalsEnabled} onChange={event => onChange({ ...settings, proformaApprovalsEnabled: event.target.checked })} /> Require DAF approval over configured thresholds</span>
        </label>
        {settings.proformaApprovalsEnabled && <>
          <label className="field">
            <span>Approval total threshold (RWF)</span>
            <input type="number" min={0} step={0.01} required disabled={loading || saving} value={settings.approvalValueThreshold ?? ""} onChange={event => onChange({ ...settings, approvalValueThreshold: event.target.value === "" ? null : Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>Approval discount threshold (%)</span>
            <input type="number" min={0} max={100} step={0.01} required disabled={loading || saving} value={settings.approvalDiscountPercent ?? ""} onChange={event => onChange({ ...settings, approvalDiscountPercent: event.target.value === "" ? null : Number(event.target.value) })} />
          </label>
        </>}
        <p className="admin-data-note">Products at or below {settings.lowStockThreshold || 0} units are considered low stock. Saved threshold: {savedSettings.lowStockThreshold}.</p>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="button button-blue" type="submit" disabled={loading || saving}>{saving ? "SAVING…" : "SAVE SETTINGS"}</button>
      </form>

      <section className="admin-dashboard-panel settings-summary">
        <div className="admin-panel-heading"><div><h3>Saved configuration</h3><p>Current values stored for the POS application</p></div></div>
        <div className="admin-health-list">
          <div className="admin-health-row"><span>Shop name</span><strong>{savedSettings.shopName}</strong></div>
          <div className="admin-health-row"><span>Tax treatment</span><strong>{savedSettings.taxTreatment}</strong></div>
          <div className="admin-health-row"><span>Proforma validity</span><strong>{savedSettings.proformaValidityDays} days</strong></div>
          <div className="admin-health-row"><span>Proforma approvals</span><strong>{savedSettings.proformaApprovalsEnabled ? "Enabled" : "Disabled"}</strong></div>
          <div className="admin-health-row"><span>Low-stock threshold</span><strong>{savedSettings.lowStockThreshold} units</strong></div>
        </div>
      </section>
    </div>
  </section>;
}

function DafApprovals({ requests, onDecision }: { requests: Request[]; onDecision: (requestId: string, status: "Approved" | "Rejected") => void }) {
  const pendingCount = requests.filter(request => request.status === "Pending").length;
  return <section className="daf-approvals-page">
    <div className="admin-section-intro">
      <div><span>DAF WORKSPACE</span><h2>Approvals</h2><p>Review and decide saved stock requests.</p></div>
      <strong>{pendingCount} pending</strong>
    </div>
    <Table headers={["DATE", "REQUEST", "SUBMITTED BY", "STATUS", "DECISION"]}>
      {requests.map(request => <tr key={request.id}>
        <td>{request.date}</td>
        <td>{request.items}</td>
        <td>{request.operator}</td>
        <td><span className={`request-status ${request.status.toLowerCase()}`}>{request.status}</span></td>
        <td>{request.status === "Pending" ? <div className="user-actions">
          <button className="user-edit-action" onClick={() => onDecision(request.id, "Approved")}>Approve</button>
          <button className="table-action" onClick={() => onDecision(request.id, "Rejected")}>Reject</button>
        </div> : "—"}</td>
      </tr>)}
    </Table>
    <p className="accountant-ledger-note">Approval decisions are saved with the request.</p>
  </section>;
}

function AccountantSalesLedger({ title, saleDate, sales, onDateChange }: { title: "Income" | "Invoices" | "Transaction Review"; saleDate: string; sales: Sale[]; onDateChange: (date: string) => void }) {
  return <section className="accountant-ledger-page">
    <div className="section-toolbar">
      <span className="section-label">{title} · {sales.length} record{sales.length === 1 ? "" : "s"}</span>
      <label className="accountant-ledger-date">Date <input aria-label={`${title} date`} type="date" value={saleDate} onChange={event => onDateChange(event.target.value)} /></label>
    </div>
    <Table headers={["REFERENCE", "CUSTOMER", "DATE", "ITEMS", "AMOUNT", "CREDIT"]}>
      {sales.map(sale => <tr key={sale.receiptNumber}>
        <td>{sale.receiptNumber}</td>
        <td>{sale.customer}</td>
        <td>{sale.date}</td>
        <td>{sale.items}</td>
        <td>{money(sale.total)}</td>
        <td>{money(sale.credit)}</td>
      </tr>)}
    </Table>
    <div className="sales-summary"><strong>Total {title.toLowerCase()}: {money(sales.reduce((sum, sale) => sum + sale.total, 0))}</strong></div>
    <p className="accountant-ledger-note">These records come from sales held in the current browser session.</p>
  </section>;
}

function AdminNotifications({
  lowStockProducts,
  products,
  requests,
}: {
  lowStockProducts: Product[];
  products: Product[];
  requests: Request[];
}) {
  const outOfStock = products.filter(product => product.quantity === 0);
  const pendingRequests = requests.filter(request => request.status === "Pending");
  const notificationCount = outOfStock.length + lowStockProducts.length + pendingRequests.length;

  return <div className="admin-notifications">
    <div className="admin-section-intro">
      <div><span>ADMINISTRATION</span><h2>Notification center</h2><p>Stock and request alerts from this prototype session.</p></div>
      <strong>{notificationCount} alert{notificationCount === 1 ? "" : "s"}</strong>
    </div>
    <section className="admin-notification-group">
      <div className="admin-notification-heading"><h3>Inventory</h3></div>
      {[...outOfStock, ...lowStockProducts].map(product =>
        <div className="admin-notification-row" key={product.id}>
          <span className={`notification-mark ${product.quantity === 0 ? "notification-critical" : "notification-warning"}`} />
          <span><strong>{product.quantity === 0 ? "Out of stock" : "Low stock"}: {product.name}</strong><small>{product.code} · {product.quantity} remaining</small></span>
        </div>
      )}
      {!outOfStock.length && !lowStockProducts.length && <p className="dashboard-empty">No inventory alerts.</p>}
    </section>
    <section className="admin-notification-group">
      <div className="admin-notification-heading"><h3>Requests</h3></div>
      {pendingRequests.map(request =>
        <div className="admin-notification-row" key={request.id}>
          <span className="notification-mark notification-info" />
          <span><strong>Request awaiting review</strong><small>{request.items} · {request.operator} · {request.date}</small></span>
          <span className="request-status pending">Pending</span>
        </div>
      )}
      {!pendingRequests.length && <p className="dashboard-empty">No pending requests.</p>}
    </section>
  </div>;
}

function AccountProfile({ session, onSignOut }: { session: UserSession; onSignOut: () => void }) {
  const [passwordEditorOpen, setPasswordEditorOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordNotice("");
    if (newPassword !== confirmPassword) {
      setPasswordError("The new password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 12 || newPassword.length > 1024) {
      setPasswordError("Use a new password between 12 and 1,024 characters.");
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json();
      if (!response.ok) {
        setPasswordError(result.message || "Unable to update your password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordEditorOpen(false);
      setPasswordNotice(result.message || "Password updated successfully.");
    } catch {
      setPasswordError("Unable to reach the account service. Please try again.");
    } finally {
      setPasswordSaving(false);
    }
  }

  return <section className="admin-profile-page">
    <div className="admin-section-intro">
      <div><span>ACCOUNT</span><h2>Your profile</h2><p>Manage your sign-in details.</p></div>
      <button className="button button-rose" onClick={onSignOut}>Sign out</button>
    </div>

    <section className="admin-profile-card profile-account-card">
      <span className="admin-profile-avatar">{session.email.charAt(0).toUpperCase()}</span>
      <div className="profile-account-details">
        <strong>{session.email}</strong>
        <span className={`role-badge role-${session.role}`}>{roleNames[session.role]}</span>
      </div>
      <button className="button button-blue" aria-expanded={passwordEditorOpen} disabled={passwordSaving} onClick={() => {
        const opening = !passwordEditorOpen;
        if (!opening) {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        }
        setPasswordEditorOpen(opening);
        setPasswordError("");
        setPasswordNotice("");
      }}>{passwordEditorOpen ? "Cancel" : "Change password"}</button>
    </section>

    {passwordNotice && <p className="profile-password-notice" role="status">{passwordNotice}</p>}
    {passwordEditorOpen && <form id="profile-password-form" className="admin-dashboard-panel profile-password-form" onSubmit={event => void changePassword(event)}>
      <div className="admin-panel-heading">
        <div><h3>Change password</h3><p>Enter your current password and choose a new one.</p></div>
      </div>
      <label className="field"><span>Current password</span>
        <input type="password" autoComplete="current-password" required maxLength={1024} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
      </label>
      <label className="field"><span>New password</span>
        <input type="password" autoComplete="new-password" required minLength={12} maxLength={1024} value={newPassword} onChange={event => setNewPassword(event.target.value)} />
      </label>
      <label className="field"><span>Confirm new password</span>
        <input type="password" autoComplete="new-password" required minLength={12} maxLength={1024} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
      </label>
      <p className="user-password-hint">Use at least 12 characters. Changing your password signs out other active sessions.</p>
      {passwordError && <p className="login-error" role="alert">{passwordError}</p>}
      <button className="button button-blue" type="submit" disabled={passwordSaving}>{passwordSaving ? "Updating password…" : "Update password"}</button>
    </form>}
  </section>;
}

function CashierDashboard({
  products,
  todaySales,
  todayRevenue,
  lowStockProducts,
  onStartSale,
  onStartInvoice,
  onOpenScreen,
}: {
  products: Product[];
  todaySales: Sale[];
  todayRevenue: number;
  lowStockProducts: Product[];
  onStartSale: () => void;
  onStartInvoice: () => void;
  onOpenScreen: DashboardAction;
}) {
  const recentSales = [...todaySales].sort((left, right) => right.id - left.id).slice(0, 5);
  const availableProducts = products.filter(product => product.quantity > 0).length;
  const outOfStock = products.filter(product => product.quantity === 0);

  return <div className="role-dashboard">
    <section className="role-dashboard-hero cashier-hero">
      <div>
        <span className="role-dashboard-eyebrow">CASHIER WORKSPACE</span>
        <h2>Ready to serve customers?</h2>
        <p>Start a sale, prepare an invoice, or check products that need attention.</p>
      </div>
      <div className="role-dashboard-hero-actions">
        <button className="hero-primary-action" onClick={onStartSale}>＋ Start a sale</button>
        <button className="hero-secondary-action" onClick={onStartInvoice}>Proforma invoice</button>
      </div>
    </section>

    <div className="role-dashboard-metrics">
      <DashboardMetric label="Sales today" value={money(todayRevenue)} detail={`${todaySales.length} transaction${todaySales.length === 1 ? "" : "s"} in this session`} />
      <DashboardMetric label="Products available" value={availableProducts} detail={`${products.length} products in catalog`} />
      <DashboardMetric label="Low stock" value={lowStockProducts.length} detail="Products with 1–5 units" tone="warning" />
      <DashboardMetric label="Out of stock" value={outOfStock.length} detail="Products unavailable" tone="danger" />
    </div>

    <div className="role-dashboard-panels">
      <section className="role-dashboard-panel">
        <DashboardPanelHeader title="Recent sales" detail="Today in this session" action="All sales" onAction={() => onOpenScreen("Sales")} />
        <DashboardSalesTable sales={recentSales} />
      </section>
      <section className="role-dashboard-panel">
        <DashboardPanelHeader title="Stock alerts" detail="Check availability before checkout" action="Inventory" onAction={() => onOpenScreen("Inventory")} />
        {[...outOfStock, ...lowStockProducts].slice(0, 5).map(product =>
          <div className="dashboard-product-row" key={product.id}>
            <span className="dashboard-product-indicator" />
            <span className="dashboard-product-name">{product.name}<small>{product.code}</small></span>
            <strong className={product.quantity === 0 ? "dashboard-danger" : "dashboard-warning"}>{product.quantity} left</strong>
          </div>
        )}
        {outOfStock.length + lowStockProducts.length === 0 && <DashboardEmpty>Stock levels look good.</DashboardEmpty>}
      </section>
    </div>
    <div className="role-dashboard-footer"><span>Sales and inventory figures reflect this browser session.</span></div>
  </div>;
}

function AccountantDashboard({
  saleDate,
  sales,
  revenue,
  credit,
  averageSale,
  eyebrow = "ACCOUNTING WORKSPACE",
  onDateChange,
  onOpenScreen,
}: {
  saleDate: string;
  sales: Sale[];
  revenue: number;
  credit: number;
  averageSale: number;
  eyebrow?: string;
  onDateChange: (date: string) => void;
  onOpenScreen: DashboardAction;
}) {
  return <div className="role-dashboard">
    <section className="role-dashboard-hero accountant-hero">
      <div>
        <span className="role-dashboard-eyebrow">{eyebrow}</span>
        <h2>Financial overview</h2>
        <p>Review recorded sales, credit, and daily totals for the selected date.</p>
      </div>
      <label className="dashboard-date-control"><span>Report date</span><input type="date" value={saleDate} onChange={event => onDateChange(event.target.value)} /></label>
    </section>

    <div className="role-dashboard-metrics">
      <DashboardMetric label="Sales on selected date" value={money(revenue)} detail={saleDate} />
      <DashboardMetric label="Transactions" value={sales.length} detail="Recorded on selected date" />
      <DashboardMetric label="Credit recorded" value={money(credit)} detail="For selected date" tone={credit > 0 ? "warning" : "default"} />
      <DashboardMetric label="Average sale" value={money(averageSale)} detail="Per transaction" />
    </div>

    <div className="role-dashboard-panels accountant-dashboard-panels">
      <section className="role-dashboard-panel accountant-ledger-panel">
        <DashboardPanelHeader title="Daily sales ledger" detail={`Transactions dated ${saleDate} in this session`} action="Open sales" onAction={() => onOpenScreen("Sales")} />
        <DashboardSalesTable sales={sales} />
      </section>
      <section className="role-dashboard-panel accountant-tools-panel">
        <span className="role-panel-kicker">ACCOUNTING TOOLS</span>
        <h3>Continue your review</h3>
        <p>Use the sales workspace to inspect transactions or open reports for a broader summary.</p>
        <button className="dashboard-tool-link" onClick={() => onOpenScreen("Report")}><span>▥</span><span><strong>Open reports</strong><small>Sales, purchase, and balance sheet reports</small></span><b>→</b></button>
        <button className="dashboard-tool-link" onClick={() => onOpenScreen("Sales")}><span>▧</span><span><strong>Review transactions</strong><small>Filter sales by date</small></span><b>→</b></button>
      </section>
    </div>
    <div className="role-dashboard-footer"><span>Financial figures reflect sales recorded in this browser session.</span></div>
  </div>;
}

function DafDashboard({
  products,
  lowStockProducts,
  unitsInStock,
  inventoryCostValue,
  pendingRequests,
  recentRequests,
  onOpenScreen,
}: {
  products: Product[];
  lowStockProducts: Product[];
  unitsInStock: number;
  inventoryCostValue: number;
  pendingRequests: number;
  recentRequests: Request[];
  onOpenScreen: DashboardAction;
}) {
  const outOfStock = products.filter(product => product.quantity === 0);
  const stockAttention = [...outOfStock, ...lowStockProducts].slice(0, 5);

  return <div className="role-dashboard">
    <section className="role-dashboard-hero daf-hero">
      <div>
        <span className="role-dashboard-eyebrow">DAF WORKSPACE</span>
        <h2>Operations overview</h2>
        <p>Monitor stock health, requests, and operational priorities.</p>
      </div>
      <button className="hero-primary-action" onClick={() => onOpenScreen("Approvals")}>Review approvals <span>→</span></button>
    </section>

    <div className="role-dashboard-metrics">
      <DashboardMetric label="Inventory at cost" value={money(inventoryCostValue)} detail="Based on purchase cost × quantity" />
      <DashboardMetric label="Units in stock" value={unitsInStock.toLocaleString("en-US")} detail={`${products.length} products tracked`} />
      <DashboardMetric label="Stock alerts" value={outOfStock.length + lowStockProducts.length} detail={`${outOfStock.length} out of stock · ${lowStockProducts.length} low`} tone={outOfStock.length ? "danger" : lowStockProducts.length ? "warning" : "default"} />
      <DashboardMetric label="Pending requests" value={pendingRequests} detail="Awaiting review" tone={pendingRequests ? "warning" : "default"} />
    </div>

    <div className="role-dashboard-panels">
      <section className="role-dashboard-panel">
        <div className="role-panel-header"><div><h3>Stock requiring attention</h3><p>Low or unavailable products</p></div></div>
        {stockAttention.map(product =>
          <div className="dashboard-product-row" key={product.id}>
            <span className={`dashboard-product-indicator ${product.quantity === 0 ? "indicator-danger" : ""}`} />
            <span className="dashboard-product-name">{product.name}<small>{product.code}</small></span>
            <strong className={product.quantity === 0 ? "dashboard-danger" : "dashboard-warning"}>{product.quantity} left</strong>
          </div>
        )}
        {stockAttention.length === 0 && <DashboardEmpty>No stock alerts at this time.</DashboardEmpty>}
      </section>
      <section className="role-dashboard-panel">
        <DashboardPanelHeader title="Request queue" detail="Most recent requests" action="All approvals" onAction={() => onOpenScreen("Approvals")} />
        {recentRequests.length ? recentRequests.map(request =>
          <div className="dashboard-request-row" key={request.id}>
            <span><strong>{request.items}</strong><small>{request.date} · {request.operator}</small></span>
            <span className={`request-status ${request.status.toLowerCase()}`}>{request.status}</span>
          </div>
        ) : <DashboardEmpty>No requests have been submitted.</DashboardEmpty>}
      </section>
    </div>
    <div className="role-dashboard-footer">
      <span>Operational figures are for the current prototype session.</span>
      <button onClick={() => onOpenScreen("Report")}>Open reports <span>→</span></button>
    </div>
  </div>;
}

function DashboardMetric({ label, value, detail, tone = "default" }: { label: string; value: string | number; detail: string; tone?: "default" | "warning" | "danger" }) {
  return <section className={`role-metric-card metric-${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
  </section>;
}

function DashboardPanelHeader({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) {
  return <div className="role-panel-header">
    <div><h3>{title}</h3><p>{detail}</p></div>
    <button onClick={onAction}>{action} <span>→</span></button>
  </div>;
}

function DashboardSalesTable({ sales }: { sales: Sale[] }) {
  const recentSales = [...sales].sort((left, right) => right.id - left.id);
  if (!recentSales.length) return <DashboardEmpty>No sales recorded for this date in the current session.</DashboardEmpty>;
  return <div className="dashboard-table-wrap"><table className="dashboard-data-table">
    <thead><tr><th>INVOICE</th><th>CUSTOMER</th><th>ITEMS</th><th>TOTAL</th></tr></thead>
    <tbody>{recentSales.map(sale => <tr key={sale.receiptNumber}>
      <td>{sale.receiptNumber}</td><td>{sale.customer}</td><td>{sale.items}</td><td>{money(sale.total)}</td>
    </tr>)}</tbody>
  </table></div>;
}

function DashboardEmpty({ children }: { children: React.ReactNode }) {
  return <p className="dashboard-empty">{children}</p>;
}

function LoginScreen({
  email,
  password,
  error,
  busy,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  email: string;
  password: string;
  error: string;
  busy: boolean;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return <main className="login-page">
    <section className="login-card">
      <div className="login-brand">
        <span className="login-crest">✥</span>
        <span><strong>CARITAS</strong><small>HQ Shop · Point of Sale</small></span>
      </div>
      <div className="login-heading">
        <span>STAFF ACCESS</span>
        <h1>Welcome back</h1>
        <p>Sign in with your assigned email and password.</p>
      </div>
      <form onSubmit={onSubmit}>
        <label className="login-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={event => onEmailChange(event.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={event => onPasswordChange(event.target.value)}
            required
          />
        </label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="login-submit" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="login-footnote">Access is limited to authorized Caritas Shop staff.</p>
    </section>
  </main>;
}

function Table({ headers, children, className = "" }: { headers: string[]; children: React.ReactNode; className?: string }) {
  const empty = !children || (Array.isArray(children) && children.length === 0);
  return <div className={`table-frame ${className}`.trim()}><table><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>
    {empty ? <tr><td className="empty-cell" colSpan={headers.length}>No content in table</td></tr> : children}
  </tbody></table></div>;
}

function FormField({ label, value, onChange, type = "text", autoFocus, autoComplete, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoFocus?: boolean; autoComplete?: string; placeholder?: string }) {
  return <label className="field"><span>{label}</span><input type={type} value={value} onChange={event => onChange(event.target.value)} autoFocus={autoFocus} autoComplete={autoComplete} placeholder={placeholder} /></label>;
}

function TextAreaField({ label, value, onChange, placeholder, maxLength }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number }) {
  return <label className="field"><span>{label}</span><textarea value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} rows={5} /></label>;
}
