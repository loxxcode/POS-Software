# QuickBooks Data Ownership and Mapping

## Scope

This document defines the QuickBooks integration policy, field mappings, and the supported POS sales-posting workflow.

## Responsibilities

- **QuickBooks Desktop** is authoritative for accounting-owned customers, supported items, accounts, sales-tax configuration, payment methods, transactions, and balances.
- **MongoDB** is the operational store and a cache of supported QuickBooks references and fields. It does not replace or restore a QuickBooks company file.
- **POS/MongoDB** is authoritative for POS-only business data and user workflows.

## Field-level ownership

| Entity or field | Authoritative source | MongoDB behavior | Write direction | Conflict policy |
|---|---|---|---|---|
| Customer `name`, `email`, `phone`, `address` | QuickBooks when mapped; POS for unmapped customer drafts | Existing POS fields remain in the customer record | Mapped edits are POS-driven under the current mapping workflow; resync is QuickBooks-to-MongoDB when import is implemented | Snapshot mismatch blocks auto-linking. Otherwise explicit administrator review; no blind last-write-wins |
| Customer `tin` | POS/MongoDB | Store POS-only TIN | No write to QuickBooks | POS wins |
| Customer `credit` | POS/MongoDB until accounting receivable posting is reconciled | Store POS outstanding balance and sale allocations | QuickBooks balance is read-only reference | Reconcile against QuickBooks customer balance; differences require review |
| Product `sku`, `barcode`, `isbn`, `author`, `category`, `origin`, `stockQty` | POS/MongoDB after initial import | Store POS-only catalog and stock state; a new QuickBooks inventory/assembly import initializes `stockQty` from QuickBooks on-hand; posted sales reduce QuickBooks on-hand through the receipt/invoice transaction | Manual stock adjustments use a separate inventory adjustment transaction | POS wins after import; re-import does not overwrite existing POS quantity |
| Product `name`, `sellingPrice` | POS/MongoDB mapping workflow today; eventual accounting policy remains QuickBooks item record | Mirror QuickBooks item name and sales price with ListID/EditSequence | POS edit may update an already mapped QuickBooks item | Current implementation: mapped record changes require bridge success. External edits require reconciliation; conflict requires review |
| Product `costPrice`, POS category/item type | POS/MongoDB | Store POS metadata | Not written unless a later approved mapping adds supported fields | POS wins |
| Inventory movements | POS/MongoDB | Append-only movement and audit history | Inventory quantities are not written to QuickBooks in the current policy | Reconcile only through a separately approved accounting policy |
| Accounts and tax/payment mappings | QuickBooks catalog values; POS mapping decisions | Cache ListIDs, mappings, and as-of timestamps | Catalog values are read-only; mappings are stored in POS settings | Catalog and mapping changes invalidate stale previews |
| Sale | POS/MongoDB for local operation; QuickBooks for confirmed accounting transaction | Sale remains locally durable; QuickBooks status, TxnID, type, and sync timestamp are references | Paid sales post as Sales Receipts on explicit accountant/admin action; credit sales post as Invoices automatically | Stable reference lookup precedes add; timeout/outcome unknown requires lookup/reconciliation |
| Customer payment | POS/MongoDB locally; QuickBooks after confirmed receive-payment creation | Store request ID, allocations, and accounting status | Later synchronization only | Stable request ID; query before uncertain retry |
| Sales receipt/invoice transaction | QuickBooks after confirmed creation | Store supported response identifiers and reconciliation status | Sales Receipts require explicit action; credit Invoices post automatically after sale commit | Stable reference lookup before retry; uncertain outcomes require review |
| Accounting balances | QuickBooks | Optional cache with `asOf` timestamp and stale status | Read-only | QuickBooks wins; stale values must be labeled |
| Proformas, discounts, users, roles, audit logs | POS/MongoDB | Existing models remain authoritative | Not posted unless a future approved workflow says otherwise | POS wins |

## Shared-field synchronization metadata

MongoDB mirror records must carry, when applicable:

- `quickBooksListId` or `quickBooksTxnId`: stable QuickBooks identifier.
- `quickBooksFullName`: display name returned by supported queries.
- `quickBooksEditSequence`: supported revision marker when available.
- `quickBooksSyncedAt`: last confirmed mirror synchronization.
- `quickBooksSyncStatus`: `pending`, `synced`, `stale`, `missing`, `failed`, or `requires_review`.
- `quickBooksLastError`: safe, structured reconciliation error text.
- `sourceSystem`: `pos`, `quickbooks`, or `both` for a specific workflow.

These fields are mirror metadata, not proof that the entire QuickBooks company file is backed up.

## Entity mapping

### Products and items

| POS field | MongoDB field | QuickBooks field or relation |
|---|---|---|
| Internal product ID | `_id` | Mapping key only; never send the POS ObjectId as a ListID |
| POS SKU | `sku` | QuickBooks item name/full name or a separately approved item code mapping |
| POS barcode | `barcode` | POS-only; no write until a supported mapping is approved |
| POS name | `name` | QuickBooks item `Name`/`FullName` |
| Sales price | `sellingPrice` | QuickBooks item sales price |
| Cost price | `costPrice` | POS-only until a purchase-cost policy is approved |
| Stock quantity | `stockQty` | POS operational quantity; QuickBooks `QuantityOnHand` initializes newly imported products; sold items are decremented by the posted receipt/invoice transaction |
| Mapping | `quickBooksItemListId` | QuickBooks item `ListID` |

Current model limitation: QuickBooks item type, income/expense/asset account references, and item-level tax configuration are not stored in the Product schema. They must be validated before transaction creation.

### Customers

| POS field | MongoDB field | QuickBooks field or relation |
|---|---|---|
| Internal customer ID | `_id` | Mapping key only |
| Name | `name` | QuickBooks customer `FullName` |
| Email | `email` | QuickBooks customer email |
| Phone | `phone` | QuickBooks customer phone |
| Address | `address` | QuickBooks customer billing address |
| TIN | `tin` | POS-only |
| Credit | `credit` | POS receivable state; reconcile to QuickBooks balances |
| Mapping | `quickBooksListId` | QuickBooks customer `ListID` |

### Sales and payments

| POS field | MongoDB field | QuickBooks target |
|---|---|---|
| Idempotency key | `clientRequestId` / `quickBooksRequestId` | Supported `OtherTxnRef`, memo, or equivalent where available |
| Receipt number | `receiptNumber` | Supported transaction reference where available |
| Customer | `customerId` / `customerName` | QuickBooks customer ListID for mapped customers |
| Line items | `items` | QuickBooks SalesItemLines or Invoice SalesItemLines |
| Paid-at-sale workflow | `paymentStatus=paid` | Sales Receipt; no Invoice unless a receivable is intended |
| Credit workflow | `paymentStatus=unpaid/partial` | Invoice plus later ReceivePayment operations |
| Accounting status | `quickBooksStatus` | Job and transaction reconciliation state |
| Accounting identifier | `quickBooksTxnId` | Confirmed QuickBooks TxnID only |
| Accounting kind | `quickBooksTxnType` | `SalesReceipt`, `Invoice`, or `ReceivePayment` |

No sale or payment may be marked `synced` unless QuickBooks confirms the transaction identifier. A receipt/invoice itself adjusts QuickBooks item quantity; do not also post an inventory adjustment for the same sold units.

## Mapping safety rules

1. Exact-match previews remain invalid if POS or QuickBooks catalog data changes.
2. Ambiguous, conflicting, truncated, or unmatched records are not auto-linked.
3. A unique QuickBooks ListID is not reused across two POS records.
4. Existing POS-only fields are preserved during QuickBooks imports.
5. QuickBooks absence from one incomplete query is not treated as deletion.
6. Deletion, inactive status, voiding, and missing records require separate reconciliation logic.
7. Imported QuickBooks products use a deterministic `QB-<ListID>` SKU and are available in POS checkout. Sales posted to QuickBooks reduce QuickBooks item quantity; manual stock changes use a separately configured inventory-adjustment account.
8. Product creation and customer creation have different policies: POS product creation is not automatically QuickBooks item creation; mapped POS customers may create QuickBooks customers under the existing approved workflow.

## Conflict policy

- POS and QuickBooks edits in the same field are not resolved by last-write-wins.
- If local edits and QuickBooks revisions both changed since the last confirmation, mark the record `requires_review`.
- The POS can continue safe local operations while accounting synchronization is unavailable.
- Any timeout or network failure must remain `outcome_unknown` until QuickBooks is queried for the stable request reference or transaction identifier.
- Manual reconciliation is required for permanent failures and unresolved outcomes.

## Next-stage boundary

The product-import flow creates POS records for active QuickBooks inventory and assembly items only; it does not create QuickBooks items. Sales receipt and invoice writes require verified company identity and completed customer, item, tax, payment/deposit, and receivable mappings. The bridge checks stable references before creating transactions. Do not duplicate sale quantities with a separate inventory adjustment, and reconcile unknown or total-mismatch results before retrying.
