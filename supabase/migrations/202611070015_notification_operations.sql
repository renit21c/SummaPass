begin;
create table public.notification_receipts (
 webhook_id text primary key check(length(webhook_id) between 1 and 200),
 provider_id text not null check(length(provider_id) between 1 and 100),
 event_type text not null check(event_type in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')),
 occurred_at timestamptz not null,received_at timestamptz not null default clock_timestamp()
);
create index notification_receipts_provider on public.notification_receipts(provider_id,event_type,occurred_at);
create index notification_outbox_provider on public.notification_outbox(provider_id) where provider_id is not null;
alter table public.notification_receipts enable row level security;
revoke all on public.notification_receipts from public,anon,authenticated;
grant select on public.notification_receipts to service_role;

create function public.record_notification_receipt(p_webhook text,p_provider text,p_type text,p_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows integer;
begin
 if p_webhook is null or length(p_webhook) not between 1 and 200 or p_provider is null or length(p_provider) not between 1 and 100 or p_type is null or p_type not in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed') or p_at is null or p_at>clock_timestamp()+interval '5 minutes' then return jsonb_build_object('error','INPUT');end if;
 insert into public.notification_receipts(webhook_id,provider_id,event_type,occurred_at) values(p_webhook,p_provider,p_type,p_at) on conflict do nothing;
 get diagnostics v_rows=row_count;
 return jsonb_build_object('ok',true,'duplicate',v_rows=0);
end;$$;

create function public.notification_receipt_status(p_provider text) returns text language sql stable security definer set search_path='' as $$
 select case event_type when 'email.complained' then 'COMPLAINED' when 'email.bounced' then 'BOUNCED' when 'email.suppressed' then 'SUPPRESSED' when 'email.failed' then 'DELIVERY_FAILED' when 'email.delivered' then 'DELIVERED' when 'email.delivery_delayed' then 'DELAYED' else 'ACCEPTED' end
 from public.notification_receipts where provider_id=p_provider order by case event_type when 'email.complained' then 7 when 'email.bounced' then 6 when 'email.suppressed' then 5 when 'email.failed' then 4 when 'email.delivered' then 3 when 'email.delivery_delayed' then 2 else 1 end desc,occurred_at desc limit 1;
$$;

alter function public.notification_email_context(uuid,uuid) rename to notification_email_context_v12;
revoke all on function public.notification_email_context_v12(uuid,uuid) from public,anon,authenticated,service_role;
create function public.notification_email_context(p_job uuid,p_lease uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.notification_outbox;n public.notifications;i public.staff_invitations;b public.bookings;e public.events;
begin
 select * into o from public.notification_outbox where id=p_job and lease_token=p_lease and status='PROCESSING' and lease_until>clock_timestamp();
 if not found then return jsonb_build_object('skip','LEASE_LOST');end if;
 select * into n from public.notifications where id=o.notification_id;
 select * into e from public.events where id=n.event_id;
 if n.kind='STAFF_INVITED' then
  select * into i from public.staff_invitations where id=n.invitation_id;
  if i.status<>'PENDING' or i.expires_at<=clock_timestamp() or e.cancelled_at is not null or e.status='ARCHIVED' or not exists(select 1 from public.event_access where event_id=i.event_id and user_id=i.invited_by and role='ORGANIZER') then return jsonb_build_object('skip','INVITATION_INACTIVE');end if;
  return jsonb_build_object('userId',n.user_id,'recipientEmail',i.email,'kind',n.kind,'bookingId',null,'ticketId',null,'title',n.title,'message',n.message,'link',n.link,'isReminder',false,'payload',o.delivery_payload);
 end if;
 select * into b from public.bookings where id=n.booking_id;
 if n.kind='EVENT_CANCELLED' then
  if e.cancelled_at is null or b.user_id<>n.user_id then return jsonb_build_object('skip','NO_LONGER_ELIGIBLE');end if;
 elsif e.cancelled_at is not null then return jsonb_build_object('skip','EVENT_CANCELLED');
 elsif n.kind='BOOKING_EXPIRED' then
  if b.status<>'EXPIRED' or b.user_id<>n.user_id then return jsonb_build_object('skip','NO_LONGER_ELIGIBLE');end if;
 else return public.notification_email_context_v12(p_job,p_lease);end if;
 return jsonb_build_object('userId',n.user_id,'kind',n.kind,'bookingId',n.booking_id,'ticketId',null,'title',n.title,'message',n.message,'link',n.link,'isReminder',false,'payload',o.delivery_payload);
end;$$;

create function public.notification_operations(p_event uuid,p_status text default null,p_cursor uuid default null,p_limit integer default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_date timestamptz;v_items jsonb;v_next uuid;
begin
 if auth.uid() is null or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN');end if;
 if p_limit is null or p_limit not between 1 and 100 or (p_status is not null and p_status not in ('PENDING','PROCESSING','RETRY','SENT','FAILED','SKIPPED')) then return jsonb_build_object('error','INPUT');end if;
 if p_cursor is not null then
  select o.created_at into v_date from public.notification_outbox o join public.notifications n on n.id=o.notification_id where o.id=p_cursor and n.event_id=p_event;
  if not found then return jsonb_build_object('error','NOT_FOUND');end if;
 end if;
 select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into v_items from (
  select o.id,o.created_at,jsonb_build_object('id',o.id,'kind',n.kind,'status',o.status,'deliveryStatus',public.notification_receipt_status(o.provider_id),'attempts',o.attempts,'createdAt',o.created_at,'sentAt',o.sent_at,'nextAttemptAt',o.next_attempt_at,'errorCode',o.last_error,
   'canRetry',coalesce(o.status='FAILED' and o.attempts<5 and o.first_attempt_at>clock_timestamp()-interval '23 hours' and o.provider_id is null,false)) item
  from public.notification_outbox o join public.notifications n on n.id=o.notification_id where n.event_id=p_event and (p_status is null or o.status=p_status) and (p_cursor is null or (o.created_at,o.id)<(v_date,p_cursor)) order by o.created_at desc,o.id desc limit p_limit) page;
 if jsonb_array_length(v_items)=p_limit then v_next:=(v_items->(p_limit-1)->>'id')::uuid;end if;
 return jsonb_build_object('items',v_items,'nextCursor',v_next,'counts',(select coalesce(jsonb_object_agg(status,total),'{}'::jsonb) from (select o.status,count(*) total from public.notification_outbox o join public.notifications n on n.id=o.notification_id where n.event_id=p_event group by o.status) totals));
end;$$;

create function public.retry_notification_email(p_event uuid,p_job uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.notification_outbox;
begin
 if auth.uid() is null or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN');end if;
 if p_reason is null or length(trim(p_reason)) not between 10 and 500 then return jsonb_build_object('error','INPUT');end if;
 perform 1 from public.events where id=p_event for update;
 select ob.* into o from public.notification_outbox ob join public.notifications n on n.id=ob.notification_id where ob.id=p_job and n.event_id=p_event for update of ob;
 if not found then return jsonb_build_object('error','NOT_FOUND');end if;
 if o.status='RETRY' then return jsonb_build_object('queued',true);end if;
 if o.status<>'FAILED' or o.attempts>=5 or o.first_attempt_at is null or o.first_attempt_at<=clock_timestamp()-interval '23 hours' or o.provider_id is not null then return jsonb_build_object('error','UNSAFE_REPLAY','message','Job ini tidak dapat diputar ulang. Periksa provider; untuk tiket, gunakan permintaan kirim ulang baru setelah pemeriksaan.');end if;
 update public.notification_outbox set status='RETRY',next_attempt_at=clock_timestamp(),lease_token=null,lease_until=null where id=p_job;
 insert into public.audit_logs(event_id,actor_id,action,after_data) values(p_event,auth.uid(),'NOTIFICATION_RETRY_REQUESTED',jsonb_build_object('jobId',p_job,'reason',trim(p_reason),'attempts',o.attempts));
 return jsonb_build_object('queued',true);
end;$$;

create or replace function public.notification_deliveries(p_ticket uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'status',o.status,'deliveryStatus',public.notification_receipt_status(o.provider_id),'attempts',o.attempts,'createdAt',o.created_at,'sentAt',o.sent_at,'errorCode',o.last_error) order by o.created_at desc),'[]'::jsonb) from public.notification_outbox o join public.notifications n on n.id=o.notification_id join public.tickets t on t.id=p_ticket join public.booking_items i on i.id=t.booking_item_id where n.user_id=auth.uid() and i.booking_id=n.booking_id and (n.ticket_id is null or n.ticket_id=p_ticket) and n.kind in ('TICKET_READY','TICKET_RESEND');
$$;
create function public.notification_operations_configuration() returns jsonb language sql stable security definer set search_path='' as $$select '{"version":3,"invitations":true,"expiry":true,"cancellation":true,"receipts":true}'::jsonb$$;

-- All mutations of assignments follow the event lock used by check-in and acceptance.
alter function public.assign_staff(uuid,uuid) rename to assign_staff_v8;
revoke all on function public.assign_staff_v8(uuid,uuid) from public,anon,authenticated,service_role;
create function public.assign_staff(p_event uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN');end if;
 perform 1 from public.events where id=p_event for update;
 if exists(select 1 from public.events where id=p_event and cancelled_at is not null) then return jsonb_build_object('error','EVENT_CANCELLED');end if;
 result:=public.assign_staff_v8(p_event,p_user);
 if not result ? 'error' then insert into public.audit_logs(event_id,actor_id,action,after_data) values(p_event,auth.uid(),'STAFF_ASSIGNED',jsonb_build_object('userId',p_user));end if;
 return result;
end;$$;
create or replace function public.unassign_staff(p_event uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN');end if;
 perform 1 from public.events where id=p_event for update;
 delete from public.event_access where event_id=p_event and user_id=p_user and role='STAFF';
 update public.staff_invitations set status='REVOKED' where event_id=p_event and status='PENDING' and email=(select lower(email) from auth.users where id=p_user);
 insert into public.audit_logs(event_id,actor_id,action,after_data) values(p_event,auth.uid(),'STAFF_UNASSIGNED',jsonb_build_object('userId',p_user));
 return jsonb_build_object('status','UNASSIGNED','userId',p_user);
end;$$;
revoke all on function public.assign_staff(uuid,uuid) from public,anon;
grant execute on function public.assign_staff(uuid,uuid) to authenticated;

revoke all on function public.record_notification_receipt(text,text,text,timestamptz),public.notification_receipt_status(text),public.notification_email_context(uuid,uuid),public.notification_operations_configuration() from public,anon,authenticated;
grant execute on function public.record_notification_receipt(text,text,text,timestamptz),public.notification_email_context(uuid,uuid),public.notification_operations_configuration() to service_role;
revoke all on function public.notification_operations(uuid,text,uuid,integer),public.retry_notification_email(uuid,uuid,text) from public,anon;
grant execute on function public.notification_operations(uuid,text,uuid,integer),public.retry_notification_email(uuid,uuid,text) to authenticated;
create or replace function public.list_notifications(p_cursor uuid default null,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;v_date timestamptz;v_next uuid;
begin
 if auth.uid() is null then return jsonb_build_object('error','AUTH');end if;
 if p_limit is null or p_limit not between 1 and 100 then return jsonb_build_object('error','INPUT');end if;
 if p_cursor is not null then select created_at into v_date from public.notifications where id=p_cursor and user_id=auth.uid();if not found then return jsonb_build_object('error','NOT_FOUND');end if;end if;
 select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into v_items from (
 select n.id,n.created_at,jsonb_build_object('id',n.id,'title',n.title,'message',n.message,'type',case n.kind when 'STAFF_INVITED' then 'announcement' when 'EVENT_CANCELLED' then 'announcement' when 'BOOKING_EXPIRED' then 'booking' when 'BOOKING_CREATED' then 'booking' when 'BOOKING_REMINDER' then 'reminder' when 'EVENT_REMINDER' then 'reminder' when 'EVENT_CHANGED' then 'announcement' else 'ticket' end,'date',n.created_at,'read',n.read_at is not null,'link',n.link) item
 from public.notifications n where n.user_id=auth.uid() and n.dismissed_at is null and (p_cursor is null or (n.created_at,n.id)<(v_date,p_cursor)) order by n.created_at desc,n.id desc limit p_limit) page;
 if jsonb_array_length(v_items)=p_limit then v_next:=(v_items->(p_limit-1)->>'id')::uuid;end if;
 return jsonb_build_object('items',v_items,'nextCursor',v_next,'unreadCount',(select count(*) from public.notifications where user_id=auth.uid() and read_at is null and dismissed_at is null));
end;$$;

alter function public.validate_check_in(text,text,text,boolean) rename to validate_check_in_v5;
revoke all on function public.validate_check_in_v5(text,text,text,boolean) from public,anon,authenticated,service_role;
create function public.validate_check_in(p_slug text,p_reference text,p_hash text,p_confirm boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event uuid;
begin
 select id into v_event from public.events where slug=p_slug;
 if auth.uid() is null or not public.has_event_access(v_event,'STAFF') then return jsonb_build_object('error','FORBIDDEN');end if;
 perform 1 from public.events where id=v_event for update;
 if not public.has_event_access(v_event,'STAFF') then return jsonb_build_object('error','FORBIDDEN');end if;
 return public.validate_check_in_v5(p_slug,p_reference,p_hash,p_confirm);
end;$$;
revoke all on function public.validate_check_in(text,text,text,boolean) from public,anon;
grant execute on function public.validate_check_in(text,text,text,boolean) to authenticated;
commit;
