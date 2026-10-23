// Runs only an ephemeral, synthetic PostgreSQL database. No URLs/credentials accepted.
// Install @electric-sql/pglite outside the repository, then pass its directory:
// node supabase/tests/order-write-boundaries.mjs ../sql-audit-runtime/node_modules/@electric-sql/pglite
// --through=044 runs the same assertions against the vulnerable migration baseline.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const runtime = resolve(process.argv[2] ?? "../sql-audit-runtime/node_modules/@electric-sql/pglite");
const { PGlite } = await import(pathToFileURL(resolve(runtime, "dist/index.js")));
const { pgcrypto } = await import(pathToFileURL(resolve(runtime, "dist/contrib/pgcrypto.js")));
const db = new PGlite({ extensions: { pgcrypto } });
const migrationDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
const through = Number(process.argv.find((arg) => arg.startsWith("--through="))?.split("=")[1] ?? 46);

// Supabase's platform-owned schemas are the only test doubles. Application
// tables, grants, RLS, triggers and functions are loaded from real migrations.
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
`);
for (const filename of (await readdir(migrationDirectory)).sort()) {
  if (!filename.endsWith(".sql") || Number(filename.slice(0, 3)) > through) continue;
  if (filename.startsWith("046_")) {
    await db.exec("insert into public.payment_qr_cleanup_jobs (storage_path) values ('legacy-unverified-path.png')");
  }
  // PGlite has no scheduler; the actual reservation/lifecycle routines still load.
  const sql = (await readFile(resolve(migrationDirectory, filename), "utf8"))
    .replace("create extension if not exists pg_cron;", "");
  try { await db.exec(sql); } catch (error) {
    throw new Error(`Migration ${filename}: ${error.message}`);
  }
}

const owner = "10000000-0000-0000-0000-000000000001";
const otherOwner = "10000000-0000-0000-0000-000000000002";
const customer = "10000000-0000-0000-0000-000000000003";
const staff = "10000000-0000-0000-0000-000000000004";
const store = "20000000-0000-0000-0000-000000000001";
const otherStore = "20000000-0000-0000-0000-000000000002";
const product = "30000000-0000-0000-0000-000000000001";
const otherProduct = "30000000-0000-0000-0000-000000000002";
const payment = "40000000-0000-0000-0000-000000000001";
const order = "50000000-0000-0000-0000-000000000001";
await db.exec(`
  insert into auth.users (id) values ('${owner}'), ('${otherOwner}'), ('${customer}'), ('${staff}');
  insert into public.stores (id, owner_id, name, slug) values
    ('${store}', '${owner}', 'Synthetic A', 'synthetic-a'),
    ('${otherStore}', '${otherOwner}', 'Synthetic B', 'synthetic-b');
  insert into public.store_members (store_id, user_id, role) values ('${store}', '${staff}', 'staff');
  insert into public.store_applications (store_id, status) values ('${store}', 'active'), ('${otherStore}', 'active');
  insert into public.store_subscriptions (store_id, status) values ('${store}', 'active'), ('${otherStore}', 'active');
  insert into public.products (id, store_id, sku, name, slug, category, price, stock, is_active, status) values
    ('${product}', '${store}', 'SYN-A', 'Synthetic A', 'synthetic-a', 'test', 10, 10, true, 'active'),
    ('${otherProduct}', '${otherStore}', 'SYN-B', 'Synthetic B', 'synthetic-b', 'test', 10, 10, true, 'active');
  insert into public.store_payment_methods (id, store_id, code, label) values ('${payment}', '${store}', 'bank', 'Synthetic transfer');
  insert into public.orders (id, store_id, customer_id, order_number, customer_name, customer_email)
    values ('${order}', '${store}', '${customer}', 'SYN-EXISTING', 'Synthetic customer', 'customer@example.invalid');
`);

async function asRole(role, userId, operation) {
  await db.exec("savepoint actor");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(`set role ${role}`);
  try { return await operation(); }
  catch (error) {
    await db.exec("rollback to savepoint actor");
    throw error;
  }
  finally {
    await db.exec("reset role");
    await db.exec("select set_config('request.jwt.claim.sub', '', false)");
    await db.exec("release savepoint actor");
  }
}

let passed = 0;
let failed = 0;
async function test(name, operation) {
  await db.exec("begin");
  try {
    await operation();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { await db.exec("rollback"); }
}

const insertOrder = `insert into public.orders (store_id, order_number, customer_name, customer_email, payment_status)
  values ('${store}', 'SYN-FORGED', 'Synthetic', 'synthetic@example.invalid', 'paid')`;
const insertItem = `insert into public.order_items (order_id, product_id, product_name, product_sku, unit_price, quantity, line_total)
  values ('${order}', '${otherProduct}', 'Synthetic foreign product', 'SYN-B', 0, 7, 0)`;
const insertEvent = `insert into public.order_events (order_id, title) values ('${order}', 'Payment confirmed')`;
const insertAddress = `insert into public.order_shipping_addresses (order_id, recipient_name, phone, address_line_1, city, state, postal_code, country)
  values ('${order}', 'Synthetic', '000', 'Synthetic address', 'Test', 'Test', '000', 'Test')`;
for (const [name, sql] of [
  ["owner cannot insert a forged paid order", insertOrder],
  ["owner cannot append another store's product to an order", insertItem],
  ["owner cannot forge order timeline events", insertEvent],
  ["owner cannot insert an order shipping snapshot", insertAddress],
]) {
  await test(name, async () => {
    await assert.rejects(asRole("authenticated", owner, () => db.exec(sql)), { code: "42501" });
  });
}
await test("owner cannot rewrite an existing shipping snapshot", async () => {
  await db.exec(insertAddress);
  await assert.rejects(asRole("authenticated", owner, () => db.exec(
    `update public.order_shipping_addresses set address_line_1 = 'Forged' where order_id = '${order}'`
  )), { code: "42501" });
});
await test("legacy cross-store items cannot inflate another store's stock on cancellation", async () => {
  // Simulate an item persisted before the fix, using the migration-owner role.
  await db.exec(insertItem);
  await asRole("authenticated", owner, () => db.query(
    "select public.advance_order_fulfillment('SYN-EXISTING', 'cancelled', null)"
  ));
  const { rows } = await db.query("select stock from public.products where id = $1", [otherProduct]);
  assert.equal(rows[0].stock, 10);
});
await test("authenticated clients cannot call server checkout or inventory release", async () => {
  const { rows } = await db.query(`select
    has_function_privilege('authenticated', 'public.create_guest_checkout_order(text,text,text,text,text,text,text,text,text,text,uuid,jsonb,uuid)', 'execute') as checkout,
    has_function_privilege('authenticated', 'public.release_order_inventory(uuid)', 'execute') as release`);
  assert.deepEqual(rows[0], { checkout: false, release: false });
});

async function checkout(customerId = null) {
  return asRole("service_role", null, async () => {
    const { rows } = await db.query(`select * from public.create_guest_checkout_order(
      'synthetic-a', 'Synthetic customer', 'customer@example.invalid', '000',
      'Synthetic address', '', 'Test', 'Test', '000', 'Test', $1, $2::jsonb, $3)`,
    [payment, JSON.stringify([{ productId: product, quantity: 2 }]), customerId]);
    return rows[0];
  });
}
await test("server checkout reserves stock, writes snapshots and links the customer", async () => {
  const created = await checkout(customer);
  const { rows } = await db.query(`select o.customer_id, o.payment_status, o.total::text,
    (select count(*)::int from public.order_items where order_id = o.id) as items,
    (select count(*)::int from public.order_events where order_id = o.id) as events,
    (select count(*)::int from public.order_shipping_addresses where order_id = o.id) as addresses,
    (select stock from public.products where id = $2) as stock
    from public.orders o where id = $1`, [created.order_id, product]);
  assert.deepEqual(rows[0], { customer_id: customer, payment_status: "pending", total: "20.00", items: 1, events: 1, addresses: 1, stock: 8 });
});
await test("owner payment and fulfillment RPCs still work", async () => {
  const created = await checkout();
  await asRole("authenticated", owner, async () => {
    await db.query("select public.mark_order_paid($1, null)", [created.order_number]);
    await db.query("select public.advance_order_fulfillment($1, 'processing', null)", [created.order_number]);
  });
  const { rows } = await db.query("select payment_status, fulfillment_status from public.orders where id = $1", [created.order_id]);
  assert.deepEqual(rows[0], { payment_status: "paid", fulfillment_status: "processing" });
});
await test("cancellation restores same-store stock exactly once", async () => {
  const created = await checkout();
  await asRole("authenticated", owner, () => db.query("select public.advance_order_fulfillment($1, 'cancelled', null)", [created.order_number]));
  const released = await asRole("service_role", null, () => db.query("select public.release_order_inventory($1) as released", [created.order_id]));
  assert.equal(released.rows[0].released, false);
  const { rows } = await db.query("select stock from public.products where id = $1", [product]);
  assert.equal(rows[0].stock, 10);
});
await test("expiry cleanup restores legitimate reserved stock", async () => {
  const created = await checkout();
  await db.query("update public.orders set inventory_reservation_expires_at = now() - interval '1 hour' where id = $1", [created.order_id]);
  const { rows } = await asRole("service_role", null, () => db.query("select public.release_expired_inventory_reservations() as released"));
  assert.equal(rows[0].released, 1);
  assert.equal((await db.query("select stock from public.products where id = $1", [product])).rows[0].stock, 10);
});
await test("order reads remain isolated to owner and assigned customer", async () => {
  for (const [userId, count] of [[owner, 1], [customer, 1], [otherOwner, 0]]) {
    const { rows } = await asRole("authenticated", userId, () => db.query("select count(*)::int as count from public.orders where id = $1", [order]));
    assert.equal(rows[0].count, count);
  }
});
await test("staff cannot confirm payment", async () => {
  await assert.rejects(asRole("authenticated", staff, () => db.query("select public.mark_order_paid('SYN-EXISTING', null)")), /permission/);
});
if (through >= 46) {
  const image = "60000000-0000-0000-0000-000000000001.png";
  const ownPath = `stores/${store}/payment-methods/${payment}/${image}`;
  await test("QR references accept the owning method's canonical path and removal", async () => {
    await asRole("authenticated", owner, () => db.query(
      "update public.store_payment_methods set qr_image_path = $1 where id = $2", [ownPath, payment],
    ));
    assert.equal((await db.query("select qr_image_path from public.store_payment_methods where id = $1", [payment])).rows[0].qr_image_path, ownPath);
    await asRole("authenticated", owner, () => db.query(
      "update public.store_payment_methods set qr_image_path = null where id = $1", [payment],
    ));
  });
  for (const [name, path] of [
    ["another store", `stores/${otherStore}/payment-methods/${payment}/${image}`],
    ["another payment method", `stores/${store}/payment-methods/${otherProduct}/${image}`],
    ["traversal", `stores/${store}/payment-methods/${payment}/../${image}`],
    ["encoded separators", ownPath.replace('/payment-methods/', '%2Fpayment-methods%2F')],
    ["trailing newline", `${ownPath}\n`],
  ]) {
    await test(`QR references reject ${name}`, async () => {
      await assert.rejects(asRole("authenticated", owner, () => db.query(
        "update public.store_payment_methods set qr_image_path = $1 where id = $2", [path, payment],
      )), { code: "23514" });
    });
  }
  await test("legacy cleanup jobs survive migration without invented authority", async () => {
    const { rows } = await db.query("select store_id, payment_method_id from public.payment_qr_cleanup_jobs where storage_path = 'legacy-unverified-path.png'");
    assert.deepEqual(rows, [{ store_id: null, payment_method_id: null }]);
  });
  await test("new cleanup jobs require a matching scope", async () => {
    await db.query("insert into public.payment_qr_cleanup_jobs (storage_path, store_id, payment_method_id) values ($1, $2, $3)", [ownPath, store, payment]);
    await assert.rejects(asRole("service_role", null, () => db.query(
      "insert into public.payment_qr_cleanup_jobs (storage_path, store_id, payment_method_id) values ($1, $2, $3)",
      [ownPath.replace(store, otherStore), store, payment],
    )), { code: "23514" });
  });
  await test("customers cannot enqueue privileged QR cleanup", async () => {
    await assert.rejects(asRole("authenticated", owner, () => db.query(
      "insert into public.payment_qr_cleanup_jobs (storage_path, store_id, payment_method_id) values ($1, $2, $3)", [ownPath, store, payment],
    )), { code: "42501" });
  });
}
await test("a customer cannot assign platform administrator privileges", async () => {
  await assert.rejects(asRole("authenticated", customer, () => db.query(
    "update public.profiles set is_platform_admin = true where id = $1", [customer],
  )), /cannot be changed/);
});
await test("store owners cannot grant themselves complimentary subscription access", async () => {
  await assert.rejects(asRole("authenticated", owner, () => db.query(
    "select public.set_store_complimentary_access($1, 'grant', 'Synthetic test')", [store],
  )), /administrators/);
});
await test("guest tracking requires the matching private token", async () => {
  const created = await checkout();
  const allowed = await asRole("anon", null, () => db.query(
    "select * from public.get_guest_order_tracking('synthetic-a', $1, $2)", [created.order_number, created.tracking_token],
  ));
  const denied = await asRole("anon", null, () => db.query(
    "select * from public.get_guest_order_tracking('synthetic-a', $1, 'wrong-synthetic-token')", [created.order_number],
  ));
  assert.equal(allowed.rows.length, 1);
  assert.equal(denied.rows.length, 0);
});
await db.close();
console.log(`${passed} passed; ${failed} failed (migrations through ${through}).`);
process.exitCode = failed ? 1 : 0;
