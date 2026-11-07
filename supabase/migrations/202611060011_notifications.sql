begin;
create table public.notifications (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 event_id uuid not null references public.events(id) on delete cascade,booking_id uuid not null references public.bookings(id) on delete cascade,
 ticket_id uuid references public.tickets(id) on delete cascade,
 kind text not null check(kind in ('BOOKING_CREATED','TICKET_READY','BOOKING_REMINDER','EVENT_REMINDER','EVENT_CHANGED','TICKET_RESEND')),
 dedup_key text not null unique,title text not null,message text not null,link text not null check(link like '/%'),
 schedule_at timestamptz,created_at timestamptz not null default clock_timestamp(),read_at timestamptz,dismissed_at timestamptz
);
create index notifications_owner_time on public.notifications(user_id,created_at desc,id desc);
create table public.notification_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 booking_reminders boolean not null default true,event_reminders boolean not null default true,email_reminders boolean not null default true
);
create table public.notification_outbox (
 id uuid primary key default gen_random_uuid(),notification_id uuid not null unique references public.notifications(id) on delete cascade,
 status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','RETRY','SENT','FAILED','SKIPPED')),
 attempts integer not null default 0 check(attempts between 0 and 5),next_attempt_at timestamptz not null default clock_timestamp(),
 first_attempt_at timestamptz,lease_token uuid,lease_until timestamptz,delivery_payload jsonb,
 provider_id text,last_error text,created_at timestamptz not null default clock_timestamp(),sent_at timestamptz
);
create index notification_outbox_due on public.notification_outbox(status,next_attempt_at,lease_until);
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_outbox enable row level security;
revoke all on public.notifications,public.notification_preferences,public.notification_outbox from public,anon,authenticated;
grant select on public.notifications,public.notification_preferences to authenticated;
grant select on public.notifications,public.notification_preferences,public.notification_outbox to service_role;
create policy notification_owner on public.notifications for select to authenticated using(user_id=(select auth.uid()));
create policy notification_preferences_owner on public.notification_preferences for select to authenticated using(user_id=(select auth.uid()));

create function public.enqueue_notification(p_user uuid,p_event uuid,p_booking uuid,p_kind text,p_key text,p_title text,p_message text,p_link text,p_email boolean default false,p_schedule timestamptz default null,p_ticket uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 insert into public.notifications(user_id,event_id,booking_id,kind,dedup_key,title,message,link,schedule_at,ticket_id)
 values(p_user,p_event,p_booking,p_kind,p_key,p_title,p_message,p_link,p_schedule,p_ticket) on conflict(dedup_key) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.notifications where dedup_key=p_key;end if;
 if p_email then insert into public.notification_outbox(notification_id) values(v_id) on conflict(notification_id) do nothing;end if;
 return v_id;
end;$$;
revoke all on function public.enqueue_notification(uuid,uuid,uuid,text,text,text,text,text,boolean,timestamptz,uuid) from public,anon,authenticated;

create function public.notify_booking_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  perform public.enqueue_notification(new.user_id,new.event_id,new.id,'BOOKING_CREATED','booking/'||new.id,'Reservasi dibuat','Selesaikan pembayaran sebelum batas reservasi.','/bookings/'||new.id);
 elsif new.status='CONFIRMED' and old.status is distinct from new.status then
  perform public.enqueue_notification(new.user_id,new.event_id,new.id,'TICKET_READY','paid/'||new.id,'E-ticket tersedia','Pembayaran berhasil. Buka e-ticket untuk melihat QR dan detail acara.','/my-tickets',true);
 end if;
 return new;
end;$$;
revoke all on function public.notify_booking_change() from public,anon,authenticated;
create trigger booking_notification after insert or update of status on public.bookings for each row execute function public.notify_booking_change();

create function public.notify_event_change() returns trigger language plpgsql security definer set search_path='' as $$
declare b record;v_key text:='event-change/'||gen_random_uuid();
begin
 if old.title is not distinct from new.title and old.starts_at is not distinct from new.starts_at and old.ends_at is not distinct from new.ends_at and old.area is not distinct from new.area then return new;end if;
 for b in select distinct on(user_id) id,user_id from public.bookings where event_id=new.id and status='CONFIRMED' order by user_id,created_at desc loop
  perform public.enqueue_notification(b.user_id,new.id,b.id,'EVENT_CHANGED',v_key||'/'||b.user_id,'Detail acara diperbarui','Periksa jadwal dan lokasi terbaru sebelum datang.','/events/'||new.slug,true);
 end loop;
 return new;
end;$$;
revoke all on function public.notify_event_change() from public,anon,authenticated;
create trigger event_change_notification after update of title,starts_at,ends_at,area on public.events for each row execute function public.notify_event_change();

create function public.list_notifications(p_cursor uuid default null,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;v_date timestamptz;v_next uuid;
begin
 if auth.uid() is null then return jsonb_build_object('error','AUTH');end if;
 if p_limit is null or p_limit not between 1 and 100 then return jsonb_build_object('error','INPUT');end if;
 if p_cursor is not null then select created_at into v_date from public.notifications where id=p_cursor and user_id=auth.uid();if not found then return jsonb_build_object('error','NOT_FOUND');end if;end if;
 select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into v_items from (
 select n.id,n.created_at,jsonb_build_object('id',n.id,'title',n.title,'message',n.message,'type',case n.kind when 'BOOKING_CREATED' then 'booking' when 'BOOKING_REMINDER' then 'reminder' when 'EVENT_REMINDER' then 'reminder' when 'EVENT_CHANGED' then 'announcement' else 'ticket' end,'date',n.created_at,'read',n.read_at is not null,'link',n.link) item
 from public.notifications n where n.user_id=auth.uid() and n.dismissed_at is null and (p_cursor is null or (n.created_at,n.id)<(v_date,p_cursor)) order by n.created_at desc,n.id desc limit p_limit) page;
 if jsonb_array_length(v_items)=p_limit then v_next:=(v_items->(p_limit-1)->>'id')::uuid;end if;
 return jsonb_build_object('items',v_items,'nextCursor',v_next,'unreadCount',(select count(*) from public.notifications where user_id=auth.uid() and read_at is null and dismissed_at is null));
end;$$;
create function public.update_notifications(p_action text,p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return jsonb_build_object('error','AUTH');end if;
 if p_action is null or p_action not in ('read','read_all','clear') or (p_action='read' and p_id is null) then return jsonb_build_object('error','INPUT');end if;
 if p_action='read' then
  update public.notifications set read_at=coalesce(read_at,clock_timestamp()) where id=p_id and user_id=auth.uid();if not found then return jsonb_build_object('error','NOT_FOUND');end if;
 elsif p_action='read_all' then update public.notifications set read_at=coalesce(read_at,clock_timestamp()) where user_id=auth.uid() and dismissed_at is null;
 else update public.notifications set dismissed_at=coalesce(dismissed_at,clock_timestamp()) where user_id=auth.uid();end if;
 return jsonb_build_object('ok',true);
end;$$;
create function public.get_notification_preferences() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then return jsonb_build_object('error','AUTH');end if;
 return coalesce((select jsonb_build_object('bookingReminders',booking_reminders,'eventReminders',event_reminders,'emailReminders',email_reminders) from public.notification_preferences where user_id=auth.uid()),'{"bookingReminders":true,"eventReminders":true,"emailReminders":true}'::jsonb);
end;$$;
create function public.set_notification_preferences(p_booking boolean,p_event boolean,p_email boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return jsonb_build_object('error','AUTH');end if;
 if p_booking is null or p_event is null or p_email is null then return jsonb_build_object('error','INPUT');end if;
 insert into public.notification_preferences(user_id,booking_reminders,event_reminders,email_reminders) values(auth.uid(),p_booking,p_event,p_email) on conflict(user_id) do update set booking_reminders=p_booking,event_reminders=p_event,email_reminders=p_email;
 return public.get_notification_preferences();
end;$$;
revoke all on function public.list_notifications(uuid,integer),public.update_notifications(text,uuid),public.get_notification_preferences(),public.set_notification_preferences(boolean,boolean,boolean) from public,anon;
grant execute on function public.list_notifications(uuid,integer),public.update_notifications(text,uuid),public.get_notification_preferences(),public.set_notification_preferences(boolean,boolean,boolean) to authenticated;

create function public.request_ticket_email(p_ticket uuid,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings;v_id uuid;v_existing uuid;v_latest timestamptz;
begin
 if auth.uid() is null then return jsonb_build_object('error','AUTH');end if;
 if p_key is null then return jsonb_build_object('error','INPUT');end if;
 select bk.* into b from public.tickets t join public.booking_items i on i.id=t.booking_item_id join public.bookings bk on bk.id=i.booking_id join public.payments p on p.booking_id=bk.id where t.id=p_ticket and bk.user_id=auth.uid() and bk.status='CONFIRMED' and p.status='PAID' and t.status='ACTIVE';
 if not found then return jsonb_build_object('error','NOT_FOUND');end if;
 -- Event first, then profile: match booking/payment and serialize per-account rate limits.
 perform 1 from public.events where id=b.event_id for update;
 perform 1 from public.profiles where id=auth.uid() for update;
 if not exists(select 1 from public.tickets t join public.booking_items i on i.id=t.booking_item_id join public.bookings bk on bk.id=i.booking_id join public.payments pay on pay.booking_id=bk.id where t.id=p_ticket and bk.user_id=auth.uid() and bk.status='CONFIRMED' and pay.status='PAID' and t.status='ACTIVE') then return jsonb_build_object('error','NOT_FOUND');end if;
 select id,ticket_id into v_existing,v_id from public.notifications where dedup_key='resend/'||auth.uid()||'/'||p_key;
 if found then
  if v_id<>p_ticket then return jsonb_build_object('error','IDEMPOTENCY_CONFLICT');end if;
  return jsonb_build_object('queued',true,'deliveryId',(select id from public.notification_outbox where notification_id=v_existing));
 end if;
 select max(created_at) into v_latest from public.notifications where user_id=auth.uid() and kind='TICKET_RESEND';
 if v_latest>clock_timestamp()-interval '60 seconds' or (select count(*) from public.notifications where user_id=auth.uid() and kind='TICKET_RESEND' and created_at>clock_timestamp()-interval '24 hours')>=5 then return jsonb_build_object('error','RATE_LIMIT','message','Tunggu sebelum mengirim ulang. Maksimal 5 permintaan per hari.');end if;
 v_id:=public.enqueue_notification(auth.uid(),b.event_id,b.id,'TICKET_RESEND','resend/'||auth.uid()||'/'||p_key,'Tautan tiket diminta','Permintaan kirim ulang masuk antrean.','/my-tickets/'||p_ticket,true,null,p_ticket);
 return jsonb_build_object('queued',true,'deliveryId',(select id from public.notification_outbox where notification_id=v_id));
end;$$;
create function public.notification_deliveries(p_ticket uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'status',o.status,'attempts',o.attempts,'createdAt',o.created_at,'sentAt',o.sent_at,'errorCode',o.last_error) order by o.created_at desc),'[]'::jsonb) from public.notification_outbox o join public.notifications n on n.id=o.notification_id join public.tickets t on t.id=p_ticket join public.booking_items i on i.id=t.booking_item_id where n.user_id=auth.uid() and i.booking_id=n.booking_id and (n.ticket_id is null or n.ticket_id=p_ticket) and n.kind in ('TICKET_READY','TICKET_RESEND');
$$;
revoke all on function public.request_ticket_email(uuid,uuid),public.notification_deliveries(uuid) from public,anon;
grant execute on function public.request_ticket_email(uuid,uuid),public.notification_deliveries(uuid) to authenticated;

create function public.enqueue_due_notifications() returns integer language plpgsql security definer set search_path='' as $$
declare e record;b record;v_key text;v_count integer:=0;
begin
 -- Same event-first lock order as reservation/payment. Bound each scheduler pass.
 for e in select ev.* from public.events ev where ev.status='PUBLISHED' and ev.starts_at>clock_timestamp() and exists(
 select 1 from public.bookings bk left join public.notification_preferences pref on pref.user_id=bk.user_id where bk.event_id=ev.id and ((coalesce(pref.booking_reminders,true) and bk.status='PENDING_PAYMENT' and bk.expires_at>clock_timestamp() and bk.expires_at<=clock_timestamp()+interval '2 minutes' and not exists(select 1 from public.notifications n where n.dedup_key='booking-reminder/'||bk.id)) or (coalesce(pref.event_reminders,true) and bk.status='CONFIRMED' and exists(select 1 from public.tickets t join public.booking_items i on i.id=t.booking_item_id where i.booking_id=bk.id and t.status='ACTIVE') and ev.starts_at<=clock_timestamp()+interval '24 hours' and not exists(select 1 from public.notifications n where n.dedup_key='event-reminder/'||ev.id||'/'||bk.user_id||'/'||extract(epoch from ev.starts_at)::text)))) order by ev.starts_at,ev.id limit 20 for update skip locked loop
  for b in select bk.*,coalesce(p.booking_reminders,true) booking_opt,coalesce(p.event_reminders,true) event_opt,coalesce(p.email_reminders,true) email_opt from public.bookings bk left join public.notification_preferences p on p.user_id=bk.user_id where bk.event_id=e.id and ((bk.status='PENDING_PAYMENT' and bk.expires_at>clock_timestamp() and bk.expires_at<=clock_timestamp()+interval '2 minutes') or (bk.status='CONFIRMED' and e.starts_at<=clock_timestamp()+interval '24 hours')) loop
   if b.status='PENDING_PAYMENT' and b.booking_opt then
    v_key:='booking-reminder/'||b.id;
    if not exists(select 1 from public.notifications where dedup_key=v_key) then perform public.enqueue_notification(b.user_id,e.id,b.id,'BOOKING_REMINDER',v_key,'Reservasi segera berakhir','Selesaikan pembayaran jika ingin melanjutkan pesanan.','/bookings/'||b.id,b.email_opt,b.expires_at);v_count:=v_count+1;end if;
   elsif b.status='CONFIRMED' and b.event_opt and exists(select 1 from public.tickets t join public.booking_items i on i.id=t.booking_item_id where i.booking_id=b.id and t.status='ACTIVE') then
    v_key:='event-reminder/'||e.id||'/'||b.user_id||'/'||extract(epoch from e.starts_at)::text;
    if not exists(select 1 from public.notifications where dedup_key=v_key) then perform public.enqueue_notification(b.user_id,e.id,b.id,'EVENT_REMINDER',v_key,'Acara akan segera dimulai','Periksa jadwal, lokasi, dan e-ticket sebelum datang.','/my-tickets',b.email_opt,e.starts_at);v_count:=v_count+1;end if;
   end if;
  end loop;
 end loop;
 return v_count;
end;$$;

create function public.claim_notification_emails(p_limit integer default 5) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 5 then raise exception 'Invalid batch size' using errcode='22023';end if;
 update public.notification_outbox set status='FAILED',last_error='RETRY_WINDOW_EXCEEDED',lease_token=null,lease_until=null where status in ('PENDING','RETRY','PROCESSING') and (status<>'PROCESSING' or lease_until<=clock_timestamp()) and (attempts>=5 or first_attempt_at<=clock_timestamp()-interval '23 hours');
 with candidates as (select id from public.notification_outbox where ((status in ('PENDING','RETRY') and next_attempt_at<=clock_timestamp()) or (status='PROCESSING' and lease_until<=clock_timestamp())) and attempts<5 order by next_attempt_at,id limit p_limit for update skip locked),claimed as (
 update public.notification_outbox o set status='PROCESSING',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes' from candidates c where o.id=c.id returning o.id,o.lease_token,o.attempts)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'leaseToken',lease_token,'attempts',attempts)),'[]'::jsonb) into v_result from claimed;
 return v_result;
end;$$;

create function public.notification_email_context(p_job uuid,p_lease uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.notification_outbox;n public.notifications;b public.bookings;e public.events;p public.notification_preferences;
begin
 select * into o from public.notification_outbox where id=p_job and lease_token=p_lease and status='PROCESSING' and lease_until>clock_timestamp();
 if not found then return jsonb_build_object('skip','LEASE_LOST');end if;
 select * into n from public.notifications where id=o.notification_id;
 select * into b from public.bookings where id=n.booking_id;
 select * into e from public.events where id=n.event_id;
 select * into p from public.notification_preferences where user_id=n.user_id;
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
 return jsonb_build_object('userId',n.user_id,'title',n.title,'message',n.message,'link',n.link,'isReminder',n.kind in ('BOOKING_REMINDER','EVENT_REMINDER'),'payload',o.delivery_payload);
end;$$;

create function public.prepare_notification_email(p_job uuid,p_lease uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.notification_outbox;
begin
 select * into o from public.notification_outbox where id=p_job and lease_token=p_lease and status='PROCESSING' and lease_until>clock_timestamp() for update;
 if not found then return jsonb_build_object('error','LEASE_LOST');end if;
 if o.delivery_payload is not null then return o.delivery_payload;end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16000 then raise exception 'Invalid email payload' using errcode='22023';end if;
 update public.notification_outbox set delivery_payload=p_payload where id=p_job;
 return p_payload;
end;$$;
create function public.finish_notification_email(p_job uuid,p_lease uuid,p_status text,p_error text default null,p_provider text default null) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_status is null or p_status not in ('SENT','RETRY','FAILED','SKIPPED') then raise exception 'Invalid outcome' using errcode='22023';end if;
 update public.notification_outbox set status=case when p_status='RETRY' and attempts>=5 then 'FAILED' else p_status end,last_error=left(p_error,80),provider_id=left(p_provider,100),sent_at=case when p_status='SENT' then clock_timestamp() else null end,next_attempt_at=clock_timestamp()+make_interval(secs=>case attempts when 1 then 30 when 2 then 120 when 3 then 600 else 3600 end),lease_token=null,lease_until=null where id=p_job and lease_token=p_lease and status='PROCESSING' and lease_until>clock_timestamp();
 return found;
end;$$;
revoke all on function public.enqueue_due_notifications(),public.claim_notification_emails(integer),public.notification_email_context(uuid,uuid),public.prepare_notification_email(uuid,uuid,jsonb),public.finish_notification_email(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_due_notifications(),public.claim_notification_emails(integer),public.notification_email_context(uuid,uuid),public.prepare_notification_email(uuid,uuid,jsonb),public.finish_notification_email(uuid,uuid,text,text,text) to service_role;
commit;
