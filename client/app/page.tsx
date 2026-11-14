"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import CameraBarcodeScanner from "./CameraBarcodeScanner";
import { buildMtnMomoPaymentPayload } from "./payment";

type Screen = "Dashboard" | "Inventory" | "Sales" | "Discount" | "Customer" | "Request" | "Report" | "Users" | "Organizations" | "Transactions" | "Financial Overview" | "Audit Logs" | "Settings" | "Notifications" | "Profile" | "Chart of Accounts" | "Income" | "Expenses" | "Journal Entries" | "Invoices" | "Bank Reconciliation" | "Financial Statements" | "Transaction Review" | "Approvals" | "Budgets" | "Audit & Compliance" | "Cash Flow" | "Activity Logs";
type Role = "cashier" | "accountant" | "daf" | "administration";
type UserSession = { role: Role; name: string; email: string };
type StaffRole = Exclude<Role, "administration">;
type ManagedUser = { _id: string; email: string; role: StaffRole; createdAt: string };
type Product = { id: string; code: string; name: string; barcode: string; purchase: number; margin: number; price: number; vat: number; category: string; origin: string; quantity: number };
type InventoryApiProduct = { _id: string; sku: string; name: string; barcode?: string; category?: string; origin?: string; stockQty: number; sellingPrice: number; costPrice?: number };
type Customer = { id: string; name: string; email: string; phone: string; tin: string; credit: number; address: string };
type Discount = { id: string; customerId: string | null; customer: string; product: string; title: string; percent: number; start: string; end: string };
type Request = { id: string; date: string; createdAt: string; status: string; items: string; operator: string };
type CustomerApiDocument = { _id: string; name: string; email: string; phone: string; tin: string; credit: number; address: string };
type DiscountApiDocument = { _id: string; customerId: string | null; customerName: string; product: string; title: string; percent?: number; start: string; end: string };
type RequestApiDocument = { _id: string; createdAt: string; status: string; items: string; operator: string };
type CustomerPayment = { id: string; createdAt: string; amount: number; paymentMethod: string; balanceBefore: number; balanceAfter: number; receivedBy: string };
type CustomerPaymentApiDocument = { _id: string; createdAt: string; amount: number; paymentMethod: string; balanceBefore: number; balanceAfter: number; receivedBy: string };
type SaleLineItem = { productId: string; sku: string; name: string; quantity: number; unitPrice: number; lineTotal: number; discountAmount?: number };
type Sale = { id: number; receiptNumber: string; date: string; customer: string; customerPhone: string; paymentMethod: string; total: number; subtotal: number; discountTotal: number; amountPaid: number; paymentStatus: string; items: number; credit: number; lineItems: SaleLineItem[] };
type SaleApiDocument = { _id: string; receiptNumber: string; createdAt: string; customerId?: string | null; customerName?: string; customerPhone?: string; paymentMethod: string; total: number; subtotal?: number; discountTotal?: number; amountPaid?: number; balanceDue?: number; paymentStatus?: string; items: SaleLineItem[] };
type DashboardAction = (screen: Screen) => void;

type NavigationItem = { label: string; screen: Screen | "Logout"; icon: string };
const navItems: NavigationItem[] = [
  { label: "Dashboard", screen: "Dashboard", icon: "⌂" },
  { label: "Inventory", screen: "Inventory", icon: "▤" },
  { label: "Sales", screen: "Sales", icon: "▧" },
  { label: "Customer", screen: "Customer", icon: "♙" },
  { label: "Discount", screen: "Discount", icon: "%" },
  { label: "Request", screen: "Request", icon: "▣" },
  { label: "Report", screen: "Report", icon: "▥" },
  { label: "Logout", screen: "Logout", icon: "↪" },
];
const adminNavItems: NavigationItem[] = [
  { label: "Dashboard", screen: "Dashboard", icon: "⌂" },
  { label: "Users", screen: "Users", icon: "♙" },
  { label: "Organizations", screen: "Organizations", icon: "⌂" },
  { label: "Transactions", screen: "Transactions", icon: "▧" },
  { label: "Financial Overview", screen: "Financial Overview", icon: "◫" },
  { label: "Reports", screen: "Report", icon: "▥" },
  { label: "Audit Logs", screen: "Audit Logs", icon: "▤" },
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
function toInventoryProduct(product: InventoryApiProduct): Product {
  const purchase = product.costPrice || 0;
  return {
    id: product._id,
    code: product.sku,
    name: product.name,
    barcode: product.barcode || "—",
    purchase,
    margin: purchase > 0 ? Math.round(((product.sellingPrice - purchase) / purchase) * 100) : 0,
    price: product.sellingPrice,
    vat: 0,
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
    title: document.title,
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
    date: Number.isNaN(createdAt.getTime()) ? today() : createdAt.toISOString().slice(0, 10),
    customer: document.customerName || "Walk-in customer",
    customerPhone: document.customerPhone || "",
    paymentMethod: document.paymentMethod,
    total: document.total,
    subtotal: document.subtotal ?? document.total,
    discountTotal: document.discountTotal || 0,
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
  const [requests, setRequests] = useState<Request[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [saleSaving, setSaleSaving] = useState(false);
  const [businessSaving, setBusinessSaving] = useState(false);
  const [saleError, setSaleError] = useState("");
  const [paymentQrOpen, setPaymentQrOpen] = useState(false);
  const [printSale, setPrintSale] = useState<Sale | null>(null);
  const [modal, setModal] = useState<"product" | "adjust" | "customer" | "discount" | "request" | "sale" | "credit-payment" | "invoice" | "user" | null>(null);
  const [message, setMessage] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [reportType, setReportType] = useState("");
  const [reportStartDate, setReportStartDate] = useState(today());
  const [reportEndDate, setReportEndDate] = useState(today());
  const [requestStatusFilter, setRequestStatusFilter] = useState("All statuses");
  const [saleDate, setSaleDate] = useState(today());
  const [cart, setCart] = useState<Record<string, number>>({});
  const saleRequestId = useRef<string | null>(null);
  const creditPaymentRequestId = useRef<string | null>(null);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [creditPaymentError, setCreditPaymentError] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
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
  }, [session?.email]);

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
    `${product.code} ${product.name} ${product.barcode}`.toLowerCase().includes(productQuery.toLowerCase())
  ), [products, productQuery]);
  const filteredCustomers = useMemo(() => customers.filter(customer =>
    `${customer.name} ${customer.email} ${customer.phone}`.toLowerCase().includes(customerQuery.toLowerCase())
  ), [customers, customerQuery]);
  const filteredUsers = useMemo(() => users.filter(user =>
    `${user.email} ${roleNames[user.role]}`.toLowerCase().includes(userQuery.toLowerCase())
  ), [users, userQuery]);
  const lowStock = products.filter(product => product.quantity > 0 && product.quantity <= 5).length;
  const outOfStock = products.filter(product => product.quantity === 0).length;
  const lowStockProducts = products.filter(product => product.quantity > 0 && product.quantity <= 5);
  const unitsInStock = products.reduce((sum, product) => sum + product.quantity, 0);
  const inventoryCostValue = products.reduce((sum, product) => sum + product.purchase * product.quantity, 0);
  const cartTotal = products.reduce((sum, product) => sum + product.price * (cart[product.id] || 0), 0);
  const activeSaleDiscounts = discounts.filter(discount =>
    discount.percent > 0 &&
    discount.start <= today() &&
    discount.end >= today() &&
    (!discount.customerId || discount.customerId === form.customerId) &&
    products.some(product => (cart[product.id] || 0) > 0 && discountProductMatches(discount, product))
  );
  const selectedSaleDiscount = activeSaleDiscounts.find(discount => discount.id === form.discountId);
  const saleDiscountTotal = selectedSaleDiscount
    ? Number(products.reduce((total, product) => {
        const quantity = cart[product.id] || 0;
        if (!quantity || !discountProductMatches(selectedSaleDiscount, product)) return total;
        const lineTotal = Number((product.price * quantity).toFixed(2));
        return total + Number((lineTotal * selectedSaleDiscount.percent / 100).toFixed(2));
      }, 0).toFixed(2))
    : 0;
  const saleTotal = Number((cartTotal - saleDiscountTotal).toFixed(2));
  const mtnPayment = buildMtnMomoPaymentPayload(saleTotal, mtnMerchantCode);
  const todaysSales = sales.filter(sale => sale.date === today());
  const todaysRevenue = todaysSales.reduce((sum, sale) => sum + sale.total, 0);
  const pendingRequests = requests.filter(request => request.status === "Pending").length;
  const selectedDateSales = sales.filter(sale => sale.date === saleDate);
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
      ? products.filter(product => product.quantity > 0 && product.quantity <= 5)
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
  }, [products, reportEndDate, reportStartDate, reportType, requests, sales]);
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

  function openUserEditor(user?: ManagedUser) {
    setForm(user
      ? { email: user.email, role: user.role, password: "" }
      : { email: "", role: "", password: "" });
    setEditingUserId(user?._id || null);
    setUserFormError("");
    setModal("user");
  }

  async function saveProduct() {
    const name = form.name?.trim() || "";
    const code = form.code?.trim() || "";
    const quantity = Number(form.quantity);
    const price = Number(form.price);
    const purchase = form.purchase ? Number(form.purchase) : 0;
    if (!name || !code || !form.quantity?.trim() || !form.price?.trim() || !Number.isSafeInteger(quantity) || quantity < 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(purchase) || purchase < 0) {
      setMessage("Enter a product code, name, valid price and quantity.");
      return;
    }
    setInventoryError("");
    setInventorySaving(true);
    try {
      if (editingProduct !== null) {
        const product = products.find(item => item.id === editingProduct);
        if (!product) throw new Error("Select a valid product to adjust.");
        const change = quantity - product.quantity;
        if (change === 0) {
          setModal(null);
          setMessage("Stock quantity is unchanged.");
          return;
        }
        const response = await fetch(`${apiBaseUrl}/api/inventory/adjust`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: editingProduct,
            change,
            reason: "correction",
            note: "Inventory screen adjustment",
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to adjust stock.");
        setProducts(current => current.map(item => item.id === editingProduct
          ? { ...item, quantity: result.data.stockAfter }
          : item));
        setMessage("Stock adjustment saved.");
      } else {
        const response = await fetch(`${apiBaseUrl}/api/products`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku: code,
            name,
            barcode: form.barcode?.trim() || "",
            category: form.category?.trim() || "General",
            origin: form.origin?.trim() || "Local",
            sellingPrice: price,
            costPrice: purchase,
            stockQty: quantity,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to save product.");
        setProducts(current => [...current, toInventoryProduct(result.data)].sort((a, b) => a.name.localeCompare(b.name)));
        setMessage("Product added.");
      }
      setModal(null);
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
    if (!form.title?.trim()) { setMessage("Enter a discount title."); return; }
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
      const response = await fetch(`${apiBaseUrl}/api/discounts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer?.id || null,
          product: form.product?.trim() || "All products",
          title: form.title.trim(),
          percent,
          start: form.start || today(),
          end: form.end || today(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to save discount.");
      setDiscounts(current => [toDiscount(result.data), ...current]);
      setModal(null);
      setMessage("Discount added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save discount.");
    } finally {
      setBusinessSaving(false);
    }
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
          <div><strong>CARITAS</strong><small>HQ Shop</small></div>
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
            onStartInvoice={() => openModal("invoice")}
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
              <select aria-label="Shop"><option>HQ Shop</option></select>
              <select aria-label="Stock family"><option>Stock family</option>{Array.from(new Set(products.map(product => product.category))).map(category => <option key={category}>{category}</option>)}</select>
              <div className="search-box"><span>⌕</span><input aria-label="Search inventory" placeholder="Search here and press enter" value={productQuery} onChange={event => setProductQuery(event.target.value)} /></div>
              <button className="button button-orange" onClick={() => setProductQuery("")}>Search</button>
              <button className="button button-muted" onClick={() => {
                const product = products[0];
                openModal("adjust", product ? { id: String(product.id), name: product.name, code: product.code, price: String(product.price), quantity: String(product.quantity) } : {});
              }}>Adjust stock</button>
              <button className="button button-blue" onClick={() => openModal("product")}>＋ ADD</button>
            </div>
            {inventoryError && <p className="inventory-error" role="alert">{inventoryError}</p>}
            <p className="hint">Double click on barcode column to copy</p>
            <Table headers={["CODE", "NAME", "BARCODE", "PURCHASE C...", "MARGIN %", "SALE PRICE", "VAT", "CATEGORY", "ORIGIN", "QUANTITY"]}>
              {inventoryLoading && <tr><td colSpan={10}>Loading inventory…</td></tr>}
              {!inventoryLoading && !inventoryError && filteredProducts.length === 0 && <tr><td colSpan={10}>{products.length ? "No products match your search." : "No products in inventory yet."}</td></tr>}
              {filteredProducts.map(product => <tr key={product.id}>
                <td>{product.code}</td><td>{product.name}</td><td>{product.barcode}</td><td>{money(product.purchase)}</td>
                <td>{product.margin}%</td><td>{money(product.price)}</td><td>{product.vat}%</td><td>{product.category}</td><td>{product.origin}</td><td>{product.quantity}</td>
              </tr>)}
            </Table>
            <div className="table-footer"><span>Page 1 of 1</span><span>Item per page &nbsp; <select aria-label="Items per page"><option>20</option><option>50</option><option>100</option></select></span></div>
          </>}

          {(screen === "Sales" || screen === "Transactions") && <>
            <div className="sales-toolbar">
              <span className="section-label">{screen === "Transactions" ? "Transactions" : "Sales"}</span>
              <input aria-label="Sales date" type="date" value={saleDate} onChange={event => setSaleDate(event.target.value)} />
              <button className="button button-rose" onClick={() => setCart({})}>Cancel</button>
              <button className="button button-orange" onClick={() => openModal("sale", { paymentMethod: "mobile_money" })}>Pay</button>
              <button className="button button-muted" onClick={() => openModal("invoice")}>Open</button>
              <button className="button button-blue" onClick={() => openModal("sale")}>▣ &nbsp; SELL</button>
            </div>
            <Table headers={["INVOICE", "CLIENT", "PHONE", "TOTAL PRICE", "ITEMS", "DATE", "PAYMENT", "OPERATOR", ""]}>
              {salesLoading && <tr><td colSpan={9}>Loading invoices…</td></tr>}
              {!salesLoading && sales.filter(sale => sale.date === saleDate).length === 0 && <tr><td colSpan={9}>No invoices for this date.</td></tr>}
              {sales.filter(sale => sale.date === saleDate).map(sale => <tr key={sale.receiptNumber}>
                <td>{sale.receiptNumber}</td><td>{sale.customer}</td><td>{sale.customerPhone || "—"}</td><td>{money(sale.total)}</td><td>{sale.items}</td><td>{sale.date}</td><td>{sale.paymentMethod}</td><td>{session?.name}</td>
                <td><button className="table-action invoice-print-action" onClick={() => printInvoice(sale)}>Print</button></td>
              </tr>)}
            </Table>
            <div className="sales-summary"><span><i className="legend-red" /> Cancelled invoice</span><span><i className="legend-pink" /> No VAT sale</span><strong>Total amount: {money(sales.reduce((sum, sale) => sum + sale.total, 0))} &nbsp; | &nbsp; Total credit: RWF 0 (RWF 0 paid)</strong></div>
          </>}

          {screen === "Discount" && <>
            <div className="section-toolbar"><span className="section-label">Discounts</span><button className="button button-blue" onClick={() => openModal("discount")}>＋ ADD</button></div>
            <Table headers={["CUSTOMER", "PRODUCT", "TITLE", "DISCOUNT", "START ON", "END ON", "OPTIONS"]}>
              {discounts.map(discount => <tr key={discount.id}><td>{discount.customer}</td><td>{discount.product}</td><td>{discount.title}</td><td>{discount.percent ? `${discount.percent}%` : "Set a new rule"}</td><td>{discount.start}</td><td>{discount.end}</td><td><button className="table-action" disabled={businessSaving} onClick={() => void removeDiscount(discount.id)}>Remove</button></td></tr>)}
            </Table>
            <div className="legend"><span><i className="legend-green" /> Today activated</span><span><i className="legend-red" /> Forced terminated</span></div>
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
          {screen === "Organizations" && session?.role === "administration" && <AdminInfoPage
            title="Organizations"
            description="Organization records and branch-level setup are not connected in this POS prototype."
            detail="Organization management"
          />}
          {screen === "Audit Logs" && session?.role === "administration" && <AdminInfoPage
            title="Audit logs"
            description="User and transaction events are not being recorded in an audit log yet."
            detail="Audit logging is not configured"
          />}
          {screen === "Settings" && session?.role === "administration" && <AdminInfoPage
            title="Settings"
            description="Server and authentication settings are managed in the server environment configuration."
            detail="No editable application preferences are configured"
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
          <button className="invoice-button" onClick={() => openModal("invoice")}>PROFORMA INVOICE</button>
          <button className="sale-button" onClick={() => openModal("sale")}>SALE</button>
        </footer>}
      </main>
    </div>

    {modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
        <button className="modal-close" aria-label="Close dialog" onClick={() => setModal(null)}>×</button>
        {modal === "product" && <>
          <h2 id="modal-heading">Add product</h2>
          <p>Enter the product details for HQ Shop.</p>
          <FormField label="Code" value={form.code || ""} onChange={value => setField("code", value)} />
          <FormField label="Name" value={form.name || ""} onChange={value => setField("name", value)} />
          <FormField
            label="Barcode"
            value={form.barcode || ""}
            onChange={value => setField("barcode", value)}
            autoFocus
            autoComplete="off"
            placeholder="Scan or type barcode"
          />
          <CameraBarcodeScanner onDetected={barcode => setField("barcode", barcode)} />
          <small className="hint">USB/Bluetooth scanners and manual barcode entry also work.</small>
          <FormField label="Purchase cost" type="number" value={form.purchase || ""} onChange={value => setField("purchase", value)} />
          <FormField label="Sale price" type="number" value={form.price || ""} onChange={value => setField("price", value)} />
          <FormField label="Quantity" type="number" value={form.quantity || ""} onChange={value => setField("quantity", value)} />
          <FormField label="Category" value={form.category || ""} onChange={value => setField("category", value)} />
          <FormField label="Origin" value={form.origin || ""} onChange={value => setField("origin", value)} />
          {inventoryError && <p className="inventory-error" role="alert">{inventoryError}</p>}
          <button className="button button-blue modal-submit" disabled={inventorySaving} onClick={saveProduct}>{inventorySaving ? "Saving…" : "Save product"}</button>
        </>}
        {modal === "adjust" && <>
          <h2 id="modal-heading">Adjust stock</h2><p>{form.name || "Select a product and set its new quantity."}</p>
          {!editingProduct && <label className="field"><span>Product</span><select value={form.id || ""} onChange={event => {
            const product = products.find(item => String(item.id) === event.target.value);
            setForm(product ? { id: String(product.id), name: product.name, code: product.code, price: String(product.price), quantity: String(product.quantity) } : {});
            setEditingProduct(product?.id || null);
          }}><option value="">Select product</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>}
          <FormField label="New quantity" type="number" value={form.quantity || ""} onChange={value => setField("quantity", value)} />
          {inventoryError && <p className="inventory-error" role="alert">{inventoryError}</p>}
          <button className="button button-blue modal-submit" disabled={inventorySaving} onClick={saveProduct}>{inventorySaving ? "Saving…" : "Save adjustment"}</button>
        </>}
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
          <h2 id="modal-heading">Add discount</h2><p>Create a percentage rule. Active rules can be selected at checkout.</p>
          <FormField label="Title" value={form.title || ""} onChange={value => setField("title", value)} />
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
          <button className="button button-blue modal-submit" disabled={businessSaving} onClick={() => void saveDiscount()}>{businessSaving ? "Saving…" : "Save discount"}</button>
        </>}
        {modal === "request" && <>
          <h2 id="modal-heading">New stock request</h2><p>List each item and quantity needed for HQ Shop. The DAF team can review and approve the request.</p>
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
        {modal === "sale" && <>
          <h2 id="modal-heading">{form.creditSale === "true" ? "New credit sale" : "New sale"}</h2><p>Scan or enter each product code, then enter customer details to create an invoice.</p>
          <form className="sale-code-entry" onSubmit={event => { event.preventDefault(); addSaleProductByCode(form.productCode || ""); }}>
            <label className="field"><span>Product code or barcode</span><input autoFocus autoComplete="off" aria-label="Product code or barcode" placeholder="Scan or type code, then press Enter" value={form.productCode || ""} onChange={event => setField("productCode", event.target.value)} /></label>
            <button type="submit" className="button button-blue" disabled={!form.productCode?.trim()}>Add product</button>
          </form>
          <CameraBarcodeScanner onDetected={addSaleProductByCode} />
          {products.length ? <div className="sale-product-list">{products.map(product => <div key={product.id}><span>{product.name}<small>{product.code} · {money(product.price)} · {product.quantity} available</small></span><button aria-label={`Remove one ${product.name}`} disabled={!cart[product.id]} onClick={() => setCart(current => ({ ...current, [product.id]: Math.max(0, (current[product.id] || 0) - 1) }))}>−</button><b>{cart[product.id] || 0}</b><button aria-label={`Add one ${product.name}`} disabled={(cart[product.id] || 0) >= product.quantity} onClick={() => setCart(current => ({ ...current, [product.id]: (current[product.id] || 0) + 1 }))}>＋</button></div>)}</div> : <p className="empty-products">No products available. Add products in Inventory first.</p>}
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
            {activeSaleDiscounts.map(discount => <option key={discount.id} value={discount.id}>{discount.title} · {discount.percent}% · {discount.product}</option>)}
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
          {saleDiscountTotal > 0 && <div className="sale-discount-breakdown"><span>Subtotal <strong>{money(cartTotal)}</strong></span><span>Discount <strong>−{money(saleDiscountTotal)}</strong></span></div>}
          <div className="modal-total"><span>{form.creditSale === "true" ? "Credit due" : "Total"}</span><strong>{money(saleTotal)}</strong></div>
          {form.creditSale === "true"
            ? <button className="button button-blue modal-submit" disabled={!products.length || !form.customerId || saleSaving} onClick={() => void finishSale()}>{saleSaving ? "Saving credit sale…" : "Save credit sale"}</button>
            : form.paymentMethod === "mobile_money"
            ? <button className="button button-blue modal-submit" disabled={!products.length || saleSaving} onClick={() => paymentQrOpen ? void finishSale() : showMtnPaymentQr()}>{saleSaving ? "Saving invoice…" : paymentQrOpen ? "Payment received — Save & print invoice" : "Pay with MTN MoMo — Show QR"}</button>
            : <button className="button button-blue modal-submit" disabled={!products.length || saleSaving} onClick={() => void finishSale()}>{saleSaving ? "Saving invoice…" : "Save & print invoice"}</button>}
        </>}
        {modal === "invoice" && <>
          <h2 id="modal-heading">Proforma invoice</h2><p>Start a new invoice or select a product to add.</p>
          {products.length ? <div className="sale-product-list">{products.map(product => <div key={product.id}><span>{product.name}<small>{money(product.price)} · {product.quantity} available</small></span><button disabled={product.quantity === 0} onClick={() => setCart(current => ({ ...current, [product.id]: (current[product.id] || 0) + 1 }))}>＋</button><b>{cart[product.id] || 0}</b></div>)}</div> : <p className="empty-products">No products available. Add products in Inventory first.</p>}
          <div className="modal-total"><span>Estimated total</span><strong>{money(cartTotal)}</strong></div>
          <button className="button button-blue modal-submit" onClick={() => openModal("sale", { paymentMethod: "mobile_money" })}>Continue to sale</button>
        </>}
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
      </section>
    </div>}
    {printSale && <InvoicePrintView sale={printSale} />}
  </div>;
}

function InvoicePrintView({ sale }: { sale: Sale }) {
  const soldAt = new Date(sale.id);
  const date = Number.isNaN(soldAt.getTime()) ? sale.date : soldAt.toLocaleDateString("en-GB");
  const time = Number.isNaN(soldAt.getTime()) ? "" : soldAt.toLocaleTimeString("en-GB");
  const amount = (value: number) => value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return <section id="print-invoice" aria-label="Invoice to print">
    <header className="receipt-header">
      <strong>CARITAS SHOP</strong>
      <span>HQ Shop</span>
      <h1>FACTURE / SALES INVOICE</h1>
      <span>INVOICE NO: {sale.receiptNumber}</span>
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
      </article>)}
    </div>
    <div className="receipt-divider" />
    <div className="receipt-totals">
      <div><span>Total</span><strong>{amount(sale.total)}</strong></div>
      <div><span>TOTAL RWF</span><strong>{amount(sale.total)}</strong></div>
    </div>
    <div className="receipt-divider" />
    <div className="receipt-payment">
      <div><strong>{sale.paymentMethod.replaceAll("_", " ").toUpperCase()}</strong><strong>{amount(sale.total)}</strong></div>
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
  return <section className="admin-profile-page">
    <div className="admin-section-intro">
      <div><span>ACCOUNT</span><h2>Your profile</h2><p>Signed-in account details and access level.</p></div>
    </div>
    <div className="admin-profile-card">
      <span className="admin-profile-avatar">{session.name.charAt(0)}</span>
      <div className="admin-profile-details">
        <span className="profile-label">EMAIL</span><strong>{session.email}</strong>
        <span className="profile-label">NAME</span><strong>{session.name}</strong>
        <span className="profile-label">ROLE</span><strong>{roleNames[session.role]}</strong>
      </div>
      <button className="button button-rose" onClick={onSignOut}>Sign out</button>
    </div>
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

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  const empty = !children || (Array.isArray(children) && children.length === 0);
  return <div className="table-frame"><table><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>
    {empty ? <tr><td className="empty-cell" colSpan={headers.length}>No content in table</td></tr> : children}
  </tbody></table></div>;
}

function FormField({ label, value, onChange, type = "text", autoFocus, autoComplete, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoFocus?: boolean; autoComplete?: string; placeholder?: string }) {
  return <label className="field"><span>{label}</span><input type={type} value={value} onChange={event => onChange(event.target.value)} autoFocus={autoFocus} autoComplete={autoComplete} placeholder={placeholder} /></label>;
}

function TextAreaField({ label, value, onChange, placeholder, maxLength }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number }) {
  return <label className="field"><span>{label}</span><textarea value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} rows={5} /></label>;
}
