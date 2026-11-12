import {createClient} from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const reply=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{...cors,"content-type":"application/json"}});
const dateOK=(v:unknown)=>{if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+"T12:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v};
const money=(x:unknown)=>Number.isFinite(Number(x))&&Number(x)>=0?Number(x):NaN;
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(!["GET","POST"].includes(req.method))return reply({error:"Method not allowed"},405);
 const auth=req.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer "))return reply({error:"Sign in required"},401);
 const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user}}=await sb.auth.getUser(auth.slice(7));
 if(!user)return reply({error:"Not authenticated"},401);
 const url=Deno.env.get("SUPABASE_DB_URL");
 if(!url)return reply({error:"Database connection missing"},503);
 const db=postgres(url,{max:1,connect_timeout:8,ssl:"require",prepare:false});
 try{
  await db`select stock_v2.workflow_require(${user.id}::uuid)`;
  if(req.method==="GET"){
   const returns=await db`select d.document_id,d.document_number,d.document_date::text as document_date,s.supplier_name,s.owner_code,s.return_reference,s.return_mode,d.reason,
    coalesce((select jsonb_agg(jsonb_build_object('line_id',dl.line_id,'item_code',i.item_code,'item_name',i.item_name,'quantity',dl.quantity,'agreed_price',c.agreed_price,'inventory_value',c.inventory_value,
      'credited_quantity',(select coalesce(sum(a.quantity),0) from stock_v2.supplier_credit_allocation a where a.return_line_id=dl.line_id),
      'credited_value',(select coalesce(sum(a.quantity*a.unit_credit_price),0) from stock_v2.supplier_credit_allocation a where a.return_line_id=dl.line_id)) order by dl.line_id)
      from stock_v2.document_line dl join stock_v2.item i on i.item_id=dl.item_id join stock_v2.supplier_return_credit_line c on c.line_id=dl.line_id where dl.document_id=d.document_id),'[]'::jsonb) as lines
    from stock_v2.supplier_return s join stock_v2.document d on d.document_id=s.document_id order by d.document_id desc limit 200`;
   const credits=await db`select c.credit_id,c.supplier_name,c.owner_code,c.credit_note_number,c.credit_note_date::text as credit_note_date,c.total_amount::float8 as total_amount,c.credit_kind,c.notes,c.created_at::text as created_at,(select jsonb_build_object('receipt_number','GRV '||(select count(*) from stock_v2.document z where z.document_type='grv' and z.status='posted' and z.document_id<=d.document_id),'item_name',i.item_name,'amount',p.amount,'reason',p.reason) from stock_v2.supplier_credit_price_adjustment p join stock_v2.document d on d.document_id=p.receipt_document_id join stock_v2.item i on i.item_id=p.item_id where p.credit_id=c.credit_id) as price_adjustment,
    coalesce((select jsonb_agg(jsonb_build_object('return_line_id',a.return_line_id,'quantity',a.quantity,'unit_credit_price',a.unit_credit_price,'agreed_price',rc.agreed_price,'expected_value',a.quantity*rc.agreed_price,'actual_value',a.quantity*a.unit_credit_price,'return_number',d.document_number,'item_name',i.item_name))
      from stock_v2.supplier_credit_allocation a join stock_v2.document_line dl on dl.line_id=a.return_line_id join stock_v2.item i on i.item_id=dl.item_id join stock_v2.document d on d.document_id=dl.document_id join stock_v2.supplier_return_credit_line rc on rc.line_id=a.return_line_id where a.credit_id=c.credit_id),'[]'::jsonb) as allocations
    from stock_v2.supplier_credit_note c order by c.credit_id desc limit 200`;
   const receipts=await db`select d.document_id,d.document_number,(select count(*) from stock_v2.document z where z.document_type='grv' and z.status='posted' and z.document_id<=d.document_id)::int as display_no,d.document_date::text as document_date,g.supplier_name,o.owner_code,dl.line_id as receipt_line_id,i.item_id,i.item_code,i.item_name from stock_v2.document d join stock_v2.grv_detail g on g.document_id=d.document_id join stock_v2.document_line dl on dl.document_id=d.document_id join stock_v2.item i on i.item_id=dl.item_id join stock_v2.movement m on m.document_line_id=dl.line_id and m.quantity_delta>0 join stock_v2.owner o on o.owner_id=m.owner_id where d.status='posted' and d.document_type='grv' and (nullif(trim(coalesce(g.invoice_number,'')),'') is not null or exists(select 1 from stock_v2.accounting_grv_allocation a where a.receipt_line_id=dl.line_id)) and o.owner_code in ('TEST_JS','TEST_AO') order by d.document_id desc limit 400`;
   return reply({returns,credits,receipts});
  }
  return reply({error:"Use the Stock approval workflow to submit supplier credits. Admin approval applies the credit and locks it."},409);
 }catch(e){return reply({error:e instanceof Error?e.message:"Credit operation failed"},400)}
 finally{await db.end({timeout:2})}
});
