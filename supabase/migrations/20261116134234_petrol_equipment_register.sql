-- Install after equipment_fuel_destinations, with the fuel-filtered application.
-- Master records only: no fuel receipts, issues or stock movements.
lock table public.vehicle_type,public.vehicle in share row exclusive mode;
do $$
declare seq text;last_id bigint;
begin
 -- Access imports used explicit IDs; never move an existing sequence backwards.
 seq:=pg_get_serial_sequence('public.vehicle_type','vehicle_type_id');
 if seq is not null then
  select greatest(coalesce(max(vehicle_type_id),0),coalesce(pg_sequence_last_value(seq::regclass),0),1) into last_id from public.vehicle_type;
  perform setval(seq::regclass,last_id,true);
 end if;
 seq:=pg_get_serial_sequence('public.vehicle','vehicle_id');
 if seq is not null then
  select greatest(coalesce(max(vehicle_id),0),coalesce(pg_sequence_last_value(seq::regclass),0),1) into last_id from public.vehicle;
  perform setval(seq::regclass,last_id,true);
 end if;
end $$;

insert into public.vehicle_type(type_code,type_name,sort_order)
values('MIST_BLOWER','Mist Blower',50),('MOTORBIKE','Motorbike',60),('MOWER','Mower',70)
on conflict(type_code) do nothing;

do $$
declare entry record;existing_count int;existing_fuel text;
begin
 for entry in select * from (values
  ('Mist Blower','MIST_BLOWER'),
  ('Motorbike-Tich','MOTORBIKE'),
  ('2 Wheel Mower','MOWER'),
  ('J Sole Mower','MOWER')
 ) as requested(machine_name,type_code) loop
  select count(*),min(fuel_type) into existing_count,existing_fuel
   from public.vehicle where lower(btrim(vehicle_name))=lower(entry.machine_name);
  if existing_count>1 or (existing_count=1 and existing_fuel<>'PETROL') then
   raise exception 'Review existing equipment classification before adding %',entry.machine_name;
  end if;
  if existing_count=0 then
   insert into public.vehicle(vehicle_name,fuel_type,vehicle_type_id,vehicle_discontinued,has_meter,is_other)
   select entry.machine_name,'PETROL',vehicle_type_id,false,false,false
   from public.vehicle_type where type_code=entry.type_code;
  end if;
 end loop;
end $$;
-- Petrol Other remains a per-issue described destination, not a fictitious machine.
