# CARITAS SHOPPER POS

A Next.js + TypeScript POS prototype. Inventory products, stock adjustments, and completed sales/invoices are stored through the Express API; other POS business data remains in-memory for the current session.

## Quick start (Windows / macOS / Linux)
1. Install Node.js LTS (Node 20+ recommended).
2. Set `MONGODB_URI` and `AUTH_SESSION_SECRET` in `server/.env` (see below).
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

Administration accounts have a separate sidebar for Dashboard, Users, Organizations, Transactions, Financial Overview, Reports, Audit Logs, Settings, Notifications, and Profile. User Management can list, create, edit, and remove non-administrator staff accounts. Admins can update an account's email and role, or optionally reset its password (which invalidates that account's existing sessions). Only Administration can call these endpoints; administrator accounts are intentionally omitted from the staff table and managed separately. Organizations, Audit Logs, and Settings are currently informational placeholders.

Accountant accounts have a dedicated sidebar for Dashboard, Chart of Accounts, Income, Expenses, Journal Entries, Invoices, Bank Reconciliation, Financial Statements, Reports, and Profile. Income and Invoices show saved sales records. Chart of Accounts, Expenses, Journal Entries, Bank Reconciliation, and Financial Statements are placeholders until accounting data and backend support are added.

DAF accounts have a dedicated sidebar for Dashboard, Financial Overview, Transaction Review, Approvals, Budgets, Financial Statements, Audit & Compliance, Cash Flow, Reports, Activity Logs, and Profile. Transaction Review shows saved sales, and Approvals can approve or reject saved stock requests. The other DAF modules that need budgets, payment records, or audit data are placeholders.

## Included prototype screens
- Dashboard: role-specific Cashier, Accountant, DAF, and Administration overviews with role-relevant metrics and quick actions
- Inventory: database-backed product table, search, product entry, and stock adjustment
- Sales: saved sales, barcode/SKU checkout, customer name and phone, itemized invoices, and print actions
- Discount: database-backed discount rules with add and remove actions
- Customer: searchable database-backed customer list with add, edit, and remove actions
- Request: database-backed stock requests with saved approval decisions
- Reports: report-type selector
- User Management (Administration only): list, add, search, edit, and remove staff accounts
- Administration-only navigation: Organizations, Financial Overview, Notifications, and Profile

## Current limitations — important
- Role-specific API permissions, tenant/branch isolation, and audit logging are not implemented.
- Configure a private session secret and unique staff passwords before starting the server.
- MTN MoMo checkout displays a QR that opens the phone dialer with the merchant USSD code and invoice amount. The encoded `%23` represents the final `#`; the displayed fallback code retains the literal `#`. Complete MTN's payment confirmation flow and have staff confirm receipt before saving the invoice. Payment is not verified automatically. Card and other payment methods are recorded as selections only.
- No tax rules, refunds, voids, barcode device integration, or printer configuration.
- No true offline queue or cross-device synchronization.
- Demo receipts are not tax invoices and must not be used for real sales.

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
