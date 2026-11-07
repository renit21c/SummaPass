begin;

-- Function to get staff assigned to an event
create or replace function public.event_staff(p_event uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'userId', ea.user_id,
   'name', coalesce(p.display_name, 'Petugas'),
   'email', coalesce(u.raw_user_meta_data->>'email', p.display_name, 'petugas@summapass.id'),
   'role', ea.role,
   'assignedAt', ea.created_at
 ) order by ea.created_at desc), '[]'::jsonb)
 from public.event_access ea
 left join public.profiles p on p.id = ea.user_id
 left join auth.users u on u.id = ea.user_id
 where ea.event_id = p_event and ea.role = 'STAFF'
   and public.has_event_access(p_event, 'ORGANIZER');
$$;

-- Function to assign a staff member to an event
create or replace function public.assign_staff(p_event uuid, p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_name text;
begin
 if auth.uid() is null or not public.has_event_access(p_event, 'ORGANIZER') then
   return jsonb_build_object('error', 'FORBIDDEN', 'message', 'Hanya organizer yang dapat menugaskan petugas.');
 end if;
 -- Verify or create profile entry
 select id, display_name into v_user, v_name from public.profiles where id = p_user;
 if not found then
   if exists(select 1 from auth.users where id = p_user) then
     insert into public.profiles(id, display_name) values(p_user, 'Petugas ' || substr(p_user::text, 1, 6))
     on conflict (id) do nothing;
     select id, display_name into v_user, v_name from public.profiles where id = p_user;
   else
     return jsonb_build_object('error', 'NOT_FOUND', 'message', 'Pengguna tidak ditemukan.');
   end if;
 end if;
 insert into public.event_access(event_id, user_id, role)
 values(p_event, p_user, 'STAFF')
 on conflict (event_id, user_id, role) do nothing;
 return jsonb_build_object('status', 'ASSIGNED', 'userId', v_user, 'name', coalesce(v_name, 'Petugas'));
end;$$;

-- Function to unassign a staff member from an event
create or replace function public.unassign_staff(p_event uuid, p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_event_access(p_event, 'ORGANIZER') then
   return jsonb_build_object('error', 'FORBIDDEN', 'message', 'Hanya organizer yang dapat mencabut penugasan.');
 end if;
 delete from public.event_access where event_id = p_event and user_id = p_user and role = 'STAFF';
 return jsonb_build_object('status', 'UNASSIGNED', 'userId', p_user);
end;$$;

revoke all on function public.event_staff(uuid), public.assign_staff(uuid, uuid), public.unassign_staff(uuid, uuid) from public, anon;
grant execute on function public.event_staff(uuid), public.assign_staff(uuid, uuid), public.unassign_staff(uuid, uuid) to authenticated;

commit;

