begin;
alter table public.profiles add column deleted_at timestamptz;
create table public.account_deletions(
 user_id uuid primary key references public.profiles(id) on delete restrict,
 requested_at timestamptz not null default clock_timestamp(),auth_deleted_at timestamptz
);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from public,anon,authenticated;
grant select,update on public.account_deletions to service_role;

-- Existing JWTs must lose database access immediately, even before Auth cleanup.
create function public.active_account_uid() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.profiles where id=auth.uid() and deleted_at is null;
$$;
revoke all on function public.active_account_uid() from public;
grant execute on function public.active_account_uid() to anon,authenticated,service_role;
-- Serialize a new reservation with closing the account, including a new event
-- that was not in the deletion request's initial booking list.
create function public.booking_requires_active_account() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=new.user_id and deleted_at is null for update;
 if not found then raise exception 'Account is inactive' using errcode='42501';end if;
 return new;
end;$$;
revoke all on function public.booking_requires_active_account() from public,anon,authenticated,service_role;
create trigger booking_active_account before insert on public.bookings for each row execute function public.booking_requires_active_account();
do $$declare f record;definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f' and p.prosecdef and p.proname<>'active_account_uid' and position('auth.uid()' in p.prosrc)>0 loop
  definition:=pg_get_functiondef(f.oid);
  execute replace(definition,'auth.uid()','public.active_account_uid()');
 end loop;
 -- Restrictive policies also cover direct table reads/updates with an old JWT.
 for f in select tablename from pg_tables where schemaname='public' and rowsecurity loop
  execute format('create policy account_must_be_active on public.%I as restrictive for all to authenticated using(public.active_account_uid() is not null) with check(public.active_account_uid() is not null)',f.tablename);
 end loop;
end;$$;

create function public.request_account_deletion(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event uuid;v_email text;v_booking record;
begin
 -- All booking operations lock event rows first, in the same stable order.
 for v_event in select id from public.events where id in(select event_id from public.event_access where user_id=p_user union select event_id from public.bookings where user_id=p_user) order by id loop
  perform 1 from public.events where id=v_event for update;
 end loop;
 perform 1 from public.profiles where id=p_user for update;
 if not found then return jsonb_build_object('error','NOT_FOUND','message','Akun tidak ditemukan.');end if;
 if exists(select 1 from public.account_deletions where user_id=p_user) then return jsonb_build_object('ok',true);end if;
 if exists(select 1 from public.event_access a join public.events e on e.id=a.event_id
  where a.user_id=p_user and a.role='ORGANIZER' and e.status<>'ARCHIVED' and e.cancelled_at is null and e.ends_at>clock_timestamp()
  and not exists(select 1 from public.event_access other join public.profiles p on p.id=other.user_id and p.deleted_at is null where other.event_id=a.event_id and other.role='ORGANIZER' and other.user_id<>p_user)) then
  return jsonb_build_object('error','EVENT_OWNER','message','Kamu masih menjadi satu-satunya organizer acara aktif. Tambahkan organizer pengganti atau batalkan acaranya terlebih dahulu.');
 end if;
 select lower(email) into v_email from auth.users where id=p_user;
 for v_booking in select id from public.bookings where user_id=p_user and status='PENDING_PAYMENT' loop
  update public.booking_items set allocation_status='RELEASED' where booking_id=v_booking.id and allocation_status='RESERVED';
  update public.bookings set status='CANCELLED' where id=v_booking.id;
  update public.payments set status='CANCELLED' where booking_id=v_booking.id and status='PENDING';
 end loop;
 -- Ticket holders lose account access; financial/attendance history stays intact.
 update public.profiles set display_name='Akun dihapus',deleted_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_user;
 delete from public.event_access where user_id=p_user;
 update public.staff_invitations set status='REVOKED' where status='PENDING' and (invited_by=p_user or email=v_email);
 delete from public.notifications where user_id=p_user or invitation_id in(select id from public.staff_invitations where email=v_email);
 delete from public.notification_preferences where user_id=p_user;
 insert into public.account_deletions(user_id) values(p_user);
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.request_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.request_account_deletion(uuid) to service_role;

-- Skip future email jobs before enqueue creates the notification or outbox row.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.enqueue_notification(uuid,uuid,uuid,text,text,text,text,text,boolean,timestamp with time zone,uuid)'::regprocedure);
 execute regexp_replace(definition,'begin', 'begin if p_user is not null and exists(select 1 from public.profiles where id=p_user and deleted_at is not null) then return null;end if;', 'i');
end;$$;
commit;
