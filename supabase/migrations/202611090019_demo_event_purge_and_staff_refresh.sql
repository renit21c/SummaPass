begin;

create or replace function public.staff_events() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('slug',e.slug,'title',e.title) order by e.starts_at,e.id),'[]'::jsonb)
 from public.events e
 where public.has_event_access(e.id,'STAFF')
   and e.status in ('PUBLISHED','UNPUBLISHED')
   and e.cancelled_at is null;
$$;

create function public.delete_demo_event(p_event uuid,p_confirmation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 e public.events%rowtype;
 v_bookings integer;
 v_tickets integer;
 v_check_ins integer;
begin
 select * into e from public.events where id=p_event for update;
 if not found then return jsonb_build_object('error','NOT_FOUND','message','Event tidak ditemukan.');end if;
 if auth.uid() is null or not public.has_event_access(p_event,'ORGANIZER') then
  return jsonb_build_object('error','FORBIDDEN','message','Akses organizer diperlukan.');
 end if;
 if p_confirmation is null or p_confirmation<>e.title then
  return jsonb_build_object('error','INPUT','message','Ketik nama event persis untuk mengonfirmasi penghapusan.');
 end if;

 select count(*) into v_bookings from public.bookings where event_id=p_event;
 select count(*) into v_tickets from public.tickets t join public.booking_items i on i.id=t.booking_item_id where i.event_id=p_event;
 select count(*) into v_check_ins from public.check_ins where event_id=p_event;

 delete from public.notification_receipts where provider_id in (
  select o.provider_id from public.notification_outbox o join public.notifications n on n.id=o.notification_id
  where n.event_id=p_event and o.provider_id is not null
 );
 delete from public.notifications where event_id=p_event;
 delete from public.check_ins where event_id=p_event;
 delete from public.ticket_secrets where ticket_id in (
  select t.id from public.tickets t join public.booking_items i on i.id=t.booking_item_id where i.event_id=p_event
 );
 delete from public.tickets where booking_item_id in (select id from public.booking_items where event_id=p_event);
 delete from public.attendees where booking_item_id in (select id from public.booking_items where event_id=p_event);
 delete from public.payments where booking_id in (select id from public.bookings where event_id=p_event);
 delete from public.booking_items where event_id=p_event;
 delete from public.bookings where event_id=p_event;
 delete from public.staff_invitations where event_id=p_event;
 delete from public.category_sections where category_id in (select id from public.ticket_categories where event_id=p_event);
 delete from public.ticket_categories where event_id=p_event;
 delete from public.event_seats where event_id=p_event;
 delete from public.seats where section_id in (select id from public.venue_sections where event_id=p_event);
 delete from public.venue_sections where event_id=p_event;
 delete from public.audit_logs where event_id=p_event;
 delete from public.event_access where event_id=p_event;
 delete from public.events where id=p_event;

 return jsonb_build_object(
  'deleted',true,'id',p_event,'slug',e.slug,'title',e.title,'coverUrl',e.cover_url,
  'removed',jsonb_build_object('bookings',v_bookings,'tickets',v_tickets,'checkIns',v_check_ins)
 );
end;$$;

revoke all on function public.delete_demo_event(uuid,text) from public,anon;
grant execute on function public.delete_demo_event(uuid,text) to authenticated;

-- Remove the exact obsolete fixture from existing demo deployments. The ID and
-- title guard ensure that no organizer-created event is selected accidentally.
do $$
declare v_event constant uuid:='20000000-0000-4000-8000-000000000004';
begin
 if exists(select 1 from public.events where id=v_event and slug='after-hours' and title='After Hours Sessions') then
  delete from public.notification_receipts where provider_id in (
   select o.provider_id from public.notification_outbox o join public.notifications n on n.id=o.notification_id
   where n.event_id=v_event and o.provider_id is not null
  );
  delete from public.notifications where event_id=v_event;
  delete from public.check_ins where event_id=v_event;
  delete from public.ticket_secrets where ticket_id in (
   select t.id from public.tickets t join public.booking_items i on i.id=t.booking_item_id where i.event_id=v_event
  );
  delete from public.tickets where booking_item_id in (select id from public.booking_items where event_id=v_event);
  delete from public.attendees where booking_item_id in (select id from public.booking_items where event_id=v_event);
  delete from public.payments where booking_id in (select id from public.bookings where event_id=v_event);
  delete from public.booking_items where event_id=v_event;
  delete from public.bookings where event_id=v_event;
  delete from public.staff_invitations where event_id=v_event;
  delete from public.category_sections where category_id in (select id from public.ticket_categories where event_id=v_event);
  delete from public.ticket_categories where event_id=v_event;
  delete from public.event_seats where event_id=v_event;
  delete from public.seats where section_id in (select id from public.venue_sections where event_id=v_event);
  delete from public.venue_sections where event_id=v_event;
  delete from public.audit_logs where event_id=v_event;
  delete from public.event_access where event_id=v_event;
  delete from public.events where id=v_event;
 end if;
end;$$;

commit;
