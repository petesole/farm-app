import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return respond({error:"Method not allowed"},405);
 const authorization=req.headers.get("authorization")||"";
 if(!authorization.startsWith("Bearer "))return respond({error:"Please sign in"},401);
 const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await sb.auth.getUser(authorization.slice(7));
 if(error||!user)return respond({error:"Unauthorized"},401);
 let body:any;
 try{body=await req.json()}catch{return respond({error:"Bad JSON"},400)}
 const items={ "-1001":"DEMO_MOSQUITO","-1002":"DEMO_GLYPHOSATE","-1003":"DEMO_LAMBDA","-1004":"DEMO_COMPOUND_D"};
 if(!body||!Number.isSafeInteger(body.tracecode_id)||typeof body.purpose!=="string"||typeof body.request_id!=="string"||!Array.isArray(body.lines))return respond({error:"Invalid request"},400);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.request_id))return respond({error:"Invalid request ID"},400);
 const lines=[];
 for(const line of body.lines){
  const code=(items as Record<string,string>)[String(line.input_id)];
  if(!code||typeof line.quantity!=="number"||!Number.isFinite(line.quantity)||line.quantity<=0||line.quantity>10000)return respond({error:"Only 4 DEMO items and positive quantities allowed"},400);
  lines.push({item_code:code,quantity:line.quantity});
 }
 if(lines.length===0||lines.length>15)return respond({error:"Supply 1-15 lines"},400);
 const dbUrl=Deno.env.get("SUPABASE_DB_URL");
 if(!dbUrl)return respond({error:"Database connection not configured"},503);
 const sql=postgres(dbUrl,{max:1,connect_timeout:6,ssl:"require",prepare:false});
 try{
  await sql`select stock_v2.workflow_require(${user.id}::uuid)`;
  const r=await sql`select stock_v2.demo_direct_issue(${body.request_id}::uuid,${body.tracecode_id}::bigint,${body.purpose}::text,${JSON.stringify(lines)}::jsonb) as result`;
  return respond(r[0]?.result??{error:"No result"});
 }catch(e){return respond({error:e instanceof Error?e.message:"Posting failed"},400)}
 finally{await sql.end({timeout:2})}
});
