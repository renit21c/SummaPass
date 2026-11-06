begin;

-- Function for staff to revert/correct a check-in with reason and log audit
create or replace function public.revert_check_in(p_slug text, p_ticket_id uuid, p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_event uuid;
 v_check_in record;
 v_ticket record;
 v_staff_name text;
begin
 select id into v_event from public.events where slug = p_slug;
 if auth.uid() is null or v_event is null or not (public.has_event_access(v_event, 'STAFF') or public.has_event_access(v_event, 'ORGANIZER')) then
   return jsonb_build_object('error', 'FORBIDDEN', 'message', 'Akses tidak diizinkan. Hanya petugas acara yang dapat mengoreksi check-in.');
 end if;

 if p_reason is null or length(trim(p_reason)) < 3 then
   return jsonb_build_object('error', 'INVALID_REASON', 'message', 'Alasan koreksi wajib diisi minimal 3 karakter.');
 end if;

 -- Lock event before check_in mutation
 perform 1 from public.events where id = v_event for update;

 select * into v_check_in from public.check_ins where ticket_id = p_ticket_id and event_id = v_event for update;
 if not found then
   return jsonb_build_object('error', 'NOT_FOUND', 'message', 'Tiket belum di-check-in atau data tidak ditemukan.');
 end if;

 select reference into v_ticket from public.tickets where id = p_ticket_id;
 select display_name into v_staff_name from public.profiles where id = auth.uid();

 -- Delete from check_ins so the ticket is now valid again
 delete from public.check_ins where ticket_id = p_ticket_id;

 -- Record into audit_logs
 insert into public.audit_logs(event_id, actor_id, action, before_data, after_data)
 values(
   v_event,
   auth.uid(),
   'REVERT_CHECK_IN',
   jsonb_build_object(
     'ticket_id', p_ticket_id,
     'reference', coalesce(v_ticket.reference, 'SPT-UNKNOWN'),
     'checked_in_at', v_check_in.checked_in_at,
     'previous_staff_id', v_check_in.staff_id
   ),
   jsonb_build_object(
     'reason', trim(p_reason),
     'reverted_at', clock_timestamp(),
     'staff_name', coalesce(v_staff_name, 'Petugas')
   )
 );

 return jsonb_build_object(
   'status', 'REVERTED',
   'ticketId', p_ticket_id,
   'reason', trim(p_reason),
   'revertedAt', clock_timestamp()
 );
end;$$;

-- Function to read check-in audit logs for an event
create or replace function public.check_in_audits(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id', a.id,
   'ticketId', (a.before_data->>'ticket_id'),
   'reference', coalesce(a.before_data->>'reference', 'SPT-UNKNOWN'),
   'action', a.action,
   'reason', (a.after_data->>'reason'),
   'performedBy', a.actor_id,
   'performedByName', coalesce(a.after_data->>'staff_name', p.display_name, 'Petugas'),
   'performedAt', a.created_at,
   'previousCheckedInAt', (a.before_data->>'checked_in_at')
 ) order by a.created_at desc), '[]'::jsonb)
 from public.audit_logs a
 join public.events e on e.id = a.event_id
 left join public.profiles p on p.id = a.actor_id
 where e.slug = p_slug and a.action = 'REVERT_CHECK_IN'
   and (public.has_event_access(e.id, 'STAFF') or public.has_event_access(e.id, 'ORGANIZER'));
$$;

-- Function to read check-in history for staff with attendee and seat details
create or replace function public.staff_history(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'ticketId', c.ticket_id,
   'reference', coalesce(t.reference, 'SPT-UNKNOWN'),
   'attendeeName', coalesce(a.display_name, 'Peserta Tiket'),
   'seatLabel', coalesce(vs.name || ' ' || s.row_label || s.number, 'Kursi'),
   'categoryName', coalesce(tc.name, 'Regular'),
   'checkedInAt', c.checked_in_at,
   'staffId', c.staff_id,
   'isMe', (c.staff_id = auth.uid())
 ) order by c.checked_in_at desc), '[]'::jsonb)
 from public.check_ins c
 join public.events e on e.id = c.event_id
 left join public.tickets t on t.id = c.ticket_id
 left join public.booking_items bi on bi.id = t.booking_item_id
 left join public.bookings b on b.id = bi.booking_id
 left join public.seats s on s.id = bi.seat_id
 left join public.venue_sections vs on vs.id = s.section_id
 left join public.ticket_categories tc on tc.id = b.category_id
 left join public.attendees a on a.booking_item_id = bi.id
 where e.slug = p_slug
   and (public.has_event_access(e.id, 'STAFF') or public.has_event_access(e.id, 'ORGANIZER'));
$$;

revoke all on function public.revert_check_in(text, uuid, text), public.check_in_audits(text), public.staff_history(text) from public, anon;
grant execute on function public.revert_check_in(text, uuid, text), public.check_in_audits(text), public.staff_history(text) to authenticated;

commit;

