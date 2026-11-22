-- The vehicle register is the source of truth for vehicle and implement ownership.
alter table public.vehicle
  add column if not exists owner_code text check (owner_code in ('JS','AO'));

do $vehicle_owner$
begin
  if to_regclass('stock_v2.job_vehicle_owner') is not null then
    update public.vehicle v
    set owner_code=replace(o.owner_code,'TEST_','')
    from stock_v2.job_vehicle_owner legacy
    join stock_v2.owner o using(owner_id)
    where v.vehicle_id=legacy.vehicle_id and v.owner_code is null
      and o.owner_code in ('TEST_JS','TEST_AO');
  end if;
end
$vehicle_owner$;

create table public.company (
  company_id bigint generated always as identity primary key,
  company_name text not null check(length(btrim(company_name)) between 1 and 120),
  stock_owner_code text unique check(stock_owner_code in ('JS','AO')),
  owns_stock boolean not null default false,
  owns_vehicles boolean not null default true,
  check(not owns_stock or stock_owner_code is not null)
);
create unique index company_name_key on public.company(lower(btrim(company_name)));
alter table public.company enable row level security;
create policy company_admin_manage on public.company for all to authenticated
  using('admin'=any(public.my_farm_app_roles())) with check('admin'=any(public.my_farm_app_roles()));
grant select,insert,update on public.company to authenticated;
grant usage,select on sequence public.company_company_id_seq to authenticated;
insert into public.company(company_name,stock_owner_code,owns_stock,owns_vehicles)
values('JS','JS',true,true),('Agri Orange','AO',true,true);

alter table public.vehicle
  add column ownership_status text check(ownership_status in ('owned','hired')),
  add column owner_company_id bigint references public.company(company_id),
  add column hire_supplier_id bigint references stock_v2.supplier(supplier_id),
  add constraint vehicle_ownership_fields_check check (
    (ownership_status is null and owner_company_id is null and hire_supplier_id is null)
    or (ownership_status is not distinct from 'owned' and hire_supplier_id is null)
    or (ownership_status is not distinct from 'hired' and owner_company_id is null)
  );

update public.vehicle v set ownership_status='owned',owner_company_id=c.company_id
from public.company c where c.stock_owner_code=v.owner_code;

create function public.sync_vehicle_ownership() returns trigger language plpgsql
set search_path='' as $sync$
begin
  if new.ownership_status is null and new.owner_company_id is null and new.hire_supplier_id is null and new.owner_code is not null then
    if tg_op='INSERT' or new.owner_code is distinct from old.owner_code then
      select company_id into new.owner_company_id from public.company where stock_owner_code=new.owner_code;
      if new.owner_company_id is not null then new.ownership_status:='owned'; end if;
    end if;
  elsif tg_op='UPDATE' and new.ownership_status='owned' and new.owner_company_id is not distinct from old.owner_company_id
        and new.owner_code is distinct from old.owner_code and new.owner_code is not null then
    select company_id into new.owner_company_id from public.company where stock_owner_code=new.owner_code;
  end if;
  new.owner_code:=null;
  if new.ownership_status='owned' and new.owner_company_id is not null then
    select stock_owner_code into new.owner_code from public.company
     where company_id=new.owner_company_id and owns_vehicles;
    if not found then raise exception 'Select a company enabled to own vehicles'; end if;
  end if;
  return new;
end
$sync$;
create trigger sync_vehicle_ownership before insert or update of ownership_status,owner_company_id,hire_supplier_id,owner_code
on public.vehicle for each row execute function public.sync_vehicle_ownership();

create function public.vehicle_hire_suppliers()
returns table(supplier_id bigint,supplier_name text,active boolean)
language sql stable security definer set search_path=''
as $$
  select s.supplier_id,s.supplier_name,s.active from stock_v2.supplier s
  where exists(select 1 from unnest(public.my_farm_app_roles()) r where lower(r)='admin')
  order by s.supplier_name
$$;
revoke all on function public.vehicle_hire_suppliers() from public,anon,authenticated;
grant execute on function public.vehicle_hire_suppliers() to authenticated;
