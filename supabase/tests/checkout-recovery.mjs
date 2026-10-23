// Runs only an ephemeral, synthetic PostgreSQL database. No URLs/credentials accepted.
// Install @electric-sql/pglite outside the repository, then pass its directory:
// node supabase/tests/order-write-boundaries.mjs ../sql-audit-runtime/node_modules/@electric-sql/pglite
// --baseline skips the recovery migration and reproduces duplicate checkout.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const runtime = resolve(process.argv.slice(2).find(arg => !arg.startsWith("--")) ?? "../sql-audit-runtime/node_modules/@electric-sql/pglite");
const { PGlite } = await import(pathToFileURL(resolve(runtime, "dist/index.js")));
const { pgcrypto } = await import(pathToFileURL(resolve(runtime, "dist/contrib/pgcrypto.js")));
const db = new PGlite({ extensions: { pgcrypto } });
const migrationDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));

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
  if (!filename.endsWith(".sql") || (process.argv.includes("--baseline") && filename.includes("checkout_attempt_recovery"))) continue;
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
`);

const baseline=process.argv.includes("--baseline");
const key="a".repeat(64);
const params=["synthetic-a","Synthetic","recovery@example.invalid","000","Do not ship","","Test","Test","000","Test",payment,JSON.stringify([{productId:product,quantity:1}]),null];
async function checkout(attempt=key, changes={}) {
 const values=[...params]; for(const [index,value] of Object.entries(changes)) values[Number(index)]=value;
 if(!baseline)values.push(attempt);
 return (await db.query(`select * from public.${baseline?"create_guest_checkout_order":"create_checkout_order_idempotent"}(${values.map((_,i)=>'$'+(i+1)).join(',')})`,values)).rows[0];
}
async function count(table){return Number((await db.query(`select count(*) as n from public.${table}`)).rows[0].n);}
async function stock(){return (await db.query("select stock from public.products where id=$1",[product])).rows[0].stock;}
let passed=0, failed=0;
async function test(name,fn){await db.exec("begin");try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+(e.code||e.message));}finally{await db.exec("rollback");}}
await test("lost committed response recovers one original order and reserves once",async()=>{
 const first=await checkout(); const replay=await checkout();
 assert.equal(replay.order_id,first.order_id,"retry created another order");
 assert.equal(replay.tracking_token===first.tracking_token,true,"tracking capability changed");
 assert.equal(await count('orders'),1); assert.equal(await stock(),9);
 assert.equal(await count('order_events'),1); assert.equal(await count('store_notifications'),1);
});
if(!baseline){
 await test("invalid changed retry cannot claim the original committed order is absent",async()=>{await checkout();await assert.rejects(checkout(key,{11:'[]'}),{code:'22023'});});
 for(const [name,index,value] of [["changed address",4,"Different"],["different customer",12,customer],["different store",0,"synthetic-b"],["changed quantity",11,JSON.stringify([{productId:product,quantity:2}])]]) {
  await test(name+" cannot reuse a committed key",async()=>{await checkout(); await assert.rejects(checkout(key,{[index]:value}),{code:'22023'});});
 }
 await test("replay succeeds after stock, eligibility and payment method change",async()=>{
  const first=await checkout(); await db.exec(`update products set stock=0 where id='${product}'; update store_payment_methods set is_enabled=false where id='${payment}'; update store_subscriptions set status='suspended' where store_id='${store}';`);
  assert.equal((await checkout()).order_id,first.order_id); assert.equal(await stock(),0);
 });
 await test("cancelled order replay does not restore or reserve again",async()=>{
  const first=await checkout(); await db.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
  await db.query("select public.advance_order_fulfillment($1,'cancelled',null)",[first.order_number]);
  assert.equal(await stock(),10); assert.equal((await checkout()).order_id,first.order_id);assert.equal(await stock(),10);
 });
 await test("rollback removes ledger and inventory writes, allowing a safe retry",async()=>{
  await db.exec('savepoint failed_attempt'); await checkout(); await db.exec('rollback to failed_attempt');
  assert.equal(await count('checkout_attempts'),0); assert.equal(await stock(),10);
  await checkout(); assert.equal(await count('orders'),1);assert.equal(await stock(),9);
 });
 await test("new attempt can place a genuinely separate order",async()=>{await checkout();await checkout('b'.repeat(64));assert.equal(await count('orders'),2);assert.equal(await stock(),8);});
 await test("database stores neither raw recovery key nor tracking token",async()=>{
  const first=await checkout(); const ledger=JSON.stringify((await db.query('select * from public.checkout_attempts')).rows);
  assert.equal(ledger.includes(key),false);assert.equal(ledger.includes(first.tracking_token),false);
  const match=(await db.query("select guest_access_token_hash=encode(extensions.digest($1,'sha256'),'hex') as ok from orders where id=$2",[first.tracking_token,first.order_id])).rows[0];assert.equal(match.ok,true);
 });
 await test("canonical item order and duplicates replay the same request",async()=>{
  const first=await checkout(key,{11:JSON.stringify([{productId:product,quantity:2}])});
  const repeat=await checkout(key,{11:JSON.stringify([{productId:product,quantity:1},{productId:product,quantity:1}])});
  assert.equal(first.order_id,repeat.order_id);assert.equal(await stock(),8);
 });
 for(const role of ['anon','authenticated'])await test(role+" cannot execute privileged checkout",async()=>{await db.exec('set local role '+role);await assert.rejects(checkout(),{code:'42501'});});
 for(const role of ['anon','authenticated','service_role'])await test(role+" cannot read private attempt ledger",async()=>{await db.exec('set local role '+role);await assert.rejects(db.query('select * from public.checkout_attempts'),{code:'42501'});});
 await test("old non-idempotent service entry point is closed",async()=>{
  const r=await db.query("select has_function_privilege('service_role','public.create_guest_checkout_order(text,text,text,text,text,text,text,text,text,text,uuid,jsonb,uuid)','execute') as allowed");assert.equal(r.rows[0].allowed,false);
 });
 await test("service role can execute protected idempotent entry point",async()=>{await db.exec('set local role service_role');assert.ok((await checkout()).order_id);});
 await test("missing attempt key is rejected",async()=>{await assert.rejects(checkout(null),{code:'22023'});});
 await test("insufficient stock fails atomically without an attempt record",async()=>{
  await db.exec(`update products set stock=0 where id='${product}'`);await db.exec('savepoint invalid');
  await assert.rejects(checkout(),{code:'P0002'});await db.exec('rollback to invalid');assert.equal(await count('checkout_attempts'),0);assert.equal(await count('orders'),0);
 });
}
await db.close(); console.log(JSON.stringify({passed,failed,baseline})); if(failed)process.exitCode=1;
