# QuickBooks Data Ownership and Mapping

## Scope

This document defines Stage 2 of the QuickBooks integration. It is a policy and field-mapping baseline only. It does not enable accounting transaction writes.

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
| Product `sku`, `barcode`, `isbn`, `author`, `category`, `origin`, `stockQty` | POS/MongoDB | Store POS-only catalog and stock state | Not written to QuickBooks | POS wins; inventory changes remain POS operational data |
| Product `name`, `sellingPrice` | POS/MongoDB mapping workflow today; eventual accounting policy remains QuickBooks item record | Mirror QuickBooks item name and sales price with ListID/EditSequence | POS edit may update an already mapped QuickBooks item | Current implementation: mapped record changes require bridge success. External edits require reconciliation; conflict requires review |
| Product `costPrice`, POS category/item type | POS/MongoDB | Store POS metadata | Not written unless a later approved mapping adds supported fields | POS wins |
| Inventory movements | POS/MongoDB | Append-only movement and audit history | Inventory quantities are not written to QuickBooks in the current policy | Reconcile only through a separately approved accounting policy |
| Accounts and tax/payment mappings | QuickBooks catalog values; POS mapping decisions | Cache ListIDs, mappings, and as-of timestamps | Catalog values are read-only; mappings are stored in POS settings | Catalog and mapping changes invalidate stale previews |
| Sale | POS/MongoDB for local operation; QuickBooks for confirmed accounting transaction | Sale remains locally durable; QuickBooks status, TxnID, type, and sync timestamp are references | New accounting creation is deferred to the synchronization stage | Never invent a TxnID; timeout/outcome unknown requires lookup/reconciliation |
| Customer payment | POS/MongoDB locally; QuickBooks after confirmed receive-payment creation | Store request ID, allocations, and accounting status | Later synchronization only | Stable request ID; query before uncertain retry |
| Sales receipt/invoice/payment transaction | QuickBooks after confirmed creation | Store supported response identifiers and reconciliation status | QuickBooks write is one-way from a confirmed outbox job | Idempotent request key and TxnID query prevent duplicate transactions |
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
| Stock quantity | `stockQty` | POS operational quantity; QuickBooks `QuantityOnHand` is read-only cache |
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

No sale or payment may be marked `synced` unless QuickBooks confirms the transaction identifier.

## Mapping safety rules

1. Exact-match previews remain invalid if POS or QuickBooks catalog data changes.
2. Ambiguous, conflicting, truncated, or unmatched records are not auto-linked.
3. A unique QuickBooks ListID is not reused across two POS records.
4. Existing POS-only fields are preserved during QuickBooks imports.
5. QuickBooks absence from one incomplete query is not treated as deletion.
6. Deletion, inactive status, voiding, and missing records require separate reconciliation logic.
7. POS stock adjustments change MongoDB stock only and must not modify QuickBooks inventory quantities.
8. Product creation and customer creation have different policies: POS product creation is not automatically QuickBooks item creation; mapped POS customers may create QuickBooks customers under the existing approved workflow.

## Conflict policy

- POS and QuickBooks edits in the same field are not resolved by last-write-wins.
- If local edits and QuickBooks revisions both changed since the last confirmation, mark the record `requires_review`.
- The POS can continue safe local operations while accounting synchronization is unavailable.
- Any timeout or network failure must remain `outcome_unknown` until QuickBooks is queried for the stable request reference or transaction identifier.
- Manual reconciliation is required for permanent failures and unresolved outcomes.

## Next-stage boundary

Stage 3 may enable read-only company, preference, and catalog operations. Stage 4 may add mirror models and initial import. No Sales Receipt, Invoice, ReceivePayment, item creation, or accounting stock write is enabled until mapping, idempotency, reconciliation, and tests pass.
