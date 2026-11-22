-- QA script: Execute AFTER pre-sale audit migration inside BEGIN; never commit.
-- Existing production data remains untouched because the caller must ROLLBACK.
do $qa$
declare
 c_reserved uuid;
 c_unallocated uuid;
 ctx jsonb;
begin
  perform set_config('request.jwt.claim.sub',
    (select user_id::text from public.app_user_role where role_name='admin' limit 1),true);
  c_reserved:=public.potato_presale_create('QA-RESERVED-CONTRACT-ROLLBACK',
    current_date,12,550,'{"BULLETS":{"pockets":2,"price":5.00}}'::jsonb,'Test');
  ctx:=public.potato_presale_edit_context(c_reserved);
  if not (ctx->'contract'->>'has_allocations')::boolean
  then raise exception 'Allocated contract not marked as protected'; end if;
  perform public.potato_presale_update(c_reserved,'QA-RESERVED-CONTRACT-AMENDED',
    current_date,12,550,'{"BULLETS":{"pockets":2,"price":5.00}}'::jsonb,
    'Updated note','Reference correction test');
  if (select count(*) from public.potato_presale_correction_audit
    where presale_id=c_reserved)<>1 then
    raise exception 'Reserved contract amendment lacks audit record'; end if;
  begin
    perform public.potato_presale_update(c_reserved,'QA-RESERVED-CONTRACT-AMENDED',
      current_date,12,550,'{"BULLETS":{"pockets":2,"price":9.00}}'::jsonb,
      'Updated','Invalid post-allocation repricing');
    raise exception 'CRITICAL: post-allocation repricing was allowed';
  exception when others then
    if sqlerrm='CRITICAL: post-allocation repricing was allowed' then raise; end if;
  end;
  c_unallocated:=public.potato_presale_create('QA-UNALLOCATED-CONTRACT-ROLLBACK',
    current_date,12,550,'{"CUTS":{"pockets":8,"price":2.00}}'::jsonb,'Test');
  ctx:=public.potato_presale_edit_context(c_unallocated);
  if (ctx->'contract'->>'has_allocations')::boolean
  then raise exception 'Expected no allocation for CUTS'; end if;
  perform public.potato_presale_update(c_unallocated,'QA-UNALLOCATED-CONTRACT-AMENDED',
    current_date,12,550,'{"CUTS":{"pockets":12,"price":3.00}}'::jsonb,
    'Updated note','Unallocated contract correction');
  if not exists(select 1 from public.potato_presale_line l
    where l.presale_id=c_unallocated and l.size_code='CUTS'
      and l.contracted_pockets=12 and l.price_per_pocket=3) then
    raise exception 'Unallocated amendment did not save correctly'; end if;
  if (select count(*) from public.potato_presale_correction_audit
    where presale_id=c_unallocated)<>1 then
    raise exception 'Unallocated amendment not audited'; end if;
end $qa$;
select 'PASS: audited pre-sale edit, locked economic terms, unrestricted unallocated correction' result;
ROLLBACK;
