begin;

-- Supabase Storage must be installed. Do not silently skip private policies.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('event-covers','event-covers',false,5242880,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function public.cover_object_event(p_name text) returns uuid language plpgsql immutable set search_path='' as $$
begin
 if p_name !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$' then return null;end if;
 return split_part(p_name,'/',1)::uuid;
end;$$;
create function public.can_write_cover(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events e where e.id=public.cover_object_event(p_name) and e.status<>'ARCHIVED' and public.has_event_access(e.id,'ORGANIZER'));
$$;
create function public.can_read_cover(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events e where e.id=public.cover_object_event(p_name) and (public.has_event_access(e.id,'ORGANIZER') or (e.status='PUBLISHED' and e.cover_url='/api/covers/'||replace(p_name,'/','_'))));
$$;
create function public.can_delete_cover(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select public.can_write_cover(p_name) and not exists(select 1 from public.events where cover_url='/api/covers/'||replace(p_name,'/','_'));
$$;
revoke all on function public.cover_object_event(text),public.can_write_cover(text),public.can_read_cover(text),public.can_delete_cover(text) from public,anon,authenticated;
grant execute on function public.can_read_cover(text) to anon,authenticated;
grant execute on function public.can_write_cover(text),public.can_delete_cover(text) to authenticated;

create policy summapass_cover_read on storage.objects for select to anon,authenticated using(bucket_id='event-covers' and public.can_read_cover(name));
create policy summapass_cover_insert on storage.objects for insert to authenticated with check(bucket_id='event-covers' and public.can_write_cover(name));
create policy summapass_cover_delete_unused on storage.objects for delete to authenticated using(bucket_id='event-covers' and public.can_delete_cover(name));
-- No UPDATE policy: normalized objects use new random IDs, never overwrite.

create function public.require_cover_object() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.cover_url<>'' and new.cover_url is distinct from old.cover_url and not exists(select 1 from storage.objects where bucket_id='event-covers' and name=new.id::text||'/'||substring(new.cover_url from 50)) then
  raise exception 'Upload cover before linking it to the event' using errcode='23514';
 end if;
 return new;
end;$$;
revoke all on function public.require_cover_object() from public,anon,authenticated;
create trigger event_requires_uploaded_cover before update of cover_url on public.events for each row execute function public.require_cover_object();

-- Storage INSERT needs a SELECT policy for the returned object; the organizer
-- read policy above covers new objects before they become the current cover.
commit;
