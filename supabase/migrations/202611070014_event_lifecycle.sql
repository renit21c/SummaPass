begin;
alter table public.events add column cancelled_at timestamptz;
alter table public.events add column cancellation_reason text;
alter table public.events add column cancellation_key uuid;
alter table public.events add constraint event_cancellation_complete check(
 (cancelled_at is null and cancellation_reason is null and cancellation_key is null) or
 (cancelled_at is not null and length(trim(cancellation_reason)) between 10 and 1000 and cancellation_key is not null and status<>'PUBLISHED'));
create index bookings_expiry_due on public.bookings(expires_at,event_id) where status='PENDING_PAYMENT';

create or replace function public.notify_booking_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  perform public.enqueue_notification(new.user_id,new.event_id,new.id,'BOOKING_CREATED','booking/'||new.id,'Reservasi dibuat','Selesaikan pembayaran sebelum batas reservasi.','/bookings/'||new.id);
 elsif new.status='CONFIRMED' and old.status is distinct from new.status then
  perform public.enqueue_notification(new.user_id,new.event_id,new.id,'TICKET_READY','paid/'||new.id,'E-ticket tersedia','Pembayaran berhasil. Buka e-ticket untuk melihat QR dan detail acara.','/my-tickets',true);
 elsif new.status='EXPIRED' and old.status='PENDING_PAYMENT' then
  perform public.enqueue_notification(new.user_id,new.event_id,new.id,'BOOKING_EXPIRED','expired/'||new.id,'Reservasi berakhir','Batas pembayaran telah lewat. Kursi sudah dilepas. Buat pesanan baru jika ingin melanjutkan.','/bookings/'||new.id,true);
 end if;
 return new;
end;$$;

-- Expiry does not depend on another customer opening the same event.
alter function public.enqueue_due_notifications() rename to enqueue_reminders_v12;
revoke all on function public.enqueue_reminders_v12() from public,anon,authenticated,service_role;
create function public.enqueue_due_notifications() returns integer language plpgsql security definer set search_path='' as $$
declare e record;v_ids uuid[];v_count integer:=0;
begin
 for e in select ev.id from public.events ev where exists(select 1 from public.bookings b where b.event_id=ev.id and b.status='PENDING_PAYMENT' and b.expires_at<=clock_timestamp()) order by ev.id limit 20 for update skip locked loop
  select array_agg(id) into v_ids from (select id from public.bookings where event_id=e.id and status='PENDING_PAYMENT' and expires_at<=clock_timestamp() order by expires_at,id limit 1000) due;
  update public.bookings set status='EXPIRED' where id=any(v_ids);
  update public.booking_items set allocation_status='RELEASED' where booking_id=any(v_ids) and allocation_status='RESERVED';
  update public.event_seats set revision=revision+1 where event_id=e.id;
  v_count:=v_count+coalesce(array_length(v_ids,1),0);
 end loop;
 return v_count+public.enqueue_reminders_v12();
end;$$;
revoke all on function public.enqueue_due_notifications() from public,anon,authenticated;
grant execute on function public.enqueue_due_notifications() to service_role;

create function public.cancel_event(p_event uuid,p_reason text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;b record;v_reason text:=trim(p_reason);
begin
 if auth.uid() is null or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN');end if;
 select * into e from public.events where id=p_event for update;
 if p_key is null or v_reason is null or length(v_reason) not between 10 and 1000 then return jsonb_build_object('error','INPUT');end if;
 if e.cancelled_at is not null then
  if e.cancellation_key<>p_key or e.cancellation_reason<>v_reason then return jsonb_build_object('error','ALREADY_CANCELLED');end if;
  return jsonb_build_object('cancelled',true,'cancelledAt',e.cancelled_at);
 end if;
 if e.status='ARCHIVED' or e.starts_at<=clock_timestamp() or exists(select 1 from public.check_ins where event_id=p_event) then return jsonb_build_object('error','EVENT_STARTED','message','Pembatalan hanya sebelum acara dimulai dan sebelum ada check-in.');end if;
 update public.events set status='UNPUBLISHED',cancelled_at=clock_timestamp(),cancellation_reason=v_reason,cancellation_key=p_key,updated_at=clock_timestamp() where id=p_event;
 -- Preserve paid totals and SOLD history. Cancellation is not a refund.
 for b in select distinct on(user_id) id,user_id from public.bookings where event_id=p_event and (status='CONFIRMED' or (status='PENDING_PAYMENT' and expires_at>clock_timestamp())) order by user_id,(status='CONFIRMED') desc,created_at desc loop
  perform public.enqueue_notification(b.user_id,p_event,b.id,'EVENT_CANCELLED','event-cancelled/'||p_event||'/'||b.user_id,'Acara dibatalkan',v_reason||' Tiket tidak berlaku. Pembatalan ini tidak memproses refund.','/bookings/'||b.id,true);
 end loop;
 update public.bookings set status='EXPIRED' where event_id=p_event and status='PENDING_PAYMENT' and expires_at<=clock_timestamp();
 update public.bookings set status='CANCELLED' where event_id=p_event and status='PENDING_PAYMENT';
 update public.booking_items set allocation_status='RELEASED' where event_id=p_event and allocation_status='RESERVED';
 update public.tickets set status='REVOKED' where status='ACTIVE' and booking_item_id in(select id from public.booking_items where event_id=p_event);
 update public.staff_invitations set status='REVOKED' where event_id=p_event and status='PENDING';
 update public.event_seats set revision=revision+1 where event_id=p_event;
 insert into public.audit_logs(event_id,actor_id,action,before_data,after_data) values(p_event,auth.uid(),'EVENT_CANCELLED',jsonb_build_object('status',e.status),jsonb_build_object('reason',v_reason,'refundProcessed',false));
 return jsonb_build_object('cancelled',true,'cancelledAt',(select cancelled_at from public.events where id=p_event),'refundProcessed',false);
end;$$;
revoke all on function public.cancel_event(uuid,text,uuid) from public,anon;
grant execute on function public.cancel_event(uuid,text,uuid) to authenticated;

-- Preserve existing serializers and their snapshot semantics.
alter function public.catalog_event_json(uuid) rename to catalog_event_json_v12;
revoke all on function public.catalog_event_json_v12(uuid) from public,anon,authenticated,service_role;
create function public.catalog_event_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select public.catalog_event_json_v12(p_id)||jsonb_build_object('cancelledAt',cancelled_at,'cancellationReason',cancellation_reason) from public.events where id=p_id;
$$;
revoke all on function public.catalog_event_json(uuid) from public,anon,authenticated;
alter function public.get_booking(uuid) rename to get_booking_v12;
revoke all on function public.get_booking_v12(uuid) from public,anon,authenticated,service_role;
create function public.get_booking(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.get_booking_v12(p_id);
 if result ? 'error' then return result;end if;
 return result||(select jsonb_build_object('eventCancelledAt',e.cancelled_at,'eventCancellationReason',e.cancellation_reason) from public.bookings b join public.events e on e.id=b.event_id where b.id=p_id and b.user_id=auth.uid());
end;$$;
revoke all on function public.get_booking(uuid) from public,anon;
grant execute on function public.get_booking(uuid) to authenticated;

alter function public.manage_event(text,uuid,jsonb) rename to manage_event_v12;
revoke all on function public.manage_event_v12(text,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.manage_event(p_action text,p_id uuid default null,p_data jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_id is not null then
  if auth.uid() is null or not public.has_event_access(p_id,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN');end if;
  perform 1 from public.events where id=p_id for update;
  if p_action<>'archive' and exists(select 1 from public.events where id=p_id and cancelled_at is not null) then return jsonb_build_object('error','EVENT_CANCELLED');end if;
 end if;
 return public.manage_event_v12(p_action,p_id,p_data);
end;$$;
revoke all on function public.manage_event(text,uuid,jsonb) from public,anon;
grant execute on function public.manage_event(text,uuid,jsonb) to authenticated;

alter function public.process_simulated_payment(uuid,uuid,text,jsonb) rename to process_simulated_payment_v12;
revoke all on function public.process_simulated_payment_v12(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.process_simulated_payment(p_user uuid,p_booking uuid,p_outcome text,p_tickets jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event uuid;
begin
 select event_id into v_event from public.bookings where id=p_booking and user_id=p_user;
 perform 1 from public.events where id=v_event for update;
 if exists(select 1 from public.events where id=v_event and cancelled_at is not null) then return jsonb_build_object('error','EVENT_CANCELLED');end if;
 return public.process_simulated_payment_v12(p_user,p_booking,p_outcome,p_tickets);
end;$$;
revoke all on function public.process_simulated_payment(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.process_simulated_payment(uuid,uuid,text,jsonb) to service_role;

-- A cancelled event cannot grant new staff access or send more invitations.
create function public.guard_cancelled_event_access() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.events where id=new.event_id for update;
 if exists(select 1 from public.events where id=new.event_id and cancelled_at is not null) then raise exception 'Event cancelled' using errcode='23514';end if;
 return new;
end;$$;
revoke all on function public.guard_cancelled_event_access() from public,anon,authenticated;
create trigger invitation_cancelled_event before insert on public.staff_invitations for each row execute function public.guard_cancelled_event_access();
create trigger assignment_cancelled_event before insert on public.event_access for each row execute function public.guard_cancelled_event_access();
commit;
