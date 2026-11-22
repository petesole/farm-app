-- Field books are the source of expected D-Notes. Does not alter WB tickets or stock.
begin;
create schema if not exists wb_dnote_private;
revoke all on schema wb_dnote_private from public,anon;
grant usage on schema wb_dnote_private to authenticated;

create table public.wb_field_dnote_request (
 request_id uuid primary key,
 note_date date not null,
 ranges jsonb not null check(jsonb_typeof(ranges)='array'),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.wb_field_dnote (
 expected_id bigint generated always as identity primary key,
 request_id uuid not null references public.wb_field_dnote_request(request_id),
 note_date date not null,
 book_number integer not null check(book_number between 1 and 999999),
 note_number integer not null check(note_number between 1 and 999999),
 dnote_number text generated always as (book_number::text||'/'||note_number::text) stored,
 unique(book_number,note_number)
);
create index wb_field_dnote_date_idx on public.wb_field_dnote(note_date);
create index wb_field_dnote_request_idx on public.wb_field_dnote(request_id);
alter table public.wb_field_dnote_request enable row level security;
alter table public.wb_field_dnote enable row level security;
revoke all on public.wb_field_dnote_request,public.wb_field_dnote from public,anon,authenticated;
grant select on public.wb_field_dnote_request,public.wb_field_dnote to authenticated;
create policy wb_field_dnote_request_read on public.wb_field_dnote_request for select to authenticated
 using ((select public.wb_admin_allowed()));
create policy wb_field_dnote_read on public.wb_field_dnote for select to authenticated
 using ((select public.wb_admin_allowed()));

create function public.wb_dnote_key(p_text text) returns text
language sql immutable strict security invoker set search_path='' as $$
 select case when btrim(p_text) ~ '^[0-9]{1,6}\s*/\s*[0-9]{1,6}$'
  and ltrim(btrim(split_part(p_text,'/',1)),'0')<>''
  and ltrim(btrim(split_part(p_text,'/',2)),'0')<>''
 then ltrim(btrim(split_part(p_text,'/',1)),'0')||'/'||ltrim(btrim(split_part(p_text,'/',2)),'0') end
$$;
revoke all on function public.wb_dnote_key(text) from public,anon,authenticated;
grant execute on function public.wb_dnote_key(text) to authenticated;

create function wb_dnote_private.add_ranges(p_request_id uuid,p_date date,p_ranges jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt public.wb_field_dnote_request; r jsonb; a text; b text;
 book integer; first_note integer; last_note integer; note integer; total integer:=0;
begin
 if auth.uid() is null or not public.wb_admin_allowed() then
  raise exception 'Only a WB Admin can add field D-Notes' using errcode='42501';
 end if;
 if p_request_id is null or p_date is null or jsonb_typeof(p_ranges) is distinct from 'array'
    or jsonb_array_length(p_ranges) not between 1 and 50 then
  raise exception 'Enter a date and between 1 and 50 D-Note range lines';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(731104,21);
 select * into receipt from public.wb_field_dnote_request where request_id=p_request_id;
 if found then
  if receipt.created_by is distinct from auth.uid() or receipt.note_date is distinct from p_date or receipt.ranges is distinct from p_ranges then
   raise exception 'This save reference belongs to different D-Note entries';
  end if;
  return jsonb_build_object('request_id',p_request_id,'note_date',p_date,'notes_added',
   (select count(*) from public.wb_field_dnote where request_id=p_request_id),'already_saved',true);
 end if;
 insert into public.wb_field_dnote_request(request_id,note_date,ranges,created_by)
 values(p_request_id,p_date,p_ranges,auth.uid());
 for r in select value from jsonb_array_elements(p_ranges) loop
  a:=public.wb_dnote_key(r->>'start'); b:=public.wb_dnote_key(r->>'end');
  if a is null or b is null then raise exception 'Use book/note numbers such as 2/12 and 2/22'; end if;
  if split_part(a,'/',1)<>split_part(b,'/',1) then
   raise exception 'Each line must stay in one book. Add another line for the next book';
  end if;
  book:=split_part(a,'/',1)::integer;
  first_note:=split_part(a,'/',2)::integer; last_note:=split_part(b,'/',2)::integer;
  if last_note<first_note or last_note-first_note+1>2000 then raise exception 'End note must follow start note; maximum 2000 notes per line'; end if;
  total:=total+last_note-first_note+1;
  if total>5000 then raise exception 'Maximum 5000 D-Notes per save'; end if;
  for note in first_note..last_note loop
   if exists(select 1 from public.wb_field_dnote e where e.book_number=book and e.note_number=note) then
    raise exception 'D-Note %/% is already registered. Ranges must not overlap',book,note;
   end if;
   insert into public.wb_field_dnote(request_id,note_date,book_number,note_number)
   values(p_request_id,p_date,book,note);
  end loop;
 end loop;
 return jsonb_build_object('request_id',p_request_id,'note_date',p_date,'notes_added',total,'already_saved',false);
end $$;
create function public.wb_add_dnote_ranges(p_request_id uuid,p_date date,p_ranges jsonb) returns jsonb
language sql security invoker set search_path='' as $$
 select wb_dnote_private.add_ranges(p_request_id,p_date,p_ranges)
$$;
revoke all on function wb_dnote_private.add_ranges(uuid,date,jsonb),public.wb_add_dnote_ranges(uuid,date,jsonb) from public,anon,authenticated;
grant execute on function wb_dnote_private.add_ranges(uuid,date,jsonb),public.wb_add_dnote_ranges(uuid,date,jsonb) to authenticated;

-- Match by full book/note, across weigh dates: a delayed WB sync resolves the original
-- expected day. Allocation joins stay as before; the UI counts a truck only once.
-- Retain historical WB-only rows so adding the register never hides existing report data.
create view public.wb_daily_dnote_register_v with(security_invoker=true) as
with raw as materialized (
 select v.*,public.wb_dnote_key(v.dnote) as match_key
 from public.wb_daily_dnote_season_v v where (select public.wb_admin_allowed())
), matches as (
 select match_key,count(distinct (source,source_id)) filter(where nullif(btrim(wb_slip),'') is not null) as match_count
 from raw group by match_key
)
select e.expected_id,e.note_date as report_date,e.dnote_number as dnote,
 r.source,r.source_id,r.wb_slip,r.crop_name,r.movement_kind,r.registration_text,
 r.load_kg,r.tracecode_id,r.tracecode_name,r.allocation_kg,r.season_id,
 r.report_date as wb_date,(nullif(btrim(r.wb_slip),'') is null) as missing,
 coalesce(m.match_count,0) as wb_match_count
from public.wb_field_dnote e
left join raw r on r.match_key=e.dnote_number
left join matches m on m.match_key=e.dnote_number
union all
select null::bigint,r.report_date,r.dnote,r.source,r.source_id,r.wb_slip,
 r.crop_name,r.movement_kind,r.registration_text,r.load_kg,
 r.tracecode_id,r.tracecode_name,r.allocation_kg,r.season_id,r.report_date,
 (nullif(btrim(r.wb_slip),'') is null),coalesce(m.match_count,0)
from raw r left join matches m on m.match_key=r.match_key
where not exists(select 1 from public.wb_field_dnote e where e.dnote_number=r.match_key);
revoke all on public.wb_daily_dnote_register_v from public,anon,authenticated;
grant select on public.wb_daily_dnote_register_v to authenticated;
commit;

