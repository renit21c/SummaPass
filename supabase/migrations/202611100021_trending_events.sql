-- Public catalog gets a boolean only, never payment or attendee details.
begin;
alter function public.public_catalog(text) rename to public_catalog_v20;
revoke all on function public.public_catalog_v20(text) from public,anon,authenticated,service_role;
create function public.public_catalog(p_slug text default null) returns jsonb
language sql stable security definer set search_path='' as $$
 with sales as (
  select e.id,count(t.id) sold
  from public.events e
  join public.bookings b on b.event_id=e.id and b.status='CONFIRMED'
  join public.payments p on p.booking_id=b.id and p.status='PAID'
  join public.booking_items i on i.booking_id=b.id and i.allocation_status='SOLD'
  join public.tickets t on t.booking_item_id=i.id and t.status='ACTIVE'
  where e.status='PUBLISHED' and e.cancelled_at is null and e.ends_at>statement_timestamp()
  group by e.id
 ), leaders as (
  select id from sales where sold=(select max(sold) from sales) and sold>0
 )
 select coalesce(jsonb_agg(item||jsonb_build_object('isTrending',exists(select 1 from leaders where id=(item->>'id')::uuid)) order by position),'[]'::jsonb)
 from jsonb_array_elements(public.public_catalog_v20(p_slug)) with ordinality entry(item,position);
$$;
revoke all on function public.public_catalog(text) from public;
grant execute on function public.public_catalog(text) to anon,authenticated;
commit;
