-- Machinery oil is charged to equipment only; petrol retains mandatory field allocation.
-- Preserve the private function's owner/privileges and all existing posting rules.
do $migration$
declare definition text;
 old_trace text:='if tr is null or not exists(select 1 from public.tracecode where tracecode_id=tr) then raise exception ''Valid tracecode required'';end if;';
 old_movement text:='values(ln,own,loc,-qty,tr);';
begin
 definition:=pg_get_functiondef('stock_v2.demo_multi(text,uuid,jsonb)'::regprocedure);
 if position(old_trace in definition)=0 or position(old_movement in definition)=0 then
  raise exception 'Unexpected posting function: review oil allocation change before installation';
 end if;
 definition:=replace(definition,old_trace,$new$
 if tr is not null and not exists(select 1 from public.tracecode where tracecode_id=tr) then raise exception 'Valid tracecode required';end if;
 if tr is null and (p_action<>'direct_issue' or exists(
  select 1 from jsonb_array_elements(p_data->'lines') x
  left join stock_v2.item i on i.item_code=x->>'item_code'
  where stock_v2.equipment_issue_kind(i.item_id) is distinct from 'OIL'
 )) then raise exception 'Valid tracecode required';end if;
 $new$);
 definition:=replace(definition,old_movement,$new$
 values(ln,own,loc,-qty,case when p_action='direct_issue' and stock_v2.equipment_issue_kind(it)='OIL' then null else tr end);
 $new$);
 execute definition;
end $migration$;
