# MongoDB and QuickBooks Backup and Recovery

This procedure covers independent recovery of the POS/MongoDB operational store and the QuickBooks Desktop company file. It does not restore the two systems transactionally.

## Responsibilities

- MongoDB preserves users, POS sales, proformas, stock movements, discounts, audit logs, sync jobs, and the mirror/checkpoint metadata.
- QuickBooks preserves the confirmed accounting company file.
- The mirror is not a complete QuickBooks backup.
- POS, accounting, and backup timestamps must be reconciled after any restore.

## MongoDB backup

Use the database provider's encrypted snapshots or MongoDB backup tooling. The repository does not require or install local backup credentials.

Example Atlas or self-hosted export:

```powershell
mongodump --uri="<mongodb-uri-without-credentials-in-shell-history>" --out="<timestamped-backup-directory>"
```

For production, prefer an automated provider snapshot or scheduled backup policy with:

- Encryption at rest and in transit.
- Restricted backup credentials.
- Backup retention and deletion policy.
- Monitoring for snapshot failure.
- A separate copy or provider-supported cross-region copy when required.

Do not copy `.env` into the database backup directory. Backups can contain personal and financial data.

## MongoDB restore

Restore only into an isolated database or a database where the restore will not overwrite active POS data.

```powershell
mongorestore --uri="<isolated-mongodb-uri>" --drop "<timestamped-backup-directory>"
```

After restore:

1. Stop POS writes.
2. Restore into the isolated target.
3. Verify collection counts, latest timestamps, authentication, and sync-job/checkpoint counts.
4. Restore application `.env` and secrets from the authorized secret store.
5. Run `node src\scripts\prepare-quickbooks-sync-index.js` in `server`.
6. Create unique indexes only if the preflight reports no duplicates.
7. Start the backend and verify `/api/health`.
8. Use the live bridge company check before resuming any sync.
9. Compare local pending/unknown sync jobs with QuickBooks transactions manually.

Do not mark unknown or failed jobs `synced` solely from a MongoDB restore.

## QuickBooks backup

Use QuickBooks Desktop's supported backup workflow, or the approved Windows backup platform:

1. Dismiss QuickBooks modal dialogs.
2. Use QuickBooks **Create Copy / Back Up Company** or the approved company backup schedule.
3. Store the backup on an approved, encrypted location with restricted access.
4. Record backup time and expected company identity, but do not expose the company file path in POS logs.
5. Test backups on an isolated Windows workstation and separate copy of QuickBooks.

Do not access or edit `.qbw`/company data through SQL or raw file manipulation. Do not enable multi-currency or change company preferences during recovery.

## QuickBooks restore

1. Stop the Node bridge and POS writes.
2. Restore the company backup through QuickBooks Desktop using its supported workflow.
3. Open the restored company in the logged-in Windows session used by the bridge.
4. Dismiss permissions and modal dialogs.
5. Run the read-only company query:

```powershell
$env:QBFC_SDK_COUNTRY="US"
& ".\quickbooks-bridge\bin\Release\QuickBooksBridge.exe" --company-query
```

6. Start the bridge:

```powershell
node .\quickbooks-bridge\start-bridge.js
```

7. Confirm the company identity hash, name, legal name, and country against the saved mapping.
8. Load read-only catalogs only after confirming the company.
9. Reconcile local sync jobs and transaction identifiers with QuickBooks before resuming writes.

## Independent restore drill

Perform at least quarterly:

1. Confirm the latest MongoDB snapshot and QuickBooks backup are available.
2. Restore MongoDB to an isolated test database.
3. Restore QuickBooks to an isolated test workstation/company copy.
4. Verify POS users, proformas, sales, stock movements, mapping settings, and sync-job counts.
5. Verify QuickBooks company identity and read-only catalogs.
6. Create no live accounting transaction during the drill.
7. Compare a sample of pending and confirmed jobs between systems.
8. Record the recovery time, missing records, and manual reconciliation actions.

## Failure matrix

| Failure | Safe POS behavior | Recovery action |
|---|---|---|
| MongoDB unavailable | Stop or fail controlled writes; do not pretend local operations succeeded | Restore database/provider endpoint, verify data, then resume |
| QuickBooks unavailable | Keep POS local operation if allowed; preserve pending accounting jobs | Restore bridge/company session; reconcile by stable request/job ID |
| Wrong company open | Reject company mismatch and block synchronization | Open configured company and reload identity |
| Timeout with possible accounting result | Mark `outcome_unknown`; never blind retry | Query/locate the transaction in QuickBooks, then reconcile by TxnID |
| MongoDB restore older than QuickBooks | POS mirror may be stale | Reconcile latest sales and transaction references manually |
| QuickBooks restore older than MongoDB | Locally recorded accounting intent may not exist in QuickBooks | Review pending jobs; do not duplicate confirmed transactions |

## Secrets

- Never commit `.env`, MongoDB credentials, bridge tokens, or QuickBooks credentials.
- Rotate `AUTH_SESSION_SECRET` and `QB_BRIDGE_SECRET` through the deployment process.
- Keep the bridge bound to `127.0.0.1` and run it in the same interactive Windows session as QuickBooks.
