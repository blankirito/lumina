# Local database boundary regression tests

The harness creates an ephemeral PGlite PostgreSQL database and synthetic fixtures. It accepts no database URL and never connects to Supabase or a production database. Application migrations are executed as written except that `pg_cron` installation is omitted. Supabase-owned auth/storage schemas and the scheduler are minimal test doubles; pgcrypto, application RLS, privileges, triggers and functions execute in PostgreSQL.

From the repository root, install the isolated test runtime outside the app:

```sh
npm install --prefix ../sql-audit-runtime --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.10
node supabase/tests/order-write-boundaries.mjs ../sql-audit-runtime/node_modules/@electric-sql/pglite
```

Expected: 25 passing cases, migrations through 046. The suite covers tenant order reads, direct order/snapshot write rejection, legitimate server checkout, payment/fulfillment authorization, inventory restoration, QR path constraints, legacy cleanup quarantine, administrator self-assignment, complimentary access and guest tracking tokens.

To verify that the order regression tests detect the original flaws:

```sh
node supabase/tests/order-write-boundaries.mjs ../sql-audit-runtime/node_modules/@electric-sql/pglite --through=044
```

Expected: six security assertions fail against the old schema. This is a deliberately failing baseline, not a command to run against a hosted database.

For synthetic migration failure, rollback and forward-recovery scenarios:

```sh
node supabase/tests/migration-rehearsal.mjs ../sql-audit-runtime/node_modules/@electric-sql/pglite
```

Expected: 18 passing cases. See [the migration rehearsal and recovery review](../../docs/migration-rehearsal-2026-10-21.md) for the tested scenarios, safe transition order and hosted verification requirements.

These tests cannot prove the deployed Supabase schema matches the repository, exercise hosted Storage APIs, or replace a separate hosted staging migration rehearsal.
## Checkout response-loss recovery

Run `node supabase/tests/checkout-recovery.mjs ../sql-audit-runtime/node_modules/@electric-sql/pglite` for the isolated recovery/permission tests. Add `--baseline` to demonstrate duplicate checkout before the recovery migration. No hosted database credentials are accepted by this test.

Apply `20261021151151_checkout_attempt_recovery.sql` after 046 and before the updated application. Drain old checkout requests first. The migration revokes the old non-idempotent service entry point; old application instances must fail closed during this transition. Keep the migration and attempt ledger on rollback, and do not restore the old grant. A compatible application artifact is required for rollback.

The recovery capability is private, saved in browser session storage, and never belongs in logs, analytics or URLs. Refreshes in that tab reuse it. Closing/clearing the tab or using a different browser loses that capability; a customer with an uncertain order must contact the store rather than start a new attempt. Distinct keys intentionally represent distinct orders. Existing orders created before this migration cannot be retroactively deduplicated.

The service-only RPC binds the attempt to normalized order details, store and trusted customer identity. It commits reservation, order, notification and hashed attempt record together. Replay returns the original snapshot and does not reserve again, including after cancellation or store suspension. New-order retry is permitted only after serialized absence checking and a confirmed failed transaction. Do not automatically expire or delete the ledger without a separately designed retention/tombstone policy.

Hosted rehearsal must use an explicitly verified isolated project, synthetic records only, no real transfers, maximum four concurrent requests, statement/lock timeouts, and explicit cleanup. Database contention and simulated transaction cancellation are not a production capacity benchmark or proof of regional failover.
