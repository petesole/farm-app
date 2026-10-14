-- Proposed, non-deployed weighbridge foundation. Review against live Supabase schema and RLS before running.
-- No existing crop/season/tracecode tables are modified. No historical import.
begin;

create table public.wb_harvest_control (
 season_id integer not null references public.season(season_id),
 crop_id integer not null references public.crop(crop_id),
 enabled boolean not null default false,
 primary key(season_id,crop_id)
);

create table public.wb_transporter (
 id bigint generated always as identity primary key,
 name text not null unique,
 active boolean not null default true
);
create table public.wb_vehicle (
 id bigint generated always as identity primary key,
 registration text not null unique,
 transporter_id bigint references public.wb_transporter(id)
);

create table public.wb_slip (
 id bigint generated always as identity primary key,
 slip_number text not null,
 slip_date date not null,
 season_id integer not null references public.season(season_id),
 crop_id integer not null references public.crop(crop_id),
 movement text not null check(movement in ('field_customer','field_stock','stock_customer','customer_return')),
 transporter_id bigint references public.wb_transporter(id),
 vehicle_id bigint references public.wb_vehicle(id),
 customer_name text,
 tare_kg numeric(14,3) check(tare_kg>=0),
 gross_kg numeric(14,3) check(gross_kg>=0),
 net_kg numeric(14,3) generated always as
  (case when gross_kg is not null and tare_kg is not null then gross_kg-tare_kg end) stored,
 moisture_pct numeric(6,3) check(moisture_pct between 0 and 100),
 crop_condition text,
 originating_dispatch_id bigint references public.wb_slip(id),
 status text not null default 'draft' check(status in ('draft','confirmed','cancelled')),
 notes text,
 created_at timestamptz not null default now(),
 check(gross_kg is null or tare_kg is null or gross_kg>=tare_kg),
 check(movement='customer_return' or originating_dispatch_id is null),
 unique(season_id,slip_number)
);
create index wb_slip_date_idx on public.wb_slip(slip_date desc);
create index wb_slip_crop_season_idx on public.wb_slip(crop_id,season_id);

create table public.wb_allocation (
 id bigint generated always as identity primary key,
 slip_id bigint not null references public.wb_slip(id) on delete restrict,
 tracecode_id integer not null references public.tracecode(tracecode_id),
 weight_kg numeric(14,3) not null check(weight_kg>0),
 unique(slip_id,tracecode_id)
);
create index wb_allocation_tracecode_idx on public.wb_allocation(tracecode_id);

create table public.wb_delivery (
 id bigint generated always as identity primary key,
 dispatch_slip_id bigint not null unique references public.wb_slip(id),
 receiving_slip_number text,
 receiving_date date,
 receiving_weight_kg numeric(14,3) check(receiving_weight_kg>=0),
 receiving_moisture_pct numeric(6,3) check(receiving_moisture_pct between 0 and 100),
 wheat_grade text check(wheat_grade is null or wheat_grade in ('Premium','B1','B2','B3','UG')),
 rejected_kg numeric(14,3) not null default 0 check(rejected_kg>=0),
 grv_number text,
 grv_date date,
 grv_accepted_kg numeric(14,3) check(grv_accepted_kg>=0),
 notes text,
 check(receiving_weight_kg is null or rejected_kg<=receiving_weight_kg)
);

create table public.wb_document (
 id bigint generated always as identity primary key,
 slip_id bigint not null references public.wb_slip(id),
 delivery_id bigint references public.wb_delivery(id),
 kind text not null check(kind in ('farm_wb','receiving_wb','grv')),
 private_storage_path text not null,
 version_no integer not null default 1 check(version_no>0),
 extraction jsonb,
 verification_status text not null default 'pending' check(verification_status in ('pending','review','verified','failed')),
 uploaded_at timestamptz not null default now(),
 unique(slip_id,kind,version_no)
);

create table public.wb_email_send (
 id bigint generated always as identity primary key,
 from_email text,
 to_emails text[] not null,
 subject text not null,
 gmail_message_id text unique,
 gmail_thread_id text,
 status text not null default 'draft' check(status in ('draft','sending','sent','failed')),
 sent_at timestamptz,
 requested_at timestamptz not null default now(),
 requested_by uuid,
 error_message text,
 check(status <> 'sent' or (sent_at is not null and gmail_message_id is not null))
);
create table public.wb_email_attachment (
 send_id bigint not null references public.wb_email_send(id),
 document_id bigint not null references public.wb_document(id),
 primary key(send_id,document_id)
);

create table public.wb_crop_rule (
 season_id integer not null references public.season(season_id),
 crop_id integer not null references public.crop(crop_id),
 condition_code text not null,
 shelling_factor numeric(8,5) check(shelling_factor>0 and shelling_factor<=1),
 reference_moisture_pct numeric(6,3) check(reference_moisture_pct between 0 and 100),
 moisture_method text not null default 'none' check(moisture_method in ('none','access_linear','dry_matter')),
 primary key(season_id,crop_id,condition_code)
);

create or replace function public.wb_validate_allocation()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v record;
begin
 select s.season_id as slip_season,s.crop_id as slip_crop,s.movement,s.slip_date,
        t.season_id as trace_season,t.crop_id as trace_crop,t.start_date,t.end_date
 into v from public.wb_slip s cross join public.tracecode t
 where s.id=new.slip_id and t.tracecode_id=new.tracecode_id;
 if not found then raise exception 'Slip or trace code not found'; end if;
 if v.movement not in ('field_customer','field_stock') then
  raise exception 'Only field harvest movements can have trace allocations'; end if;
 if v.slip_season is distinct from v.trace_season or v.slip_crop is distinct from v.trace_crop then
  raise exception 'Trace code season/crop does not match slip'; end if;
 if (v.start_date is not null and v.slip_date < v.start_date)
 or (v.end_date is not null and v.slip_date > v.end_date) then
  raise exception 'Trace code outside its active date range'; end if;
 return new;
end $$;
create trigger wb_allocation_validate before insert or update on public.wb_allocation
for each row execute function public.wb_validate_allocation();

create or replace view public.wb_delivery_reconciliation_v with (security_invoker=true) as
select d.id as delivery_id,s.id as slip_id,s.slip_number,s.slip_date,s.season_id,s.crop_id,
 s.transporter_id,s.vehicle_id,s.net_kg as dispatched_kg,
 d.receiving_weight_kg,d.rejected_kg,d.grv_accepted_kg,
 case when s.net_kg is not null and d.receiving_weight_kg is not null
 then d.receiving_weight_kg-s.net_kg end as departure_to_receipt_diff_kg,
 (select coalesce(sum(r.net_kg),0) from public.wb_slip r
  where r.originating_dispatch_id=s.id and r.movement='customer_return' and r.status='confirmed')
 as returned_to_farm_kg,
 d.receiving_slip_number,d.grv_number
from public.wb_delivery d join public.wb_slip s on s.id=d.dispatch_slip_id;

-- TODO before deployment: live type verification; RLS and private bucket permissions;
-- transactional posting and allocation-total validation; exact status transitions;
-- configured crop harvest eligibility and stock validation; document immutability and
-- Gmail sends verified server-side. This file is NOT an install-ready migration.
commit;
