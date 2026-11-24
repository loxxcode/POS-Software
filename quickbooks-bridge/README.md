# QuickBooks Desktop bridge

The bridge runs beside QuickBooks Desktop and binds only to `127.0.0.1`. It supports authenticated company, preferences, and active-catalog queries, narrowly scoped customer and mapped inventory-item master-data writes, inventory adjustments, and mapped sales receipt/invoice creation. It does not expose QuickBooks delete operations.

## Requirements

- QuickBooks Desktop 2024 with the matching QBFC 18 registration.
- .NET Framework 4.8 runtime. The .NET Framework 4.8 targeting pack is recommended for clean builds.
- QuickBooks Desktop open to the company file that will be mapped.

## Configure and build

Generate one random secret locally (do not send it in chat or commit it):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the generated value as `QB_BRIDGE_SECRET` in `server\.env` for the backend. Use the launcher below so the local bridge reads the same value directly from `server\.env`, without copying the secret into another terminal or printing it:

```powershell
node .\quickbooks-bridge\start-bridge.js
```

The launcher uses the last `QB_BRIDGE_SECRET` and `QB_BRIDGE_PORT` entries if a key is duplicated. Remove duplicate entries from `server\.env` and keep one authoritative value. In non-production mode, the backend also treats these two bridge settings in `server\.env` as authoritative over inherited terminal values. Do not put the secret in client-side environment variables or commit it to source control.

Build the x64 bridge from the repository root:

```powershell
& "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe" `
  "quickbooks-bridge\QuickBooksBridge.csproj" /p:Configuration=Release /p:Platform=x64
```

Keep QuickBooks Desktop open to the company file and dismiss any modal dialogs before loading lists; QBFC cannot access the company while a modal window is open. Run the launcher in the same user session as QuickBooks. The POS administrator can load the lists from **Settings → QuickBooks Desktop mapping setup**. The catalog query returns active names and ListIDs, tax-code flags/rates, payment methods, and account types; it does not return balances, transactions, customer contact details, or credentials.

The read-only company query returns the company name, legal name, country, sample-company flag, qbXML version, and a stable 64-character identity hash derived from those supported fields. An administrator should first load the company information and save the returned identity hash in the QuickBooks mapping configuration. Later company requests are rejected as `QUICKBOOKS_COMPANY_MISMATCH` if a configured company name, legal name, country, or identity hash differs. The hash is a company-open-check aid, not a filesystem path or a restorable company-file key.

QuickBooks informational status 1 responses that mean no matching object are treated as an empty catalog or an unavailable home-currency reference, rather than as a failed query. After rebuilding the bridge, stop the old bridge process and run the launcher again.

## Mapping and safety

The backend exposes bridge status, preferences, catalogs, POS product/customer mappings, and tax/payment/account mappings. Catalogs are fetched only after an administrator chooses **Load QuickBooks lists**. Creating a POS customer also creates its QuickBooks customer; editing a mapped customer updates its name, email, phone, and billing address. Customer credit balances and TIN are not written. Editing a mapped QuickBooks inventory or assembly item updates its name and sales price only. Administrators may import active QuickBooks inventory and assembly items into POS with a deterministic `QB-<ListID>` SKU; this creates POS products but does not create QuickBooks items. POS stock adjustments may post inventory-adjustment transactions when the adjustment account is configured.

Paid sales are posted as QuickBooks Sales Receipts when an accountant or administrator uses **Save sale to QuickBooks** on the selected sale. Credit-sale invoices are posted automatically after the POS sale commits. Posting requires a verified company identity and mapped QuickBooks customer and items; configure the default QuickBooks customer for walk-in paid sales. Credit invoices require an individually mapped customer and accounts-receivable account, while receipts require a payment method and deposit account. Each tax rate needs a mapped QuickBooks sales-tax code; taxable lines also need a compatible sales-tax item. The application rejects mixed sales-tax items in one transaction. QuickBooks transaction lines reduce QuickBooks inventory, so the same sale is not also sent as an inventory adjustment.

The bridge checks for a transaction with the stable POS reference number before adding it. A timeout or incomplete response is recorded as an unknown outcome and must be reconciled before another post. A saved transaction whose QuickBooks total differs from the POS total is held for review rather than silently marked synced. QuickBooks and MongoDB cannot be updated atomically; compare both systems after any failure.

The mapping setup can preview exact matches between POS product SKU/name and QuickBooks inventory-item name/full name, and between customer names. The administrator must apply the preview to link records and synchronize POS product names/prices and customer names/contact details into QuickBooks. Ambiguous, conflicting, unmatched, or catalog-truncated records are not auto-linked. The preview is invalidated if relevant POS or QuickBooks data changes before apply. Records with no exact match are not created automatically.

The current company reports multi-currency disabled and does not return a home-currency reference. Sales posting is restricted to the saved/verified company identity, and a multi-currency company is accepted only when its home currency is RWF. Before enabling posts in a live company, confirm the home currency, tax treatment, and all mappings with the accountant. Do not enable multi-currency or change company preferences as part of this setup.

Before deploying the unique idempotency and mapping indexes, run the preflight without flags from the `server` directory:

```powershell
node src\scripts\prepare-quickbooks-sync-index.js
```

Only if it reports no duplicates, create the indexes explicitly:

```powershell
node src\scripts\prepare-quickbooks-sync-index.js --create-index
```

The preflight reports counts only and does not print stored keys or ListIDs. Validate transaction posting first in a QuickBooks test company; the production posting path has not been live-tested as part of a build.

## Backup and recovery

Follow [the independent MongoDB and QuickBooks recovery procedure](../docs/backup-and-recovery.md). MongoDB and QuickBooks backups are independent; restore and reconcile them before resuming synchronization. A timeout or bridge outage must remain unresolved until QuickBooks is queried and the transaction is confirmed.
