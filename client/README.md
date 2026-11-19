# CARITAS SHOPPER POS

A Next.js + TypeScript POS prototype. Inventory products, stock adjustments, and completed sales/invoices are stored through the Express API; other POS business data remains in-memory for the current session.

## Quick start (Windows / macOS / Linux)
1. Install Node.js LTS (Node 20+ recommended).
2. Set `MONGODB_URI`, `AUTH_SESSION_SECRET`, and `FRONTEND_URL` in `server/.env` (see below). `FRONTEND_URL` must be the exact deployed frontend origin; multiple origins can be comma-separated.
3. In a terminal inside the `server` folder, run:

   ```bash
   npm install
   npm run create-user -- --email admin@example.com --role administration
   npm run dev
   ```

   The account command prompts twice for a password (input is hidden; use at least 12 characters). It creates the first Administration account in MongoDB.

4. In a second terminal inside the `client` folder, run:

   ```bash
   npm install
   npm run dev
   ```

5. Open http://localhost:3000

To test barcode scanning with a phone camera, open the POS from a trusted HTTPS address reachable by the phone and allow camera access. Mobile browsers block camera access from plain HTTP LAN addresses. USB/Bluetooth keyboard-style scanners can scan directly into the barcode field.

Run the automated barcode-camera checks from the `client` directory with `npm test`. The tests simulate camera access and a decoded barcode; use **Test webcam / scan barcode** in the product form to check a real webcam.

## Staff sign-in and accounts
Set a private session secret in `server/.env`:

```env
AUTH_SESSION_SECRET=replace-with-at-least-32-random-characters
```

Generate a session secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Never commit `.env` or share the secret.

Create the first Administration account from the `server` directory:

```powershell
npm run create-user -- --email admin@example.com --role administration
```

The password is entered interactively and stored as a scrypt hash. The same command creates other roles by changing `--role` to `cashier`, `accountant`, or `daf`. Staff sign in with their email and password. The API issues an eight-hour, HttpOnly cookie; logout clears it. API routes for products, inventory, sales, and sync require a valid session.

Administration accounts have a separate sidebar for Dashboard, Users, Organizations, Transactions, Proformas, Financial Overview, Reports, Audit Logs, Settings, Notifications, and Profile. User Management can list, create, edit, and remove non-administrator staff accounts. Admins can update an account's email and role, or optionally reset its password (which invalidates that account's existing sessions); administrator accounts are intentionally omitted from the staff table and managed separately. Settings configure shop identity, proforma numbering and validity, tax treatment, and optional DAF approval thresholds.

Accountant accounts have a dedicated sidebar for Dashboard, Chart of Accounts, Income, Expenses, Journal Entries, Invoices, Proformas, Bank Reconciliation, Financial Statements, Reports, and Profile. Income and Invoices show saved sales records. Chart of Accounts, Expenses, Journal Entries, Bank Reconciliation, and Financial Statements are placeholders until accounting data and backend support are added.

DAF accounts have a dedicated sidebar for Dashboard, Financial Overview, Transaction Review, Approvals, Proformas, Budgets, Financial Statements, Audit & Compliance, Cash Flow, Reports, Activity Logs, and Profile. Transaction Review shows saved sales, and Approvals can approve or reject saved stock requests. DAF users can review proformas that meet the configured approval thresholds.

## Included prototype screens
- Dashboard: role-specific Cashier, Accountant, DAF, and Administration overviews with role-relevant metrics and quick actions
- Inventory: database-backed product table, search, product entry, and stock adjustment
- Sales: saved sales, barcode/SKU checkout, customer name and phone, itemized invoices, and print actions
- Proformas: create and revise quotation drafts, issue and record customer decisions, approve configured thresholds, download PDFs, and convert accepted quotes to sales
- Discount: database-backed discount rules with add and remove actions
- Customer: searchable database-backed customer list with add, edit, and remove actions
- Request: database-backed stock requests with saved approval decisions
- Reports: report-type selector
- User Management (Administration only): list, add, search, edit, and remove staff accounts
- Administration-only navigation: Organizations, Financial Overview, Notifications, and Profile

## Current limitations — important
- Some API routes enforce session and role permissions, and administrative activity is logged; tenant/branch isolation is not implemented.
- Configure a private session secret and unique staff passwords before starting the server.
- MTN MoMo checkout displays a QR that opens the phone dialer with the merchant USSD code and invoice amount. The encoded `%23` represents the final `#`; the displayed fallback code retains the literal `#`. Complete MTN's payment confirmation flow and have staff confirm receipt before saving the invoice. Payment is not verified automatically. Card and other payment methods are recorded as selections only.
- Tax rates and inclusive/exclusive treatment must be configured by the administrator; the application does not prescribe tax rules. Refunds, voids, barcode device integration, and printer configuration are not implemented.
- No true offline queue or cross-device synchronization.
- Demo receipts are not tax invoices and must not be used for real sales.

## Proforma workflow
Proformas are quotations, not sales or payment receipts, and do not reserve inventory. Drafts snapshot customer and product details; prices, saved or one-off percentage discounts, stock availability, and tax are validated again by the server before issue and conversion. Configure tax treatment and an explicit tax rate for every product (including `0%`) in Settings and Inventory before issuing. No tax rate or treatment is assumed by the application.

Cashiers can create and manage their own drafts, record customer acceptance or rejection, and convert accepted proformas. DAF approval is required only when enabled and a configured total-value or discount threshold is exceeded. Accountants can review the records; administrators can manage all proformas. Revisions and renewals retain the document number and create a new revision.

Conversion to cash, card, or other payment requires staff confirmation that payment was received; credit conversion requires a saved customer and adds the balance to that customer's account. Mobile-money conversion is blocked because server-side payment confirmation is not integrated. MongoDB must support transactions (for example, run as a replica set), as conversion and numbering use atomic transactions.

Run backend unit checks from the `server` directory with `npm test`; run client checks from `client` with `npm test` and `npm run build`.

## QuickBooks Desktop setup and reconciliation

Copy `server/.env.example` to `server/.env`, replace placeholders, remove duplicate `QB_BRIDGE_*` entries, and set `QBFC_SDK_COUNTRY` to the two-letter locale of the installed QuickBooks edition.

Build and start the read-only local bridge from the repository root:

```powershell
& "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe" `
  "quickbooks-bridge\QuickBooksBridge.csproj" /p:Configuration=Release /p:Platform=x64

node .\quickbooks-bridge\start-bridge.js
```

Keep QuickBooks Desktop open in the same Windows user session and verify the company before running catalog or reconciliation operations. Administration → Settings includes QuickBooks mapping and synchronization reconciliation.

Transaction synchronization is not enabled. The reconciliation panel only displays durable outbox jobs and lets an administrator enter a QuickBooks TxnID already confirmed inside QuickBooks. It does not create transactions or blindly retry unknown outcomes.

## Suggested production architecture
- Frontend: Next.js + TypeScript
- API: Node.js + Express
- Database: MongoDB Atlas + Mongoose
- Auth: scrypt password hashes and signed HttpOnly cookies; production deployment should add rate limiting and role permissions enforced by the API
- Core models: Tenant, Branch, User, Role/Permission, Product, InventoryMovement, Sale, SaleItem, Payment, AuditEvent
- Key principle: every business-owned record must be tenant-scoped; branch-level records must also be branch-scoped. Never rely on frontend hiding alone for security.
- Sales should be handled atomically so the same item cannot be sold beyond available stock. Add idempotency keys to prevent duplicate sales during retries/offline sync.

## Suggested team split
**Frontend developer:** POS, inventory, sales, reports, accessibility, responsive behavior, user feedback.
**Backend developer:** auth, roles, tenant/branch boundaries, models, API, stock/sale consistency, audit logs, automated tests.
**Together:** requirements, API contracts, acceptance tests, payment workflow, offline conflict strategy, pilot checklist.

## Recommended phases
1. Confirm requirements, user roles, tax/currency, and workflows.
2. Build database schema and API contract.
3. Implement authentication and tenant/branch isolation.
4. Build catalog and inventory movements.
5. Build checkout, payment recording, receipts, refunds/voids.
6. Add reporting, audit, backup/restore, tests, and pilot.
7. Only then integrate approved payment provider and offline synchronization.

## Before coding production, answer these
- Is this for one business or multiple separate businesses (SaaS)?
- Does each business have multiple branches?
- Which roles exist (owner, manager, cashier, stock manager)?
- What taxes/discount rules apply?
- Which payment methods and Mobile Money providers?
- Are barcode scanners and receipt printers required?
- Must checkout operate when internet is unavailable?
- What is the process for refunds, voids, cash drawer reconciliation, and end-of-day closing?
