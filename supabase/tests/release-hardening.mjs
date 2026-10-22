// Ephemeral PostgreSQL only. No remote database URL accepted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const runtime = resolve(process.argv[2] ?? '../sql-audit-runtime/node_modules/@electric-sql/pglite');
const { PGlite } = await import(pathToFileURL(resolve(runtime, 'dist/index.js')));
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  create table public.orders(id int primary key, updated_at timestamptz);
  create table public.payment_qr_cleanup_jobs(id int primary key, store_id uuid, payment_method_id uuid, storage_path text,
    constraint payment_qr_cleanup_jobs_scope_check check(store_id is not null and payment_method_id is not null));
  alter table public.payment_qr_cleanup_jobs enable row level security;
  revoke all on public.payment_qr_cleanup_jobs from public, anon, authenticated, service_role;
  create function public.set_updated_at() returns trigger language plpgsql as
    $$ begin new.updated_at=now(); return new; end; $$;
  create trigger update_time before update on public.orders for each row execute function public.set_updated_at();
  create schema storage;
  grant usage on schema storage to authenticated;
  create type public.store_member_role as enum('owner','admin','customer');
  create function public.is_platform_admin() returns boolean language sql as $$select false$$;
  create function public.has_store_role(uuid,public.store_member_role[]) returns boolean language sql as $$select $1::text=current_setting('fixture.store',true)$$;
  create function public.product_image_store_id(text) returns uuid language sql as $$select split_part($1,'/',2)::uuid$$;
  create table storage.objects(bucket_id text,name text);
  alter table storage.objects enable row level security;
  grant select,delete on storage.objects to authenticated;
  create policy delete_own on storage.objects for delete to authenticated using(bucket_id='product-images' and public.has_store_role(public.product_image_store_id(name),array['owner']::public.store_member_role[]));
  insert into storage.objects values('product-images','stores/10000000-0000-4000-8000-000000000001/products/a'),('product-images','stores/20000000-0000-4000-8000-000000000002/products/b');
`);
await db.exec(await readFile(new URL('../migrations/20261022023729_release_privilege_hardening.sql', import.meta.url), 'utf8'));
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('PASS ' + name); }
  catch (error) { failures++; console.error('FAIL ' + name + ': ' + error.message); }
}
await test('worker can insert, inspect, retry and acknowledge scoped cleanup', async () => {
  await db.exec('begin; set local role service_role');
  try {
    await db.exec("insert into public.payment_qr_cleanup_jobs values (1,'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','synthetic')");
    assert.equal((await db.query('select count(*)::int as n from public.payment_qr_cleanup_jobs')).rows[0].n, 1);
    await db.exec("update public.payment_qr_cleanup_jobs set storage_path='retry' where id=1; delete from public.payment_qr_cleanup_jobs where id=1");
    assert.equal((await db.query('select count(*)::int as n from public.payment_qr_cleanup_jobs')).rows[0].n, 0);
  } finally { await db.exec('rollback'); }
});
for (const role of ['anon','authenticated','service_role']) {
  await test(role + ' cannot TRUNCATE existing business tables', async () => {
    await db.exec('begin; set local role ' + role);
    try { await assert.rejects(db.exec('truncate public.orders'), {code:'42501'}); }
    finally { await db.exec('rollback'); }
  });
}
await db.exec('create table public.future_table(id int)');
await test('future tables lose TRUNCATE but retain ordinary SELECT', async () => {
  const {rows} = await db.query("select has_table_privilege('authenticated','public.future_table','truncate') as destructive, has_table_privilege('authenticated','public.future_table','select') as readable");
  assert.equal(rows[0].destructive, false); assert.equal(rows[0].readable, true);
});
await test('client roles retain no cleanup table writes', async () => {
  for (const role of ['anon','authenticated']) {
    const {rows} = await db.query("select has_table_privilege($1,'public.payment_qr_cleanup_jobs','insert') as allowed", [role]);
    assert.equal(rows[0].allowed, false);
  }
});
await test('updated_at works with a fixed empty search path', async () => {
  const {rows} = await db.query("select proconfig from pg_proc where oid='public.set_updated_at()'::regprocedure");
  assert.ok(rows[0].proconfig?.some(v => v === 'search_path=""'));
  await db.exec('insert into public.orders values(1,null); update public.orders set id=1');
  assert.ok((await db.query('select updated_at from public.orders')).rows[0].updated_at);
});
await test('Storage owner can delete its exact image but cannot inspect or delete another store image',async()=>{
  await db.exec("begin; set local role authenticated; set local fixture.store='10000000-0000-4000-8000-000000000001'");
  try{
    assert.equal((await db.query('select * from storage.objects')).rows.length,1);
    assert.equal((await db.query("delete from storage.objects where name='stores/20000000-0000-4000-8000-000000000002/products/b' returning name")).rows.length,0);
    assert.equal((await db.query("delete from storage.objects where name='stores/10000000-0000-4000-8000-000000000001/products/a' returning name")).rows.length,1);
  }finally{await db.exec('rollback');}
});
await db.close(); if (failures) process.exitCode = 1;
