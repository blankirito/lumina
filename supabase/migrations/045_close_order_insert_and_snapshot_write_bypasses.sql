-- Checkout owns order creation and snapshots; protected RPCs own later changes.
-- Migration 035 removed direct order UPDATE, but migration 005 still allowed
-- owners/admins to insert paid orders, append unreserved items, forge events,
-- and rewrite shipping snapshots through the authenticated table API.
revoke insert, update, delete on table
  public.orders,
  public.order_items,
  public.order_shipping_addresses,
  public.order_events
from public, anon, authenticated;

drop policy if exists "Store owners and admins can create orders"
on public.orders;
drop policy if exists "Store owners and admins can create order items"
on public.order_items;
drop policy if exists "Store owners and admins can create order addresses"
on public.order_shipping_addresses;
drop policy if exists "Store owners and admins can update order addresses"
on public.order_shipping_addresses;
drop policy if exists "Store owners and admins can create order events"
on public.order_events;

-- Also isolate release of any malformed items persisted before this fix.
-- The order lock and released timestamp preserve exactly-once restoration.
create or replace function public.release_order_inventory(
  p_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item record;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found or v_order.inventory_released_at is not null then
    return false;
  end if;

  for v_item in
    select product_id, quantity
    from public.order_items
    where order_id = v_order.id
      and product_id is not null
  loop
    update public.products
    set stock = stock + v_item.quantity
    where id = v_item.product_id
      and store_id = v_order.store_id;
  end loop;

  update public.orders
  set
    inventory_released_at = now(),
    inventory_reservation_expires_at = null
  where id = v_order.id;

  return true;
end;
$$;

revoke all on function public.release_order_inventory(uuid)
from public, anon, authenticated;
grant execute on function public.release_order_inventory(uuid)
to service_role;
