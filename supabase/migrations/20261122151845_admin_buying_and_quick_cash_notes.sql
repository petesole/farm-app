create or replace function stock_v2.can_buy(p_actor uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce((stock_v2.workflow_access(p_actor)->>'is_admin')::boolean,false)
      or exists(select from public.app_user_role where user_id=p_actor and lower(role_name)='buyer')
      or exists(select from stock_v2.buying_staff_role where user_id=p_actor and role_name='buyer');
$$;

create table cash_book.quick_cash_note (
  id uuid primary key,
  note_number bigint generated always as identity unique,
  note_date date not null,
  description text not null check(length(btrim(description)) between 1 and 500),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  entry_id uuid references cash_book.entry(id),
  reconciled_by uuid references auth.users(id),
  reconciled_at timestamptz,
  check ((entry_id is null)=(reconciled_by is null) and (entry_id is null)=(reconciled_at is null))
);
alter table cash_book.quick_cash_note enable row level security;
revoke all on cash_book.quick_cash_note from public,anon,authenticated;
create index quick_cash_note_entry_idx on cash_book.quick_cash_note(entry_id) where entry_id is not null;

create function cash_book.save_quick_note(p_actor uuid,p_operation uuid,p_date date,p_description text)
returns cash_book.quick_cash_note language plpgsql security invoker set search_path='' as $$
declare note cash_book.quick_cash_note;
begin
  if not exists(select from public.app_user_role where user_id=p_actor and lower(role_name)='admin') then
    raise exception 'Cash Book Admin access required' using errcode='42501';
  end if;
  insert into cash_book.quick_cash_note(id,note_date,description,created_by)
    values(p_operation,p_date,btrim(p_description),p_actor) on conflict(id) do nothing returning * into note;
  if not found then
    select * into strict note from cash_book.quick_cash_note where id=p_operation;
    if row(note.note_date,note.description,note.created_by) is distinct from row(p_date,btrim(p_description),p_actor) then
      raise exception 'Different Quick Cash note already saved with this reference'; end if;
  end if;
  return note;
end $$;

create function cash_book.match_quick_note(p_actor uuid,p_note uuid,p_entry uuid)
returns cash_book.quick_cash_note language plpgsql security invoker set search_path='' as $$
declare note cash_book.quick_cash_note;
begin
  if not exists(select from public.app_user_role where user_id=p_actor and lower(role_name)='admin') then
    raise exception 'Cash Book Admin access required' using errcode='42501';
  end if;
  select * into strict note from cash_book.quick_cash_note where id=p_note for update;
  if not exists(select from cash_book.entry e where e.id=p_entry and e.kind in ('payment','receipt') and e.status='confirmed'
    and e.reversal_of is null and not exists(select from cash_book.entry r where r.reversal_of=e.id and r.status='confirmed') for update of e)
    then raise exception 'Select a confirmed payment or receipt that is still in effect'; end if;
  if note.entry_id=p_entry then return note; end if;
  if note.entry_id is not null and not exists(select from cash_book.entry where reversal_of=note.entry_id and status='confirmed')
    then raise exception 'Quick Cash note already reconciled'; end if;
  update cash_book.quick_cash_note set entry_id=p_entry,reconciled_by=p_actor,reconciled_at=now() where id=p_note returning * into note;
  return note;
end $$;
revoke all on function cash_book.save_quick_note(uuid,uuid,date,text),cash_book.match_quick_note(uuid,uuid,uuid) from public,anon,authenticated;
