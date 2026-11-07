begin;

create table public.staff_invitations (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id) on delete restrict,
 email text not null check(email=lower(trim(email)) and length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 invited_by uuid not null references public.profiles(id) on delete restrict,
 status text not null default 'PENDING' check(status in ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
 expires_at timestamptz not null default clock_timestamp()+interval '7 days',created_at timestamptz not null default clock_timestamp(),
 accepted_by uuid references public.profiles(id) on delete restrict,accepted_at timestamptz,
 request_key uuid not null,unique(invited_by,request_key)
);
create unique index staff_invitation_pending on public.staff_invitations(event_id,email) where status='PENDING';
create index staff_invitation_email on public.staff_invitations(email,status);
alter table public.staff_invitations enable row level security;
revoke all on public.staff_invitations from public,anon,authenticated;
grant select on public.staff_invitations to service_role;

-- Invitations also work before the recipient has registered. Only that kind may omit an owner/booking.
alter table public.notifications alter column user_id drop not null;
alter table public.notifications alter column booking_id drop not null;
alter table public.notifications add column invitation_id uuid references public.staff_invitations(id) on delete restrict;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check(kind in ('BOOKING_CREATED','TICKET_READY','BOOKING_REMINDER','EVENT_REMINDER','EVENT_CHANGED','TICKET_RESEND','STAFF_INVITED','BOOKING_EXPIRED','EVENT_CANCELLED'));
alter table public.notifications add constraint notifications_owner_scope check(
 (kind='STAFF_INVITED' and invitation_id is not null and booking_id is null) or
 (kind<>'STAFF_INVITED' and invitation_id is null and user_id is not null and booking_id is not null));

create function public.enqueue_staff_invitation(p_id uuid,p_key text) returns void language plpgsql security definer set search_path='' as $$
declare i public.staff_invitations;v_note uuid;v_user uuid;
begin
 select * into i from public.staff_invitations where id=p_id;
 select id into v_user from auth.users where lower(email)=i.email and email_confirmed_at is not null;
 insert into public.notifications(user_id,event_id,kind,dedup_key,title,message,link,invitation_id)
 values(v_user,i.event_id,'STAFF_INVITED',p_key,'Undangan petugas: '||(select title from public.events where id=i.event_id),'Masuk dengan email penerima untuk menerima undangan. Berlaku sampai '||to_char(i.expires_at at time zone 'Asia/Jakarta','DD Mon YYYY HH24:MI')||' WIB.','/staff/invitations/'||i.id,i.id)
 on conflict(dedup_key) do nothing returning id into v_note;
 if v_note is not null then insert into public.notification_outbox(notification_id) values(v_note);end if;
end;$$;

create function public.invite_event_staff(p_event uuid,p_email text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.staff_invitations;v_email text:=lower(trim(p_email));v_id uuid;
begin
 if auth.uid() is null or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN');end if;
 perform 1 from public.events where id=p_event for update;
 if p_key is null or v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return jsonb_build_object('error','INPUT');end if;
 if exists(select 1 from public.events where id=p_event and status='ARCHIVED') then return jsonb_build_object('error','ARCHIVED');end if;
 select * into i from public.staff_invitations where invited_by=auth.uid() and request_key=p_key;
 if found then
  if i.event_id<>p_event or i.email<>v_email then return jsonb_build_object('error','IDEMPOTENCY_CONFLICT');end if;
  return jsonb_build_object('id',i.id,'status',i.status,'expiresAt',i.expires_at);
 end if;
 -- Serialize an organizer's quota across events, after the event lock.
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into i from public.staff_invitations where invited_by=auth.uid() and request_key=p_key;
 if found then
  if i.event_id<>p_event or i.email<>v_email then return jsonb_build_object('error','IDEMPOTENCY_CONFLICT');end if;
  return jsonb_build_object('id',i.id,'status',i.status,'expiresAt',i.expires_at);
 end if;
 if (select count(*) from public.staff_invitations where invited_by=auth.uid() and created_at>clock_timestamp()-interval '1 day')>=50 then return jsonb_build_object('error','RATE_LIMIT');end if;
 update public.staff_invitations set status='EXPIRED' where event_id=p_event and status='PENDING' and expires_at<=clock_timestamp();
 select * into i from public.staff_invitations where event_id=p_event and email=v_email and status='PENDING';
 if found then return jsonb_build_object('error','ALREADY_INVITED','id',i.id);end if;
 insert into public.staff_invitations(event_id,email,invited_by,request_key) values(p_event,v_email,auth.uid(),p_key) returning id into v_id;
 perform public.enqueue_staff_invitation(v_id,'staff-invite/'||v_id);
 insert into public.audit_logs(event_id,actor_id,action,after_data) values(p_event,auth.uid(),'STAFF_INVITED',jsonb_build_object('invitationId',v_id));
 return jsonb_build_object('id',v_id,'status','PENDING','expiresAt',(select expires_at from public.staff_invitations where id=v_id));
end;$$;

create function public.event_staff_invitations(p_event uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN');end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'status',case when status='PENDING' and expires_at<=clock_timestamp() then 'EXPIRED' else status end,'expiresAt',expires_at,'createdAt',created_at,'acceptedAt',accepted_at) order by created_at desc) from (select * from public.staff_invitations where event_id=p_event order by created_at desc limit 100) recent),'[]'::jsonb);
end;$$;

create function public.staff_invitation(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i public.staff_invitations;v_email text;
begin
 if auth.uid() is null then return jsonb_build_object('error','AUTH');end if;
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into i from public.staff_invitations where id=p_id and email=v_email;
 if not found then return jsonb_build_object('error','NOT_FOUND');end if;
 return jsonb_build_object('id',i.id,'eventTitle',(select title from public.events where id=i.event_id),'status',case when i.status='ACCEPTED' and not public.has_event_access(i.event_id,'STAFF') then 'REVOKED' when i.status='PENDING' and i.expires_at<=clock_timestamp() then 'EXPIRED' else i.status end,'expiresAt',i.expires_at);
end;$$;

create function public.accept_staff_invitation(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.staff_invitations;v_event uuid;v_email text;
begin
 if auth.uid() is null then return jsonb_build_object('error','AUTH');end if;
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select event_id into v_event from public.staff_invitations where id=p_id and email=v_email;
 if v_event is null then return jsonb_build_object('error','NOT_FOUND');end if;
 perform 1 from public.events where id=v_event for update;
 select * into i from public.staff_invitations where id=p_id for update;
 if i.status='ACCEPTED' and i.accepted_by=auth.uid() then
  if public.has_event_access(v_event,'STAFF') then return jsonb_build_object('accepted',true,'eventId',v_event);end if;
  return jsonb_build_object('error','REVOKED');
 end if;
 if i.status<>'PENDING' then return jsonb_build_object('error',i.status);end if;
 if i.expires_at<=clock_timestamp() then update public.staff_invitations set status='EXPIRED' where id=p_id;return jsonb_build_object('error','EXPIRED');end if;
 if not exists(select 1 from public.event_access where event_id=v_event and user_id=i.invited_by and role='ORGANIZER') then return jsonb_build_object('error','INVITER_ACCESS_REVOKED');end if;
 if exists(select 1 from public.events where id=v_event and status='ARCHIVED') then return jsonb_build_object('error','ARCHIVED');end if;
 insert into public.event_access(event_id,user_id,role) values(v_event,auth.uid(),'STAFF') on conflict do nothing;
 update public.staff_invitations set status='ACCEPTED',accepted_by=auth.uid(),accepted_at=clock_timestamp() where id=p_id;
 -- Connect pre-registration notifications to the verified recipient without exposing them to others.
 update public.notifications set user_id=auth.uid() where invitation_id=p_id;
 insert into public.audit_logs(event_id,actor_id,action,after_data) values(v_event,auth.uid(),'STAFF_INVITATION_ACCEPTED',jsonb_build_object('invitationId',p_id));
 return jsonb_build_object('accepted',true,'eventId',v_event);
end;$$;

create function public.manage_staff_invitation(p_id uuid,p_action text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.staff_invitations;v_event uuid;v_key text;
begin
 select event_id into v_event from public.staff_invitations where id=p_id;
 if auth.uid() is null or not public.has_event_access(v_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN');end if;
 perform 1 from public.events where id=v_event for update;
 select * into i from public.staff_invitations where id=p_id for update;
 if p_action='revoke' then
  if i.status='REVOKED' then return jsonb_build_object('ok',true);end if;
  if i.status<>'PENDING' then return jsonb_build_object('error','NOT_PENDING');end if;
  update public.staff_invitations set status='REVOKED' where id=p_id;
 elsif p_action='resend' then
  if p_key is null then return jsonb_build_object('error','INPUT');end if;
  if i.status<>'PENDING' or i.expires_at<=clock_timestamp() then return jsonb_build_object('error','EXPIRED');end if;
  v_key:='staff-invite-resend/'||p_id||'/'||p_key;
  if exists(select 1 from public.notifications where dedup_key=v_key) then return jsonb_build_object('queued',true);end if;
  if exists(select 1 from public.notifications where invitation_id=p_id and created_at>clock_timestamp()-interval '60 seconds') or (select count(*) from public.notifications where invitation_id=p_id and created_at>clock_timestamp()-interval '1 day')>=5 then return jsonb_build_object('error','RATE_LIMIT');end if;
  perform public.enqueue_staff_invitation(p_id,v_key);
 else return jsonb_build_object('error','INPUT');end if;
 insert into public.audit_logs(event_id,actor_id,action,after_data) values(v_event,auth.uid(),'STAFF_INVITATION_'||upper(p_action),jsonb_build_object('invitationId',p_id));
 return jsonb_build_object('ok',true,'queued',p_action='resend');
end;$$;

revoke all on function public.enqueue_staff_invitation(uuid,text) from public,anon,authenticated;
revoke all on function public.invite_event_staff(uuid,text,uuid),public.event_staff_invitations(uuid),public.staff_invitation(uuid),public.accept_staff_invitation(uuid),public.manage_staff_invitation(uuid,text,uuid) from public,anon;
grant execute on function public.invite_event_staff(uuid,text,uuid),public.event_staff_invitations(uuid),public.staff_invitation(uuid),public.accept_staff_invitation(uuid),public.manage_staff_invitation(uuid,text,uuid) to authenticated;
commit;
