-- Apply only after 045, 046 and checkout recovery, under the approved runner.
-- Do not grant the cleanup worker access to a legacy, unscoped queue.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_qr_cleanup_jobs'::regclass
      and conname = 'payment_qr_cleanup_jobs_scope_check'
  ) then
    raise exception 'Apply and verify scoped QR migration 046 before worker grants';
  end if;
end;
$$;

revoke all on table public.payment_qr_cleanup_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.payment_qr_cleanup_jobs to service_role;

-- TRUNCATE bypasses row filtering and is not needed by application roles.
revoke truncate on all tables in schema public from public, anon, authenticated, service_role;
-- Production's application objects/default ACL are owned by postgres.
alter default privileges for role postgres in schema public
  revoke truncate on tables from public, anon, authenticated, service_role;

alter function public.set_updated_at() set search_path = '';

-- Storage removal needs SELECT as well as DELETE. Without this scoped policy,
-- the API can return success with an empty deletion list and leave bytes behind.
drop policy if exists "Store owners and admins can inspect product images" on storage.objects;
create policy "Store owners and admins can inspect product images"
on storage.objects for select to authenticated
using (
  bucket_id = 'product-images'
  and (public.is_platform_admin() or public.has_store_role(
    public.product_image_store_id(name), array['owner', 'admin']::public.store_member_role[]
  ))
);
