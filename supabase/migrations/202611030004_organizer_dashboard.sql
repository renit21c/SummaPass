begin;
create or replace function public.seat_inventory(p_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.events; result jsonb;
begin
 select * into e from public.events where slug=p_slug and (status='PUBLISHED' or public.has_event_access(id,'ORGANIZER'));
 if not found then return jsonb_build_object('error','NOT_FOUND','message','Event tidak ditemukan.');end if;
 select jsonb_build_object('eventId',e.id,'slug',e.slug,'mode','supabase','serverNow',clock_timestamp(),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'price',c.price_idr,'quota',c.quota,'sections',coalesce((select jsonb_agg(s.name) from public.category_sections cs join public.venue_sections s on s.id=cs.section_id where cs.category_id=c.id),'[]'::jsonb)) order by c.price_idr desc) from public.ticket_categories c where c.event_id=e.id),'[]'::jsonb),
 'seats',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'section',vs.name,'row',s.row_label,'number',s.number,'x',s.x,'y',s.y+case when vs.name='Regular' then 235 else 0 end,'status',case when exists(select 1 from public.booking_items i where i.event_id=e.id and i.seat_id=s.id and i.allocation_status='SOLD') then 'SOLD' when exists(select 1 from public.booking_items i join public.bookings b on b.id=i.booking_id where i.event_id=e.id and i.seat_id=s.id and i.allocation_status='RESERVED' and b.status='PENDING_PAYMENT' and b.expires_at>clock_timestamp()) then 'RESERVED' else 'AVAILABLE' end) order by vs.name,s.row_label,s.number) from public.event_seats es join public.seats s on s.id=es.seat_id join public.venue_sections vs on vs.id=s.section_id where es.event_id=e.id),'[]'::jsonb)) into result;
 return result;
end;$$;

create function public.organizer_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.event_access where user_id=auth.uid() and role='ORGANIZER') then return jsonb_build_object('error','FORBIDDEN');end if;
 select jsonb_build_object('mode','supabase',
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'slug',e.slug,'title',e.title,'status',e.status) order by e.starts_at) from public.events e where public.has_event_access(e.id,'ORGANIZER')),'[]'::jsonb),
 'inventory',coalesce((select jsonb_agg(public.seat_inventory(e.slug)) from public.events e where public.has_event_access(e.id,'ORGANIZER')),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'reference',b.reference,'slug',e.slug,'userId',b.user_id,'categoryId',b.category_id,'categoryName',c.name,'status',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else b.status end,'expiresAt',b.expires_at,'total',b.total_idr,'paymentStatus',case when b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp() then 'EXPIRED' else p.status end,'items',coalesce((select jsonb_agg(jsonb_build_object('seatId',i.seat_id,'label',vs.name||' '||s.row_label||s.number,'name',a.display_name,'price',i.price_snapshot_idr)) from public.booking_items i join public.seats s on s.id=i.seat_id join public.venue_sections vs on vs.id=s.section_id join public.attendees a on a.booking_item_id=i.id where i.booking_id=b.id),'[]'::jsonb)) order by b.created_at desc) from public.bookings b join public.events e on e.id=b.event_id join public.ticket_categories c on c.id=b.category_id left join public.payments p on p.booking_id=b.id where public.has_event_access(e.id,'ORGANIZER')),'[]'::jsonb)) into result;
 return result;
end;$$;
revoke all on function public.organizer_snapshot() from public,anon;
grant execute on function public.organizer_snapshot() to authenticated;
commit;
