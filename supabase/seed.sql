-- Fictional catalog only. No auth users or privileged credentials are seeded.
begin;
insert into public.venues(id,name,address) values('10000000-0000-4000-8000-000000000001','Summarecon Mall Bandung','Venue demo fiktif, Bandung') on conflict(id) do nothing;
insert into public.events(id,venue_id,slug,title,category,description,starts_at,ends_at,status)
values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','senja-di-summa','Senja di Summa','Musik','Showcase akustik demo.','2026-12-12 16:00+07','2026-12-12 19:00+07','PUBLISHED'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','clay-and-coffee','Clay & Coffee Club','Workshop','Workshop keramik demo.','2026-12-13 10:00+07','2026-12-13 12:00+07','PUBLISHED'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','little-weekend','Little Weekend','Keluarga','Pertunjukan keluarga demo.','2026-12-19 09:00+07','2026-12-19 11:00+07','PUBLISHED'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','after-hours','After Hours Sessions','Musik','Showcase independen demo.','2026-12-20 18:00+07','2026-12-20 21:00+07','PUBLISHED') on conflict(id) do nothing;
insert into public.venue_sections(id,venue_id,name) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Front'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Regular') on conflict(id) do nothing;
insert into public.seats(section_id,row_label,number,x,y)
select s.id,r.label,n.number,80+(n.number-1)*50,140+(r.position-1)*54
from public.venue_sections s cross join (values ('A',1),('B',2),('C',3)) r(label,position) cross join generate_series(1,8) n(number)
where s.venue_id='10000000-0000-4000-8000-000000000001' on conflict(section_id,row_label,number) do nothing;
insert into public.ticket_categories(event_id,venue_id,name,price_idr,quota,sales_start,sales_end)
select e.id,e.venue_id,c.name,
(case e.slug when 'senja-di-summa' then 125000 when 'clay-and-coffee' then 175000 when 'little-weekend' then 75000 else 150000 end)+(case c.name when 'Front' then 50000 else 0 end),24,'2026-11-01 00:00+07',e.starts_at
from public.events e cross join (values ('Front'),('Regular')) c(name)
where e.venue_id='10000000-0000-4000-8000-000000000001' on conflict(event_id,name) do nothing;
insert into public.category_sections(category_id,section_id,venue_id)
select c.id,s.id,c.venue_id from public.ticket_categories c join public.venue_sections s on s.venue_id=c.venue_id and s.name=c.name on conflict do nothing;
commit;

insert into public.event_seats(event_id,seat_id)
select e.id,s.id from public.events e join public.venue_sections vs on vs.venue_id=e.venue_id join public.seats s on s.section_id=vs.id
where e.venue_id='10000000-0000-4000-8000-000000000001' on conflict do nothing;
