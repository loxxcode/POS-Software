"use client";

import { useCallback, useEffect, useState } from "react";
import QuickBooksMappingSettings from "./QuickBooksMappingSettings";

type Destination = "Inventory" | "Customer" | "Proformas" | "Sales" | "Settings";
type Props = { onNavigate: (screen: Destination) => void };
type BridgeStatus = {
  state: "loading" | "connected" | "disconnected";
  companyName: string | null;
  companyVerified: boolean;
  operations: string[];
  inventoryAdjustmentAccountConfigured: boolean;
  salesTransactionsEnabled: boolean;
  error: string;
};

type Workflow = {
  title: string;
  description: string;
  destination?: Destination;
  state: "available" | "partial" | "unavailable";
  action?: string;
};
type WorkflowGroup = { title: string; caption: string; workflows: Workflow[] };

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000").replace(/\/$/, "");

const workflowGroups: WorkflowGroup[] = [
  {
    title: "Vendors",
    caption: "Purchasing and accounts payable",
    workflows: [
      { title: "Purchase orders", description: "Vendor purchase-order creation is not connected.", state: "unavailable" },
      { title: "Receive inventory", description: "Receiving against a vendor order is not connected.", state: "unavailable" },
      { title: "Enter bills against inventory", description: "Vendor bills and inventory costing are not connected.", state: "unavailable" },
      { title: "Enter bills", description: "QuickBooks vendor-bill creation is not connected.", state: "unavailable" },
      { title: "Pay bills", description: "Bill payment posting is not connected.", state: "unavailable" },
    ],
  },
  {
    title: "Customers",
    caption: "Sales and receivables",
    workflows: [
      { title: "Estimates", description: "Create POS proformas; QuickBooks estimate posting is not connected.", destination: "Proformas", state: "partial", action: "Open proformas" },
      { title: "Invoices", description: "Credit-sale invoices post automatically to QuickBooks; accounting can retry eligible failures.", destination: "Sales", state: "partial", action: "Open sales" },
      { title: "Sales receipts", description: "Paid sales are saved to QuickBooks from the selected sale in the sales ledger.", destination: "Sales", state: "partial", action: "Open sales" },
      { title: "Receive payments", description: "Manage POS customer balances; QuickBooks receive-payment posting is not connected.", destination: "Customer", state: "partial", action: "Open customers" },
      { title: "Accept credit cards", description: "QuickBooks credit-card processing is not connected.", state: "unavailable" },
    ],
  },
  {
    title: "Company",
    caption: "Items, accounts, and inventory",
    workflows: [
      { title: "Chart of accounts", description: "Load QuickBooks accounts and configure the inventory-adjustment account.", destination: "Settings", state: "partial", action: "Open mappings" },
      { title: "Inventory activities", description: "Import mapped products and adjust POS stock. QuickBooks adjustments require a configured account.", destination: "Inventory", state: "partial", action: "Open inventory" },
      { title: "Items and services", description: "Browse QuickBooks items and import inventory/assembly products into POS.", destination: "Inventory", state: "partial", action: "Open item catalog" },
      { title: "Order checks", description: "Check ordering is not connected.", state: "unavailable" },
    ],
  },
  {
    title: "Banking",
    caption: "Deposits, reconciliation, and checks",
    workflows: [
      { title: "Record deposits", description: "Deposit posting is not connected.", state: "unavailable" },
      { title: "Reconcile", description: "Bank reconciliation is not connected.", state: "unavailable" },
      { title: "Write and print checks", description: "Check writing and printing are not connected.", state: "unavailable" },
      { title: "Refunds and credits", description: "QuickBooks refund and credit posting is not connected.", state: "unavailable" },
    ],
  },
  {
    title: "Employees",
    caption: "Payroll and employee records",
    workflows: [
      { title: "Payroll center", description: "Employee and payroll workflows are not connected.", state: "unavailable" },
      { title: "Pay employees and liabilities", description: "Payroll posting is not connected.", state: "unavailable" },
    ],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function getApiData(path: string): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include" });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      isRecord(body) && typeof body.message === "string"
        ? body.message
        : "Unable to read QuickBooks connection status."
    );
  }
  if (!isRecord(body) || body.success !== true || !isRecord(body.data)) {
    throw new Error("QuickBooks returned an invalid status response.");
  }
  return body.data;
}

function getStatusChip(state: Workflow["state"]) {
  if (state === "available") return "POS available";
  if (state === "partial") return "Partial";
  return "Not connected";
}

export default function QuickBooksWorkspace({ onNavigate }: Props) {
  const [bridge, setBridge] = useState<BridgeStatus>({
    state: "loading",
    companyName: null,
    companyVerified: false,
    operations: [],
    inventoryAdjustmentAccountConfigured: false,
    salesTransactionsEnabled: false,
    error: "",
  });

  const refresh = useCallback(async () => {
    setBridge(current => ({ ...current, state: "loading", error: "" }));
    try {
      const [health, company, capabilities, mappings] = await Promise.all([
        getApiData("/api/sync/quickbooks/health"),
        getApiData("/api/sync/quickbooks/company"),
        getApiData("/api/sync/quickbooks/capabilities"),
        getApiData("/api/sync/quickbooks/mappings/config"),
      ]);
      if (
        !isRecord(health) ||
        health.status !== "ready" ||
        !isRecord(company) ||
        !isRecord(capabilities) ||
        !Array.isArray(capabilities.operations) ||
        !capabilities.operations.every(operation => typeof operation === "string") ||
        !isRecord(mappings)
      ) {
        throw new Error("QuickBooks returned incomplete connection information.");
      }
      setBridge({
        state: "connected",
        companyName: typeof company.companyName === "string" ? company.companyName : null,
        companyVerified: company.companyVerified === true,
        operations: capabilities.operations,
        inventoryAdjustmentAccountConfigured:
          typeof mappings.inventoryAdjustmentAccountListId === "string" &&
          mappings.inventoryAdjustmentAccountListId.length > 0,
        salesTransactionsEnabled:
          capabilities.operations.includes("salesReceiptAdd") &&
          capabilities.operations.includes("invoiceAdd"),
        error: "",
      });
    } catch (error) {
      setBridge(current => ({
        ...current,
        state: "disconnected",
        error: error instanceof Error ? error.message : "Unable to reach the QuickBooks bridge.",
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const supportedOperations = [
    ["companyQuery", "Company identity"],
    ["preferencesQuery", "Preferences"],
    ["catalogsQuery", "Catalog lists"],
    ["inventoryAdjustmentAdd", "Inventory adjustment"],
    ["inventoryItemMod", "Inventory item updates"],
    ["customerAdd", "Customer creation"],
    ["customerMod", "Customer updates"],
    ["salesReceiptAdd", "Sales receipt posting"],
    ["invoiceAdd", "Invoice posting"],
  ] as const;

  return <div className="qb-workspace-page">
    <section className="admin-section-intro">
      <div>
        <span>QUICKBOOKS DESKTOP</span>
        <h2>Workflow center</h2>
        <p>Use this workspace to reach connected POS flows and see which QuickBooks Desktop workflows are still unavailable.</p>
      </div>
      <button className="button button-outline" type="button" onClick={() => void refresh()} disabled={bridge.state === "loading"}>
        {bridge.state === "loading" ? "CHECKING…" : "REFRESH CONNECTION"}
      </button>
    </section>

    <section className="qb-connection-card" aria-label="QuickBooks connection status">
      <div className="qb-connection-main">
        <span className={`qb-connection-indicator ${bridge.state}`} />
        <div>
          <strong>{bridge.state === "loading" ? "Checking bridge…" : bridge.state === "connected" ? "QuickBooks bridge connected" : "QuickBooks bridge unavailable"}</strong>
          <small>{bridge.companyName || "No company name returned"}{bridge.companyVerified ? " · company verified" : bridge.state === "connected" ? " · company identity not verified" : ""}</small>
        </div>
      </div>
      <div className="qb-connection-detail">
        <span>Inventory account</span>
        <strong>{bridge.inventoryAdjustmentAccountConfigured ? "Configured" : "Not configured"}</strong>
      </div>
      <div className="qb-connection-detail">
        <span>Sales receipts / invoices / payments</span>
        <strong>{bridge.salesTransactionsEnabled ? "Receipts and invoices connected" : "Not connected"}</strong>
      </div>
      {bridge.error && <p className="qb-workspace-error" role="alert">{bridge.error}</p>}
      {bridge.state === "connected" && !bridge.companyVerified && <p className="qb-workspace-warning" role="status">
        Verify the expected QuickBooks company in Settings before importing data or enabling accounting writes.
      </p>}
    </section>

    <section className="qb-capability-panel" aria-label="Bridge operations">
      <div className="qb-catalog-heading">
        <h4>Bridge operations</h4>
        <p>These are the capabilities exposed by the currently running local bridge.</p>
      </div>
      <div className="qb-capability-list">
        {supportedOperations.map(([operation, label]) => {
          const enabled = bridge.operations.includes(operation);
          return <span key={operation} className={enabled ? "enabled" : "disabled"}>
            <i aria-hidden="true">{enabled ? "✓" : "—"}</i>{label}
          </span>;
        })}
      </div>
    </section>

    <div className="qb-workflow-groups">
      {workflowGroups.map(group => <section className="qb-workflow-group" key={group.title}>
        <header>
          <div><h3>{group.title}</h3><p>{group.caption}</p></div>
        </header>
        <div className="qb-workflow-grid">
          {group.workflows.map(workflow => <article className={`qb-workflow-card ${workflow.state}`} key={workflow.title}>
            <div className="qb-workflow-card-heading">
              <strong>{workflow.title}</strong>
              <span>{getStatusChip(workflow.state)}</span>
            </div>
            <p>{workflow.description}</p>
            {workflow.destination && workflow.action
              ? <button type="button" className="admin-text-action" onClick={() => onNavigate(workflow.destination!)}>
                  {workflow.action} <span aria-hidden="true">→</span>
                </button>
              : <span className="qb-workflow-unavailable">QuickBooks action unavailable</span>}
          </article>)}
        </div>
      </section>)}
    </div>

    <QuickBooksMappingSettings />
  </div>;
}
