-- Apply before deploying the updated payment action / cleanup worker.
-- NOT VALID preserves existing rows while enforcing the constraint for new
-- writes. Existing invalid QR references require review; do not delete their
-- Storage objects based on a reference that may have been supplied by a tenant.
alter table public.store_payment_methods
add constraint store_payment_methods_qr_image_scope_check
check (
  qr_image_path is null
  or (
    qr_image_path !~ '[^a-z0-9/.-]'
    and qr_image_path ~ (
      '^stores/' || store_id::text || '/payment-methods/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    )
  )
) not valid;

-- Provenance is set only by the authenticated action after authorizing the
-- store and payment method. Deliberately do not backfill from storage_path:
-- legacy jobs might contain a victim's path and must remain quarantined.
-- No FK: legitimate orphan cleanup must survive payment-method/store deletion.
alter table public.payment_qr_cleanup_jobs
  add column store_id uuid,
  add column payment_method_id uuid;

alter table public.payment_qr_cleanup_jobs
add constraint payment_qr_cleanup_jobs_scope_check
check (
  store_id is not null
  and payment_method_id is not null
  and storage_path !~ '[^a-z0-9/.-]'
  and storage_path ~ (
    '^stores/' || store_id::text || '/payment-methods/' || payment_method_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  )
) not valid;

-- RLS and the anon/authenticated revocations from 038 remain in force.
