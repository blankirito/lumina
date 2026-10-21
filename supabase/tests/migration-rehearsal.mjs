// Synthetic embedded PostgreSQL only. No database URL or credentials accepted.
// node supabase/tests/migration-rehearsal.mjs ../sql-audit-runtime/node_modules/@electric-sql/pglite
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const runtime = resolve(process.argv[2] ?? "../sql-audit-runtime/node_modules/@electric-sql/pglite");
const { PGlite } = await import(pathToFileURL(resolve(runtime, "dist/index.js")));
const { pgcrypto } = await import(pathToFileURL(resolve(runtime, "dist/contrib/pgcrypto.js")));
const db = new PGlite({ extensions: { pgcrypto } });
const directory = fileURLToPath(new URL("../migrations/", import.meta.url));
const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
async function migration(number) {
  const filename = files.find((file) => Number(file.slice(0, 3)) === number);
  assert.ok(filename, `Missing migration ${number}`);
  return (await readFile(resolve(directory, filename), "utf8"))
    .replace("create extension if not exists pg_cron;", "");
}

// Platform stubs: these do not emulate hosted Auth, Storage, PostgREST or pg_cron.
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  grant usage on schema public to service_role;
  alter default privileges in schema public grant all on tables to service_role;
  alter default privileges in schema public grant all on sequences to service_role;
  create schema auth;
  create schema extensions;
  create schema storage;
  create schema cron;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key, bucket_id text, name text);
  create function storage.foldername(text) returns text[] language sql immutable as
    $$ select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1)-1] $$;
  create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
  create schema rehearsal;
  -- A transactional marker only, not an emulation of Supabase CLI history.
  create table rehearsal.applied (version integer primary key);
`);
for (let version = 1; version <= 44; version++) await db.exec(await migration(version));
const sql45 = await migration(45);
const sql46 = await migration(46);
// Known statement boundaries; never split SQL on semicolons inside PL/pgSQL.
const first45 = sql45.indexOf("drop policy");
const function45 = sql45.indexOf("create or replace function");
const columns46 = sql46.indexOf("alter table public.payment_qr_cleanup_jobs");
const constraint46 = sql46.indexOf("alter table public.payment_qr_cleanup_jobs", columns46 + 1);
assert.ok(first45 > 0 && function45 > first45 && columns46 > 0 && constraint46 > columns46);

const owner = "10000000-0000-0000-0000-000000000001";
const other = "10000000-0000-0000-0000-000000000002";
const store = "20000000-0000-0000-0000-000000000001";
const otherStore = "20000000-0000-0000-0000-000000000002";
const payment = "40000000-0000-0000-0000-000000000001";
const invalidPayment = "40000000-0000-0000-0000-000000000002";
const order = "50000000-0000-0000-0000-000000000001";
const image = "60000000-0000-0000-0000-000000000001.png";
const ownPath = `stores/${store}/payment-methods/${payment}/${image}`;
const invalidPath = `stores/${otherStore}/payment-methods/${invalidPayment}/${image}`;
await db.exec(`
  insert into auth.users (id) values ('${owner}'), ('${other}');
  insert into public.stores (id, owner_id, name, slug) values
    ('${store}', '${owner}', 'Synthetic rehearsal A', 'rehearsal-a'),
    ('${otherStore}', '${other}', 'Synthetic rehearsal B', 'rehearsal-b');
  insert into public.store_payment_methods (id, store_id, code, label, qr_image_path) values
    ('${payment}', '${store}', 'valid', 'Synthetic valid reference', '${ownPath}'),
    ('${invalidPayment}', '${store}', 'legacy', 'Synthetic invalid reference', '${invalidPath}');
  insert into public.payment_qr_cleanup_jobs (storage_path, attempts, last_error) values
    ('${ownPath}', 2, 'Synthetic prior failure'), ('${invalidPath}', 1, 'Synthetic untrusted legacy reference');
  insert into public.orders (id, store_id, customer_id, order_number, customer_name, customer_email)
    values ('${order}', '${store}', '${owner}', 'SYN-REHEARSAL', 'Synthetic', 'synthetic@example.invalid');
  insert into public.order_items (order_id, product_name, product_sku, unit_price, quantity, line_total)
    values ('${order}', 'Historical snapshot', 'HISTORICAL', 10, 1, 10);
  insert into public.order_shipping_addresses (order_id, recipient_name, phone, address_line_1, city, state, postal_code, country)
    values ('${order}', 'Synthetic', '000', 'Synthetic address', 'Test', 'Test', '000', 'Test');
  insert into public.order_events (order_id, title) values ('${order}', 'Historical event');
  insert into storage.objects (id, bucket_id, name)
    values ('70000000-0000-0000-0000-000000000001', 'payment-qr-codes', '${invalidPath}');
`);

const tables = ["orders", "order_items", "order_events", "order_shipping_addresses", "store_payment_methods", "payment_qr_cleanup_jobs"];
async function rows(sql, params = []) { return (await db.query(sql, params)).rows; }
async function dataSnapshot() {
  const result = {};
  for (const table of tables) {
    // Ignore only newly added NULL provenance columns when comparing pre/post 046.
    result[table] = await rows(`select (to_jsonb(t) - ${table === "payment_qr_cleanup_jobs" ? "array['store_id','payment_method_id']" : "array[]::text[]"})::text as row
      from public.${table} t order by 1`);
  }
  result.objects = await rows("select to_jsonb(o)::text as row from storage.objects o order by 1");
  return result;
}
async function catalogSnapshot() {
  return {
    tables: await rows(`select relname, relacl::text, relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relname = any($1) order by relname`, [tables]),
    policies: await rows("select * from pg_policies where schemaname = 'public' order by tablename, policyname"),
    columns: await rows(`select table_name, column_name, data_type, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = any($1) order by table_name, ordinal_position`, [tables]),
    constraints: await rows(`select conname, convalidated, pg_get_constraintdef(oid) as definition from pg_constraint
      where connamespace = 'public'::regnamespace order by conname, conrelid`),
    release: await rows(`select pg_get_functiondef(oid) as definition, proacl::text from pg_proc
      where oid = 'public.release_order_inventory(uuid)'::regprocedure`),
    history: await rows("select * from rehearsal.applied order by version"),
  };
}
let passed = 0;
async function test(name, operation) {
  try { await operation(); passed++; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.stack}`); throw error; }
}
async function reversible(operation) {
  await db.exec("begin");
  try { await operation(); } finally { await db.exec("rollback"); }
}
async function expectFailure(sql, code) {
  await db.exec("savepoint expected_failure");
  try { await assert.rejects(db.exec(sql), { code }); }
  finally { await db.exec("rollback to expected_failure; release expected_failure"); }
}
async function injectedFailure(prefix, version) {
  const before = await catalogSnapshot();
  const beforeData = await dataSnapshot();
  await db.exec("begin");
  try {
    await db.exec(prefix);
    await db.query("insert into rehearsal.applied values ($1)", [version]);
    await assert.rejects(db.exec("select 1 / 0"), { code: "22012" });
  } finally { await db.exec("rollback"); }
  assert.deepEqual(await catalogSnapshot(), before);
  assert.deepEqual(await dataSnapshot(), beforeData);
}

try {
  for (const [point, prefix] of [["revokes", sql45.slice(0, first45)], ["policy drops", sql45.slice(0, function45)], ["function replacement", sql45]]) {
    await test(`045 failure after ${point} rolls back catalog, privileges, function, data and marker`, () => injectedFailure(prefix, 45));
  }
  const beforeData = await dataSnapshot();
  await test("045 successful transaction commits revocation and retains historical snapshots", async () => {
    await db.exec(`begin; ${sql45} insert into rehearsal.applied values (45); commit;`);
    assert.deepEqual(await dataSnapshot(), beforeData);
    for (const table of tables.slice(0, 4)) {
      for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
        const result = await rows("select has_table_privilege('authenticated', $1, $2) as allowed", [`public.${table}`, privilege]);
        assert.equal(result[0].allowed, false);
      }
    }
    assert.equal((await rows("select has_table_privilege('authenticated', 'public.orders', 'SELECT') as allowed"))[0].allowed, true);
  });
  await test("045 idempotent reapplication preserves the hardened state", async () => {
    const before = await catalogSnapshot();
    await db.exec(sql45);
    assert.deepEqual(await catalogSnapshot(), before);
  });
  for (const [point, prefix] of [["QR check", sql46.slice(0, columns46)], ["nullable columns", sql46.slice(0, constraint46)], ["cleanup check", sql46]]) {
    await test(`046 failure after ${point} rolls back without undoing 045`, () => injectedFailure(prefix, 46));
  }
  await test("046 operator dry-run ROLLBACK undoes completed DDL and retains 045", async () => {
    const before = await catalogSnapshot();
    await reversible(() => db.exec(sql46));
    assert.deepEqual(await catalogSnapshot(), before);
  });
  // Simulate a runner that commits each prefix separately. Recovery completes
  // only the verified missing suffix. It never drops a security constraint.
  for (const [point, boundary] of [["QR check", columns46], ["nullable columns", constraint46]]) {
    await test(`046 partial commit after ${point}: blind replay fails; verified forward completion works`, async () => {
      await db.exec(sql46.slice(0, boundary));
      await reversible(async () => {
        await expectFailure(sql46, "42710");
      });
      await db.exec(`begin; ${sql46.slice(boundary)} commit;`);
      assert.equal((await rows(`select count(*)::int as n from pg_constraint
        where conname in ('store_payment_methods_qr_image_scope_check','payment_qr_cleanup_jobs_scope_check')`))[0].n, 2);
      assert.deepEqual(await dataSnapshot(), beforeData);
      // Reset only this isolated rehearsal fixture to exercise the next scenario.
      // This is deliberately not a recovery/rollback recommendation.
      await db.exec(`alter table public.store_payment_methods drop constraint store_payment_methods_qr_image_scope_check;
        alter table public.payment_qr_cleanup_jobs drop constraint payment_qr_cleanup_jobs_scope_check;
        alter table public.payment_qr_cleanup_jobs drop column store_id, drop column payment_method_id;`);
    });
  }
  await test("046 commits both NOT VALID checks while preserving legacy rows and Storage metadata", async () => {
    await db.exec(`begin; ${sql46} insert into rehearsal.applied values (46); commit;`);
    assert.deepEqual(await dataSnapshot(), beforeData);
    const checks = await rows(`select conname, convalidated from pg_constraint where
      conname in ('store_payment_methods_qr_image_scope_check','payment_qr_cleanup_jobs_scope_check') order by conname`);
    assert.equal(checks.length, 2);
    assert.ok(checks.every((check) => check.convalidated === false));
    assert.deepEqual(await rows("select version from rehearsal.applied order by version"), [{ version: 45 }, { version: 46 }]);
  });
  await test("legacy jobs, even canonical paths, stay unscoped and outside the hardened worker query", async () => {
    assert.equal((await rows("select count(*)::int as n from public.payment_qr_cleanup_jobs where store_id is null and payment_method_id is null"))[0].n, 2);
    assert.equal((await rows("select count(*)::int as n from public.payment_qr_cleanup_jobs where store_id is not null and payment_method_id is not null"))[0].n, 0);
  });
  await test("legacy invalid QR blocks unrelated edits but explicit removal safely repairs the row", () => reversible(async () => {
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${owner}', true);`);
    await expectFailure(`update public.store_payment_methods set label = 'Updated label' where id = '${invalidPayment}'`, "23514");
    await db.exec(`update public.store_payment_methods set label = 'Repaired label', qr_image_path = null where id = '${invalidPayment}'`);
    await db.exec("reset role");
    assert.equal((await rows("select qr_image_path from public.store_payment_methods where id = $1", [invalidPayment]))[0].qr_image_path, null);
    assert.deepEqual((await dataSnapshot()).objects, beforeData.objects);
  }));
  await test("legacy constraint validation fails until reviewed repair; does not lose data", () => reversible(async () => {
    await expectFailure("alter table public.store_payment_methods validate constraint store_payment_methods_qr_image_scope_check", "23514");
    await expectFailure("alter table public.payment_qr_cleanup_jobs validate constraint payment_qr_cleanup_jobs_scope_check", "23514");
    await db.exec(`update public.store_payment_methods set qr_image_path = null where id = '${invalidPayment}'`);
    await db.exec("alter table public.store_payment_methods validate constraint store_payment_methods_qr_image_scope_check");
    assert.equal((await rows("select convalidated from pg_constraint where conname = 'store_payment_methods_qr_image_scope_check'"))[0].convalidated, true);
  }));
  await test("old application cleanup inserts and retry updates fail closed after 046", () => reversible(async () => {
    await db.exec("set local role service_role");
    await expectFailure("insert into public.payment_qr_cleanup_jobs(storage_path, last_error) values ('old-app-path.png', 'Synthetic failure')", "23514");
    await expectFailure(`update public.payment_qr_cleanup_jobs set attempts = attempts + 1 where storage_path = '${ownPath}'`, "23514");
  }));
  await test("trusted action can upgrade a matching legacy job using explicit scope, never path inference", () => reversible(async () => {
    await db.exec("set local role service_role");
    await db.exec(`insert into public.payment_qr_cleanup_jobs(storage_path, store_id, payment_method_id, last_error)
      values ('${ownPath}', '${store}', '${payment}', 'New authenticated cleanup attempt')
      on conflict (storage_path) do update set store_id = excluded.store_id,
        payment_method_id = excluded.payment_method_id, last_error = excluded.last_error`);
    assert.equal((await rows("select count(*)::int as n from public.payment_qr_cleanup_jobs where store_id is not null and payment_method_id is not null"))[0].n, 1);
    assert.equal((await rows("select attempts from public.payment_qr_cleanup_jobs where storage_path = $1", [ownPath]))[0].attempts, 2);
  }));
  await test("scoped orphan cleanup survives deletion of its payment method and store", () => reversible(async () => {
    await db.exec(`insert into public.payment_qr_cleanup_jobs(storage_path, store_id, payment_method_id)
      values ('${ownPath.replace(image, '60000000-0000-0000-0000-000000000002.png')}', '${store}', '${payment}');
      delete from public.stores where id = '${store}';`);
    assert.equal((await rows("select count(*)::int as n from public.payment_qr_cleanup_jobs where store_id is not null"))[0].n, 1);
  }));
  console.log(`${passed} passed; 0 failed. Synthetic embedded PostgreSQL only; hosted staging remains unverified.`);
} finally { await db.close(); }
