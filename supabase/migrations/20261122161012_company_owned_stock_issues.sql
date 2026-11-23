alter table stock_v2.owner add column company_id bigint unique references public.company(company_id);
update stock_v2.owner o set company_id=c.company_id from public.company c where o.owner_code='TEST_'||c.stock_owner_code;
alter table public.company drop constraint company_stock_owner_code_check,
  add constraint company_stock_owner_code_check check(stock_owner_code in ('JS','AO') or stock_owner_code='C'||company_id::text);
alter table public.vehicle drop constraint vehicle_owner_code_check,
  add constraint vehicle_owner_code_company_fk foreign key(owner_code) references public.company(stock_owner_code);

create function stock_v2.set_company_stock_code() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and old.stock_owner_code is not null and new.stock_owner_code is distinct from old.stock_owner_code then
    raise exception 'The stock owner code is already linked to this company'; end if;
  if new.owns_stock and new.stock_owner_code is null then new.stock_owner_code:='C'||new.company_id::text; end if;
  return new;
end $$;
create trigger set_company_stock_code before insert or update of owns_stock,stock_owner_code on public.company
for each row execute function stock_v2.set_company_stock_code();

-- Only the existing Companies admin policy can initiate this trigger from the Data API.
create function stock_v2.link_company_stock_owner() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into stock_v2.owner(owner_code,owner_name,company_id) values('TEST_'||new.stock_owner_code,new.company_name,new.company_id)
    on conflict(company_id) do nothing;
  return new;
end $$;
create trigger link_company_stock_owner after insert or update of owns_stock on public.company
for each row when (new.owns_stock) execute function stock_v2.link_company_stock_owner();
revoke all on function stock_v2.set_company_stock_code(),stock_v2.link_company_stock_owner() from public,anon,authenticated;

create view stock_v2.issue_company with(security_invoker=true) as
select o.owner_id,c.company_id,c.stock_owner_code as owner_code,c.company_name,c.owns_stock and o.active as enabled
from stock_v2.owner o join public.company c using(company_id);
create view stock_v2.issue_item_balances with(security_invoker=true) as
select b.item_id,jsonb_object_agg(c.owner_code,b.quantity) as owner_quantities
from stock_v2.quantity_balance b join stock_v2.issue_company c using(owner_id)
join stock_v2.location l using(location_id)
where c.enabled and l.location_code='TEST_WH' group by b.item_id;
revoke all on stock_v2.issue_company,stock_v2.issue_item_balances from public,anon,authenticated;

create function stock_v2.check_issue_stock_companies() returns trigger language plpgsql security invoker set search_path='' as $$
declare required_owner bigint;
begin
  for required_owner in
    select distinct m.owner_id from stock_v2.document_line l join stock_v2.movement m on m.document_line_id=l.line_id
    where l.document_id=new.document_id and m.quantity_delta<0 order by m.owner_id
  loop
    perform 1 from stock_v2.owner o join public.company c using(company_id)
    where o.owner_id=required_owner and c.owns_stock and o.active for share of o,c;
    if not found then raise exception 'Choose a company enabled to own stock in Control Panel → Companies.'; end if;
  end loop;
  return new;
end $$;
create trigger check_issue_stock_companies before update of status on stock_v2.document
for each row when (new.document_type='issue' and new.status='posted' and old.status<>'posted')
execute function stock_v2.check_issue_stock_companies();

create function stock_v2.check_reservation_stock_company() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from stock_v2.job_card_part p join stock_v2.owner o using(owner_id) join public.company c using(company_id)
  where p.id=new.part_id and o.active and c.owns_stock for share of o,c;
  if not found then raise exception 'Choose a company enabled to own stock before reserving this line.'; end if;
  return new;
end $$;
create trigger require_reservation_stock_company before insert on stock_v2.job_part_reservation_event
for each row when (new.quantity_delta>0) execute function stock_v2.check_reservation_stock_company();
revoke all on function stock_v2.check_reservation_stock_company(),stock_v2.check_issue_stock_companies() from public,anon,authenticated;

do $migration$
declare spec record; definition text;
begin
  for spec in select * from (values
    ('stock_v2.demo_multi(text,uuid,jsonb)','own not in (select owner_id from stock_v2.owner where owner_code in (''TEST_JS'',''TEST_AO'')) then raise exception ''Choose HS or AO test stock owner''','not exists(select from stock_v2.issue_company c where c.owner_id=own and c.enabled) then raise exception ''Choose a company enabled to own stock in Control Panel'''),
    ('stock_v2.check_job_line()','join stock_v2.owner o on o.owner_code=''TEST_''||c.stock_owner_code and o.active','join stock_v2.owner o on o.company_id=c.company_id and o.active'),
    ('stock_v2.demo_edit_spray(bigint,jsonb)','and active and owner_code in (''TEST_JS'',''TEST_AO'')','and owner_id in (select c.owner_id from stock_v2.issue_company c where c.enabled)'),
    ('stock_v2.demo_return_spray(jsonb)','o.owner_code in (''TEST_JS'',''TEST_AO'')','o.company_id is not null')
  ) s(signature,marker,replacement) loop
    definition:=pg_get_functiondef(spec.signature::regprocedure);
    if position(spec.marker in definition)=0 then raise exception 'Review stock owner condition in %',spec.signature; end if;
    execute replace(definition,spec.marker,spec.replacement);
  end loop;
end $migration$;
