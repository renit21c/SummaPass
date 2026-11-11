begin;
create table public.event_gallery_images(
 id uuid primary key,event_id uuid not null references public.events(id) on delete cascade,
 object_name text not null unique,caption text not null default '' check(char_length(caption)<=160),
 position integer not null check(position>=0),created_at timestamptz not null default clock_timestamp(),
 check(object_name=event_id::text||'/'||id::text||'.webp')
);
create index event_gallery_order on public.event_gallery_images(event_id,position,created_at);
alter table public.event_gallery_images enable row level security;
revoke all on public.event_gallery_images from public,anon,authenticated;
grant select on public.event_gallery_images to anon,authenticated,service_role;
create policy event_gallery_read on public.event_gallery_images for select to anon,authenticated using(
 exists(select 1 from public.events e where e.id=event_id and ((e.status='PUBLISHED' and e.cancelled_at is null) or public.has_event_access(e.id,'ORGANIZER')))
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('event-gallery','event-gallery',false,3145728,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function public.can_write_gallery(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select public.active_account_uid() is not null and exists(select 1 from public.events e where e.id=public.cover_object_event(p_name) and e.status<>'ARCHIVED' and e.cancelled_at is null and public.has_event_access(e.id,'ORGANIZER'));
$$;
create function public.can_read_gallery(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events e where e.id=public.cover_object_event(p_name) and
 (public.has_event_access(e.id,'ORGANIZER') or (e.status='PUBLISHED' and e.cancelled_at is null and exists(select 1 from public.event_gallery_images i where i.event_id=e.id and i.object_name=p_name))));
$$;
create function public.can_delete_gallery(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select public.can_write_gallery(p_name) and not exists(select 1 from public.event_gallery_images where object_name=p_name);
$$;
revoke all on function public.can_write_gallery(text),public.can_read_gallery(text),public.can_delete_gallery(text) from public,anon,authenticated;
grant execute on function public.can_read_gallery(text) to anon,authenticated;
grant execute on function public.can_write_gallery(text),public.can_delete_gallery(text) to authenticated;
create policy summapass_gallery_read on storage.objects for select to anon,authenticated using(bucket_id='event-gallery' and public.can_read_gallery(name));
create policy summapass_gallery_upload on storage.objects for insert to authenticated with check(bucket_id='event-gallery' and public.can_write_gallery(name));
create policy summapass_gallery_remove on storage.objects for delete to authenticated using(bucket_id='event-gallery' and public.can_delete_gallery(name));

create function public.event_gallery(p_event uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.events e where e.id=p_event and ((e.status='PUBLISHED' and e.cancelled_at is null) or public.has_event_access(e.id,'ORGANIZER'))) then
  return jsonb_build_object('error','NOT_FOUND','message','Galeri tidak ditemukan.');
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'url','/api/gallery/'||replace(object_name,'/','_'),'caption',caption,'position',position) order by position,created_at,id) from public.event_gallery_images where event_id=p_event),'[]'::jsonb);
end;$$;
revoke all on function public.event_gallery(uuid) from public;
grant execute on function public.event_gallery(uuid) to anon,authenticated;

create function public.manage_event_gallery(p_event uuid,p_action text,p_image uuid,p_caption text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;i public.event_gallery_images;v_name text;v_position integer;v_before jsonb;
begin
 if public.active_account_uid() is null then return jsonb_build_object('error','AUTH','message','Silakan masuk.');end if;
 select * into e from public.events where id=p_event for update;
 if not found or not public.has_event_access(p_event,'ORGANIZER') then return jsonb_build_object('error','FORBIDDEN','message','Tidak memiliki akses event.');end if;
 if e.status='ARCHIVED' or e.cancelled_at is not null then return jsonb_build_object('error','CLOSED','message','Galeri event ini tidak dapat diubah.');end if;
 if p_image is null or p_action is null or p_action not in ('add','caption','delete') or p_caption is null or char_length(p_caption)>160 then return jsonb_build_object('error','INPUT','message','Keterangan foto maksimal 160 karakter.');end if;
 v_before:=public.event_gallery(p_event);
 v_name:=p_event::text||'/'||p_image::text||'.webp';
 if p_action='add' then
  if exists(select 1 from public.event_gallery_images where id=p_image and event_id=p_event) then return public.event_gallery(p_event);end if;
  if (select count(*) from public.event_gallery_images where event_id=p_event)>=10 then return jsonb_build_object('error','QUOTA','message','Maksimal 10 foto per event.');end if;
  if not exists(select 1 from storage.objects where bucket_id='event-gallery' and name=v_name) then return jsonb_build_object('error','UPLOAD_REQUIRED','message','Unggah foto sebelum menambahkannya ke galeri.');end if;
  select coalesce(max(position)+1,0) into v_position from public.event_gallery_images where event_id=p_event;
  insert into public.event_gallery_images(id,event_id,object_name,caption,position) values(p_image,p_event,v_name,trim(p_caption),v_position);
 else
  select * into i from public.event_gallery_images where id=p_image and event_id=p_event;
  if not found then return jsonb_build_object('error','NOT_FOUND','message','Foto tidak ditemukan.');end if;
  if p_action='delete' then delete from public.event_gallery_images where id=i.id;
  else update public.event_gallery_images set caption=trim(p_caption) where id=i.id;end if;
 end if;
 insert into public.audit_logs(event_id,actor_id,action,before_data,after_data) values(p_event,public.active_account_uid(),'gallery.'||p_action,v_before,public.event_gallery(p_event));
 return public.event_gallery(p_event);
end;$$;
revoke all on function public.manage_event_gallery(uuid,text,uuid,text) from public,anon;
grant execute on function public.manage_event_gallery(uuid,text,uuid,text) to authenticated;
commit;
