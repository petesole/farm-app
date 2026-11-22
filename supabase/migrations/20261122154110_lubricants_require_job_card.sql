-- Keep one stock identity across receiving, balances and Job Cards.
insert into stock_v2.buying_category(catalogue_group,category_name)
select g,'Lubricants' from unnest(array['general','vehicle','implement','irrigation']) g
on conflict do nothing;

create function stock_v2.is_lubricant(p_type text,p_category text,p_name text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(lower(btrim(p_type))='lubricants'
    or lower(btrim(p_category))='lubricants'
    or (lower(btrim(p_type)) in ('parts','general') and lower(btrim(p_category)) in ('oils','grease'))
    or ((lower(btrim(p_type))='fuel' or lower(btrim(p_category))='fuel')
        and p_name ~* '\moil\M|lubricant|grease|transmission fluid'),false);
$$;

create function stock_v2.classify_lubricant() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if stock_v2.is_lubricant(new.input_type,new.input_category,new.item_name) then
    new.input_type:='Lubricants';
    if lower(btrim(new.input_category))='fuel' then new.input_category:='Lubricants'; end if;
  end if;
  return new;
end $$;
create trigger classify_stock_lubricant before insert or update of input_type,input_category,item_name on stock_v2.item
for each row execute function stock_v2.classify_lubricant();

create function stock_v2.link_lubricant_catalogues() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into stock_v2.buying_item_category(item_id,category_id)
  select new.item_id,category_id from stock_v2.buying_category where lower(category_name)='lubricants'
  on conflict do nothing;
  return new;
end $$;
create trigger link_stock_lubricant after insert or update of input_type,input_category,item_name on stock_v2.item
for each row when (new.input_type='Lubricants') execute function stock_v2.link_lubricant_catalogues();

update stock_v2.item set input_type='Lubricants'
where stock_v2.is_lubricant(input_type,input_category,item_name);

-- Direct, planned and older issue callers all post through the same document ledger.
create function stock_v2.check_lubricant_issue() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists (
    select from stock_v2.document_line l join stock_v2.item i using(item_id)
    where l.document_id=new.document_id and i.input_type='Lubricants'
      and not exists (
        select from stock_v2.job_part_issue x join stock_v2.job_card_part p on p.id=x.part_id
        join stock_v2.job_card j on j.id=p.job_id
        where x.line_id=l.line_id and p.item_id=l.item_id and j.closed_at is null
      )
  ) then raise exception 'Issue lubricants from the matching line on an open Job Card.'; end if;
  return new;
end $$;
create trigger require_lubricant_job_card before update of status on stock_v2.document
for each row when (new.document_type='issue' and old.status<>'posted' and new.status='posted')
execute function stock_v2.check_lubricant_issue();

-- Establish the real Job Card link before validating the post, within the same transaction.
do $migration$
declare
  original text:=pg_get_functiondef('stock_v2.post_job_part_issue(uuid,uuid,bigint,numeric)'::regprocedure);
  posting text:='perform stock_v2.post_draft(document_id);';
  link text:='insert into stock_v2.job_part_issue(part_id,line_id,issued_by,operation_id) values(p_part,issue_line_id,p_actor,p_operation);';
begin
  if position(link in original)<=position(posting in original) or position(posting in original)=0 then
    raise exception 'Review the Job Card issue posting order'; end if;
  execute replace(replace(original,link,''),posting,link||chr(10)||'  '||posting);
end $migration$;

-- Give stale clients the workflow correction before field or stock validation.
do $migration$
declare
  original text:=pg_get_functiondef('stock_v2.demo_multi(text,uuid,jsonb)'::regprocedure);
  marker text:='select owner_id into own from stock_v2.owner';
begin
  if position(marker in original)=0 then raise exception 'Review stock issue entry point'; end if;
  execute replace(original,marker,$check$
    if p_action in ('direct_issue','planned_issue') and exists (
      select from jsonb_array_elements(p_data->'lines') x
      join stock_v2.item i on i.item_code=x->>'item_code' where i.input_type='Lubricants'
    ) then raise exception 'Issue lubricants from the matching line on an open Job Card.'; end if;
    $check$||marker);
end $migration$;
revoke all on function stock_v2.is_lubricant(text,text,text),stock_v2.classify_lubricant(),
 stock_v2.link_lubricant_catalogues(),stock_v2.check_lubricant_issue() from public,anon,authenticated;
