import {createClient} from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const rejected=(e:unknown)=>/^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|40[0-9A-Z]{3}|42[0-9A-Z]{3})$/.test(String((e as any)?.code??''));
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(!['GET','POST'].includes(req.method))return reply({error:'Method not allowed'},405);
 const auth=req.headers.get('authorization')??'';if(!auth.startsWith('Bearer '))return reply({error:'Sign in required'},401);
 const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await sb.auth.getUser(auth.slice(7));if(error){const retry=error.name==='AuthRetryableFetchError'||!error.status||error.status>=500;return reply({error:retry?'Unable to verify connection. Saved phone data is retained.':'Sign in required'},retry?503:401);}if(!user)return reply({error:'Sign in required'},401);
 const db=postgres(Deno.env.get('SUPABASE_DB_URL')!,{max:1,ssl:'require',prepare:false,connect_timeout:8});
 try{
  const access=(await db`select stock_v2.workflow_access(${user.id}::uuid) as access`)[0].access;
  if(!access.is_sprayer)return reply({error:'Sprayer access required'},403);
  const url=new URL(req.url);
  if(req.method==='GET'&&url.searchParams.has('access'))return reply({user_id:user.id,name:user.email??'Sprayer',is_admin:access.is_admin});
  if(req.method==='GET'&&url.searchParams.has('admin_list')){
   if(!access.is_admin)return reply({error:'Admin access required'},403);
   const rows=await db`select j.job_id::text,j.spray_type,t.tracecode_name as trace,t.end_date::text as trace_end_date,c.completed_date::text,c.version,c.updated_at,
    (select a.reason from stock_v2.sprayer_completion_audit a where a.job_id=j.job_id and a.reason is not null order by a.audit_id desc limit 1) as reason
    from stock_v2.sprayer_completion c join stock_v2.spray_job j using(job_id) join public.tracecode t on t.tracecode_id=j.external_tracecode_id order by c.completed_date nulls first,j.job_id`;
   return reply({rows});
  }
  if(req.method==='GET')return reply({error:'Unknown request'},400);
  const raw=await req.text();if(raw.length>250000)return reply({error:'Sync request too large'},413);
  let body:any;try{body=JSON.parse(raw)}catch{return reply({error:'Invalid request'},400)}
  if(body.action==='admin_edit'){
   if(!access.is_admin)return reply({error:'Admin access required'},403);
   const result=await db`select stock_v2.sprayer_complete(${user.id}::uuid,${body.operation_id}::uuid,${db.json(body.data)}::jsonb,true) as result`;
   return reply({result:result[0].result});
  }
  if(body.action!=='sync'||!/^\d{1,19}$/.test(String(body.cursor??'0')))return reply({error:'Invalid sync cursor'},400);
  const operations=body.operations??[];if(!Array.isArray(operations)||operations.length>50)return reply({error:'Sync at most 50 completion changes at a time'},400);
  const results:any[]=[];
  for(const op of operations){
   if(!op||!/^[-a-f0-9]{36}$/i.test(op.operation_id??'')||!/^\d+$/.test(String(op.job_id??''))||!/^\d{4}-\d{2}-\d{2}$/.test(op.completed_date??'')||!/^[a-f0-9]{32}$/.test(op.base_hash??'')){
    results.push({operation_id:op?.operation_id,status:'rejected',error:'Invalid completion change'});continue;
   }
   try{
    const data={job_id:String(op.job_id),completed_date:op.completed_date,base_hash:op.base_hash};
    const result=await db`select stock_v2.sprayer_complete(${user.id}::uuid,${op.operation_id}::uuid,${db.json(data)}::jsonb,false) as result`;
    results.push({operation_id:op.operation_id,status:'accepted',result:result[0].result});
   }catch(e){const confirmed=rejected(e);results.push({operation_id:op.operation_id,status:confirmed?'rejected':'unconfirmed',error:e instanceof Error?e.message:'Completion not confirmed'});}
  }
  await db`select stock_v2.sprayer_refresh_feed()`;
  const meta=(await db`select epoch::text from stock_v2.sprayer_feed_meta`)[0];
  const max=(await db`select coalesce(max(revision),0)::text as revision from stock_v2.sprayer_feed`)[0].revision;
  const reset=body.epoch!==meta.epoch||BigInt(body.cursor??'0')>BigInt(max);const cursor=reset?'0':String(body.cursor??'0');
  const limit=Math.max(1,Math.min(500,Number(body.limit)||100));
  const rows=await db`select job_id::text as id,revision::text,hash,payload from stock_v2.sprayer_feed where revision>${cursor}::bigint and revision<=${max}::bigint order by revision limit ${limit+1}`;
  const hasMore=rows.length>limit,changes=rows.slice(0,limit),next=hasMore?changes[changes.length-1].revision:max;
  const dirty=(await db`select exists(select 1 from stock_v2.sprayer_dirty) as pending`)[0].pending;
  return reply({epoch:meta.epoch,reset,changes,results,cursor:next,more:hasMore||dirty,server_time:new Date().toISOString()});
 }catch(e){return reply({error:e instanceof Error?e.message:'Sync failed'},rejected(e)?400:503)}finally{await db.end({timeout:2})}
});
