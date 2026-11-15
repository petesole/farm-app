-- Potatoes do not require a moisture reading. Preserve the existing rule for all other own crops.
-- No ticket, weight, allocation or queue records are changed by this correction.
create or replace function public.wb_require_completed_moisture()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
 if new.status='completed' then
  if new.moisture_pct is not null and (new.moisture_pct < 0 or new.moisture_pct > 100) then
   raise exception 'Moisture percentage must be between 0 and 100';
  end if;
  if new.owner_type='own' and new.moisture_pct is null
   and not exists(select 1 from public.crop c where c.crop_id=new.crop_id and lower(btrim(c.crop_name))='potatoes') then
   raise exception 'Moisture percentage is required before a John Sole weighbridge slip can be completed';
  end if;
 end if;
 return new;
end $function$;
