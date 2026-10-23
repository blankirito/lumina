# Migrations 045–046: synthetic rehearsal and recovery review

Date: 2026-10-21. Reviewed application baseline: `df7aafd`. Migration files were not changed by this review.

**GO for the local synthetic SQL rehearsal. NO-GO for a hosted rollout or production release on this evidence alone.** The migrations pass the local tests, but actual Supabase migration transaction/history behavior, Auth, PostgREST, Storage and scheduler integration remain unverified. No remote database, real customer data, deployment, merge, credentials or production service was accessed.

## Executed evidence

The rehearsal uses PGlite 0.5.10, an embedded PostgreSQL runtime, with a fresh in-memory database. All application migrations 001–046 are read from the repository. Auth identity resolution, Storage metadata and `cron.schedule` are minimal stubs; `pg_cron` installation is omitted. Application schemas, grants, RLS, triggers, constraints and stored procedures execute as PostgreSQL SQL. This is **not a hosted Supabase staging environment** and does not prove production lock duration, concurrency, extension compatibility or HTTP behavior.

| Check | Result |
| --- | --- |
| `supabase/tests/migration-rehearsal.mjs` | 18 passed, 0 failed |
| `supabase/tests/order-write-boundaries.mjs` through 046 | 25 passed, 0 failed |
| Payment Server Action isolation and cleanup-worker tests | 20 passed across 2 files |

Commands, from the repository root:

```text
node supabase/tests/migration-rehearsal.mjs ../sql-audit-runtime/node_modules/@electric-sql/pglite
node supabase/tests/order-write-boundaries.mjs ../sql-audit-runtime/node_modules/@electric-sql/pglite
node node_modules/vitest/vitest.mjs run src/lib/payments/paymentQrIsolation.test.ts src/lib/payments/paymentQrCleanup.test.ts
```

The first Vitest invocation failed before tests loaded because the sandbox temporary directory rejected a file rename. The rerun used process-local `TEMP` and `TMP` pointing to the writable `../migration-rehearsal-temp` directory and all 20 tests passed. No application change was needed for that environment failure.

The rehearsal seeded synthetic stores, owners, historical order/item/address/event snapshots, a canonical QR reference, an invalid cross-store QR reference, both canonical-looking and invalid legacy cleanup jobs, and a dummy Storage metadata row. It checked:

- Failure after 045 revocations, policy drops and function replacement rolls back table privileges, policies, function definition/ACL, relevant columns/constraints, data and a transactional rehearsal marker.
- Failure after each 046 DDL stage rolls back those changes while retaining committed 045 protections. A successful 046 dry run followed by explicit `ROLLBACK` has the same result.
- Successful commits preserve all seeded legacy data, timestamps, cleanup attempts/errors and Storage metadata. Newly added scope columns are NULL on existing cleanup jobs; no authority is invented from their paths.
- Both 046 constraints remain `NOT VALID`, yet reject invalid new writes and invalid updates. Attempting `VALIDATE CONSTRAINT` while invalid legacy rows remain fails without losing data.
- Partial autocommit 046 application after its first or second DDL statement cannot be blindly replayed: the existing named constraint causes `42710`. Completing only the verified missing suffix in a transaction succeeds and preserves data.
- Reapplying 045 leaves its completed hardened catalog unchanged.
- A legacy invalid QR row rejects even a label-only edit (`23514`). Its authorized owner can explicitly clear the QR reference and edit the label; the dummy foreign Storage object remains untouched. Existing action tests additionally prove removal/replacement does not call Storage deletion or enqueue cleanup for the untrusted path.
- Legacy cleanup jobs remain outside the hardened worker's scoped query, including jobs whose paths happen to look canonical. A new authenticated action can upsert a matching job with independently authorized scope; the test does not backfill by parsing a path.
- Old unscoped job inserts and retry updates fail after 046. Properly scoped orphan jobs survive payment-method/store deletion because provenance columns deliberately have no foreign keys.
- The existing boundary harness verifies service checkout, stock reservation, owner payment/fulfillment, cancellation/expiry restoration, customer linkage, private tracking tokens, direct-write denials and cross-store stock isolation.

The migration-history marker in the rehearsal is intentionally a simple transaction marker. It does not claim to reproduce the Supabase CLI migration ledger or its exact execution protocol.

## Independent callsite review and compatibility

045 revokes direct order/snapshot writes and removes their write policies. Current checkout uses the service-only `create_guest_checkout_order` RPC; order administration uses `mark_order_paid`, `advance_order_fulfillment` and `ship_order`. Order-reading callers keep their SELECT path. The new stock-release function preserves its lock/release marker and adds the product's store match. No current direct order INSERT dependency was found in the reviewed source.

046 must precede the updated payment action and cleanup worker. The action writes `store_id` and `payment_method_id` when it queues failed cleanup, and the worker selects both columns. Deploying that code before 046 produces missing-column failures. Migration 046 alone does **not** make the old application safe: the old cleanup worker at `c708662` reads `storage_path` and invokes service-role Storage removal before touching the queue row. Database CHECK constraints cannot intercept that external removal. An old payment action can likewise act on a stored untrusted reference. Both the old worker and old QR mutation path must be disabled during the transition.

Legacy invalid QR references remain readable after 046, including through the public payment-method reader. They are not automatically sanitized. Because PostgreSQL enforces `NOT VALID` checks on updated rows, label/instructions/enabled edits fail until the owner explicitly removes or replaces the invalid reference. The current action returns a generic update failure for that case. This is a known support and data-review requirement, not silent preservation of full edit compatibility.

The nullable cleanup scope fields are an intentional quarantine, not evidence that every legacy job should be populated. Even a well-formed path is not authorization. Do not bulk infer scope from `storage_path`, delete referenced objects merely because an old row names them, or globally validate the queue constraint while quarantined rows remain.

## Coordinated staging procedure

1. In a separately approved disposable hosted staging project, verify the migration ledger is exactly through 044 and compare existing grants, function ownership, policy definitions and schema against the expected baseline. Use synthetic fixtures only. Record the tool/version and transaction behavior actually used by the deployment runner.
2. Disable external invocations of the old QR cleanup endpoint and block the old QR mutation action. Confirm in-flight executions have drained and previous deployments/alternate URLs cannot receive those invocations. Keep any app rollback candidate gated the same way. This cannot be accomplished just by applying 046.
3. Capture counts of existing order snapshots, payment references, cleanup jobs and invalid references without exposing real data. In a later approved real rollout, inventory and backup requirements must be completed by the operator before applying migrations; this rehearsal did not do that work.
4. Apply 045 and then 046 using verified transaction boundaries. Keep each migration and its ledger update atomic under the chosen runner. If the runner cannot guarantee that, use the partial-application recovery procedure below and do not call a partially applied migration complete.
5. Verify effective INSERT/UPDATE/DELETE denial for anon/authenticated on all four order tables, retained SELECT access, service-only checkout/release privileges, the same-store release predicate, both exact 046 constraints, `convalidated = false`, nullable UUID provenance columns, and retained cleanup-table RLS/revocations.
6. Release the hardened app only after both migration states are confirmed. Check the public schema cache recognizes the added columns, then run authenticated end-to-end fixtures against hosted APIs and Storage. Keep QR work gated until the checks below pass.
7. Review invalid legacy references using independently established ownership. Use explicit owner removal/replacement or a reviewed scoped repair. Preserve untrusted objects; do not automatically delete them. Leave unproven legacy jobs quarantined. Re-enable the hardened QR action and worker after successful end-to-end checks.

## Failure, rollback and recovery procedure

### Failure before transaction commit

Issue `ROLLBACK` on the failed transaction or let the verified migration runner abort it. Compare actual catalogs and migration history with the recorded baseline before retrying. A failed 046 transaction must retain committed 045. If 045 also failed, the preexisting vulnerabilities remain; keep affected operations gated until the corrected rollout completes.

The rehearsal injected a real PostgreSQL error (`22012`) at multiple DDL boundaries and verified rollback. It did not simulate network loss while COMMIT acknowledgement is in flight. For an ambiguous commit, read the database catalog and ledger from a fresh connection before retrying; never assume failure means nothing committed.

### Partial or ambiguous application

- For 045, compare revocations, policies, function body and execute grants with the source. Its SQL is idempotent in this rehearsal, but replay through the deployment tool must still respect its history/ledger rules.
- For 046, inspect each of the three statements separately: payment-method constraint, both provenance columns, cleanup-job constraint. Compare complete definitions, UUID types, nullability and validation flags. Names or column existence alone are insufficient.
- If the verified state is an exact prefix of 046, complete only its missing suffix in one transaction and reconcile the deployment ledger through the approved runner. The harness rehearsed both possible intermediate prefixes. If state differs from the expected prefix, stop and prepare a specific repair against that state.
- Do not drop a live security check or grant back order writes just to make the original file replay. Do not mark 046 applied while one constraint or scope column is absent. A schema-complete/history-incomplete state needs ledger reconciliation, not repeated DDL.

The harness drops its local 046 fixture objects between partial-commit scenarios solely to reset an isolated in-memory test. Those reset statements are not a hosted rollback recipe.

### Application rollback after successful migration

Retain 045 and 046. Roll forward to a corrected build or use a known compatible build that retains the hardened QR authorization and scoped worker. If the rollback build lacks these protections, keep its QR update action and cleanup endpoint disabled. Core checkout/order operations must be smoke-tested against the retained RPC signatures and privileges before resuming traffic.

Do not restore vulnerable table grants, the old unguarded release routine, or the old QR cron worker. Old unscoped inserts may fail closed, but old service-role Storage removals are still destructive and are not protected by 046. Removing the new columns/checks for old-app compatibility would also break the hardened worker and reopen unsafe reference writes.

The separate PostgreSQL scheduled inventory-release job calls the database function changed by 045. That schedule is not the HTTP payment-QR cleanup worker. Verify its identity and invoker in hosted staging; do not replace it with an older release implementation during recovery.

## Hosted checks still required before GO

- **Migration runner:** actual migration transaction and ledger atomicity, an intentional staged failure, a fresh-connection ambiguous-commit inspection, and recovery using the same runner intended for release.
- **Auth/PostgREST:** real JWT identities for guest, customer, store owner/admin/staff and another store; effective table/column grants and RLS through HTTP; exact RPC exposure; schema-cache refresh and new-column read/write behavior. The SQL stubs do not prove these.
- **Storage:** real synthetic files in `payment-qr-codes`; public reads and browser write denial; service upload/removal, failing removal retry, scoped queue upsert, and poisoned legacy references that never delete a foreign object. Database metadata preservation is not a Storage API test.
- **Scheduler:** approved cron authentication, previous worker disabled, no overlapping old worker deployment, one hardened-worker synthetic pass, retry persistence and legacy jobs excluded before the batch limit. Verify the distinct `pg_cron` inventory job and extension permissions.
- **Operations/data:** lock duration under representative load, migration lock timeout/retry policy, concurrent checkout/cancellation/expiry behavior, preflight invalid-reference counts and repair ownership, monitoring, a retained-data/backups policy and a tested compatible app rollback artifact.

There is no demonstrated SQL blocker to proceeding to that authorized hosted staging rehearsal. **Hosted/production remains NO-GO until these checks have evidence and the legacy-reference/worker transition is owned.**
