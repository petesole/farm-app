import {createClient} from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"content-type":"application/json"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(!["GET","POST"].includes(req.method))return reply({error:"Method not allowed"},405);
 const auth=req.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer "))return reply({error:"Authentication required"},401);
 const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await sb.auth.getUser(auth.slice(7));
 if(error||!user)return reply({error:"Not authenticated"},401);
 const url=Deno.env.get("SUPABASE_DB_URL");
 if(!url)return reply({error:"Private demo database connection missing"},503);
 const db=postgres(url,{max:1,connect_timeout:8,ssl:"require",prepare:false});
 try{
  const access=(await db`select stock_v2.workflow_access(${user.id}::uuid) as value`)[0].value;
  if(req.method==="GET" && new URL(req.url).searchParams.has("stock_access"))return reply({access});
  if(req.method==="GET" && new URL(req.url).searchParams.has("chemical_actives")){
    const rows=await db`select i.item_code,a.active_name,a.concentration::float8 as concentration,a.concentration_unit
      from stock_v2.item_active_ingredient a join stock_v2.item i using(item_id)
      order by i.item_code,a.id`;
    return reply({rows});
  }
  if(req.method==="POST" && new URL(req.url).searchParams.has("chemical_actives")){
    if(!access.is_admin)return reply({error:"Admin access required to edit chemical master data"},403);
    const payload=await req.json().catch(()=>null);
    const code=String(payload?.item_code??"").trim();
    const rows=payload?.actives;
    if(!code||!Array.isArray(rows)||rows.length<1||rows.length>20)
      return reply({error:"Product and 1–20 active ingredients required"},400);
    const normalized=rows.map((a:any)=>({
      name:String(a.name??"").trim(),
      amount:Number(a.amount),
      unit:String(a.unit??"")
    }));
    if(normalized.some((a:any)=>!a.name||a.name.length>150||!Number.isFinite(a.amount)||a.amount<=0||!["g/L","g/kg"].includes(a.unit))||
      new Set(normalized.map((a:any)=>a.name.toLowerCase())).size!==normalized.length)
      return reply({error:"Each active needs a unique name, positive concentration and g/L or g/kg unit"},400);
    try{
      await db.begin(async(tx:any)=>{
        const found=await tx`select item_id from stock_v2.item where item_code=${code} for update`;
        if(!found.length)throw Error("Product not found");
        const itemId=found[0].item_id;
        const prior=await tx`select active_name,concentration::float8 as amount,concentration_unit as unit from stock_v2.item_active_ingredient where item_id=${itemId} order by id`;
        await tx`delete from stock_v2.item_active_ingredient where item_id=${itemId}`;
        for(const a of normalized)await tx`insert into stock_v2.item_active_ingredient
          (item_id,active_name,concentration,concentration_unit,updated_by)
          values(${itemId},${a.name},${a.amount},${a.unit},${user.id}::uuid)`;
        await tx`insert into stock_v2.item_active_ingredient_audit(item_id,actor,old_ingredients,new_ingredients)
          values(${itemId},${user.id}::uuid,${JSON.stringify(prior)}::jsonb,${JSON.stringify(normalized)}::jsonb)`;
      });
      return reply({saved:true});
    }catch(e){return reply({error:e instanceof Error?e.message:String(e)},400)}
  }

  await db`select stock_v2.workflow_require(${user.id}::uuid)`;
  if(req.method==='GET'&&new URL(req.url).searchParams.has('stock_adjustment_report')){
   if(!(await db`select stock_v2.can_print_stocktake(${user.id}::uuid) as allowed`)[0].allowed)return reply({error:'Admin or Clerk access required'},403);
   const rows=await db`select p.*,p.take_date::text as take_date,p.required_quantity::float8 as required_quantity from stock_v2.stocktake_adjustment_pending p order by p.take_date,p.sheet_id,p.position,p.owner_code`;
   const history=await db`select d.document_id,d.document_number,d.document_date::text,d.reason,m.reason_code,
    count(l.line_id)::int as lines from stock_v2.stock_adjustment_meta m join stock_v2.document d using(document_id) join stock_v2.document_line l using(document_id) where d.status='posted' group by d.document_id,m.reason_code order by d.document_date,d.document_id`;
   return reply({rows,history,is_admin:access.is_admin});
  }
  if(req.method==='GET'&&new URL(req.url).searchParams.has('stock_adjustment_history_lines')){
   if(!(await db`select stock_v2.can_print_stocktake(${user.id}::uuid) as allowed`)[0].allowed)return reply({error:'Admin or Clerk access required'},403);
   const id=Number(new URL(req.url).searchParams.get('document_id'));if(!Number.isSafeInteger(id)||id<1)return reply({error:'Invalid adjustment'},400);
   const rows=await db`select d.document_number,d.document_date::text,d.reason,coalesce(t.take_number,old.take_number) as take_number,
    coalesce(s.owner_code,case when o.owner_code='TEST_JS' then 'HS' else 'AO' end) as owner_code,coalesce(s.item_code,i.item_code) as item_code,coalesce(s.item_name,i.item_name) as item_name,
    m.quantity_delta::float8 as quantity from stock_v2.stock_adjustment_meta a join stock_v2.document d using(document_id) join stock_v2.document_line l using(document_id)
    join stock_v2.movement m on m.document_line_id=l.line_id join stock_v2.owner o using(owner_id) join stock_v2.item i using(item_id)
    left join stock_v2.stock_adjustment_source s on s.line_id=l.line_id left join stock_v2.combined_stocktake t on t.sheet_id=s.sheet_id left join stock_v2.stocktake old on old.take_id=a.stocktake_id
    where d.status='posted' and d.document_id=${id} order by l.line_id`;
   return reply({rows});
  }
  if(req.method==='GET'&&new URL(req.url).searchParams.has('combined_stocktake_groups')){
   const canPrint=(await db`select stock_v2.can_print_stocktake(${user.id}::uuid) as allowed`)[0].allowed;
   const rows=await db`select distinct coalesce(nullif(btrim(i.input_type),''),'Other') as stock_type from stock_v2.item i
    where i.active and exists(select 1 from stock_v2.quantity_balance q join stock_v2.owner o using(owner_id) join stock_v2.location l using(location_id) where q.item_id=i.item_id and q.quantity>0 and o.owner_code in ('TEST_JS','TEST_AO') and l.location_code='TEST_WH') order by stock_type`;
   return reply({groups:canPrint?rows.map((r:any)=>r.stock_type):[],is_admin:access.is_admin,can_print:canPrint});
  }
  if(req.method==='GET'&&new URL(req.url).searchParams.has('combined_stocktake_list')){
   const historical=new URL(req.url).searchParams.get('history')==='1';if(historical)await db`select stock_v2.workflow_require(${user.id}::uuid,true)`;
   const rows=await db`select t.*,t.take_date::text as take_date,d.document_number as adjustment_number,(select count(*)::int from stock_v2.combined_stocktake_line l where l.sheet_id=t.sheet_id) as items
    from stock_v2.combined_stocktake t left join stock_v2.document d on d.document_id=t.adjustment_document_id where ${historical} or t.status='draft' order by t.take_date,t.created_at,t.sheet_id`;
   return reply({rows});
  }
  if(req.method==='GET'&&new URL(req.url).searchParams.has('combined_stocktake_lines')){
   const canPrint=(await db`select stock_v2.can_print_stocktake(${user.id}::uuid) as allowed`)[0].allowed;
   if(new URL(req.url).searchParams.has('print')&&!canPrint)return reply({error:'Only Admin and Clerk can print stocktake sheets'},403);
   const id=Number(new URL(req.url).searchParams.get('sheet_id'));if(!Number.isSafeInteger(id)||id<1)return reply({error:'Invalid stock sheet'},400);
   const sheets=await db`select t.*,t.take_date::text as take_date,d.document_number as adjustment_number from stock_v2.combined_stocktake t left join stock_v2.document d on d.document_id=t.adjustment_document_id where t.sheet_id=${id}`;
   if(!sheets.length)return reply({error:'Stock sheet not found'},404);
   if(sheets[0].status!=='draft'&&!access.is_admin)return reply({error:'Admin access required for saved stocktakes'},403);
   const rows=await db`select l.item_code,l.item_name,l.category,l.stock_type,l.position,l.counted_hs::float8 as hs,l.counted_ao::float8 as ao,
    case when ${access.is_admin} then (l.counted_hs-coalesce(l.applied_hs,l.system_hs))::float8 else null end as delta_hs,
    case when ${access.is_admin} then (l.counted_ao-coalesce(l.applied_ao,l.system_ao))::float8 else null end as delta_ao
    from stock_v2.combined_stocktake_line l where l.sheet_id=${id} order by l.position`;
   const audit=access.is_admin?await db`select action,reason,created_at from stock_v2.combined_stocktake_audit where sheet_id=${id} order by audit_id`:[];
   return reply({sheet:sheets[0],rows,audit,is_admin:access.is_admin,can_print:canPrint});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("workflow_context")){
   const documents=await db`select a.*,coalesce((select bool_or(l.received_quantity>0) from stock_v2.order_line l where l.order_id=a.target_order_id),false) as received,
    (select jsonb_agg(jsonb_build_object('action',x.action,'actor',x.actor,'created_at',x.created_at,'reason',x.reason) order by x.id) from stock_v2.approval_audit x where x.document_id=a.id) as audit
    from stock_v2.approval_document a order by (status='pending') desc,updated_at desc limit 1000`;
   const stocktakes=await db`select t.*,replace(o.owner_code,'TEST_','') as owner_code,l.location_code,
    (select jsonb_agg(jsonb_build_object('item_code',i.item_code,'item_name',i.item_name,'system_quantity',x.system_quantity,'counted_quantity',x.counted_quantity,'current_quantity',coalesce(q.quantity,0)))
     from stock_v2.stocktake_line x join stock_v2.item i using(item_id) left join stock_v2.quantity_balance q on q.item_id=x.item_id and q.owner_id=t.owner_id and q.location_id=t.location_id where x.take_id=t.take_id) as lines
    from stock_v2.stocktake t join stock_v2.owner o using(owner_id) join stock_v2.location l using(location_id) where t.status='counted' and o.owner_code in ('TEST_JS','TEST_AO') order by t.take_id`;
   const counts=(await db`select (select count(*) from stock_v2.approval_document where status='pending')::int+(select count(*) from stock_v2.stocktake t join stock_v2.owner o using(owner_id) where t.status='counted' and o.owner_code in ('TEST_JS','TEST_AO'))::int as awaiting`)[0];
   const can_adjustments=(await db`select stock_v2.can_print_stocktake(${user.id}::uuid) as allowed`)[0].allowed;
   const adjustment_count=can_adjustments?(await db`select count(*)::int as n from stock_v2.stocktake_adjustment_pending`)[0].n:0;
   return reply({access:{...access,can_adjustments},documents,stocktakes,combined_stocktakes:[],adjustment_count,awaiting:counts.awaiting});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("workflow_operation")){
   const id=new URL(req.url).searchParams.get("workflow_operation");
   const rows=await db`select result from stock_v2.approval_operation where id=${id}::uuid and actor=${user.id}::uuid`;
   return reply({result:rows[0]?.result??null});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("linked_credit_options")){
   const rows=await db`select credit_id,credit_note_number,owner_code,supplier_name,credit_note_date::text,total_amount::float8 from stock_v2.supplier_credit_note where status='posted' order by credit_id desc`;return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("stock_staff")){
   await db`select stock_v2.workflow_require(${user.id}::uuid,true)`;
   const rows=await db`select u.id,u.email,s.role_name,s.active,s.assigned_at,s.note,exists(select 1 from public.app_user_role a where a.user_id=u.id and lower(a.role_name)='admin') as global_admin from auth.users u left join stock_v2.staff_role s on s.user_id=u.id order by u.email`;
   return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("grv_corrections")){
   await db`select stock_v2.workflow_require(${user.id}::uuid,true)`;
   const invoices=await db`select l.id as grv_line_id,null::bigint as receipt_line_id,h.invoice_number,h.invoice_date::text as invoice_date,h.supplier_name,i.item_name,i.item_code,
    coalesce(c.new_invoice_quantity,l.invoice_quantity)::float8 as invoice_quantity,coalesce(c.new_unit_price,l.invoice_unit_price)::float8 as unit_price,
    (select sum(stock_v2.workflow_physical_quantity(receipt_line_id))::float8 from stock_v2.accounting_grv_allocation where grv_line_id=l.id) as physical_quantity
    from stock_v2.accounting_grv_line l join stock_v2.accounting_grv h on h.id=l.grv_id join stock_v2.owner o using(owner_id) join stock_v2.item i using(item_id)
    left join lateral(select * from stock_v2.grv_correction c where c.grv_line_id=l.id order by c.id desc limit 1)c on true
    where h.status in ('posted','matched','disputed') and o.owner_code in ('TEST_JS','TEST_AO')
    union all select null,l.line_id,g.invoice_number,d.document_date::text,g.supplier_name,i.item_name,i.item_code,coalesce(c.new_invoice_quantity,l.quantity)::float8,coalesce(c.new_unit_price,pc.confirmed_unit_cost,pr.actual_unit_cost)::float8,stock_v2.workflow_physical_quantity(l.line_id)::float8
    from stock_v2.document_line l join stock_v2.document d using(document_id) join stock_v2.grv_detail g using(document_id) join stock_v2.item i using(item_id)
    left join stock_v2.price_confirmation pc using(line_id) left join stock_v2.grv_line_price pr using(line_id)
    left join lateral(select * from stock_v2.grv_correction c where c.receipt_line_id=l.line_id order by c.id desc limit 1)c on true
    where d.status='posted' and d.document_type='grv' and nullif(btrim(g.invoice_number),'') is not null and not exists(select 1 from stock_v2.accounting_grv_allocation where receipt_line_id=l.line_id)
    and exists(select 1 from stock_v2.movement m join stock_v2.owner o using(owner_id) where m.document_line_id=l.line_id and o.owner_code in ('TEST_JS','TEST_AO'))`;
   const receipts=await db`select l.line_id as receipt_line_id,d.document_number,g.delivery_note,g.supplier_name,i.item_name,l.quantity::float8 as original_quantity,
    (l.quantity+coalesce((select sum(m.quantity_delta) from stock_v2.document a join stock_v2.document_line al using(document_id) join stock_v2.movement m on m.document_line_id=al.line_id where a.document_type='adjustment' and a.status='posted' and a.parent_document_id=d.document_id and al.source_line_id=l.line_id),0))::float8 as physical_quantity
    from stock_v2.document_line l join stock_v2.document d using(document_id) join stock_v2.grv_detail g using(document_id) join stock_v2.item i using(item_id)
    where d.status='posted' and d.document_type='grv' and exists(select 1 from stock_v2.movement m join stock_v2.owner o using(owner_id) where m.document_line_id=l.line_id and o.owner_code in ('TEST_JS','TEST_AO')) order by l.line_id desc`;
   const history=await db`select * from stock_v2.grv_correction order by id desc limit 200`;
   const physical_history=await db`select * from stock_v2.physical_correction order by created_at desc limit 200`;
   return reply({invoices,receipts,history,physical_history});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("supplier_return_suppliers")){
   const rows=await db`select distinct trim(g.supplier_name) as name,replace(o.owner_code,'TEST_','') as owner_code from stock_v2.grv_detail g join stock_v2.document d on d.document_id=g.document_id join stock_v2.document_line dl on dl.document_id=d.document_id join stock_v2.movement m on m.document_line_id=dl.line_id join stock_v2.owner o on o.owner_id=m.owner_id where d.status='posted' and d.document_type='grv' and nullif(trim(g.supplier_name),'') is not null order by name`;
   return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("supplier_return_sources")){
   const supplier=String(new URL(req.url).searchParams.get("supplier")||"").trim();const owner=String(new URL(req.url).searchParams.get("owner")||"JS");
   if(!supplier)return reply({rows:[]});
   const rows=await db`select dl.line_id as receipt_line_id,d.document_id,d.document_number,(select count(*) from stock_v2.document z where z.document_type='grv' and z.status='posted' and z.document_id<=d.document_id)::int as display_no,d.document_date::text as document_date,g.supplier_name,i.item_code,i.item_name,stock_v2.workflow_physical_quantity(dl.line_id)::float8 as received_quantity,coalesce((select p.actual_unit_cost::float8 from stock_v2.grv_line_price p where p.line_id=dl.line_id),(select (sum(a.quantity*al.invoice_unit_price)/nullif(sum(a.quantity),0))::float8 from stock_v2.accounting_grv_allocation a join stock_v2.accounting_grv_line al on al.id=a.grv_line_id where a.receipt_line_id=dl.line_id),(select p.provisional_unit_cost::float8 from stock_v2.grv_line_price p where p.line_id=dl.line_id)) as original_unit_price,
     coalesce((select sum(src.quantity) from stock_v2.supplier_return_source src where src.receipt_line_id=dl.line_id),0)::float8 as previously_returned
     from stock_v2.document d join stock_v2.grv_detail g on g.document_id=d.document_id
     join stock_v2.document_line dl on dl.document_id=d.document_id join stock_v2.item i on i.item_id=dl.item_id
     where d.document_type='grv' and d.status='posted' and lower(trim(g.supplier_name))=lower(${supplier}) and exists(select 1 from stock_v2.movement m join stock_v2.owner o on o.owner_id=m.owner_id where m.document_line_id=dl.line_id and o.owner_code='TEST_'||${owner}) order by d.document_date desc,dl.line_id desc limit 500`;
   return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("supplier_returns")){
   const rows=await db`select d.document_id,d.document_number,d.document_date::text as document_date,s.supplier_name,s.owner_code,s.return_reference,s.return_mode,s.credit_status,s.credit_note_number,s.credit_note_date::text as credit_note_date,
   coalesce((select jsonb_agg(jsonb_build_object('item_code',i.item_code,'item_name',i.item_name,'quantity',dl.quantity,'agreed_price',cl.agreed_price,'confirmed_price',cl.confirmed_price,'inventory_unit_cost',cl.inventory_unit_cost,'inventory_value',cl.inventory_value,'valuation_difference',cl.valuation_difference,'original_grv_value',cl.original_grv_value,'sources',(select coalesce(jsonb_agg(jsonb_build_object('grv','GRV '||(select count(*) from stock_v2.document z where z.document_type='grv' and z.status='posted' and z.document_id<=d2.document_id),'quantity',src.quantity,'original_unit_price',src.original_unit_price)),'[]'::jsonb) from stock_v2.supplier_return_source src join stock_v2.document_line rl on rl.line_id=src.receipt_line_id join stock_v2.document d2 on d2.document_id=rl.document_id where src.return_line_id=dl.line_id))) from stock_v2.document_line dl join stock_v2.item i on i.item_id=dl.item_id join stock_v2.supplier_return_credit_line cl on cl.line_id=dl.line_id where dl.document_id=d.document_id),'[]'::jsonb) as lines
   from stock_v2.supplier_return s join stock_v2.document d on d.document_id=s.document_id order by d.document_id desc limit 100`;
   return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("adjustment_history")){
   const rows=await db`select d.document_id,d.document_number,d.document_date::text as document_date,d.reason,m.reason_code,
    coalesce((select jsonb_agg(jsonb_build_object('item_code',i.item_code,'item_name',i.item_name,'quantity_delta',mv.quantity_delta,'owner_code',o.owner_code,'location_code',lc.location_code) order by dl.line_id)
       from stock_v2.document_line dl join stock_v2.movement mv on mv.document_line_id=dl.line_id join stock_v2.item i on i.item_id=dl.item_id join stock_v2.owner o on o.owner_id=mv.owner_id join stock_v2.location lc on lc.location_id=mv.location_id where dl.document_id=d.document_id),'[]'::jsonb) as lines
     from stock_v2.document d left join stock_v2.stock_adjustment_meta m on m.document_id=d.document_id where d.document_type='adjustment' and d.status='posted' order by d.document_id desc limit 250`;
   return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("stocktake_list")){
    const rows=await db`select t.take_id,t.take_number,t.status,t.take_date::text as take_date,o.owner_code,l.location_code,t.notes,t.printed_at::text as printed_at,t.counted_at::text as counted_at,t.adjustment_document_id,d.document_number as adjustment_number,(select count(*) from stock_v2.stocktake_line x where x.take_id=t.take_id)::int as lines from stock_v2.stocktake t join stock_v2.owner o on o.owner_id=t.owner_id join stock_v2.location l on l.location_id=t.location_id left join stock_v2.document d on d.document_id=t.adjustment_document_id order by t.take_id desc limit 100`;
    return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("stocktake_lines")){
    const takeId=Number(new URL(req.url).searchParams.get("take_id"));
    if(!Number.isSafeInteger(takeId))return reply({error:"Invalid count"},400);
    const rows=await db`select x.take_id,i.item_code,i.item_name,coalesce(nullif(btrim(i.input_category),''),nullif(btrim(i.category),''),'Uncategorised') as category,coalesce(nullif(btrim(i.input_type),''),'Other') as stock_type,i.base_unit,x.system_quantity::float8 as system_quantity,x.counted_quantity::float8 as counted_quantity from stock_v2.stocktake_line x join stock_v2.item i on i.item_id=x.item_id where x.take_id=${takeId} order by lower(coalesce(nullif(btrim(i.input_category),''),nullif(btrim(i.category),''),'Uncategorised')),lower(i.item_name),i.item_code`;
    return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("adjustment_stock")){
    const rows=await db`select i.item_code,i.item_name,coalesce(nullif(btrim(i.input_category),''),nullif(btrim(i.category),''),'Uncategorised') as category,coalesce(nullif(btrim(i.input_type),''),'Other') as stock_type,i.base_unit,o.owner_code,l.location_code,coalesce(q.quantity,0)::float8 as quantity from stock_v2.item i cross join stock_v2.owner o cross join stock_v2.location l left join stock_v2.quantity_balance q on q.item_id=i.item_id and q.owner_id=o.owner_id and q.location_id=l.location_id where o.owner_code in ('TEST_JS','TEST_AO') and l.location_code='TEST_WH' and i.active=true order by lower(coalesce(nullif(btrim(i.input_category),''),nullif(btrim(i.category),''),'Uncategorised')),lower(i.item_name),i.item_code`;
    return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("correction_dnote_lines")){
   const id=Number(new URL(req.url).searchParams.get("document_id"));
   if(!Number.isSafeInteger(id)||id<1)return reply({error:"Invalid D-Note"},400);
   const rows=await db`select l.line_id,i.item_code,i.item_name,i.base_unit,l.quantity::float8 as received_quantity,
   coalesce((select sum(a.quantity) from stock_v2.accounting_grv_allocation a where a.receipt_line_id=l.line_id),0)::float8 as invoiced_quantity,
   coalesce((select sum(dl.quantity) from stock_v2.document_line dl join stock_v2.document d2 on d2.document_id=dl.document_id where dl.source_line_id=l.line_id and d2.status='posted' and d2.document_type='adjustment' and dl.note like 'DNote reduction%'),0)::float8 as reduced_quantity
   from stock_v2.document_line l join stock_v2.item i on i.item_id=l.item_id join stock_v2.document d on d.document_id=l.document_id
   where d.document_id=${id} and d.document_type='grv' and d.status='posted' order by l.line_id`;
   return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("po_corrections")){
    const rows=await db`select h.order_id,h.order_number,h.order_date::text as order_date,h.supplier_name,replace(o.owner_code,'TEST_','') as owner_code,h.status,ol.order_line_id,i.item_code,i.item_name,
     (ol.ordered_quantity+coalesce((select sum(c.quantity) from stock_v2.order_line_cancellation c where c.order_line_id=ol.order_line_id),0))::float8 as originally_ordered,
     ol.ordered_quantity::float8 as current_ordered,ol.received_quantity::float8 as received_quantity,
     coalesce((select sum(c.quantity) from stock_v2.order_line_cancellation c where c.order_line_id=ol.order_line_id),0)::float8 as cancelled_quantity,
     (ol.ordered_quantity-ol.received_quantity)::float8 as outstanding_quantity
     from stock_v2.order_header h join stock_v2.owner o on o.owner_id=h.owner_id join stock_v2.order_line ol on ol.order_id=h.order_id join stock_v2.item i on i.item_id=ol.item_id
     where o.owner_code like 'TEST_%' order by h.order_id desc,ol.order_line_id limit 400`;
    return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("correction_dnotes")){
   const rows=await db`select d.document_id,(select count(*) from stock_v2.document z where z.document_type='grv' and z.status='posted' and z.document_id<=d.document_id)::int as display_no,d.document_date::text as document_date,g.delivery_note,g.delivery_note_date::text as delivery_note_date,g.supplier_name,g.invoice_number,d.reason,(nullif(trim(coalesce(g.invoice_number,'')),'') is not null or exists(select 1 from stock_v2.accounting_grv_allocation a join stock_v2.document_line l on l.line_id=a.receipt_line_id where l.document_id=d.document_id)) as locked,
   (select count(*) from stock_v2.document_line dl where dl.document_id=d.document_id)::int as line_count
   from stock_v2.document d join stock_v2.grv_detail g on g.document_id=d.document_id
   where d.document_type='grv' and d.status='posted' and g.delivery_note is not null order by d.document_id desc limit 250`;
   return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("spray_admin")){return reply({is_admin:access.is_admin});}
  if(req.method==="GET" && new URL(req.url).searchParams.has("outstanding_dnotes")){
   const rows=await db`select d.document_id,d.document_date,g.delivery_note,g.delivery_note_date,g.supplier_name,
     replace(o.owner_code,'TEST_','') owner_code,i.item_code,i.item_name,i.base_unit,dl.line_id,(stock_v2.workflow_physical_quantity(dl.line_id)-coalesce((select sum(a.quantity) from stock_v2.accounting_grv_allocation a where a.receipt_line_id=dl.line_id),0))::float8 quantity,
     coalesce(lp.provisional_unit_cost,price_ref.received_price,price_ref.po_price)::float8 original_price,price_ref.po_price::float8 po_price,
     case when lp.provisional_unit_cost is not null then 'DNote'
          when price_ref.received_price is not null and price_ref.po_price is distinct from price_ref.received_price then 'DNote'
          when price_ref.po_price is not null then 'PO'
          when price_ref.received_price is not null then 'DNote' else null end original_price_source
     from stock_v2.document d join stock_v2.grv_detail g using(document_id)
     join stock_v2.document_line dl on dl.document_id=d.document_id
     join stock_v2.item i on i.item_id=dl.item_id
     join stock_v2.movement m on m.document_line_id=dl.line_id and m.quantity_delta>0
     join stock_v2.owner o on o.owner_id=m.owner_id
     left join stock_v2.grv_line_price lp on lp.line_id=dl.line_id
     left join lateral (
       select max(link.received_unit_price) received_price,max(ol.ordered_unit_price) po_price
       from stock_v2.demo_grv_line_link link
       join stock_v2.order_line ol on ol.order_line_id=link.order_line_id and ol.item_id=dl.item_id
       where link.document_id=d.document_id
     ) price_ref on true
     where d.status='posted' and d.document_type='grv' and d.document_number like 'DEMO-%' and g.price_status='pending' and o.owner_code in ('TEST_JS','TEST_AO')
       and coalesce((select sum(a.quantity) from stock_v2.accounting_grv_allocation a where a.receipt_line_id=dl.line_id),0)<stock_v2.workflow_physical_quantity(dl.line_id)
     order by d.document_id desc,dl.line_id`;
   return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("spray_return_issues")){
   const jobId=Number(new URL(req.url).searchParams.get("job_id"));
   if(!Number.isSafeInteger(jobId)||jobId<=0)return reply({error:"Valid spray required"},400);
   const rows=await db`select d.document_id,stock_v2.business_number(d.document_id) as document_number,d.document_date::text as document_date,dl.line_id as source_line_id,i.item_code,i.item_name,i.base_unit,(dl.quantity-coalesce((select sum(rl.quantity) from stock_v2.document_line rl join stock_v2.document rd on rd.document_id=rl.document_id where rl.source_line_id=dl.line_id and rd.status='posted' and rd.document_type='return'),0))::float8 as available_to_return
   from stock_v2.document d join stock_v2.document_line dl on dl.document_id=d.document_id join stock_v2.spray_job_input ji on ji.requirement_id=dl.requirement_id join stock_v2.spray_job j on j.job_id=ji.job_id join stock_v2.item i on i.item_id=dl.item_id
   where j.job_id=${jobId} and j.owner_id=(select owner_id from stock_v2.owner where owner_code='TEST_JS') and d.document_type='issue' and d.status='posted' order by d.document_id desc,dl.line_id`;
   return reply({rows:rows.filter((x:any)=>x.available_to_return>0)});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("spray_assignments")){
   const week=new URL(req.url).searchParams.get("through_week")||"";
   if(!/^\d{4}-\d{2}-\d{2}$/.test(week))return reply({error:"Valid week required"},400);
   const rows=await db`select i.item_code,coalesce(sum(greatest(0,ji.rate_per_ha*j.area_ha-coalesce((select sum(case when d.document_type='issue' then dl.quantity when d.document_type='return' then -dl.quantity else 0 end) from stock_v2.document_line dl join stock_v2.document d on d.document_id=dl.document_id where dl.requirement_id=ji.requirement_id and d.document_type in ('issue','return') and d.status='posted'),0))),0)::float8 assigned
   from stock_v2.spray_job j join stock_v2.spray_job_input ji on ji.job_id=j.job_id join stock_v2.item i on i.item_id=ji.item_id
   where j.status='planned' and j.planned_week_start<=${week}::date and j.owner_id=(select owner_id from stock_v2.owner where owner_code='TEST_JS')
   group by i.item_code`;
   return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("spray_history")){
   const traceId=Number(new URL(req.url).searchParams.get("tracecode_id"));
   if(!Number.isSafeInteger(traceId)||traceId<=0)return reply({error:"Valid tracecode required"},400);
   const rows=await db`select j.job_id,j.planned_week_start::text as spray_date,j.status,i.item_name as product,ji.rate_per_ha::float8 as rate_per_ha,i.base_unit
     from stock_v2.spray_job j join stock_v2.spray_job_input ji on ji.job_id=j.job_id join stock_v2.item i on i.item_id=ji.item_id
     where j.external_tracecode_id=${traceId} and j.owner_id=(select owner_id from stock_v2.owner where owner_code='TEST_JS')
     order by j.planned_week_start,j.job_id,ji.job_input_id limit 1500`;
   return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("supplier_list")){
   const suppliers=await db`select supplier_id,supplier_name,active from stock_v2.supplier order by active desc,supplier_name`;
   return reply({suppliers});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("owner_workflow")){
   const owners=await db`select o.owner_id,replace(o.owner_code,'TEST_','') as owner_code,o.owner_name,o.active,p.po_required_for_grv,p.po_requires_contract,p.default_contract_id,p.allow_direct_grv
   from stock_v2.owner o left join stock_v2.owner_policy p on p.owner_id=o.owner_id
   where o.owner_code like 'TEST_%' order by o.owner_name`;
   const contracts=await db`select contract_id,contract_code,contract_name,active from stock_v2.contracts order by contract_code`;
   const items=await db`select item_code,item_name,base_unit from stock_v2.item where active=true order by item_name`;
   const orders=await db`select h.order_id,h.order_number,h.supplier_name,replace(o.owner_code,'TEST_','') as owner_code,h.contract_id,
     i.item_code,i.item_name,i.base_unit,ol.ordered_quantity::float8 ordered_quantity,ol.received_quantity::float8 received_quantity,
     ol.ordered_unit_price::float8 ordered_unit_price
     from stock_v2.order_header h join stock_v2.owner o on o.owner_id=h.owner_id
     join stock_v2.order_line ol on ol.order_id=h.order_id join stock_v2.item i on i.item_id=ol.item_id
     where o.owner_code like 'TEST_%' and h.status='approved'
       and ol.ordered_quantity>ol.received_quantity
     order by h.order_id desc limit 400`;
   const balances=await db`select replace(o.owner_code,'TEST_','') owner_code,i.item_code,i.item_name,i.base_unit,coalesce(nullif(btrim(i.input_category),''),nullif(btrim(i.category),''),'Uncategorised') as category,
    coalesce(q.quantity,0)::float8 as quantity from stock_v2.owner o cross join stock_v2.item i
    left join stock_v2.quantity_balance q on q.owner_id=o.owner_id and q.item_id=i.item_id and q.location_id=(select location_id from stock_v2.location where location_code='TEST_WH')
    where o.owner_code in ('TEST_JS','TEST_AO') and o.active and i.active order by o.owner_code,lower(i.item_name),i.item_code`;
   return reply({owners,contracts,items,orders,balances});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("stock_setup")){
   const contracts=await db`select contract_id,contract_code,contract_name,active from stock_v2.contracts order by active desc,contract_code`;
   const owners=await db`select o.owner_id,replace(o.owner_code,'TEST_','') as owner_code,o.owner_name,o.active,
    coalesce(p.po_required_for_grv,true) as po_required_for_grv,coalesce(p.po_requires_contract,false) as po_requires_contract,
    p.default_contract_id,coalesce(p.allow_direct_grv,false) as allow_direct_grv
    from stock_v2.owner o left join stock_v2.owner_policy p on p.owner_id=o.owner_id
    where o.owner_code like 'TEST_%' order by o.owner_id`;
   const traces=await db`select t.tracecode_id,t.tracecode_name,c.contract_id from public.tracecode t left join stock_v2.tracecode_contract c on c.external_tracecode_id=t.tracecode_id order by t.tracecode_name limit 1000`;
   return reply({contracts,owners,traces});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("issue_slip")){
   const id=Number(new URL(req.url).searchParams.get("issue_slip"));
   if(!Number.isSafeInteger(id)||id<=0)return reply({error:"Invalid issue slip number"},400);
   const header=await db`select d.document_id,stock_v2.business_number(d.document_id) as document_number,d.document_date,d.status,
     max(t.tracecode_name) as tracecode_name,max(j.job_id)::text as job_id,
     max(j.water_litres_per_ha)::float8 as water_rate,max(j.sprayer_asset_code) as sprayer,
     max(j.spray_type) as spray_type
     from stock_v2.document d
     join stock_v2.document_line dl on dl.document_id=d.document_id
     join stock_v2.movement m on m.document_line_id=dl.line_id
     join stock_v2.owner o on o.owner_id=m.owner_id
     join stock_v2.location loc on loc.location_id=m.location_id
     left join public.tracecode t on t.tracecode_id=m.external_tracecode_id
     left join stock_v2.spray_job_input ji on ji.requirement_id=dl.requirement_id
     left join stock_v2.spray_job j on j.job_id=ji.job_id
     where d.document_id=${id} and d.document_type='issue' and d.status='posted'
       and o.owner_code='TEST_JS' and loc.location_code='TEST_WH'
     group by d.document_id,d.document_number,d.document_date,d.status`;
   if(header.length===0)return reply({error:"Posted test stock issue not found"},404);
   const lines=await db`select i.item_name,i.base_unit,i.item_code,
      sum(dl.quantity)::float8 as quantity,max(ji.rate_per_ha)::float8 as rate_per_ha,max(nullif(dl.note,'DEMO issue')) as mix_instruction
      from stock_v2.document_line dl
      join stock_v2.item i on i.item_id=dl.item_id
      join stock_v2.movement m on m.document_line_id=dl.line_id
      join stock_v2.owner o on o.owner_id=m.owner_id
      join stock_v2.location loc on loc.location_id=m.location_id
      left join stock_v2.spray_job_input ji on ji.requirement_id=dl.requirement_id
      where dl.document_id=${id} and o.owner_code='TEST_JS' and loc.location_code='TEST_WH'
      group by i.item_id,i.item_name,i.base_unit,i.item_code
      order by i.item_name`;
   const printStatus=await db`select 1 from stock_v2.issue_slip_print_lock where document_id=${id} limit 1`;
   return reply({header:header[0],lines,already_printed:printStatus.length>0,can_reprint:access.is_admin});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("spray_types")){
    const spray_types=await db`select access_spray_type_id,spray_type_name,spray_tank_size::float8 as spray_tank_size,spray_rate_per_ha::float8 as spray_rate_per_ha from stock_v2.access_spray_type_catalog order by spray_type_name`;
    return reply({spray_types});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("budget_templates")){
    const budgets=await db`select crop_budget_id,crop_name,budget_name,irrigation_type from stock_v2.crop_budget_template order by crop_name,budget_name`;
    return reply({budgets});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("budget_reference")){
    const id=Number(new URL(req.url).searchParams.get("tracecode_id")||0);
    if(!Number.isSafeInteger(id)||id<=0)return reply({error:"Valid tracecode required"},400);
    const assigned=await db`select crop_budget_id from stock_v2.trace_crop_budget where external_tracecode_id=${id}`;
    const budgetId=assigned[0]?.crop_budget_id??null;
    const rows=await db`select l.crop_budget_input_id as budget_ref_id,l.dap as days_after_planting,l.input_rate_per_ha::float8 as rate_per_ha,l.input_name as item_name,coalesce(i.item_code,'') as item_code,coalesce(i.base_unit,'') as base_unit
       from stock_v2.crop_budget_template_line l
       left join lateral (select item_code,base_unit from stock_v2.item where lower(btrim(item_name))=lower(btrim(l.input_name)) order by active desc,item_id limit 1) i on true
       where l.crop_budget_id=${budgetId} order by l.dap,l.input_name`;
    return reply({budget:rows,crop_budget_id:budgetId});
  }
  if(req.method==="POST"){
    const body=await req.clone().json().catch(()=>null);
    if(body?.action==="link_crop_budget"){
      const traceId=Number(body.tracecode_id),budgetId=Number(body.crop_budget_id);
      if(!Number.isSafeInteger(traceId)||traceId<=0)return reply({error:"Choose a valid tracecode"},400);
      if(body.crop_budget_id==null){await db`delete from stock_v2.trace_crop_budget where external_tracecode_id=${traceId}`;return reply({success:true,crop_budget_id:null});}
      if(!Number.isSafeInteger(budgetId)||budgetId<=0)return reply({error:"Choose a valid crop budget"},400);
      const result=await db`insert into stock_v2.trace_crop_budget(external_tracecode_id,crop_budget_id,updated_at) values(${traceId},${budgetId},now()) on conflict(external_tracecode_id) do update set crop_budget_id=excluded.crop_budget_id,updated_at=now() returning crop_budget_id`;
      return reply({success:true,crop_budget_id:result[0].crop_budget_id});
    }
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("movement_item")){
   const code=new URL(req.url).searchParams.get("movement_item")||"";
   const ownerCode=new URL(req.url).searchParams.get("owner")||"JS";
   if(!["JS","AO"].includes(ownerCode))return reply({error:"Invalid stock owner"},400);
   if(!code)return reply({error:"Choose a product"},400);
   const movements=await db`select d.document_date as transaction_date,d.document_id as trans_id,
      case when d.document_type='grv' then coalesce(g.supplier_name,'Stock received')
           when d.document_type='issue' then coalesce(t.tracecode_name,d.reason,'Stock issued')
           else coalesce(d.reason,d.document_number) end as description,
      greatest(m.quantity_delta,0)::float8 as stock_in,
      greatest(-m.quantity_delta,0)::float8 as stock_out,
      sum(m.quantity_delta) over(order by d.document_date,m.created_at,m.movement_id rows between unbounded preceding and current row)::float8 as stock_pos,
      stock_v2.business_number(d.document_id) as document_number,
      case when d.document_type='grv' and m.quantity_delta>0 then
        coalesce(pc.confirmed_unit_cost,gp.actual_unit_cost,gx.received_unit_price)
      when m.quantity_delta<0 then ce.unit_cost else null end::float8 as unit_price,
      case when d.document_type='grv' and m.quantity_delta>0 then 'Receipt price'
           when m.quantity_delta<0 and ce.unit_cost is not null then
             case when ce.provisional then 'Provisional WA' else 'Costed WA' end
           else 'Pending' end as price_basis
    from stock_v2.movement m
    join stock_v2.document_line dl on dl.line_id=m.document_line_id
    join stock_v2.document d on d.document_id=dl.document_id
    join stock_v2.item i on i.item_id=dl.item_id
    join stock_v2.owner o on o.owner_id=m.owner_id
    join stock_v2.location l on l.location_id=m.location_id
    left join stock_v2.grv_detail g on g.document_id=d.document_id
    left join public.tracecode t on t.tracecode_id=m.external_tracecode_id
    left join stock_v2.price_confirmation pc on pc.line_id=dl.line_id
    left join stock_v2.grv_line_price gp on gp.line_id=dl.line_id
    left join lateral (
      select x.received_unit_price from stock_v2.demo_grv_line_link x
      join stock_v2.order_line ol on ol.order_line_id=x.order_line_id
      where x.document_id=d.document_id and ol.item_id=dl.item_id and x.received_unit_price is not null
      limit 1
    ) gx on true
    left join lateral (
      select c.unit_cost,c.provisional from stock_v2.cost_entry c
      join stock_v2.cost_run cr on cr.run_id=c.run_id and cr.status='complete'
      where c.movement_id=m.movement_id
      order by c.run_id desc limit 1
    ) ce on true
    where d.status='posted' and o.owner_code=${'TEST_'+ownerCode} and l.location_code='TEST_WH' and i.item_code=${code}
    order by d.document_date,m.created_at,m.movement_id`;
   const item=await db`select item_name,base_unit from stock_v2.item where item_code=${code} limit 1`;
   const balance=await db`select coalesce(sum(q.quantity),0)::float8 as current_stock from stock_v2.quantity_balance q join stock_v2.item i on i.item_id=q.item_id join stock_v2.owner o on o.owner_id=q.owner_id join stock_v2.location l on l.location_id=q.location_id where i.item_code=${code} and o.owner_code=${'TEST_'+ownerCode} and l.location_code='TEST_WH'`;
   return reply({item:item[0]??null,movements,current_stock:balance[0]?.current_stock??0});
  }
  if(req.method==="GET"){
   const items=await db`select i.item_code,i.item_name,i.base_unit,i.active,st.heyshott_quantity::float8 as opening_heyshott_quantity,st.ao_quantity::float8 as opening_ao_quantity,st.historical_unit_cost::float8 as historical_unit_cost,i.input_type,coalesce(i.input_category,i.category) input_category,i.active_ingredient,coalesce(b.quantity,0)::float8 quantity,coalesce(abo.quantity,0)::float8 ao_quantity,p.last_purchase_price::float8 last_purchase_price,s.last_purchase_supplier,wa.unit_cost::float8 weighted_average_price from stock_v2.item i cross join (select owner_id from stock_v2.owner where owner_code='TEST_JS') ow cross join (select location_id from stock_v2.location where location_code='TEST_WH') loc left join stock_v2.quantity_balance b on b.item_id=i.item_id and b.owner_id=ow.owner_id and b.location_id=loc.location_id left join stock_v2.quantity_balance abo on abo.item_id=i.item_id and abo.owner_id=(select owner_id from stock_v2.owner where owner_code='TEST_AO') and abo.location_id=loc.location_id left join lateral (
 select (array_agg(z.unit_price order by z.posted_at desc,z.document_id desc))[1] last_purchase_price,
        sum(z.qty*z.unit_price)/nullif(sum(z.qty),0) weighted_receipt_price,sum(z.qty) priced_receipt_quantity
 from (select stock_v2.workflow_physical_quantity(dl.line_id) as qty,coalesce(pc.confirmed_unit_cost,gp.actual_unit_cost,gp.provisional_unit_cost,x.received_unit_price) as unit_price,d.posted_at,d.document_id
 from stock_v2.document_line dl join stock_v2.document d using(document_id)
 left join stock_v2.price_confirmation pc using(line_id) left join stock_v2.grv_line_price gp using(line_id)
 left join lateral(select received_unit_price from stock_v2.demo_grv_line_link x join stock_v2.order_line ol using(order_line_id) where x.document_id=d.document_id and ol.item_id=dl.item_id limit 1)x on true
 where d.document_type='grv' and d.status='posted' and dl.item_id=i.item_id and exists(select 1 from stock_v2.movement m where m.document_line_id=dl.line_id and m.owner_id=ow.owner_id and m.quantity_delta>0))z
 where z.unit_price is not null
) p on true
left join lateral (
 select ce.value_after/nullif(ce.quantity_after,0) as unit_cost from stock_v2.cost_entry ce
 join stock_v2.cost_run cr on cr.run_id=ce.run_id and cr.status='complete'
 join stock_v2.movement m on m.movement_id=ce.movement_id join stock_v2.document_line dl on dl.line_id=m.document_line_id join stock_v2.document d using(document_id)
 where ce.item_id=i.item_id and ce.owner_id=ow.owner_id and m.location_id=loc.location_id and not ce.provisional and ce.quantity_after=coalesce(b.quantity,0)
 order by cr.run_id desc,d.document_date desc,d.document_id desc,m.movement_id desc limit 1
) wa on true
left join lateral (
 select z.supplier_name as last_purchase_supplier from (
  select h.supplier_name,d.posted_at,d.document_id from stock_v2.demo_grv_line_link x
  join stock_v2.order_line ol on ol.order_line_id=x.order_line_id
  join stock_v2.order_header h on h.order_id=ol.order_id
  join stock_v2.document d on d.document_id=x.document_id and d.status='posted'
  where h.owner_id=ow.owner_id and ol.item_id=i.item_id and x.received_unit_price is not null
  union all
  select h.supplier_name,d.posted_at,d.document_id from stock_v2.demo_grv_order_link x
  join stock_v2.order_line ol on ol.order_line_id=x.order_line_id
  join stock_v2.order_header h on h.order_id=ol.order_id
  join stock_v2.document d on d.document_id=x.document_id and d.status='posted'
  where h.owner_id=ow.owner_id and ol.item_id=i.item_id and x.received_unit_price is not null
  union all
  select g.supplier_name,d.posted_at,d.document_id
  from stock_v2.price_confirmation pc
  join stock_v2.document_line dl on dl.line_id=pc.line_id
  join stock_v2.document d on d.document_id=dl.document_id and d.status='posted'
  join stock_v2.grv_detail g on g.document_id=d.document_id
  join stock_v2.movement m on m.document_line_id=dl.line_id and m.quantity_delta>0
  where m.owner_id=ow.owner_id and dl.item_id=i.item_id and pc.confirmed_unit_cost>0
 ) z order by z.posted_at desc,z.document_id desc limit 1
) s on true left join stock_v2.access_stock_levels_hsq st on st.access_input_id=i.access_input_id order by i.item_name`;
   const orders=await db`select h.order_id,h.order_number,h.order_date,h.supplier_name,h.contract_id,replace(ow.owner_code,'TEST_','') as owner_code,h.status,i.item_code,i.item_name,i.base_unit,ol.order_line_id,ol.ordered_quantity::float8 as ordered_quantity,ol.received_quantity::float8 as received_quantity,ol.ordered_unit_price::float8 as ordered_unit_price from stock_v2.order_header h join stock_v2.owner ow on ow.owner_id=h.owner_id join stock_v2.order_line ol on ol.order_id=h.order_id join stock_v2.item i on i.item_id=ol.item_id where ow.owner_code like 'TEST_%' and h.status='approved' order by h.order_id desc,ol.order_line_id limit 200`;
   const sprays=await db`select j.job_id,j.external_tracecode_id,t.tracecode_name,c.crop_name,j.area_ha::float8 as area_ha,j.planned_week_start::text as planned_week_start,(select max(d.document_date)::text from stock_v2.document d join stock_v2.document_line dl on dl.document_id=d.document_id join stock_v2.spray_job_input si on si.requirement_id=dl.requirement_id where si.job_id=j.job_id and d.document_type='issue' and d.status='posted') as completed_date,j.spray_type,j.part_label,j.water_litres_per_ha::float8 as water_litres_per_ha,j.sprayer_asset_code,j.job_tracking_code,j.status,sc.completed_date::text as sprayed_date,i.base_unit,i.item_code,i.item_name,ji.rate_per_ha::float8 as rate_per_ha,(ji.rate_per_ha*j.area_ha)::float8 as planned_quantity,coalesce((select sum(case when d.document_type='issue' then dl.quantity when d.document_type='return' then -dl.quantity else 0 end) from stock_v2.document_line dl join stock_v2.document d on d.document_id=dl.document_id where dl.requirement_id=ji.requirement_id and d.document_type in ('issue','return') and d.status='posted'),0)::float8 as issued_quantity from stock_v2.spray_job j join stock_v2.spray_job_input ji on ji.job_id=j.job_id join stock_v2.item i on i.item_id=ji.item_id left join stock_v2.sprayer_completion sc on sc.job_id=j.job_id left join public.tracecode t on t.tracecode_id=j.external_tracecode_id left join public.crop c on c.crop_id=t.crop_id where j.owner_id=(select owner_id from stock_v2.owner where owner_code='TEST_JS') order by j.job_id desc,ji.job_input_id limit 200`;
   const documents=await db`select d.document_id,d.document_type,d.document_number,d.document_date,i.item_name,dl.quantity::float8 as quantity,t.tracecode_name from stock_v2.document d join stock_v2.document_line dl on dl.document_id=d.document_id join stock_v2.item i on i.item_id=dl.item_id left join stock_v2.movement m on m.document_line_id=dl.line_id left join public.tracecode t on t.tracecode_id=m.external_tracecode_id where d.document_number like 'DEMO-GRV-%' or d.document_number like 'DEMO-ISS-%' or d.document_number like 'DEMO-DIR-%' order by d.document_id desc limit 100`;
   const sprayers=await db`select setup_name,water_litres_per_ha::float8 as water_litres_per_ha from stock_v2.sprayer_setup where active=true order by setup_name`;
   const pendingInvoiceCount=await db`select count(distinct d.document_id)::integer as n
     from stock_v2.document d join stock_v2.grv_detail g using(document_id)
     join stock_v2.document_line dl on dl.document_id=d.document_id
     join stock_v2.movement m on m.document_line_id=dl.line_id and m.quantity_delta>0
     join stock_v2.owner o on o.owner_id=m.owner_id
     where d.status='posted' and d.document_type='grv' and d.document_number like 'DEMO-%' and g.price_status='pending'
     and o.owner_code in ('TEST_JS','TEST_AO')`;
   const outstandingSprayCount=await db`select count(*)::int as n from (
    select j.job_id from stock_v2.spray_job j join stock_v2.spray_job_input ji using(job_id)
    left join lateral(select coalesce(sum(case when d.document_type='issue' then dl.quantity when d.document_type='return' then -dl.quantity else 0 end),0) as issued
     from stock_v2.document_line dl join stock_v2.document d using(document_id) where dl.requirement_id=ji.requirement_id and d.status='posted' and d.document_type in ('issue','return')) x on true
    where j.owner_id=(select owner_id from stock_v2.owner where owner_code='TEST_JS') and j.status='planned'
    group by j.job_id having min(case when ji.rate_per_ha>0 then greatest((ji.rate_per_ha*j.area_ha-x.issued)/ji.rate_per_ha,0) else 0 end)>0.0001
   ) due`;
   return reply({items,orders,sprays,documents,sprayers,pending_invoice_count:pendingInvoiceCount[0]?.n??0,outstanding_spray_count:outstandingSprayCount[0]?.n??0});
  }
  let body:any;try{body=await req.json()}catch{return reply({error:"Invalid JSON"},400)}


  const transaction=async(fn:(tx:any)=>Promise<any>)=>db.begin(async tx=>{
   await tx`select pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'))`;
   if(body.operation_id){
    const previous=await tx`select * from stock_v2.approval_operation where id=${body.operation_id}::uuid`;
    if(previous.length){if(previous[0].actor!==user.id||JSON.stringify(previous[0].request)!==JSON.stringify(JSON.parse(JSON.stringify(body)))){
     const same=await tx`select request=${tx.json(body)}::jsonb as same from stock_v2.approval_operation where id=${body.operation_id}::uuid`;
     if(previous[0].actor!==user.id||!same[0].same)throw Error("Operation reference reused with different values");
    }return {...previous[0].result,replayed:true};}
   }
   const result=await fn(tx);
   if(result.document_id)result.document_number=(await tx`select stock_v2.business_number(${result.document_id}::bigint) as number`)[0].number;
   if(["stocktake_post","stock_adjustment_post","supplier_return_post"].includes(body.action)){
    const documentId=result.adjustment_document_id??result.document_id;
    if(documentId){const items=await tx`select distinct item_id from stock_v2.document_line where document_id=${documentId}`;
     for(const item of items)await tx`select stock_v2.recalculate_demo_item_costs(${item.item_id}::bigint,${"Stock transaction: "+body.action}::text)`;
    }
   }
   if(body.operation_id)await tx`insert into stock_v2.approval_operation(id,actor,request,result) values(${body.operation_id}::uuid,${user.id}::uuid,${tx.json(body)}::jsonb,${tx.json(result)}::jsonb)`;
   return result;
  });
  if(['stocktake_adjustment_save','individual_adjustment_save'].includes(body?.action)){const result=await db`select stock_v2.stock_adjustment_command(${user.id}::uuid,${body.operation_id}::uuid,${body.action}::text,${db.json(body)}::jsonb) as result`;return reply({success:true,result:result[0].result});}
  if(body?.action==='stock_adjustment_post')return reply({error:'Use Stock Adjustment to save a numbered individual adjustment'},409);
  if(['combined_stocktake_create','combined_stocktake_save','combined_stocktake_post'].includes(body?.action)){
   const result=await db`select stock_v2.combined_stocktake_command(${user.id}::uuid,${body.operation_id}::uuid,${body.action}::text,${db.json(body)}::jsonb) as result`;return reply({success:true,result:result[0].result});
  }
  if(body?.action==='reset_issue_slip_print'){
   if(!access.is_admin)return reply({error:'Admin access required'},403);
   if(!body.operation_id||String(body.reason??'').trim().length<8)return reply({error:'Enter a reprint reason (at least 8 characters)'},400);
   const result=await transaction(async tx=>{
    const previous=await tx`select * from stock_v2.issue_slip_print_lock where document_id=${Number(body.document_id)} for update`;
    if(previous.length){
     await tx`insert into stock_v2.correction_audit(document_id,correction_type,old_values,new_values,reason,changed_by) values(${Number(body.document_id)},'issue_slip_reprint',${tx.json(previous[0])}::jsonb,'{}'::jsonb,${String(body.reason).trim()},${user.id}::uuid)`;
     await tx`delete from stock_v2.issue_slip_print_lock where document_id=${Number(body.document_id)}`;
    }return {already_printed:false};
   });return reply({success:true,result});
  }
  if(['spray','spray_edit','spray_return','planned_issue','direct_issue'].includes(body?.action)&&!body.operation_id)return reply({error:'Reload Stock to use verified, recoverable saves'},409);
  if(['spray','spray_edit','spray_return','planned_issue','direct_issue'].includes(body?.action)&&body.operation_id){
   if(!body.payload||!Array.isArray(body.payload.lines)||!body.payload.lines.length||body.payload.lines.length>30)return reply({error:'Provide 1–30 product lines'},400);
   const result=await transaction(async tx=>{
    if(body.action==='spray_return')return (await tx`select stock_v2.demo_return_spray(${tx.json(body.payload)}::jsonb) as result`)[0].result;
    if(body.action==='spray_edit')return (await tx`select stock_v2.demo_edit_spray(${Number(body.payload.job_id)}::bigint,${tx.json(body.payload)}::jsonb) as result`)[0].result;
    return (await tx`select stock_v2.demo_multi(${body.action}::text,${body.operation_id}::uuid,${tx.json(body.payload)}::jsonb) as result`)[0].result;
   });return reply({success:true,result});
  }
  if(body?.action==="workflow_command"){
   const rows=await db`select stock_v2.workflow_command(${user.id}::uuid,${body.operation_id}::uuid,${body.command}::text,${db.json(body.data)}::jsonb) as result`;
   return reply({success:true,result:rows[0].result});
  }
  if(body?.action==="workflow_correct_grv"||body?.action==="workflow_correct_physical"){
   const rows=body.action==="workflow_correct_grv"?await db`select stock_v2.workflow_correct_grv(${user.id}::uuid,${body.operation_id}::uuid,${db.json(body.payload)}::jsonb) as result`:await db`select stock_v2.workflow_correct_physical(${user.id}::uuid,${body.operation_id}::uuid,${db.json(body.payload)}::jsonb) as result`;
   return reply({success:true,result:rows[0].result});
  }
  if(body?.action==="stock_staff_assign"){
   await db`select stock_v2.workflow_assign_staff(${user.id}::uuid,${body.user_id}::uuid,${body.role_name}::text,${body.active}::boolean,${body.reason}::text)`;
   return reply({success:true});
  }
  // Old clients cannot bypass the new approval lifecycle.
  if(body?.action==="ownership_transfer" && body.operation_id){
   const result=await transaction(async tx=>{const rows=await tx`select stock_v2.demo_multi('ownership_transfer',${body.operation_id}::uuid,${tx.json(body.payload??{})}::jsonb) as result`;return rows[0].result;});
   return reply({success:true,result});
  }
  if(body?.action==="order")return reply({error:"Use Purchase Orders to submit for Admin approval and finalise the approved order."},409);
  if(body?.action==="unplanned_dnote"){
   const p=body.payload??{},id=String(body.operation_id??body.request_id??"");
   if(!/^[-a-f0-9]{36}$/i.test(id)||!Array.isArray(p.lines)||!p.lines.length)return reply({error:"Valid D-Note and products required"},400);
   const result=await transaction(async tx=>{const rows=await tx`select stock_v2.demo_post_unplanned_dnote(${id}::uuid,${tx.json(p)}::jsonb) as result`;return rows[0].result;});
   return reply({success:true,result});
  }
  if(body?.action==="multi_po_dnote"){
   const p=body.payload??{},id=String(body.operation_id??body.request_id??"");
   if(!/^[-a-f0-9]{36}$/i.test(id)||!Array.isArray(p.lines)||!p.lines.length)return reply({error:"Valid request and purchase order lines required"},400);
   const result=await transaction(async tx=>{const rows=await tx`select stock_v2.demo_post_multi_po_dnote(${id}::uuid,${tx.json(p)}::jsonb) as result`;return rows[0].result;});
   return reply({success:true,result});
  }
  if(body?.action==="combined_grv"){
   const p=body.payload??{};
   const id=String(body.operation_id??body.request_id??"");
   if(!/^[-a-f0-9]{36}$/i.test(id)||!["JS","AO"].includes(p.owner_code)||typeof p.supplier!=="string"||!p.supplier.trim()||typeof p.invoice_number!=="string"||!p.invoice_number.trim()||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(p.invoice_date??"")))
    return reply({error:"Owner, supplier, GRV date and reference required"},400);
   const validItems=new Set((await db`select item_code from stock_v2.item where active=true`).map((row:any)=>row.item_code));
   if(!Array.isArray(p.invoice_lines)||!p.invoice_lines.length||!Array.isArray(p.allocations)||!Array.isArray(p.new_receipts)||
     p.invoice_lines.some((x:any)=>!validItems.has(x.item_code)||!(Number(x.unit_price)>0)||!(Number(x.invoice_quantity)>0))||
     p.allocations.some((x:any)=>!Number.isSafeInteger(Number(x.line_id))||!(Number(x.quantity)>0))||
     p.new_receipts.some((x:any)=>!validItems.has(x.item_code)||!(Number(x.quantity)>0)))
    return reply({error:"Every selected GRV line needs a positive quantity and unit price"},400);
   const result=await transaction(async tx=>{const rows=await tx`select stock_v2.demo_post_combined_grv(${id}::uuid,${tx.json({...p,actor_id:user.id})}::jsonb) as result`;return rows[0].result;});
   return reply({success:true,result});
  }
  if(body?.action==="match_invoice"){
   const id=Number(body.payload?.document_id),invoice=String(body.payload?.invoice_number||"").trim(),dt=String(body.payload?.invoice_date||"");
   if(!Number.isSafeInteger(id)||id<=0||!invoice||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dt)||!Array.isArray(body.payload?.lines))return reply({error:"Invoice number, date and all prices required"},400);
   const result=await db`select stock_v2.demo_match_invoice(${id}::bigint,${invoice}::text,${dt}::date,${db.json(body.payload.lines)}::jsonb) as result`;
   return reply({success:true,result:result[0].result});
  }
  if(body?.action==="save_supplier"){
   const name=String(body.payload?.supplier_name||"").trim();
   if(!name||name.length>150)return reply({error:"Supplier name required (max 150 characters)"},400);
   const id=Number(body.payload?.supplier_id||0),active=body.payload?.active!==false;
   const result=id>0?await db`update stock_v2.supplier set supplier_name=${name},active=${active} where supplier_id=${id} returning supplier_id`:
     await db`insert into stock_v2.supplier(supplier_name,active) values(${name},${active}) returning supplier_id`;
   if(!result.length)return reply({error:"Supplier not found"},404);
   return reply({success:true,result:result[0]});
  }
  if(["save_contract","save_owner","save_trace_contract"].includes(body?.action)){
   if(!access.is_admin)return reply({error:"Admin access required to change stock owners and contract rules"},403);
   const result=await db`select stock_v2.demo_manage(${body.action}::text,${db.json(body.payload??{})}::jsonb) as result`;
   return reply({success:true,result:result[0].result});
  }
  if(body?.action==="delete_unissued_spray"){
   const admin=access.is_admin?[1]:[];
   if(!admin.length)return reply({error:"Admin access required"},403);
   const jobId=Number(body.job_id);if(!Number.isSafeInteger(jobId)||jobId<=0)return reply({error:"Invalid spray"},400);
   const result=await transaction(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'))`;
    const jobs=await tx`select job_id from stock_v2.spray_job where job_id=${jobId} and status='planned' and owner_id=(select owner_id from stock_v2.owner where owner_code='TEST_JS') for update`;
    if(!jobs.length)throw Error("Only incomplete sprays may be deleted");
    const moved=await tx`select 1 from stock_v2.document_line dl join stock_v2.document d on d.document_id=dl.document_id join stock_v2.spray_job_input ji on ji.requirement_id=dl.requirement_id where ji.job_id=${jobId} and d.status='posted' and d.document_type in ('issue','return') limit 1`;
    if(moved.length)throw Error("Spray has stock movements. Reverse/correct its issues before deletion.");
    await tx`delete from stock_v2.spray_job_input where job_id=${jobId}`;
    await tx`delete from stock_v2.spray_job where job_id=${jobId}`;
    return {job_id:jobId,deleted:true};
   });return reply({success:true,result});
  }
  if(body?.action==="claim_issue_slip_print"){
   const id=Number(body.document_id);if(!Number.isSafeInteger(id)||id<=0)return reply({error:"Invalid issue slip"},400);
   const row=await db`insert into stock_v2.issue_slip_print_lock(document_id,printed_by) select d.document_id,${user.id}::uuid from stock_v2.document d where d.document_id=${id} and d.document_type='issue' and d.status='posted' on conflict do nothing returning document_id`;
   return row.length?reply({success:true}):reply({error:"Issue slip has already been printed or is not eligible"},409);
  }
  if(["stocktake_create","stocktake_save","stocktake_submit","stocktake_post","stock_adjustment_post"].includes(body?.action)){
    const admin=access.is_admin?[1]:[];
    if(!admin.length&&["stocktake_post","stock_adjustment_post"].includes(body.action))return reply({error:"Admin access required to post adjustments"},403);
    const result=await transaction(async tx=>{
      await tx`select pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'))`;
      const owner=String(body.owner_code||"JS"),loc=String(body.location_code||"TEST_WH");
      const ownerRow=await tx`select owner_id from stock_v2.owner where owner_code=${"TEST_"+owner}`;
      const locationRow=await tx`select location_id from stock_v2.location where location_code=${loc}`;
      if(!ownerRow.length||!locationRow.length)throw Error("Invalid owner or location");
      const oid=ownerRow[0].owner_id,lid=locationRow[0].location_id;
      if(body.action==="stocktake_create"){
        if(!(await tx`select stock_v2.can_print_stocktake(${user.id}::uuid) as allowed`)[0].allowed)throw Error("Only Admin and Clerk can print stocktake sheets");
        const ids=body.item_codes;
        if(!Array.isArray(ids)||ids.length<1||ids.length>500||new Set(ids).size!==ids.length)throw Error("Select stock items to print");
        const selected=await tx`select i.item_id,i.item_code,coalesce(q.quantity,0)::float8 as qty from stock_v2.item i left join stock_v2.quantity_balance q on q.item_id=i.item_id and q.owner_id=${oid} and q.location_id=${lid} where i.item_code in ${tx(ids)} and i.active=true`;
        if(selected.length!==ids.length)throw Error("Unrecognised stock item selection");
        const seq=await tx`select nextval('stock_v2.stocktake_number_seq') as n`;
        const t=await tx`insert into stock_v2.stocktake(take_number,owner_id,location_id,created_by,notes,printed_at,printed_by) values(${"ST-"+seq[0].n},${oid},${lid},${user.id}::uuid,${String(body.notes||"")},now(),${user.id}::uuid) returning take_id,take_number,printed_at`;
        for(const x of selected)await tx`insert into stock_v2.stocktake_line(take_id,item_id,system_quantity) values(${t[0].take_id},${x.item_id},${x.qty})`;
        return t[0];
      }
      if(body.action==="stocktake_save"){
        const id=Number(body.take_id);if(!Number.isSafeInteger(id))throw Error("Invalid count");
        const t=await tx`select take_id from stock_v2.stocktake where take_id=${id} and status='draft' and owner_id=${oid} and location_id=${lid} for update`;
        if(!t.length)throw Error("Stocktake is not editable");
        if(!Array.isArray(body.lines))throw Error("Lines required");
        for(const l of body.lines){const qty=l.counted_quantity===null?null:Number(l.counted_quantity);if(qty!==null&&(!Number.isFinite(qty)||qty<0))throw Error("Invalid count quantity");const updated=await tx`update stock_v2.stocktake_line x set counted_quantity=${qty} where x.take_id=${id} and x.item_id=(select item_id from stock_v2.item where item_code=${String(l.item_code)}) returning item_id`;if(!updated.length)throw Error("Item not in this stocktake");}
        return {take_id:id};
      }
      if(body.action==="stocktake_submit"){
        const id=Number(body.take_id);const rows=await tx`select take_id from stock_v2.stocktake where take_id=${id} and status='draft' and owner_id=${oid} and location_id=${lid} for update`;
        if(!rows.length)throw Error("Stocktake not open");
        const counts=await tx`select count(*)::int total,count(counted_quantity)::int counted from stock_v2.stocktake_line where take_id=${id}`;
        if(!counts[0].total||counts[0].total!==counts[0].counted)throw Error("Every selected item needs a count; enter 0 where applicable");
        await tx`update stock_v2.stocktake set status='counted',counted_at=now(),counted_by=${user.id}::uuid where take_id=${id}`;
        return {take_id:id,status:"counted"};
      }
      if(body.action==="stocktake_post"){
        const id=Number(body.take_id);if(!Number.isSafeInteger(id))throw Error("Invalid count");
        const t=await tx`select take_id,take_number from stock_v2.stocktake where take_id=${id} and status='counted' and owner_id=${oid} and location_id=${lid} for update`;
        if(!t.length)throw Error("Stocktake already posted or missing");
        const lines=await tx`select x.item_id,i.item_code,x.system_quantity::float8 as system_quantity,x.counted_quantity::float8 as counted_quantity,coalesce(q.quantity,0)::float8 as current_quantity from stock_v2.stocktake_line x join stock_v2.item i on i.item_id=x.item_id left join stock_v2.quantity_balance q on q.item_id=x.item_id and q.owner_id=${oid} and q.location_id=${lid} where x.take_id=${id}`;
        if(!lines.length||lines.some((x:any)=>x.counted_quantity===null))throw Error("Every stocktake product must be counted");
        if(lines.some((x:any)=>Math.abs(Number(x.current_quantity)-Number(x.system_quantity))>0.000001))throw Error("Stock has moved since stock sheet printed; reconcile transactions before posting");
        const changed=lines.filter((x:any)=>Math.abs(x.counted_quantity-x.system_quantity)>0.000001);
        let document_id=null;
        if(changed.length){
         const seq=await tx`select nextval('stock_v2.adjustment_number_seq') as n`;
         const d=await tx`insert into stock_v2.document(document_type,document_number,document_date,status,reason) values('adjustment',${"ADJ-"+seq[0].n},current_date,'draft',${"Stocktake "+t[0].take_number}) returning document_id`;
         document_id=d[0].document_id;
         for(const l of changed){const proposed=Array.isArray(body.adjustments)?body.adjustments.find((v:any)=>v.item_code===l.item_code):null;if(!proposed)throw Error("Provide adjustment quantity for "+l.item_code);const delta=Number(proposed.delta);if(!Number.isFinite(delta)||Math.abs(delta-(l.counted_quantity-l.system_quantity))>0.000001)throw Error("Adjustment must match stocktake variance");const dl=await tx`insert into stock_v2.document_line(document_id,item_id,quantity,note) values(${document_id},${l.item_id},${Math.abs(delta)},${"Stocktake "+id}) returning line_id`;await tx`insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(${dl[0].line_id},${oid},${lid},${delta})`;}
         await tx`insert into stock_v2.stock_adjustment_meta(document_id,reason_code,created_by,stocktake_id) values(${document_id},'STOCKTAKE',${user.id}::uuid,${id})`;
         await tx`select stock_v2.post_draft(${document_id})`;
        }
        await tx`update stock_v2.stocktake set status='posted',posted_at=now(),adjusted_at=now(),adjustment_document_id=${document_id} where take_id=${id}`;
        return {take_id:id,adjustment_document_id:document_id,adjustment_number:document_id?(await tx`select document_number from stock_v2.document where document_id=${document_id}`)[0]?.document_number:null,variances:changed.length};
      }
      if(body.action==="stock_adjustment_post"){
        const reason=String(body.reason||"").trim(),reasonCode=String(body.reason_code||"ADJUSTMENT").trim(),date=String(body.adjustment_date||"");
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date+"T12:00:00Z").toISOString().slice(0,10)!==date)throw Error("Valid adjustment date required");
        if(reason.length<5||!reasonCode||!Array.isArray(body.lines)||!body.lines.length||body.lines.length>30)throw Error("Reason and 1–30 adjustment lines required");
        const seq=await tx`select nextval('stock_v2.adjustment_number_seq') as n`;
        const d=await tx`insert into stock_v2.document(document_type,document_number,document_date,status,reason) values('adjustment',${"ADJ-"+seq[0].n},${date}::date,'draft',${reason}) returning document_id`;
        for(const line of body.lines){const delta=Number(line.delta);if(!Number.isFinite(delta)||Math.abs(delta)<0.000001)throw Error("Nonzero adjustment required");const item=await tx`select item_id from stock_v2.item where item_code=${String(line.item_code)}`;if(!item.length)throw Error("Product not found");
        const b=await tx`select coalesce(sum(quantity),0)::float8 as q from stock_v2.quantity_balance where item_id=${item[0].item_id} and owner_id=${oid} and location_id=${lid}`;
        if(delta<0&&Number(b[0].q)+delta< -0.000001)throw Error("Insufficient stock");
        const dl=await tx`insert into stock_v2.document_line(document_id,item_id,quantity,note) values(${d[0].document_id},${item[0].item_id},${Math.abs(delta)},${reason}) returning line_id`;
        await tx`insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(${dl[0].line_id},${oid},${lid},${delta})`;}
        await tx`insert into stock_v2.stock_adjustment_meta(document_id,reason_code,created_by) values(${d[0].document_id},${reasonCode},${user.id}::uuid)`;
        await tx`select stock_v2.post_draft(${d[0].document_id})`;
        return {document_id:d[0].document_id,document_number:"ADJ-"+seq[0].n};
      }
    });return reply({success:true,result});
  }
  if(body?.action==="cancel_po_balance")return reply({error:"Use Purchase Orders. POs cannot be changed after stock is received."},409);
  if(body?.action==="supplier_return_post"){
   const owner=String(body.owner_code||"JS"),supplier=String(body.supplier_name||"").trim(),reference=String(body.return_reference||"").trim(),mode=String(body.return_mode||"specific_grv"),reason=String(body.reason||"").trim(),lines=body.lines;
   if(!["JS","AO"].includes(owner))return reply({error:"Select stock owner JS or AO"},400);if(!["specific_grv","supplier_stock"].includes(mode))return reply({error:"Select a valid return type"},400);if(!supplier)return reply({error:"Select a supplier"},400);if(reason.length<5)return reply({error:"Enter a return reason (at least 5 characters)"},400);if(!Array.isArray(lines)||!lines.length)return reply({error:"Enter a return quantity for at least one product"},400);if(lines.length>30)return reply({error:"Maximum 30 products per supplier return"},400);
   const result=await transaction(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'))`;
    const ow=await tx`select owner_id from stock_v2.owner where owner_code=${"TEST_"+owner}`,loc=await tx`select location_id from stock_v2.location where location_code='TEST_WH'`;
    if(!ow.length||!loc.length)throw Error("Stock owner or warehouse not found");
    const seq=await tx`select nextval('stock_v2.supplier_return_no_seq') as number`;
    const doc=await tx`insert into stock_v2.document(document_type,document_number,document_date,status,reason,supplier_reference) values('return',${"SUP-RET-"+seq[0].number},current_date,'draft',${reason},${reference}) returning document_id`;
    await tx`insert into stock_v2.supplier_return(document_id,owner_code,supplier_name,return_reference,return_mode,created_by) values(${doc[0].document_id},${owner},${supplier},${reference},${mode},${user.id}::uuid)`;
    const seen=new Set();
    for(const l of lines){const code=String(l.item_code||""),qty=Number(l.quantity),price=Number(l.agreed_price);
     if(!code||seen.has(code)||!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<0)throw Error("Invalid, duplicate or negative product/price");seen.add(code);
     const item=await tx`select item_id from stock_v2.item where item_code=${code} and active=true`;
     if(!item.length)throw Error("Unknown product "+code);
     const balance=await tx`select coalesce(sum(quantity),0)::float8 as qty from stock_v2.quantity_balance where item_id=${item[0].item_id} and owner_id=${ow[0].owner_id} and location_id=${loc[0].location_id}`;
     if(qty>Number(balance[0].qty))throw Error("Insufficient physical stock for "+code+". Available: "+balance[0].qty+", requested: "+qty);
     const sources=Array.isArray(l.sources)?l.sources:[];
     if(mode==="specific_grv"&&!sources.length)throw Error("Select original GRV lines for "+code);
     if(mode==="supplier_stock"&&sources.length)throw Error("Supplier stock mode must not allocate specific GRVs");
     const sourceQty=sources.reduce((n:any,x:any)=>n+Number(x.quantity||0),0);
     const sourcePrices:any[]=[];
     if(mode==="specific_grv"&&Math.abs(sourceQty-qty)>0.000001)throw Error("Linked GRV quantities must equal return quantity for "+code);
     for(const src of sources){const sid=Number(src.receipt_line_id),sq=Number(src.quantity);
       if(!Number.isSafeInteger(sid)||sid<1||!Number.isFinite(sq)||sq<=0)throw Error("Invalid source GRV allocation");
       const matching=await tx`select stock_v2.workflow_physical_quantity(dl.line_id)::float8 as quantity from stock_v2.document_line dl join stock_v2.document d on d.document_id=dl.document_id join stock_v2.grv_detail g on g.document_id=d.document_id where dl.line_id=${sid} and dl.item_id=${item[0].item_id} and d.document_type='grv' and d.status='posted' and lower(trim(g.supplier_name))=lower(${supplier}) and exists(select 1 from stock_v2.movement m where m.document_line_id=dl.line_id and m.owner_id=${ow[0].owner_id})`;
       if(!matching.length)throw Error("Source GRV does not match product and supplier");
       const used=await tx`select coalesce(sum(quantity),0)::float8 as qty from stock_v2.supplier_return_source where receipt_line_id=${sid}`;
       if(sq>Number(matching[0].quantity)-Number(used[0].qty)+0.000001)throw Error("Original GRV return allocation exceeded");
       const originalPrice=await tx`select coalesce(p.actual_unit_cost,(select sum(a.quantity*al.invoice_unit_price)/nullif(sum(a.quantity),0) from stock_v2.accounting_grv_allocation a join stock_v2.accounting_grv_line al on al.id=a.grv_line_id where a.receipt_line_id=${sid}),p.provisional_unit_cost) as price from stock_v2.document_line dl left join stock_v2.grv_line_price p on p.line_id=dl.line_id where dl.line_id=${sid}`;
       sourcePrices.push({sid,sq,price:originalPrice.length&&originalPrice[0].price!==null?Number(originalPrice[0].price):null});
     }
     const cost=await tx`select e.unit_cost::float8 as unit_cost from stock_v2.cost_entry e join stock_v2.cost_run cr on cr.run_id=e.run_id where e.item_id=${item[0].item_id} and e.owner_id=${ow[0].owner_id} and cr.status='complete' order by cr.run_id desc,e.movement_id desc limit 1`;
     if(!cost.length||!Number.isFinite(Number(cost[0].unit_cost)))throw Error("Inventory valuation unavailable for "+code+"; return not posted");
     const dl=await tx`insert into stock_v2.document_line(document_id,item_id,quantity,note) values(${doc[0].document_id},${item[0].item_id},${qty},'Supplier return') returning line_id`;
     await tx`insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(${dl[0].line_id},${ow[0].owner_id},${loc[0].location_id},${-qty})`;
     await tx`insert into stock_v2.supplier_return_credit_line(line_id,agreed_price,inventory_unit_cost,inventory_value,valuation_difference) values(${dl[0].line_id},${price},${Number(cost[0].unit_cost)},${(qty*Number(cost[0].unit_cost)).toFixed(4)},${(qty*(price-Number(cost[0].unit_cost))).toFixed(4)})`;
     for(const src of sourcePrices)await tx`insert into stock_v2.supplier_return_source(return_line_id,receipt_line_id,quantity,original_unit_price) values(${dl[0].line_id},${src.sid},${src.sq},${src.price})`;
     if(sourcePrices.length>0&&sourcePrices.every(x=>x.price!==null))await tx`update stock_v2.supplier_return_credit_line set original_grv_value=${sourcePrices.reduce((n:any,x:any)=>n+x.sq*x.price,0).toFixed(4)} where line_id=${dl[0].line_id}`;
    }
    await tx`select stock_v2.post_draft(${doc[0].document_id})`;
    return {document_id:doc[0].document_id,document_number:"SUP-RET-"+seq[0].number};
   });return reply({success:true,result});
  }
  if(body?.action==="supplier_return_credit")return reply({error:"Use Supplier Credit Notes to record actual credit values, allocations and any difference. Legacy whole-return confirmation is disabled."},409);
  if(body?.action==="correct_dnote_uninvoiced")return reply({error:"Reload D-Note Corrections to enter the corrected physical quantity."},409);
  if(body?.action==="correct_dnote_details"){

   const id=Number(body.document_id),reason=String(body.reason??"").trim(),delivery=String(body.delivery_note??"").trim(),date=String(body.delivery_note_date??"");
   if(!Number.isSafeInteger(id)||id<=0||reason.length<5||!delivery||!/^\d{4}-\d{2}-\d{2}$/.test(date))return reply({error:"Enter D-Note number, supplier, date and a reason (at least five characters)"},400);
   const result=await transaction(async tx=>{
    const previous=await tx`select g.delivery_note,g.supplier_name,g.invoice_number,g.delivery_note_date::text as delivery_note_date from stock_v2.grv_detail g join stock_v2.document d on d.document_id=g.document_id where g.document_id=${id} and d.status='posted' and d.document_type='grv' for update`;
    if(!previous.length)throw Error("Posted D-Note not found");
    const linked=await tx`select 1 from stock_v2.accounting_grv_allocation a join stock_v2.document_line l on l.line_id=a.receipt_line_id where l.document_id=${id} limit 1`;
    if(linked.length||previous[0].invoice_number)throw Error("D-Note is linked to a supplier invoice/GRV and is locked. Use a linked credit or correction document instead.");
    await tx`update stock_v2.grv_detail set delivery_note=${delivery},delivery_note_date=${date}::date where document_id=${id}`;
    const updated={delivery_note:delivery,supplier_name:previous[0].supplier_name,delivery_note_date:date};
    await tx`insert into stock_v2.correction_audit(document_id,correction_type,old_values,new_values,reason,changed_by) values(${id},'dnote_details',${tx.json(previous[0])}::jsonb,${tx.json(updated)}::jsonb,${reason},${user.id}::uuid)`;
    return {document_id:id,updated};
   });return reply({success:true,result});
  }
  if(body?.action==="spray_return"){if(!body.payload||!Array.isArray(body.payload.lines))return reply({error:"Return lines required"},400);const rows=await db`select stock_v2.demo_return_spray(${db.json(body.payload)}::jsonb) as result`;return reply({success:true,result:rows[0].result});}
  if(!body||!["order","grv","direct_grv","ownership_transfer","spray","spray_edit","planned_issue","direct_issue"].includes(body.action)||typeof body.request_id!=="string"||!/^[-a-f0-9]{36}$/i.test(body.request_id)||!body.payload||!Array.isArray(body.payload.lines))return reply({error:"Invalid multi-line demo transaction"},400);
  if(body.payload.lines.length<1||body.payload.lines.length>30||body.payload.lines.some((line:any)=>!line||typeof line.item_code!=="string"||!line.item_code.trim()))return reply({error:"Select 1-30 valid product lines"},400);
  if(body.action==="spray_edit"){
   const jobId=Number(body.payload.job_id);
   if(!Number.isSafeInteger(jobId)||jobId<=0)return reply({error:"Valid spray job required"},400);
   const edited=await db`select stock_v2.demo_edit_spray(${jobId}::bigint,${db.json(body.payload)}::jsonb) as result`;
   return reply({success:true,result:edited[0].result});
  }
  const result=await db`select stock_v2.demo_multi(${body.action}::text,${body.request_id}::uuid,${db.json(body.payload)}::jsonb) as result`;
  return reply({success:true,result:result[0].result});
 }catch(e){return reply({error:e instanceof Error?e.message:"Posting failed"},400)}
 finally{await db.end({timeout:2})}
});
