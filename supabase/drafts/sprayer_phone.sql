-- Dedicated sprayer access. Existing Stock permissions and assignments are preserved.
alter table stock_v2.staff_role drop constraint staff_role_role_name_check;
alter table stock_v2.staff_role add constraint staff_role_role_name_check check(role_name in ('clerk','stock','supervisor','admin','sprayer'));
create or replace function stock_v2.workflow_access(p_actor uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'can_main',exists(select 1 from public.app_user_role where user_id=p_actor and lower(role_name)='admin'),
 'is_admin',p_actor is not null and (exists(select 1 from public.app_user_role where user_id=p_actor and lower(role_name)='admin') or exists(select 1 from stock_v2.staff_role where user_id=p_actor and active and role_name='admin')),
 'is_stock',p_actor is not null and (exists(select 1 from public.app_user_role where user_id=p_actor and lower(role_name)='admin') or exists(select 1 from stock_v2.staff_role where user_id=p_actor and active and role_name in ('clerk','stock','supervisor','admin'))),
 'is_sprayer',p_actor is not null and (exists(select 1 from public.app_user_role where user_id=p_actor and lower(role_name)='admin') or exists(select 1 from stock_v2.staff_role where user_id=p_actor and active and role_name in ('sprayer','admin'))))
$$;
create or replace function stock_v2.workflow_assign_staff(p_actor uuid,p_user uuid,p_role text,p_active boolean,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare before_doc jsonb;after_doc jsonb;
begin
 perform stock_v2.workflow_require(p_actor,true);
 if coalesce(p_role,'') not in ('clerk','stock','supervisor','admin','sprayer') or p_active is null or length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Role, active status and reason required';end if;
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'User not found';end if;
 perform pg_catalog.pg_advisory_xact_lock(hashtext('stock_v2_staff_roles'));
 select to_jsonb(s) into before_doc from stock_v2.staff_role s where user_id=p_user;
 insert into stock_v2.staff_role(user_id,role_name,active,assigned_by,note) values(p_user,p_role,p_active,p_actor,p_reason)
 on conflict(user_id) do update set role_name=excluded.role_name,active=excluded.active,assigned_by=p_actor,assigned_at=now(),note=p_reason;
 select to_jsonb(s) into after_doc from stock_v2.staff_role s where user_id=p_user;
 insert into stock_v2.staff_role_audit(actor,user_id,before_values,after_values,reason) values(p_actor,p_user,before_doc,after_doc,p_reason);
end $$;

create table stock_v2.sprayer_completion(
 job_id bigint primary key references stock_v2.spray_job(job_id),completed_date date,
 completed_by uuid references auth.users(id),updated_by uuid not null references auth.users(id),
 version integer not null default 1,updated_at timestamptz not null default now()
);
create table stock_v2.sprayer_completion_audit(
 audit_id bigint generated always as identity primary key,job_id bigint not null,
 actor uuid not null references auth.users(id),action text not null,reason text,
 before_values jsonb,after_values jsonb,created_at timestamptz not null default now()
);
create table stock_v2.sprayer_operation(
 operation_id uuid primary key,actor uuid not null references auth.users(id),request jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
create sequence stock_v2.sprayer_feed_revision;
create table stock_v2.sprayer_feed(
 job_id bigint primary key,revision bigint not null unique,hash text not null,payload jsonb,updated_at timestamptz not null default now()
);
create table stock_v2.sprayer_dirty(job_id bigint primary key);
create table stock_v2.sprayer_feed_meta(singleton boolean primary key default true check(singleton),epoch uuid not null default gen_random_uuid());
insert into stock_v2.sprayer_feed_meta default values;
alter table stock_v2.sprayer_completion enable row level security;
alter table stock_v2.sprayer_completion_audit enable row level security;
alter table stock_v2.sprayer_operation enable row level security;
alter table stock_v2.sprayer_feed enable row level security;
alter table stock_v2.sprayer_dirty enable row level security;
alter table stock_v2.sprayer_feed_meta enable row level security;
revoke all on stock_v2.sprayer_completion,stock_v2.sprayer_completion_audit,stock_v2.sprayer_operation,stock_v2.sprayer_feed,stock_v2.sprayer_dirty,stock_v2.sprayer_feed_revision from public,anon,authenticated;
revoke all on stock_v2.sprayer_feed_meta from public,anon,authenticated;

create function stock_v2.sprayer_payload(p_job bigint,p_include_closed boolean default false) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',j.job_id::text,'trace_id',t.tracecode_id::text,'trace',t.tracecode_name,
 'week',j.planned_week_start::text,'area',j.area_ha,'spray_type',j.spray_type,'water_rate',coalesce(j.water_litres_per_ha,s.water_litres_per_ha),
 'tank_capacity',coalesce(s.tank_litres,typ.spray_tank_size),'part',j.part_label,
 'fully_issued',coalesce(a.full_issue,false),'last_issue_date',a.last_issue_date::text,
 'completed_date',c.completed_date::text,'completion_version',coalesce(c.version,0),'lines',coalesce(a.lines,'[]'::jsonb))
 from stock_v2.spray_job j join stock_v2.owner o using(owner_id) join public.tracecode t on t.tracecode_id=j.external_tracecode_id
 left join stock_v2.sprayer_setup s on s.setup_id=j.setup_id
 left join lateral(select x.spray_tank_size from stock_v2.access_spray_type_catalog x where x.spray_type_name=j.spray_type order by x.access_spray_type_id limit 1) typ on true
 left join stock_v2.sprayer_completion c using(job_id)
 left join lateral(
  select count(*)>0 and bool_and(ji.rate_per_ha>0 and x.issued+0.000001>=ji.rate_per_ha*j.area_ha) as full_issue,max(x.last_issue_date) as last_issue_date,
   jsonb_agg(jsonb_build_object('code',i.item_code,'name',i.item_name,'unit',i.base_unit,'rate',ji.rate_per_ha) order by coalesce(i.mix_sequence,9999),i.item_name,i.item_code) as lines
  from stock_v2.spray_job_input ji join stock_v2.item i using(item_id)
  cross join lateral(select coalesce(sum(case when d.document_type='issue' then dl.quantity when d.document_type='return' then -dl.quantity else 0 end),0) as issued,
   max(d.document_date) filter(where d.document_type='issue') as last_issue_date
   from stock_v2.document_line dl join stock_v2.document d using(document_id) where dl.requirement_id=ji.requirement_id and d.status='posted' and d.document_type in ('issue','return')) x
  where ji.job_id=j.job_id
 ) a on true
 where j.job_id=p_job and o.owner_code='TEST_JS' and j.status in ('planned','completed') and (p_include_closed or t.end_date is null)
$$;

create function stock_v2.sprayer_mark_dirty() returns trigger
language plpgsql security definer set search_path='' as $$
declare ids bigint[]:='{}';key_id bigint;
begin
 if tg_table_name in ('spray_job','spray_job_input','sprayer_completion') then
  if tg_op<>'DELETE' then ids:=array_append(ids,new.job_id);end if;
  if tg_op<>'INSERT' then ids:=array_append(ids,old.job_id);end if;
 elsif tg_table_name='document_line' then
  if tg_op<>'DELETE' then insert into stock_v2.sprayer_dirty select job_id from stock_v2.spray_job_input where requirement_id=new.requirement_id on conflict do nothing;end if;
  if tg_op<>'INSERT' then insert into stock_v2.sprayer_dirty select job_id from stock_v2.spray_job_input where requirement_id=old.requirement_id on conflict do nothing;end if;
 elsif tg_table_name='document' then
  if tg_op='DELETE' then key_id:=old.document_id;else key_id:=new.document_id;end if;
  insert into stock_v2.sprayer_dirty select distinct ji.job_id from stock_v2.document_line dl join stock_v2.spray_job_input ji on ji.requirement_id=dl.requirement_id where dl.document_id=key_id on conflict do nothing;
 elsif tg_table_name='tracecode' then
  if tg_op='DELETE' then key_id:=old.tracecode_id;else key_id:=new.tracecode_id;end if;
  insert into stock_v2.sprayer_dirty select job_id from stock_v2.spray_job where external_tracecode_id=key_id on conflict do nothing;
 elsif tg_table_name='item' then
  if tg_op='DELETE' then key_id:=old.item_id;else key_id:=new.item_id;end if;
  insert into stock_v2.sprayer_dirty select distinct job_id from stock_v2.spray_job_input where item_id=key_id on conflict do nothing;
 else
  insert into stock_v2.sprayer_dirty select job_id from stock_v2.spray_job on conflict do nothing;
 end if;
 insert into stock_v2.sprayer_dirty select distinct unnest(ids) where cardinality(ids)>0 on conflict do nothing;
 return null;
end $$;
create trigger sprayer_dirty_jobs after insert or update or delete on stock_v2.spray_job for each row execute function stock_v2.sprayer_mark_dirty();
create trigger sprayer_dirty_inputs after insert or update or delete on stock_v2.spray_job_input for each row execute function stock_v2.sprayer_mark_dirty();
create trigger sprayer_dirty_execution after insert or update or delete on stock_v2.sprayer_completion for each row execute function stock_v2.sprayer_mark_dirty();
create trigger sprayer_dirty_lines after insert or update or delete on stock_v2.document_line for each row execute function stock_v2.sprayer_mark_dirty();
create trigger sprayer_dirty_posting after update of status on stock_v2.document for each row execute function stock_v2.sprayer_mark_dirty();
create trigger sprayer_dirty_trace after update or delete on public.tracecode for each row execute function stock_v2.sprayer_mark_dirty();
create trigger sprayer_dirty_item after update on stock_v2.item for each row execute function stock_v2.sprayer_mark_dirty();
create trigger sprayer_dirty_setup after update on stock_v2.sprayer_setup for each row execute function stock_v2.sprayer_mark_dirty();
create trigger sprayer_dirty_types after insert or update or delete on stock_v2.access_spray_type_catalog for each row execute function stock_v2.sprayer_mark_dirty();
insert into stock_v2.sprayer_dirty select job_id from stock_v2.spray_job;

create function stock_v2.sprayer_refresh_feed() returns void
language plpgsql security invoker set search_path='' as $$
declare r record;p jsonb;h text;
begin
 perform pg_advisory_xact_lock(hashtext('stock_v2_sprayer_feed'));
 for r in select job_id from stock_v2.sprayer_dirty order by job_id limit 200 for update skip locked loop
  delete from stock_v2.sprayer_dirty where job_id=r.job_id;
  p:=stock_v2.sprayer_payload(r.job_id);h:=md5(coalesce(p::text,'null'));
  insert into stock_v2.sprayer_feed(job_id,revision,hash,payload) values(r.job_id,nextval('stock_v2.sprayer_feed_revision'),h,p)
  on conflict(job_id) do update set revision=excluded.revision,hash=excluded.hash,payload=excluded.payload,updated_at=now() where stock_v2.sprayer_feed.hash<>excluded.hash;
 end loop;
end $$;

create function stock_v2.sprayer_complete(p_actor uuid,p_operation uuid,p_data jsonb,p_admin boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare access jsonb:=stock_v2.workflow_access(p_actor);prior stock_v2.sprayer_operation;c stock_v2.sprayer_completion;
 p jsonb;before_doc jsonb;result jsonb;jid bigint;day date;reason text;closed_date date;today date:=(now() at time zone 'Africa/Harare')::date;
begin
 if not coalesce((access->>'is_sprayer')::boolean,false) or (p_admin and not coalesce((access->>'is_admin')::boolean,false)) then raise exception 'Sprayer % access required',case when p_admin then 'Admin' else 'phone' end using errcode='42501';end if;
 if p_operation is null then raise exception 'Save reference required';end if;
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 select * into prior from stock_v2.sprayer_operation where operation_id=p_operation;
 if found then
  if prior.actor<>p_actor or prior.request<>jsonb_build_object('admin',p_admin,'data',p_data) then raise exception 'Save reference reused with different values';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 jid:=(p_data->>'job_id')::bigint;
 perform 1 from stock_v2.spray_job where job_id=jid for update;
 perform 1 from public.tracecode where tracecode_id=(select external_tracecode_id from stock_v2.spray_job where job_id=jid) for share;
 p:=stock_v2.sprayer_payload(jid,true);
 select t.end_date into closed_date from public.tracecode t join stock_v2.spray_job j on j.external_tracecode_id=t.tracecode_id where j.job_id=jid;
 select * into c from stock_v2.sprayer_completion where job_id=jid for update;before_doc:=case when found then to_jsonb(c) else null end;
 if p_admin then
  perform stock_v2.workflow_require(p_actor,true);reason:=btrim(coalesce(p_data->>'reason',''));
  if c.job_id is null or c.version is distinct from (p_data->>'version')::integer or length(reason)<8 then raise exception 'Current completion version and correction reason required';end if;
 else
  if p is null then raise exception 'Spray is cancelled or removed. Sync and review';end if;
  if p_data->>'base_hash' is distinct from md5(p::text) then raise exception 'Spray details changed. Sync, review the tank mix and confirm again';end if;
  if not coalesce((p->>'fully_issued')::boolean,false) then raise exception 'Awaiting stock: full spray must be issued before completion';end if;
  if c.completed_date is not null then raise exception 'Spray already has a completion date. Sync to view it';end if;
 end if;
 day:=nullif(p_data->>'completed_date','')::date;
 if not p_admin and day is null then raise exception 'Completion date required';end if;
 if not p_admin and day>closed_date then raise exception 'Completed date is after this trace closed. Ask Admin to review';end if;
 if day>today then raise exception 'Completion date cannot be in the future';end if;
 if day is not null and p is not null and p->>'last_issue_date' is not null and day<(p->>'last_issue_date')::date then raise exception 'Completion date cannot precede the last stock issue';end if;
 if not exists(select 1 from stock_v2.spray_job where job_id=jid) then raise exception 'Spray not found';end if;
 insert into stock_v2.sprayer_completion(job_id,completed_date,completed_by,updated_by) values(jid,day,p_actor,p_actor)
 on conflict(job_id) do update set completed_date=excluded.completed_date,completed_by=case when p_admin then stock_v2.sprayer_completion.completed_by else p_actor end,updated_by=p_actor,version=stock_v2.sprayer_completion.version+1,updated_at=now() returning * into c;
 insert into stock_v2.sprayer_completion_audit(job_id,actor,action,reason,before_values,after_values) values(jid,p_actor,case when p_admin then 'correct' else 'complete' end,reason,before_doc,to_jsonb(c));
 result:=jsonb_build_object('job_id',jid::text,'completed_date',day,'version',c.version);
 insert into stock_v2.sprayer_operation(operation_id,actor,request,result) values(p_operation,p_actor,jsonb_build_object('admin',p_admin,'data',p_data),result);
 return result;
end $$;
revoke all on function stock_v2.workflow_access(uuid),stock_v2.workflow_assign_staff(uuid,uuid,text,boolean,text),stock_v2.sprayer_payload(bigint,boolean),stock_v2.sprayer_mark_dirty(),stock_v2.sprayer_refresh_feed(),stock_v2.sprayer_complete(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
