begin;
-- Email payload can now contain a bounded, encrypted PDF attachment.
create or replace function public.notification_email_context(p_job uuid,p_lease uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.notification_outbox;n public.notifications;b public.bookings;e public.events;p public.notification_preferences;
begin
 select * into o from public.notification_outbox where id=p_job and lease_token=p_lease and status='PROCESSING' and lease_until>clock_timestamp();
 if not found then return jsonb_build_object('skip','LEASE_LOST');end if;
 select * into n from public.notifications where id=o.notification_id;
 select * into b from public.bookings where id=n.booking_id;
 select * into e from public.events where id=n.event_id;
 select * into p from public.notification_preferences where user_id=n.user_id;
 -- A frozen PDF may contain several tickets. Revalidate every attached ticket, not merely one.
 if o.delivery_payload->>'version'='2' and exists(
 select 1 from jsonb_array_elements_text(o.delivery_payload->'ticketIds') wanted where not exists(
 select 1 from public.tickets t join public.booking_items i on i.id=t.booking_item_id join public.bookings bk on bk.id=i.booking_id
 where t.id::text=wanted and t.status='ACTIVE' and bk.id=n.booking_id and bk.user_id=n.user_id
 and (n.ticket_id is null or t.id=n.ticket_id))) then return jsonb_build_object('skip','ATTACHED_TICKET_INACTIVE');end if;
 if n.kind in ('BOOKING_REMINDER','EVENT_REMINDER') and (p.email_reminders=false or (n.kind='BOOKING_REMINDER' and p.booking_reminders=false) or (n.kind='EVENT_REMINDER' and p.event_reminders=false)) then return jsonb_build_object('skip','PREFERENCE_DISABLED');end if;
 if n.kind='BOOKING_REMINDER' then
  if b.status<>'PENDING_PAYMENT' or b.expires_at<=clock_timestamp() or b.expires_at is distinct from n.schedule_at or e.status<>'PUBLISHED' or e.starts_at<=clock_timestamp() then return jsonb_build_object('skip','NO_LONGER_ELIGIBLE');end if;
 elsif n.kind in ('EVENT_REMINDER','EVENT_CHANGED') then
  if not exists(select 1 from public.bookings bk join public.payments pay on pay.booking_id=bk.id join public.booking_items i on i.booking_id=bk.id join public.tickets t on t.booking_item_id=i.id where bk.event_id=n.event_id and bk.user_id=n.user_id and bk.status='CONFIRMED' and pay.status='PAID' and t.status='ACTIVE') then return jsonb_build_object('skip','NO_LONGER_ELIGIBLE');end if;
  if n.kind='EVENT_REMINDER' and (e.starts_at is distinct from n.schedule_at or e.starts_at<=clock_timestamp() or e.status<>'PUBLISHED') then return jsonb_build_object('skip','NO_LONGER_ELIGIBLE');end if;
 else
  if b.status<>'CONFIRMED' or not exists(select 1 from public.payments where booking_id=b.id and status='PAID') or not exists(select 1 from public.tickets t join public.booking_items i on i.id=t.booking_item_id where i.booking_id=b.id and t.status='ACTIVE' and (n.ticket_id is null or n.ticket_id=t.id)) then return jsonb_build_object('skip','NO_LONGER_ELIGIBLE');end if;
  if n.kind='EVENT_REMINDER' and (e.starts_at is distinct from n.schedule_at or e.starts_at<=clock_timestamp() or e.status<>'PUBLISHED') then return jsonb_build_object('skip','NO_LONGER_ELIGIBLE');end if;
 end if;
 return jsonb_build_object('userId',n.user_id,'kind',n.kind,'bookingId',n.booking_id,'ticketId',n.ticket_id,'title',n.title,'message',n.message,'link',n.link,'isReminder',n.kind in ('BOOKING_REMINDER','EVENT_REMINDER'),'payload',o.delivery_payload);
end;$$;
create or replace function public.prepare_notification_email(p_job uuid,p_lease uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.notification_outbox;
begin
 select * into o from public.notification_outbox where id=p_job and lease_token=p_lease and status='PROCESSING' and lease_until>clock_timestamp() for update;
 if not found then return jsonb_build_object('error','LEASE_LOST');end if;
 if o.delivery_payload is not null then return o.delivery_payload;end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>3145728 then raise exception 'Invalid email payload' using errcode='22023';end if;
 if p_payload->>'version'='2' then
  if jsonb_typeof(p_payload->'ciphertext') is distinct from 'string' or jsonb_typeof(p_payload->'ticketIds') is distinct from 'array' then raise exception 'Invalid encrypted payload' using errcode='22023';end if;
  if jsonb_array_length(p_payload->'ticketIds')>6 then raise exception 'Too many PDF tickets' using errcode='22023';end if;
 end if;
 update public.notification_outbox set delivery_payload=p_payload where id=p_job;
 return p_payload;
end;$$;
create function public.notification_pdf_configuration() returns jsonb language sql stable security definer set search_path='' as $$
 select '{"version":2,"maxTickets":6,"maxPdfBytes":1048576}'::jsonb;
$$;
create function public.notification_attachment_tickets(p_job uuid,p_lease uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n public.notifications;
begin
 select note.* into n from public.notification_outbox o join public.notifications note on note.id=o.notification_id where o.id=p_job and o.lease_token=p_lease and o.status='PROCESSING' and o.lease_until>clock_timestamp();
 if not found or n.kind not in ('TICKET_READY','TICKET_RESEND') then return jsonb_build_object('error','ATTACHMENTS_UNAVAILABLE');end if;
 -- Existing owner-only ticket serializer preserves the issued event/price/category snapshots.
 return coalesce((select jsonb_agg(item order by item->>'id') from jsonb_array_elements(public.issued_tickets_for_owner(n.user_id,n.ticket_id)) item where item->>'bookingId'=n.booking_id::text and item->>'status'='ACTIVE'),'[]'::jsonb);
end;$$;
revoke all on function public.notification_pdf_configuration(),public.notification_attachment_tickets(uuid,uuid) from public,anon,authenticated;
grant execute on function public.notification_pdf_configuration(),public.notification_attachment_tickets(uuid,uuid) to service_role;
commit;
