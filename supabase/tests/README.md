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

These tests cannot prove the deployed Supabase schema matches the repository, exercise hosted Storage APIs, or replace a separate staging migration rehearsal.
