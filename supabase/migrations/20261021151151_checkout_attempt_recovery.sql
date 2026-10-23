-- Apply after 046, before deploying checkout recovery. Drain old checkout
-- requests first: the old non-idempotent service entry point is revoked below.
-- Keep this ledger and migration on application rollback. Do not restore the
-- old checkout grant or prune attempts while a retry could still arrive.
create table public.checkout_attempts (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  store_id uuid not null references public.stores(id),
  order_id uuid not null unique references public.orders(id),
  created_at timestamptz not null default now()
);
alter table public.checkout_attempts enable row level security;
revoke all on table public.checkout_attempts from public, anon, authenticated, service_role;

create function public.create_checkout_order_idempotent(
  p_store_slug text, p_customer_name text, p_customer_email text,
  p_customer_phone text, p_address_line_1 text, p_address_line_2 text,
  p_city text, p_state text, p_postal_code text, p_country text,
  p_payment_method_id uuid, p_items jsonb, p_customer_id uuid,
  p_attempt_key text
)
returns table (
  order_id uuid, order_number text, tracking_token text,
  payment_method_label text, payment_instructions text, replayed boolean
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_key_hash text;
  v_request_hash text;
  v_tracking_token text;
  v_store_id uuid;
  v_attempt public.checkout_attempts;
  v_order public.orders;
  v_created record;
  v_items jsonb;
  v_has_attempt boolean;
begin
  if p_attempt_key is null or p_attempt_key !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023', message='Invalid checkout attempt.';
  end if;
  v_key_hash := encode(extensions.digest(p_attempt_key, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_key_hash, 0));
  select * into v_attempt from public.checkout_attempts where key_hash=v_key_hash;
  v_has_attempt := found;
  -- Stable guest tracking capability without storing the raw attempt key or
  -- raw tracking token. Never place these values in logs or error messages.
  v_tracking_token := encode(extensions.digest('lumina-tracking-v1:' || p_attempt_key, 'sha256'), 'hex');
  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 100 then
    if v_has_attempt then raise exception using errcode='22023', message='Checkout attempt does not match.'; end if;
    raise exception using errcode='P0002', message='Invalid checkout details.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) i
    where coalesce(i->>'productId','') !~ '^[a-f0-9-]{36}$'
      or coalesce(i->>'quantity','') !~ '^[1-9][0-9]{0,6}$') then
    if v_has_attempt then raise exception using errcode='22023', message='Checkout attempt does not match.'; end if;
    raise exception using errcode='P0002', message='Invalid checkout details.';
  end if;
  select jsonb_agg(jsonb_build_object('productId', product_id, 'quantity', quantity) order by product_id)
  into v_items from (
    select i->>'productId' as product_id, sum((i->>'quantity')::integer) as quantity
    from jsonb_array_elements(p_items) i group by i->>'productId'
  ) items;
  v_request_hash := encode(extensions.digest(jsonb_build_array(
    lower(btrim(p_store_slug)), p_customer_id, btrim(p_customer_name),
    lower(btrim(p_customer_email)), btrim(p_customer_phone), btrim(p_address_line_1),
    coalesce(btrim(p_address_line_2), ''), btrim(p_city), btrim(p_state),
    btrim(p_postal_code), btrim(p_country), p_payment_method_id, v_items
  )::text, 'sha256'), 'hex');

  -- The transaction lock covers lookup, reservation, notification and ledger
  -- insertion. It also serializes a retry while the original commit is pending.
  if v_has_attempt then
    if v_attempt.request_hash <> v_request_hash then
      raise exception using errcode='22023', message='Checkout attempt does not match.';
    end if;
    select * into strict v_order from public.orders where id=v_attempt.order_id and store_id=v_attempt.store_id;
    -- Replay the original snapshot even if stock, method or eligibility later
    -- changed. Never reserve again or resurrect a cancelled/expired order.
    return query select v_order.id, v_order.order_number, v_tracking_token,
      v_order.payment_method_label, coalesce(v_order.payment_method_instructions, ''), true;
    return;
  end if;

  begin
    select * into strict v_created from public.create_guest_checkout_order(
      p_store_slug,p_customer_name,p_customer_email,p_customer_phone,
      p_address_line_1,p_address_line_2,p_city,p_state,p_postal_code,p_country,
      p_payment_method_id,v_items,p_customer_id
    );
  exception when raise_exception or invalid_text_representation or numeric_value_out_of_range then
    -- This subtransaction rolled back; only this code permits a new attempt.
    raise exception using errcode='P0002', message='Checkout details are unavailable.';
  end;
  select store_id into strict v_store_id from public.orders where id=v_created.order_id;
  update public.orders set guest_access_token_hash=encode(extensions.digest(v_tracking_token,'sha256'),'hex')
    where id=v_created.order_id;
  perform public.create_new_order_notifications(v_created.order_id,p_customer_name);
  insert into public.checkout_attempts(key_hash,request_hash,store_id,order_id)
    values(v_key_hash,v_request_hash,v_store_id,v_created.order_id);
  return query select v_created.order_id,v_created.order_number,v_tracking_token,
    v_created.payment_method_label,v_created.payment_instructions,false;
end;
$$;
revoke all on function public.create_checkout_order_idempotent(text,text,text,text,text,text,text,text,text,text,uuid,jsonb,uuid,text)
  from public,anon,authenticated;
grant execute on function public.create_checkout_order_idempotent(text,text,text,text,text,text,text,text,text,text,uuid,jsonb,uuid,text)
  to service_role;
revoke all on function public.create_guest_checkout_order(text,text,text,text,text,text,text,text,text,text,uuid,jsonb,uuid)
  from service_role;
notify pgrst, 'reload schema';
