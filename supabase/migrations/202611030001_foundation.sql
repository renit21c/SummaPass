-- Foundation only. Reservation/payment RPCs are intentionally a later migration.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (char_length(display_name) between 1 and 100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.venues (
 id uuid primary key default gen_random_uuid(), name text not null, address text not null,
 timezone text not null default 'Asia/Jakarta', created_at timestamptz not null default now()
);
create table public.events (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venues(id) on delete restrict,
 slug text not null unique check (slug ~ '^[a-z0-9-]+$'), title text not null,
 description text not null default '', rules text not null default '',
 category text not null check (category in ('Musik','Workshop','Keluarga')),
 starts_at timestamptz not null, ends_at timestamptz not null,
 status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','UNPUBLISHED','ARCHIVED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (ends_at > starts_at), unique(id,venue_id)
);
create table public.event_access (
 event_id uuid not null references public.events(id) on delete restrict,
 user_id uuid not null references public.profiles(id) on delete cascade,
 role text not null check (role in ('ORGANIZER','STAFF')),
 created_at timestamptz not null default now(), primary key(event_id,user_id,role)
);
create table public.venue_sections (
 id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venues(id) on delete restrict,
 name text not null, created_at timestamptz not null default now(), unique(venue_id,name), unique(id,venue_id)
);
create table public.seats (
 id uuid primary key default gen_random_uuid(), section_id uuid not null references public.venue_sections(id) on delete restrict,
 row_label text not null, number integer not null check(number > 0), x integer not null, y integer not null,
 created_at timestamptz not null default now(), unique(section_id,row_label,number)
);
create table public.ticket_categories (
 id uuid primary key default gen_random_uuid(), event_id uuid not null, venue_id uuid not null,
 name text not null, price_idr bigint not null check(price_idr >= 0), quota integer not null check(quota > 0),
 sales_start timestamptz not null, sales_end timestamptz not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(sales_end > sales_start), unique(event_id,name), unique(id,venue_id),
 foreign key(event_id,venue_id) references public.events(id,venue_id) on delete restrict
);
create table public.category_sections (
 category_id uuid not null, section_id uuid not null, venue_id uuid not null,
 primary key(category_id,section_id),
 foreign key(category_id,venue_id) references public.ticket_categories(id,venue_id) on delete restrict,
 foreign key(section_id,venue_id) references public.venue_sections(id,venue_id) on delete restrict
);
create index events_public_schedule on public.events(status,starts_at);
create index event_access_user on public.event_access(user_id,event_id);
create index events_venue on public.events(venue_id);
create index sections_venue on public.venue_sections(venue_id);
create index seats_section on public.seats(section_id);
create index categories_event on public.ticket_categories(event_id);
create index category_sections_section on public.category_sections(section_id);

-- Narrow authorization helpers bypass recursive RLS but never accept a user ID.
create function public.has_event_access(target_event uuid, target_role text default null)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.event_access where event_id=target_event and user_id=(select auth.uid()) and (target_role is null or role=target_role));
$$;
create function public.event_is_visible(target_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.events where id=target_event and (status='PUBLISHED' or public.has_event_access(id)));
$$;
create function public.venue_is_visible(target_venue uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.events where venue_id=target_venue and (status='PUBLISHED' or public.has_event_access(id)));
$$;
revoke all on function public.has_event_access(uuid,text), public.event_is_visible(uuid), public.venue_is_visible(uuid) from public;
grant execute on function public.has_event_access(uuid,text), public.event_is_visible(uuid), public.venue_is_visible(uuid) to anon,authenticated;

alter table public.profiles enable row level security;
alter table public.venues enable row level security;
alter table public.events enable row level security;
alter table public.event_access enable row level security;
alter table public.venue_sections enable row level security;
alter table public.seats enable row level security;
alter table public.ticket_categories enable row level security;
alter table public.category_sections enable row level security;
revoke all on public.profiles,public.venues,public.events,public.event_access,public.venue_sections,public.seats,public.ticket_categories,public.category_sections from anon,authenticated;
grant select on public.venues,public.events,public.venue_sections,public.seats,public.ticket_categories,public.category_sections to anon,authenticated;
grant select on public.profiles,public.event_access to authenticated;
grant update(display_name) on public.profiles to authenticated;
create policy profile_self_read on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy profile_self_name on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy assigned_access_read on public.event_access for select to authenticated using(user_id=(select auth.uid()));
create policy event_catalog on public.events for select using(status='PUBLISHED' or public.has_event_access(id));
create policy venue_catalog on public.venues for select using(public.venue_is_visible(id));
create policy section_catalog on public.venue_sections for select using(public.venue_is_visible(venue_id));
create policy seat_catalog on public.seats for select using(exists(select 1 from public.venue_sections s where s.id=section_id));
create policy category_catalog on public.ticket_categories for select using(public.event_is_visible(event_id));
create policy eligible_catalog on public.category_sections for select using(exists(select 1 from public.ticket_categories c where c.id=category_id));
-- No client write grants on event_access or catalog. Organizer editing will use
-- separately audited RPCs that guard sold inventory when bookings are added.
create function public.create_profile_for_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name) values(new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Pengunjung'),100));
 return new;
end; $$;
revoke all on function public.create_profile_for_user() from public,anon,authenticated;
create trigger auth_profile_created after insert on auth.users for each row execute function public.create_profile_for_user();
insert into public.profiles(id,display_name) select id,left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'),''),'Pengunjung'),100) from auth.users on conflict(id) do nothing;
commit;
