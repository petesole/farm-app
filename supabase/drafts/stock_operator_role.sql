alter table stock_v2.staff_role drop constraint staff_role_role_name_check;
alter table stock_v2.staff_role add constraint staff_role_role_name_check check(role_name in ('clerk','stock','supervisor','admin'));
create or replace function stock_v2.workflow_access(p_actor uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('can_main',exists(select 1 from public.app_user_role where user_id=p_actor and lower(role_name)='admin'),'is_admin',p_actor is not null and (
  exists(select 1 from public.app_user_role where user_id=p_actor and lower(role_name)='admin')
  or exists(select 1 from stock_v2.staff_role where user_id=p_actor and active and role_name='admin')),
 'is_stock',p_actor is not null and (
  exists(select 1 from public.app_user_role where user_id=p_actor and lower(role_name)='admin')
  or exists(select 1 from stock_v2.staff_role where user_id=p_actor and active and role_name in ('clerk','stock','supervisor','admin'))))
$$;
create or replace function stock_v2.workflow_assign_staff(p_actor uuid,p_user uuid,p_role text,p_active boolean,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare before_doc jsonb;after_doc jsonb;
begin
 perform stock_v2.workflow_require(p_actor,true);
 if coalesce(p_role,'') not in ('clerk','stock','supervisor','admin') or p_active is null or length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Role, active status and reason required';end if;
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'User not found';end if;
 perform pg_catalog.pg_advisory_xact_lock(hashtext('stock_v2_staff_roles'));
 select to_jsonb(s) into before_doc from stock_v2.staff_role s where user_id=p_user;
 insert into stock_v2.staff_role(user_id,role_name,active,assigned_by,note) values(p_user,p_role,p_active,p_actor,p_reason)
 on conflict(user_id) do update set role_name=excluded.role_name,active=excluded.active,assigned_by=p_actor,assigned_at=now(),note=p_reason;
 select to_jsonb(s) into after_doc from stock_v2.staff_role s where user_id=p_user;
 insert into stock_v2.staff_role_audit(actor,user_id,before_values,after_values,reason) values(p_actor,p_user,before_doc,after_doc,p_reason);
end $$;
revoke all on function stock_v2.workflow_access(uuid),stock_v2.workflow_assign_staff(uuid,uuid,text,boolean,text) from public,anon,authenticated;
