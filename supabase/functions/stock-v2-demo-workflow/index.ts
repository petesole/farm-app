import {allocateSpray} from "../_shared/spray-allocation.ts";
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
  const [permissions]=await db`select stock_v2.workflow_access(${user.id}::uuid) as value,
   stock_v2.can_buy(${user.id}::uuid) as is_buyer,
   exists(select 1 from public.app_user_role where user_id=${user.id}::uuid and lower(role_name)='workshop') as is_workshop,
   (exists(select from public.app_user_role where user_id=${user.id}::uuid and lower(role_name)='driver') or exists(select from stock_v2.buying_staff_role where user_id=${user.id}::uuid and role_name='driver')) as is_driver`;
  const access={...permissions.value,is_buyer:permissions.is_buyer,is_workshop:permissions.is_workshop,is_driver:permissions.is_driver};
  const purchasingOnly=access.is_buyer&&!access.is_stock;
  if(req.method==="GET" && new URL(req.url).searchParams.has("stock_access"))return reply({access});
  if(req.method==="POST"&&new URL(req.url).searchParams.has("workflow_help")){
   const input=await req.json().catch(()=>null);
   const module=input?.module;
   const question=typeof input?.question==="string"?input.question.trim():"";
   if(!["buying","cashbook"].includes(module)||!question||question.length>500)
    return reply({error:"Enter a workflow question of up to 500 characters."},400);
   if(module==="buying"?!(access.is_buyer||access.can_main):!access.can_main)return reply({error:"Module access required"},403);
   const key=Deno.env.get("JSPL_WORKFLOW_OPENAI_API_KEY"),model=Deno.env.get("JSPL_WORKFLOW_OPENAI_MODEL");
   if(!key||!model)return reply({error:"Ask a question will be available when AI help is configured. The workflow guide is available now."},503);
   const workflow=module==="buying"
    ?"Admin and Buyer can open Job Cards and submit purchase orders or receipts. Admin authorises POs and enters payment terms. JS requires a supplier. AO may defer supplier selection until receiving. Partial deliveries remain linked to the PO. An admin verifies a receipt before stock posts. A returned receipt can be reopened and corrected by the submitter. Town Trips let admin assign orders and drivers report collection. Buying opens collected orders in Receiving. Buying and Stock can reserve and issue Job Card parts. Lubricants including oils and grease must be issued against an open Job Card. Petrol uses Direct Issue."
    :"Cash Book is admin-only. Quick Cash saves only a date and description for later reconciliation. In Transaction History select the note to match it to a confirmed payment or receipt. Saving or matching a note does not change balances. History starts with the latest transaction, with From and To dates and current balances by currency. Draft payments and receipts affect balances only when confirmed. Trip advances debit the selected account. Reconciliation requires documented spend plus cash returned to equal the advance. Only cash returned credits the account. Labour drafts link to selected source rows and the admin must choose the account in the recorded cost currency. Eligible verified supplier invoices support partial drafts and payments. Trip invoices and credit-linked invoices require separate reconciliation.";
   try{
    const response=await fetch("https://api.openai.com/v1/responses",{
     method:"POST",headers:{authorization:"Bearer "+key,"content-type":"application/json"},
     signal:AbortSignal.timeout(12000),
     body:JSON.stringify({model,store:false,max_output_tokens:350,
      instructions:"Explain how to use the JSPL "+module+" screens. Give brief steps based only on these workflow facts: "+workflow+
       " You cannot view records, check balances or perform actions. If the facts do not answer a question, say so. Do not give accounting or payment advice.",
      input:question}),
    });
    if(!response.ok)return reply({error:"AI help is temporarily unavailable. Use the workflow guide."},502);
    const result=await response.json();
    const answer=(result.output??[]).flatMap((item:any)=>item.type==="message"?item.content??[]:[])
     .filter((item:any)=>item.type==="output_text"&&typeof item.text==="string").map((item:any)=>item.text).join("\n").trim();
    if(!answer)return reply({error:"AI help did not return an answer. Try a shorter question or use the workflow guide."},502);
    return reply({answer});
   }catch{return reply({error:"AI help is temporarily unavailable. Use the workflow guide."},502);}
  }
  if(req.method==="GET"&&new URL(req.url).searchParams.has("cash_book_supplier_invoices")){
   if(!access.can_main)return reply({error:"Cash Book access required"},403);
   const [invoices,creditOptions]=await Promise.all([
    db`select id::text,invoice_number,invoice_date::text,supplier_name,
     invoice_amount::text,paid::text,drafted::text,credited::text,available::text,payment_currency
     from cash_book.supplier_invoice_balance order by invoice_date desc,id desc`,
    db`select g.id::text as grv_id,g.invoice_number,g.supplier_name,g.owner_code,g.available::text,
     c.credit_id::text,c.credit_note_number,c.remaining::text,coalesce(g.payment_currency,c.currency) as currency
     from cash_book.verified_invoice_balance g join cash_book.supplier_credit_balance c
      on c.owner_code=g.owner_code and lower(btrim(c.supplier_name))=lower(btrim(g.supplier_name))
      and (g.linked_credit_id is null or g.linked_credit_id=c.credit_id
       or exists(select 1 from cash_book.supplier_credit_application a where a.grv_id=g.id and a.credit_id=g.linked_credit_id))
      and (g.payment_currency is null or c.currency is null or g.payment_currency=c.currency)
     where g.available>0 and c.remaining>0 order by g.invoice_date desc,g.id desc,c.credit_note_date,c.credit_id`,
   ]);
   return reply({invoices,creditOptions});
  }
  if(req.method==="GET"&&new URL(req.url).searchParams.has("outstanding_issues")){
   if(!access.can_main)return reply({error:"Outstanding Issues requires Admin access"},403);
   const [counts]=await db`select
    (select count(*)::int from stock_v2.approval_document where kind='po' and status='pending') as po_approvals,
    (select count(*)::int from stock_v2.receipt_verification where status='pending') as receipt_verifications,
    (select count(*)::int from stock_v2.receipt_verification r where r.status='returned'
     and not exists(select 1 from stock_v2.receipt_verification next where next.replaces_id=r.id)) as returned_receipts,
    (select count(distinct h.order_id)::int from stock_v2.order_header h join stock_v2.order_line l using(order_id)
     where h.status='approved' and l.ordered_quantity>l.received_quantity) as outstanding_orders,
    (select count(*)::int from stock_v2.grv_detail g join stock_v2.document d using(document_id)
     where d.status='posted' and g.price_status='pending' and d.document_type='grv'
       and d.document_number like 'DEMO-%') as invoices_pending,
    (select count(*)::int from stock_v2.town_trip_order where outcome='pending') + (select count(*) from (select distinct trip_id,supplier_name from stock_v2.trip_plan_detail where finalised_at is null and visited_at is null) visits) as pending_collections,
    (select count(*)::int from stock_v2.town_trip_order t join stock_v2.order_header h using(order_id)
     where t.outcome='collected' and h.status='approved' and exists(
       select 1 from stock_v2.order_line l where l.order_id=h.order_id and l.ordered_quantity>l.received_quantity))
     + (select count(distinct (trip_id,order_id)) from stock_v2.trip_plan_detail where finalised_at is null and visited_at is not null and to_receive>0) as collected_outstanding,
    (select count(*)::int from stock_v2.job_card_part p
     left join stock_v2.job_part_usage u on u.part_id=p.id
     left join stock_v2.job_part_cancellation c on c.part_id=p.id
     where p.requested_quantity>coalesce(u.issued_quantity,0)+coalesce(c.quantity,0) and exists(select from stock_v2.item i where i.item_id=p.item_id and not i.buying_direct_expense) and exists(select from stock_v2.job_card j where j.id=p.job_id and j.closed_at is null)) as outstanding_parts,
    (select count(*)::int from cash_book.entry where status='draft') as cash_drafts,
    (select count(*)::int from cash_book.trip_advance a where not exists(
      select 1 from cash_book.trip_settlement s where s.advance_id=a.id)) as unreconciled_advances`;
   const returned=await db`select r.id,r.request_number,r.decision_reason,u.email as assigned_to,
    (select t.id from stock_v2.town_trip t where t.id=r.town_trip_id and t.line_plan) as planned_trip,
    (exists(select from stock_v2.town_trip t where t.id=r.town_trip_id and t.line_plan) or (r.submitted_by=${user.id}::uuid and r.receipt_action in ('combined_grv','multi_po_dnote','unplanned_dnote'))) as can_correct,
    coalesce(r.payload->>'delivery_note',r.payload->>'invoice_number') as reference
    from stock_v2.receipt_verification r join auth.users u on u.id=r.submitted_by
    where r.status='returned' and not exists(select 1 from stock_v2.receipt_verification next where next.replaces_id=r.id)
    order by r.request_number`;
   return reply({counts,returned});
  }
  if(req.method==="GET"&&new URL(req.url).searchParams.has("cash_book_labour")){
   if(!access.can_main)return reply({error:"Cash Book access required"},403);
   const date=new URL(req.url).searchParams.get("cash_book_labour")??"";
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return reply({error:"Choose a labour date."},400);
   const rows=await db`select l.source_type::text,l.source_id::text,l.tracecode_name,l.activity_name,
     round(l.total_cost::numeric,2)::text as amount
    from public.labour_v2_report_rows l where l.labour_date=${date}::date and round(l.total_cost::numeric,2)>0
     and not exists(select 1 from cash_book.labour_payment_source p where p.active
       and p.source_type=l.source_type::text and p.source_id=l.source_id::text)
    order by l.tracecode_name,l.activity_name,l.source_type,l.source_id`;
   return reply({rows});
  }
  if(req.method==="GET"&&new URL(req.url).searchParams.has("cash_book")){
   if(!access.can_main)return reply({error:"Cash Book access required"},403);
   const [accounts,entries,trips,advances,tripInvoices,counterparties]=await Promise.all([
    db`select id,name,currency,opening_date::text,opening_balance::text,active,balance::text from cash_book.account_balance order by currency,name`,
    db`select e.id,e.entry_number,e.kind,e.currency,e.account_id,e.destination_id,e.amount::text,e.entry_date::text,e.created_at,
      e.value_date::text,e.reference,e.narrative,e.counterparty,e.status,e.reversal_of,
      exists(select 1 from cash_book.entry r where r.reversal_of=e.id) as reversed,
      exists(select 1 from cash_book.trip_advance a where a.id=e.id)
       or exists(select 1 from cash_book.trip_settlement s where s.return_entry_id=e.id) as trip_cash
      from cash_book.entry e order by e.entry_date desc,e.entry_number desc`,
    db`select t.id,t.trip_number,t.trip_date::text,u.email as driver_name
      from stock_v2.town_trip t join auth.users u on u.id=t.driver_id order by t.trip_date desc,t.trip_number desc`,
    db`select a.id,a.trip_id,a.account_id,a.amount::text,e.currency,
      s.spend::text,s.cash_returned::text,s.receipt_reference,s.settled_date::text,
      coalesce((select jsonb_agg(jsonb_build_object('invoice_number',g.invoice_number,'amount',p.amount::text) order by p.grv_id)
        from cash_book.trip_invoice_payment p join stock_v2.accounting_grv g on g.id=p.grv_id where p.advance_id=a.id),'[]'::jsonb) as invoices,
      case when s.advance_id is null then a.amount else 0 end::text as outstanding
      from cash_book.trip_advance a join cash_book.entry e on e.id=a.id
      left join cash_book.trip_settlement s on s.advance_id=a.id order by e.entry_number desc`,
    db`select id::text,town_trip_id,invoice_number,supplier_name,available::text,payment_currency
      from cash_book.verified_invoice_balance where town_trip_id is not null and available>0 order by invoice_date desc,id desc`,
    db`select min(name) as name from (
     select name from cash_book.counterparty
     union all select counterparty from cash_book.entry where btrim(counterparty)<>''
    ) names group by lower(name) order by lower(name)`,
   ]);
   const expenses=await db`select p.id::text as id,j.job_number,i.item_name,t.tracecode_name from stock_v2.job_card_part p join stock_v2.job_card j on j.id=p.job_id join stock_v2.item i using(item_id) left join public.tracecode t on t.tracecode_id=j.tracecode_id where i.buying_direct_expense and j.closed_at is null order by j.job_number desc,p.id`;
   const notes=await db`select n.id,n.note_number,n.note_date::text,n.description,n.created_at,n.entry_id,e.reference as matched_reference,
     n.entry_id is not null and not exists(select from cash_book.entry r where r.reversal_of=n.entry_id and r.status='confirmed') as reconciled
     from cash_book.quick_cash_note n left join cash_book.entry e on e.id=n.entry_id order by n.note_date desc,n.note_number desc`;
   const balances=await db`select currency,sum(balance)::text as balance from cash_book.account_balance group by currency order by currency`;
   return reply({accounts,entries,trips,advances,tripInvoices,counterparties,expenses,notes,balances});
  }
  if(req.method==="GET"&&new URL(req.url).searchParams.has("town_trips")){
   if(!access.is_stock&&!access.is_buyer&&!access.is_driver)return reply({error:"Town Trip access required"},403);
   const canReceive=access.is_stock||access.is_buyer;
   const trips=await db`select t.id,t.trip_number,t.trip_date::text,t.driver_id,t.finalised_at,t.line_plan,t.plan_version,
    coalesce((select jsonb_agg(case when ${access.is_stock||access.is_buyer} then to_jsonb(d) else jsonb_build_object('supplier_name',d.supplier_name,'visited_at',d.visited_at,'order_line_id',d.order_line_id,'order_number',d.order_number,'item_name',d.item_name,'quantity',d.quantity) end order by d.supplier_name,d.order_line_id) from stock_v2.trip_plan_detail d where d.trip_id=t.id),'[]') as plan_lines,
    coalesce((select jsonb_agg((to_jsonb(c)-'changed_by') || jsonb_build_object('actor',u.email) order by c.id) from stock_v2.trip_terms_change c join auth.users u on u.id=c.changed_by where c.trip_id=t.id and ${access.is_admin}),'[]') as terms_history,
    coalesce((select jsonb_agg(to_jsonb(r)) from stock_v2.trip_receipt_quantities r where r.town_trip_id=t.id and ${access.is_stock||access.is_buyer}),'[]') as receipts,
    coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'request_number',v.request_number,'reason',v.decision_reason,'payload',v.payload)) from stock_v2.receipt_verification v where v.town_trip_id=t.id and v.status='returned' and ${access.is_stock} and not exists(select from stock_v2.receipt_verification n where n.replaces_id=v.id)),'[]') as corrections,(${access.is_driver} and t.driver_id=${user.id}::uuid) as can_report,driver.email as driver_name,
    coalesce((select jsonb_agg(jsonb_build_object('order_id',h.order_id,'order_number',h.order_number,
      'supplier',h.supplier_name,'owner',replace(o.owner_code,'TEST_',''),'outcome',entry.outcome,
      'job_requirements',approval.payload->>'job_requirements'='true','driver_note',entry.driver_note,'payment_terms',approval.payload->>'payment_terms',
      'can_receive',entry.outcome='collected' and h.status='approved' and exists(
        select 1 from stock_v2.order_line pending where pending.order_id=h.order_id and pending.ordered_quantity>pending.received_quantity),
      'items',(select jsonb_agg(jsonb_build_object('name',coalesce(i.item_name,s.ref||' · '||s.description),'quantity',l.ordered_quantity,'remaining',greatest(0,l.ordered_quantity-l.received_quantity),'unit',coalesce(i.base_unit,'each')) order by l.order_line_id)
        from stock_v2.order_line l left join stock_v2.item i using(item_id) left join stock_v2.job_supplier_line s on s.id=l.supplier_line_id where l.order_id=h.order_id))
      order by h.order_id)
      from stock_v2.town_trip_order entry join stock_v2.order_header h using(order_id)
      join stock_v2.owner o using(owner_id)
      left join stock_v2.approval_document approval on approval.target_order_id=h.order_id
      where entry.trip_id=t.id),'[]'::jsonb) as orders
    from stock_v2.town_trip t join auth.users driver on driver.id=t.driver_id
    where ${canReceive} or t.driver_id=${user.id}::uuid order by t.trip_date desc,t.trip_number desc`;
   if(!access.is_admin)return reply({trips,line_planning:true,can_report:access.is_driver,can_receive:canReceive,can_receive_plan:access.is_stock});
   const [drivers,orders]=await Promise.all([
    db`select u.id,u.email from auth.users u where exists(
      select from public.app_user_role r where r.user_id=u.id and lower(r.role_name)='driver' union all select from stock_v2.buying_staff_role r where r.user_id=u.id and r.role_name='driver'
     ) order by u.email`,
    db`select h.order_id::float8,h.order_number,h.supplier_name,approval.payload->>'payment_terms' as payment_terms
     from stock_v2.order_header h left join stock_v2.approval_document approval on approval.target_order_id=h.order_id
     where h.status='approved' and exists(select 1 from stock_v2.order_line l where l.order_id=h.order_id and l.ordered_quantity>l.received_quantity)
      and not exists(select 1 from stock_v2.town_trip_order entry where entry.order_id=h.order_id and entry.outcome='pending')
     order by h.order_id desc`,
   ]);
   const available_lines=await db`select a.*,stock_v2.trip_terms_note(a.payment_terms) as terms_note from stock_v2.trip_order_availability a where available>0 order by supplier_name,order_number,item_name`;
   return reply({trips,drivers,orders,available_lines,line_planning:true,can_receive_plan:true,can_create:true,can_main:access.can_main,can_report:access.is_driver,can_receive:canReceive});
  }
  if(req.method==="GET"&&new URL(req.url).searchParams.has("job_requirements")){
   if(!access.is_buyer&&!access.is_stock&&!access.is_admin)return reply({error:"Buying or Stores access required"},403);
   const rows=await db`select r.*,replace(r.owner_code,'TEST_','') as owner_code,s.declined_on from stock_v2.job_requirements r
    left join stock_v2.job_supplier_line s on s.id=r.supplier_line_id where r.closed_at is null order by r.job_number,r.key`;
   const suppliers=await db`select supplier_id::text as id,supplier_name as label from stock_v2.supplier where active order by supplier_name`;
   const owners=await db`select owner_code as id,company_name as label from stock_v2.issue_company where enabled order by company_name`;
   const orders=await db`select h.order_id::text,h.order_number,h.supplier_name,replace(o.owner_code,'TEST_','') as owner_code,
     l.order_line_id::text,l.ordered_quantity-l.received_quantity-coalesce(waiting.qty,0)-assigned.qty as outstanding,l.ordered_unit_price,
     r.kind,r.ref,r.description,r.job_number,r.part_number from stock_v2.job_order_allocation a
     join stock_v2.order_line l using(order_line_id) join stock_v2.order_header h using(order_id) join stock_v2.owner o using(owner_id)
     join stock_v2.job_requirements r on r.key=coalesce('S'||a.supplier_line_id,'P'||a.part_id)
     left join lateral(select sum((x->>'quantity')::numeric) qty from stock_v2.receipt_verification v,jsonb_array_elements(v.payload->'lines') x
       where v.receipt_action='job_delivery' and v.status='pending' and x->>'order_line_id'=l.order_line_id::text) waiting on true
     cross join lateral(select coalesce(sum(d.to_receive),0) qty from stock_v2.trip_plan_detail d where d.order_line_id=l.order_line_id and d.finalised_at is null) assigned
     where h.status='approved' and l.ordered_quantity-l.received_quantity>coalesce(waiting.qty,0)+assigned.qty order by h.order_id desc,a.position`;
   const returned=await db`select v.id,v.town_trip_id,v.request_number,v.decision_reason,v.payload from stock_v2.receipt_verification v where v.receipt_action='job_delivery' and v.status='returned' and not exists(select from stock_v2.town_trip pt where pt.id=v.town_trip_id and pt.line_plan) and not exists(select from stock_v2.receipt_verification next where next.replaces_id=v.id) order by v.request_number desc`;
   const progress=await db`select * from stock_v2.trip_job_progress order by receipt_date desc nulls last,job_number desc,key,trip`;
   return reply({rows,suppliers,owners,orders,returned,access,progress});
  }
  if(req.method==="GET"&&new URL(req.url).searchParams.has("job_part_quotes")){
   if(!access.is_buyer&&!access.is_admin)return reply({error:"Buying access required"},403);
   const partId=Number(new URL(req.url).searchParams.get("job_part_quotes"));
   if(!Number.isSafeInteger(partId)||partId<=0)return reply({error:"Select a Job Card part."},400);
   const [part]=await db`select p.id,p.job_id,i.item_code,i.item_name,p.requested_quantity::float8 as quantity,
     greatest(0,p.requested_quantity-coalesce(u.issued_quantity,0)-coalesce(c.quantity,0)) as remaining_quantity,r.quantity as reserved,
     replace(o.owner_code,'TEST_','') as owner_code from stock_v2.job_card_part p
     left join stock_v2.job_part_usage u on u.part_id=p.id left join stock_v2.job_part_cancellation c on c.part_id=p.id
     left join stock_v2.job_part_reserved r on r.part_id=p.id
     join stock_v2.item i on i.item_id=p.item_id left join stock_v2.owner o on o.owner_id=p.owner_id where p.id=${partId}`;
   if(!part)return reply({error:"Job Card part not found"},404);
   const [quotes,history,suppliers]=await Promise.all([
    db`select q.id,q.quote_reference,q.quote_date::text,q.currency,q.unit_price::text,s.supplier_name
      from stock_v2.job_part_quote q join stock_v2.supplier s using(supplier_id)
      where q.part_id=${partId} order by q.quote_date desc,q.recorded_at desc`,
    db`select stock_v2.business_number(d.document_id) as receipt,d.document_date::text,g.supplier_name,
      coalesce(pc.confirmed_unit_cost,gp.actual_unit_cost)::text as unit_price
      from stock_v2.job_card_part p join stock_v2.document_line l on l.item_id=p.item_id
      join stock_v2.document d using(document_id) join stock_v2.grv_detail g using(document_id)
      left join stock_v2.price_confirmation pc on pc.line_id=l.line_id
      left join stock_v2.grv_line_price gp on gp.line_id=l.line_id and g.price_status='confirmed'
      where p.id=${partId} and d.status='posted' and d.document_type='grv'
        and coalesce(pc.confirmed_unit_cost,gp.actual_unit_cost)>0
        and exists(select 1 from stock_v2.movement m where m.document_line_id=l.line_id and (p.owner_id is null or m.owner_id=p.owner_id) and m.quantity_delta>0)
      order by d.document_date desc,d.document_id desc,l.line_id desc limit 3`,
    db`select supplier_id::text,supplier_name from stock_v2.supplier where active order by supplier_name`,
   ]);
   return reply({part,quotes,history,suppliers});
  }

  if(req.method==="GET"&&new URL(req.url).searchParams.has("job_asset_purchase_history")){
   if(!access.is_buyer&&!access.is_admin)return reply({error:"Buying access required"},403);
   const vehicle=Number(new URL(req.url).searchParams.get("job_asset_purchase_history"));
   if(!Number.isSafeInteger(vehicle)||vehicle<=0)return reply({error:"Select an asset."},400);
   const rows=await db`select h.line_id::text as id,h.item_code,h.item_name,h.buying_part_number as part_number,i.active,h.document_date::text,h.supplier_name,stock_v2.business_number(h.document_id) as receipt,h.unit_price::text from stock_v2.job_asset_purchase_history h join stock_v2.item i using(item_id) where h.vehicle_id=${vehicle}
    union all select 'job-'||dl.receipt_id||'-'||dl.order_line_id,i.item_code,s.description,i.buying_part_number,i.active,
      rv.payload->>'receipt_date',rv.payload->>'supplier',rv.payload->>'invoice_number',dl.unit_price::text
      from stock_v2.job_delivery_line dl join stock_v2.receipt_verification rv on rv.id=dl.receipt_id
      join stock_v2.order_line ol using(order_line_id) join stock_v2.job_supplier_line s on s.id=ol.supplier_line_id
      join stock_v2.job_card j on j.id=s.job_id join stock_v2.item i on i.item_id=dl.item_id
      where j.vehicle_id=${vehicle} and s.kind='sample' and rv.status='posted'
    order by document_date desc,id desc`;
   return reply({rows});
  }
  const jobClearanceReason=()=>db`case
    when exists(select from stock_v2.job_requirements r left join stock_v2.job_supplier_line s on s.id=r.supplier_line_id where r.job_id=j.id and r.kind in ('repair','sample') and r.verified_quantity<r.quantity and not (s.declined_on is not null and (s.sent_on is null or s.returned_on is not null))) then 'Complete the sample or repair, or record its return.'
    when exists(select from stock_v2.job_order_allocation a join stock_v2.approval_document d on d.id=a.document_id join stock_v2.job_card_part p on p.id=a.part_id where p.job_id=j.id and d.status in ('pending','approved','draft')) then 'Complete the outstanding Job Card order.'
    when exists(select from stock_v2.approval_document d where d.kind='po' and d.payload->>'source_job_card_id'=j.id::text
      and (d.status in ('draft','pending','approved') or (d.status='applied' and exists(
        select from stock_v2.order_line l join stock_v2.order_header h using(order_id) where h.order_id=d.target_order_id
        and h.status='approved' and l.ordered_quantity>l.received_quantity)))) then 'Complete or cancel the outstanding purchase order.'
    when exists(select from stock_v2.job_card_part p join stock_v2.job_part_reserved r on r.part_id=p.id
      where p.job_id=j.id and r.quantity>0) then 'Issue or release the reserved stock.'
    when exists(select from stock_v2.job_card_part p join stock_v2.item i using(item_id)
      left join stock_v2.job_part_usage u on u.part_id=p.id where p.job_id=j.id and not i.buying_direct_expense
      and p.requested_quantity>coalesce(u.issued_quantity,0)+coalesce((select c.quantity from stock_v2.job_part_cancellation c where c.part_id=p.id),0)) then 'Issue the outstanding Job Card items.'
    when exists(select from stock_v2.job_card_part p join stock_v2.item i using(item_id)
      where p.job_id=j.id and i.buying_direct_expense and not exists(select from stock_v2.job_requirements r where r.part_id=p.id and r.verified_quantity>=r.quantity) and (not exists(
        select from cash_book.job_expense x join cash_book.entry e on e.id=x.entry_id where x.part_id=p.id and e.status='confirmed'
        and not exists(select from cash_book.entry v where v.reversal_of=e.id and v.status='confirmed'))
      or exists(select from cash_book.job_expense x join cash_book.entry e on e.id=x.entry_id where x.part_id=p.id and e.status='draft')))
      then 'Confirm the Cash Book payment for the direct expense.'
    end`;
  if(req.method==="GET"&&new URL(req.url).searchParams.has("job_cards")){
   if(!access.is_stock&&!access.is_buyer&&!access.is_workshop)return reply({error:"Job Card access required"},403);
   const cards=await db`select case when j.closed_at is null then ${jobClearanceReason()} end as clearance_reason,j.id,j.job_number,j.work_description,j.requested_at,j.xmin::text as revision,j.vehicle_id::float8,j.tracecode_id::float8,j.transaction_date::text,j.closed_at,j.card_type,
    coalesce(v.vehicle_name,t.tracecode_name) as vehicle_name,
    coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('declined_on',s.declined_on) order by s.id)
      from stock_v2.job_requirements r join stock_v2.job_supplier_line s on s.id=r.supplier_line_id where r.job_id=j.id),'[]'::jsonb) as supplier_lines,
    coalesce((select jsonb_agg(jsonb_build_object('owner_code',d.payload->>'owner_code','status',d.status,
      'order_number',h.order_number,'request_number',d.request_number) order by d.request_number desc)
      from stock_v2.approval_document d left join stock_v2.order_header h on h.order_id=d.target_order_id
      where d.kind='po' and (d.payload->>'source_job_card_id'=j.id::text or exists(select from jsonb_array_elements(d.payload->'lines') z where z->>'job_id'=j.id::text))),'[]'::jsonb) as purchase_orders,
    coalesce((select jsonb_agg(jsonb_build_object(
     'item_code',i.item_code,'item_name',i.item_name,'quantity',p.requested_quantity,'unit',i.base_unit,
     'owner_code',replace(o.owner_code,'TEST_',''),'owner_name',ic.company_name,'issue_enabled',coalesce(ic.enabled,false),'sample_details',p.sample_details,'line_purpose',p.line_purpose,'part_id',p.id,
     'category_id',p.category_id,'unit_price',p.unit_price,'price_supplier_id',p.price_supplier_id::text,'price_supplier_name',ps.supplier_name,'direct_expense',i.buying_direct_expense,'part_number',i.buying_part_number,
     'reserved',r.quantity,'issued',coalesce(u.issued_quantity,0),'repair_cost',u.repair_cost,
     'remaining_quantity',greatest(0,p.requested_quantity-coalesce(u.issued_quantity,0)-coalesce(c.quantity,0)),
     'cancelled_quantity',c.quantity,'cancellation_reason',c.reason,'cancelled_at',c.cancelled_at,
     'stock_sources',case when p.owner_id is null and j.vehicle_id is null and not i.buying_direct_expense and ${access.is_stock||access.is_buyer} then (
       select coalesce(jsonb_agg(jsonb_build_object('code',src.owner_code,'name',src.owner_name,'available',src.available) order by src.owner_name),'[]'::jsonb)
       from (select so.owner_code,so.company_name as owner_name,stock_v2.available_after_job_reservations(so.owner_id,p.item_id,loc.location_id) as available
         from stock_v2.issue_company so cross join stock_v2.location loc where so.enabled and loc.location_code='TEST_WH') src where src.available>0
     ) end,
     'pending_cost',coalesce(u.pending_cost_lines,0)>0,'available',case when ${access.is_stock||access.is_buyer} then greatest(0,
      stock_v2.available_after_job_reservations(p.owner_id,p.item_id,
       (select location_id from stock_v2.location where location_code='TEST_WH'))) end) order by p.id)
     from stock_v2.job_card_part p join stock_v2.item i using(item_id) left join stock_v2.owner o using(owner_id)
     left join stock_v2.job_part_cancellation c on c.part_id=p.id
     left join stock_v2.supplier ps on ps.supplier_id=p.price_supplier_id
     left join stock_v2.issue_company ic on ic.owner_id=p.owner_id
     join stock_v2.job_part_reserved r on r.part_id=p.id
     left join stock_v2.job_part_usage u on u.part_id=p.id
     where p.job_id=j.id),'[]'::jsonb) as parts
    from stock_v2.job_card j left join public.vehicle v using(vehicle_id) left join public.tracecode t on t.tracecode_id=j.tracecode_id
    where ${access.is_stock||access.is_buyer} or j.requested_by=${user.id}::uuid
    order by j.job_number desc`;
   const canReserve=access.is_stock||access.is_buyer;
   if(!access.is_buyer&&!access.is_admin)return reply({cards,can_create:false,can_main:access.can_main,can_buy:access.is_admin,can_reserve:canReserve});
   const [vehicles,items,categories,traces,suppliers]=await Promise.all([
    db`select v.vehicle_id::float8,v.vehicle_name,v.vehicle_type_id::float8,coalesce(t.type_name,'Unclassified') as vehicle_type,
     coalesce(t.type_code,'') as type_code,company.company_name as owner_name,company.stock_owner_code as owner_code,stock_v2.job_asset_group(v.vehicle_id) as catalogue_group,f.farm_name as farm_name
     from public.vehicle v left join public.vehicle_type t using(vehicle_type_id)
     join public.company company on company.company_id=v.owner_company_id and company.owns_vehicles
     left join stock_v2.irrigation_asset_farm af using(vehicle_id) left join public.farm f using(farm_id)
     where t.active and not v.vehicle_discontinued and not v.is_other and v.ownership_status='owned' order by vehicle_type,v.vehicle_name`,
    db`select i.item_code,i.item_name,i.base_unit,i.buying_part_number as part_number,lub.item_id is not null as stock_lubricant,
      array(select category_id::float8 from stock_v2.buying_item_category where item_id=i.item_id) as category_ids
      from stock_v2.item i left join stock_v2.job_lubricant_inputs lub using(item_id)
      where i.active and (i.input_type is distinct from 'Lubricants' or lub.item_id is not null) order by i.item_name`,
    db`select category_id::float8,catalogue_group,category_name,stock_v2.is_job_lubricant_category(category_name) as stock_only
      from stock_v2.buying_category order by category_name`,
    db`select t.tracecode_id::float8 as id,t.tracecode_name as name from public.tracecode t left join public.crop c using(crop_id)
      where t.end_date is null and (c.crop_name is null or upper(c.crop_name)='COS') order by t.tracecode_name`,
    db`select supplier_id::text,supplier_name from stock_v2.supplier where active order by supplier_name`,
   ]);
   return reply({cards,vehicles,items,categories,traces,suppliers,can_create:access.is_buyer,can_main:access.can_main,can_buy:access.is_buyer||access.is_admin,can_reserve:canReserve});
  }
  if(req.method==="GET"&&(access.is_workshop||access.is_driver)&&new URL(req.url).searchParams.has("workflow_operation")){
   const id=new URL(req.url).searchParams.get("workflow_operation");
   const rows=await db`select result from stock_v2.approval_operation where id=${id}::uuid and actor=${user.id}::uuid`;
   return reply({result:rows[0]?.result??null});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("equipment_catalog")){
    await db`select stock_v2.workflow_require(${user.id}::uuid)`;
    const rows=await db`select vehicle_id,vehicle_name,fuel_type,is_other,vehicle_discontinued from public.vehicle where not vehicle_discontinued order by vehicle_name`;
    return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("chemical_actives")){
    await db`select stock_v2.workflow_require(${user.id}::uuid)`;
    try{
      const rows=await db`select i.item_code,a.active_name,a.concentration::float8 as concentration,a.concentration_unit
        from stock_v2.item_active_ingredient a join stock_v2.item i using(item_id)
        order by i.item_code,a.id`;
      return reply({rows});
    }catch(e){
      if((e as any)?.code==="42P01")return reply({rows:[],unavailable:true});
      throw e;
    }
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
        const found=await tx`select item_id,input_type from stock_v2.item where item_code=${code} for update`;
        if(!found.length)throw Error("Product not found");
        if(!/^chemicals?$/i.test(found[0].input_type??''))throw Error('Active ingredients apply to Chemicals only');
        const itemId=found[0].item_id;
        const prior=await tx`select active_name,concentration::float8 as amount,concentration_unit as unit from stock_v2.item_active_ingredient where item_id=${itemId} order by id`;
        await tx`delete from stock_v2.item_active_ingredient where item_id=${itemId}`;
        for(const a of normalized)await tx`insert into stock_v2.item_active_ingredient
          (item_id,active_name,concentration,concentration_unit,updated_by)
          values(${itemId},${a.name},${a.amount},${a.unit},${user.id}::uuid)`;
        await tx`insert into stock_v2.item_active_ingredient_audit(item_id,actor,old_ingredients,new_ingredients)
          values(${itemId},${user.id}::uuid,${JSON.stringify(prior)}::jsonb,${JSON.stringify(normalized)}::jsonb)`;
        await tx`insert into stock_v2.product_metadata(item_id,version) values(${itemId},1) on conflict(item_id) do update set version=product_metadata.version+1`;
      });
      return reply({saved:true});
    }catch(e){return reply({error:e instanceof Error?e.message:String(e)},400)}
  }

  let body:any;
  const workshopOnly=(access.is_workshop||access.is_driver)&&!access.is_stock&&!access.is_buyer;
  if(purchasingOnly||workshopOnly){
   if(req.method==="GET"){
    const query=new URL(req.url).searchParams;
    const allowed=["workflow_context","workflow_operation","supplier_list","stock_setup","purchasing_feed","outstanding_dnotes","my_receipts"];
    if(workshopOnly||[...query.keys()].length!==1||!allowed.some(key=>query.has(key)))return reply({error:"Module access required"},403);
   }else{
    try{body=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
    const poEdit=body?.action==="workflow_command"&&["save","submit"].includes(body.command)&&body.data?.kind==="po";
    const driverReport=access.is_driver&&(body?.action==="report_town_trip_order"||(body?.action==="trip_plan"&&body.command==="visit"));
    if(!driverReport&&(workshopOnly||(!poEdit&&!["unplanned_dnote","multi_po_dnote","combined_grv","reserve_job_part","issue_job_part","record_job_quote","create_job_card","create_job_category","save_job_catalogue_part","set_job_part_price","edit_job_card","finalise_job_card","cancel_job_part_balance","job_requirement"].includes(body?.action))))
     return reply({error:"Module access required"},403);
   }
  }else await db`select stock_v2.workflow_require(${user.id}::uuid)`;
  if(req.method==='GET'&&new URL(req.url).searchParams.has('product_catalog')){
   const items=await db`select i.item_code,i.item_name,i.base_unit,i.input_type,i.input_category,i.active,
    m.pastel_stock_code,coalesce(m.version,0) as version,
    coalesce((select jsonb_agg(jsonb_build_object('name',a.active_name,'amount',a.concentration::text,'unit',a.concentration_unit) order by a.id) from stock_v2.item_active_ingredient a where a.item_id=i.item_id),'[]'::jsonb) as actives
    from stock_v2.item i left join stock_v2.product_metadata m using(item_id) order by i.item_name`;
   return reply({items,can_create:access.is_stock||access.is_admin,can_edit:access.is_admin});
  }
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
    from stock_v2.approval_document a where (not ${purchasingOnly} or a.kind='po')
    order by (status='pending') desc,updated_at desc limit 1000`;
   if(purchasingOnly)return reply({access,documents,stocktakes:[],awaiting:documents.filter(d=>d.status==="pending").length});
   const stocktakes=await db`select t.*,replace(o.owner_code,'TEST_','') as owner_code,l.location_code,
    (select jsonb_agg(jsonb_build_object('item_code',i.item_code,'item_name',i.item_name,'system_quantity',x.system_quantity,'counted_quantity',x.counted_quantity,'current_quantity',coalesce(q.quantity,0)))
     from stock_v2.stocktake_line x join stock_v2.item i using(item_id) left join stock_v2.quantity_balance q on q.item_id=x.item_id and q.owner_id=t.owner_id and q.location_id=t.location_id where x.take_id=t.take_id) as lines
    from stock_v2.stocktake t join stock_v2.owner o using(owner_id) join stock_v2.location l using(location_id) where t.status='counted' and o.owner_code in ('TEST_JS','TEST_AO') order by t.take_id`;
   const counts=(await db`select (
     (select count(*) from stock_v2.approval_document where status='pending')+
     (select count(*) from stock_v2.stocktake t join stock_v2.owner o using(owner_id) where t.status='counted' and o.owner_code in ('TEST_JS','TEST_AO'))+
     (select count(*) from stock_v2.receipt_verification where status='pending' and ${access.is_admin===true})
   )::int as awaiting`)[0];
   const can_adjustments=(await db`select stock_v2.can_print_stocktake(${user.id}::uuid) as allowed`)[0].allowed;
   const adjustment_count=can_adjustments?(await db`select count(*)::int as n from stock_v2.stocktake_adjustment_pending`)[0].n:0;
   return reply({access:{...access,can_adjustments},documents,stocktakes,combined_stocktakes:[],adjustment_count,awaiting:counts.awaiting});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("my_receipts")){
   const receipts=await db`select r.id,r.request_number,r.receipt_action,r.payload,r.status,r.decision_reason,r.town_trip_id
    from stock_v2.receipt_verification r
    where r.submitted_by=${user.id}::uuid and r.status in ('pending','returned')
      and not exists(select 1 from stock_v2.receipt_verification replacement where replacement.replaces_id=r.id)
    order by r.request_number desc`;
   return reply({receipts});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("receipt_verification")){
   await db`select stock_v2.workflow_require(${user.id}::uuid,true)`;
   const receipts=await db`select r.id,r.request_number,r.receipt_action,r.payload,r.submitted_at,
     (select jsonb_agg(jsonb_build_object('order_number',h.order_number,'item_name',i.item_name,'unit',i.base_unit,
       'quantity',line->'quantity','unit_price',line->'unit_price') order by pos)
      from jsonb_array_elements(case when r.receipt_action='multi_po_dnote' then r.payload->'lines' else '[]'::jsonb end)
       with ordinality as entry(line,pos)
      left join stock_v2.order_line l on l.order_line_id::text=line->>'order_line_id'
      left join stock_v2.order_header h using(order_id) left join stock_v2.item i on i.item_id=l.item_id) as review_lines
    from stock_v2.receipt_verification r where r.status='pending' order by r.request_number`;
   return reply({receipts});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("workflow_operation")){
   const id=new URL(req.url).searchParams.get("workflow_operation");
   const rows=await db`select result from stock_v2.approval_operation where id=${id}::uuid and actor=${user.id}::uuid`;
   return reply({result:rows[0]?.result??null});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("linked_credit_options")){
   const rows=await db`select credit_id,credit_note_number,owner_code,supplier_name,credit_note_date::text,total_amount::float8 from stock_v2.supplier_credit_note where status='posted' order by credit_id desc`;return reply({rows});
  }
  if(req.method==="GET"&&new URL(req.url).searchParams.has("irrigation_asset_farm")){
   if(!access.can_main)return reply({error:"Vehicle Admin access required"},403);
   const vehicle=Number(new URL(req.url).searchParams.get("irrigation_asset_farm"));
   const [assignment]=await db`select farm_id::float8 from stock_v2.irrigation_asset_farm where vehicle_id=${vehicle}`;
   const farms=await db`select farm_id::float8 as id,farm_name as label from public.farm where active or farm_id=${assignment?.farm_id??null}::bigint order by farm_name`;
   return reply({farms,farm_id:assignment?.farm_id??null});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("stock_staff")){
   await db`select stock_v2.workflow_require(${user.id}::uuid,true)`;
   const rows=await db`select u.id,u.email,coalesce(s.role_name,br.roles[1]) as role_name,
     coalesce(s.active,cardinality(br.roles)>0) as active,s.assigned_at,s.note,br.roles as buying_roles,
     exists(select from public.app_user_role a where a.user_id=u.id and lower(a.role_name)='admin') as global_admin
     from auth.users u left join stock_v2.staff_role s on s.user_id=u.id
     cross join lateral (select array(select role_name from stock_v2.buying_staff_role where user_id=u.id
       union select lower(role_name) from public.app_user_role where user_id=u.id and lower(role_name) in ('buyer','driver') order by 1) as roles) br
     order by u.email`;
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
   where j.job_id=${jobId} and j.owner_id in (select owner_id from stock_v2.issue_company) and d.document_type='issue' and d.status='posted' order by d.document_id desc,dl.line_id`;
   return reply({rows:rows.filter((x:any)=>x.available_to_return>0)});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("spray_assignments")){
   const week=new URL(req.url).searchParams.get("through_week")||"";
   const assignmentOwner=new URL(req.url).searchParams.get("owner")||"JS";
   const excludeJob=Number(new URL(req.url).searchParams.get("exclude_job")||0);
   if(!Number.isSafeInteger(excludeJob)||excludeJob<0)return reply({error:"Valid owner and job required"},400);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(week))return reply({error:"Valid week required"},400);
   const rows=await db`select i.item_code,coalesce(sum(greatest(0,ji.rate_per_ha*j.area_ha-coalesce((select sum(case when d.document_type='issue' then dl.quantity when d.document_type='return' then -dl.quantity else 0 end) from stock_v2.document_line dl join stock_v2.document d on d.document_id=dl.document_id where dl.requirement_id=ji.requirement_id and d.document_type in ('issue','return') and d.status='posted'),0))),0)::float8 assigned
   from stock_v2.spray_job j join stock_v2.spray_job_input ji on ji.job_id=j.job_id join stock_v2.item i on i.item_id=ji.item_id
   where j.status='planned' and j.planned_week_start<=${week}::date and j.job_id<>${excludeJob} and j.owner_id=(select owner_id from stock_v2.issue_company where owner_code=${assignmentOwner} and enabled)
   group by i.item_code`;
   return reply({rows});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("spray_history")){
   const traceId=Number(new URL(req.url).searchParams.get("tracecode_id"));
   if(!Number.isSafeInteger(traceId)||traceId<=0)return reply({error:"Valid tracecode required"},400);
   const rows=await db`select j.job_id,j.planned_week_start::text as spray_date,j.status,i.item_name as product,ji.rate_per_ha::float8 as rate_per_ha,i.base_unit
     from stock_v2.spray_job j join stock_v2.spray_job_input ji on ji.job_id=j.job_id join stock_v2.item i on i.item_id=ji.item_id
     where j.external_tracecode_id=${traceId} and j.owner_id in (select owner_id from stock_v2.issue_company)
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
   const traces=purchasingOnly?[]:await db`select t.tracecode_id,t.tracecode_name,c.contract_id from public.tracecode t left join stock_v2.tracecode_contract c on c.external_tracecode_id=t.tracecode_id order by t.tracecode_name limit 1000`;
   return reply({contracts,owners,traces});
  }
  if(req.method==="GET" && new URL(req.url).searchParams.has("issue_slip")){
   const id=Number(new URL(req.url).searchParams.get("issue_slip"));
   if(!Number.isSafeInteger(id)||id<=0)return reply({error:"Invalid issue slip number"},400);
   const header=await db`select d.document_id,stock_v2.business_number(d.document_id) as document_number,d.document_date,d.status,
     string_agg(distinct ic.company_name,', ' order by ic.company_name) as company_name,max(t.tracecode_name) as tracecode_name,max(j.job_id)::text as job_id,
     max(j.water_litres_per_ha)::float8 as water_rate,max(j.sprayer_asset_code) as sprayer,
     max(j.spray_type) as spray_type
     from stock_v2.document d
     join stock_v2.document_line dl on dl.document_id=d.document_id
     join stock_v2.movement m on m.document_line_id=dl.line_id
     join stock_v2.owner o on o.owner_id=m.owner_id
     join stock_v2.issue_company ic on ic.owner_id=o.owner_id
     join stock_v2.location loc on loc.location_id=m.location_id
     left join public.tracecode t on t.tracecode_id=m.external_tracecode_id
     left join stock_v2.spray_job_input ji on ji.requirement_id=dl.requirement_id
     left join stock_v2.spray_job j on j.job_id=ji.job_id
     where d.document_id=${id} and d.document_type='issue' and d.status='posted'
       and o.company_id is not null and loc.location_code='TEST_WH'
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
      where dl.document_id=${id} and o.company_id is not null and loc.location_code='TEST_WH'
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
  if(req.method==="POST"&&!purchasingOnly&&!workshopOnly){
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
  if(req.method==="GET"&&new URL(req.url).searchParams.has("purchasing_feed")){
   const items=await db`select i.item_code,i.item_name,i.base_unit,i.active,stock_v2.po_without_job_card(i) as standalone_po from stock_v2.item i order by i.item_name`;
   const orders=await db`select h.order_id,h.order_number,h.order_date,h.supplier_name,h.status,
    replace(o.owner_code,'TEST_','') as owner_code,i.item_code,i.item_name,i.base_unit,ol.order_line_id,
    ol.ordered_quantity::float8 as ordered_quantity,ol.received_quantity::float8 as received_quantity,
    greatest(0,ol.ordered_quantity-ol.received_quantity-coalesce((select sum(d.quantity-d.posted) from stock_v2.trip_plan_detail d where d.order_line_id=ol.order_line_id and d.finalised_at is null),0))::float8 as free_quantity,
    ol.ordered_unit_price::float8 as ordered_unit_price
    from stock_v2.order_header h join stock_v2.owner o using(owner_id)
    join stock_v2.order_line ol using(order_id) join stock_v2.item i using(item_id)
    where o.owner_code in ('TEST_JS','TEST_AO') and h.status='approved' and not exists(select from stock_v2.job_order_allocation a where a.order_line_id=ol.order_line_id)
    order by h.order_id desc,ol.order_line_id`;
   return reply({items,orders,can_receive_job_orders:access.is_stock||access.is_admin});
  }
  if(req.method==="GET"){
   const items=await db`select i.item_code,i.item_name,i.base_unit,i.active,st.heyshott_quantity::float8 as opening_heyshott_quantity,st.ao_quantity::float8 as opening_ao_quantity,st.historical_unit_cost::float8 as historical_unit_cost,i.input_type,coalesce(i.input_category,i.category) input_category,i.active_ingredient,i.formulation_type,coalesce(b.quantity,0)::float8 quantity,coalesce(abo.quantity,0)::float8 ao_quantity,coalesce(ib.owner_quantities,'{}'::jsonb) as owner_quantities,p.last_purchase_price::float8 last_purchase_price,s.last_purchase_supplier,wa.unit_cost::float8 weighted_average_price from stock_v2.item i left join stock_v2.issue_item_balances ib using(item_id) cross join (select owner_id from stock_v2.owner where owner_code='TEST_JS') ow cross join (select location_id from stock_v2.location where location_code='TEST_WH') loc left join stock_v2.quantity_balance b on b.item_id=i.item_id and b.owner_id=ow.owner_id and b.location_id=loc.location_id left join stock_v2.quantity_balance abo on abo.item_id=i.item_id and abo.owner_id=(select owner_id from stock_v2.owner where owner_code='TEST_AO') and abo.location_id=loc.location_id left join lateral (
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
   const sprays=await db`select j.job_id,j.external_tracecode_id,ic.owner_code,ic.company_name as owner_name,ic.enabled as issue_enabled,j.allocation_groups,t.tracecode_name,c.crop_name,j.area_ha::float8 as area_ha,j.planned_week_start::text as planned_week_start,(select max(d.document_date)::text from stock_v2.document d join stock_v2.document_line dl on dl.document_id=d.document_id join stock_v2.spray_job_input si on si.requirement_id=dl.requirement_id where si.job_id=j.job_id and d.document_type='issue' and d.status='posted') as completed_date,j.spray_type,j.part_label,j.water_litres_per_ha::float8 as water_litres_per_ha,j.sprayer_asset_code,j.job_tracking_code,j.status,stock_v2.spray_physical_completed_date(j.job_id)::text as sprayed_date,i.base_unit,i.item_code,i.item_name,ji.rate_per_ha::float8 as rate_per_ha,(ji.rate_per_ha*j.area_ha)::float8 as planned_quantity,coalesce((select sum(case when d.document_type='issue' then dl.quantity when d.document_type='return' then -dl.quantity else 0 end) from stock_v2.document_line dl join stock_v2.document d on d.document_id=dl.document_id where dl.requirement_id=ji.requirement_id and d.document_type in ('issue','return') and d.status='posted'),0)::float8 as issued_quantity from stock_v2.spray_job j join stock_v2.issue_company ic on ic.owner_id=j.owner_id join stock_v2.spray_job_input ji on ji.job_id=j.job_id join stock_v2.item i on i.item_id=ji.item_id left join public.tracecode t on t.tracecode_id=j.external_tracecode_id left join public.crop c on c.crop_id=t.crop_id order by j.job_id desc,ji.job_input_id limit 200`;
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
    where j.owner_id in (select owner_id from stock_v2.issue_company where enabled) and j.status='planned'
    group by j.job_id having min(case when ji.rate_per_ha>0 then greatest((ji.rate_per_ha*j.area_ha-x.issued)/ji.rate_per_ha,0) else 0 end)>0.0001
   ) due`;
   const issue_companies=await db`select company_id,owner_code,company_name from stock_v2.issue_company where enabled order by company_name`;
   return reply({items,orders,sprays,documents,sprayers,issue_companies,pending_invoice_count:pendingInvoiceCount[0]?.n??0,outstanding_spray_count:outstandingSprayCount[0]?.n??0});
  }
  if(!purchasingOnly&&!workshopOnly)try{body=await req.json()}catch{return reply({error:"Invalid JSON"},400)}


  const transaction=async(fn:(tx:any)=>Promise<any>)=>db.begin(async tx=>{
   await tx`select pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'))`;
   if(body.operation_id){
    const previous=await tx`select actor,result,request=${tx.json(body)}::jsonb as same_request from stock_v2.approval_operation where id=${body.operation_id}::uuid`;
    if(previous.length){
     if(previous[0].actor!==user.id||!previous[0].same_request)throw Error("Operation reference reused with different values");
     return {...previous[0].result,replayed:true};
    }
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
  if(body?.action==="trip_plan"){
   if(!/^[a-f0-9-]{36}$/i.test(String(body.operation_id??'')))return reply({error:"Operation reference required"},400);
   const result=await transaction(async tx=>["receive","confirm"].includes(body.command)
    ?(await tx`select stock_v2.trip_receive(${user.id}::uuid,${tx.json(body.payload)}::jsonb,${body.command==="confirm"}) result`)[0].result
    :(await tx`select stock_v2.trip_plan_command(${user.id}::uuid,${body.command}::text,${tx.json(body.payload)}::jsonb) result`)[0].result);
   return reply({success:true,result});
  }
  if(body?.action==="job_requirement"||body?.action==="job_delivery"){
   if(!/^[a-f0-9-]{36}$/i.test(String(body.operation_id??'')))return reply({error:"Operation reference required"},400);
   const result=await transaction(async tx=>{
    if(body.action==="job_delivery"&&body.command==="verify")await tx`select set_config('jspl.receiving_trip',t.id::text,true) from stock_v2.receipt_verification v join stock_v2.town_trip t on t.id=v.town_trip_id where v.id=${body.payload?.receipt_id}::uuid and t.line_plan`;
    return body.action==="job_requirement"
    ?(await tx`select stock_v2.job_requirements_command(${user.id}::uuid,${body.command}::text,${tx.json(body.payload??{})}::jsonb) as result`)[0].result
    :(await tx`select stock_v2.job_delivery_command(${user.id}::uuid,${body.command}::text,${tx.json(body.payload??{})}::jsonb) as result`)[0].result;});
   return reply({success:true,result});
  }
  if(body?.action==="cash_book_quick_cash_out")return reply({error:"Refresh Cash Book to enter a Quick Cash note."},409);
  if(["cash_book_account","cash_book_draft","cash_book_decision","cash_book_trip_advance","cash_book_trip_settle","cash_book_labour_draft","cash_book_quick_note","cash_book_match_note","cash_book_supplier_draft","cash_book_apply_supplier_credit","cash_book_add_counterparty"].includes(body?.action)){
   if(!access.can_main)return reply({error:"Cash Book access required"},403);
   const p=body.payload??{};
   const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
   const iso=/^\d{4}-\d{2}-\d{2}$/;
   const amount=/^\d{1,16}(?:\.\d{1,2})?$/;
   const clean=(value:unknown)=>typeof value==="string"?value.trim():"";
   if(!uuid.test(String(body.operation_id??"")))return reply({error:"Reload Cash Book to save a recoverable operation."},400);
   const result=await transaction(async tx=>{
    if(body.action==="cash_book_quick_note"){
     if(!iso.test(clean(p.date))||!clean(p.description)||clean(p.description).length>500)throw Error("Enter a date and a description of up to 500 characters.");
     const [note]=await tx`select id,note_number from cash_book.save_quick_note(${user.id}::uuid,${body.operation_id}::uuid,${p.date}::date,${clean(p.description)})`;
     return note;
    }
    if(body.action==="cash_book_match_note"){
     if(!uuid.test(clean(p.note_id))||!uuid.test(clean(p.entry_id)))throw Error("Select a note and a confirmed transaction.");
     const [note]=await tx`select id,note_number from cash_book.match_quick_note(${user.id}::uuid,${p.note_id}::uuid,${p.entry_id}::uuid)`;
     return note;
    }
    if(body.action==="cash_book_add_counterparty"){
     const name=clean(p.name);
     if(!name||name.length>120)throw Error("Enter a payer or payee name of up to 120 characters.");
     await tx`insert into cash_book.counterparty(name) values(${name}) on conflict do nothing`;
     const [party]=await tx`select name from cash_book.counterparty where lower(name)=lower(${name})`;
     return party;
    }
    if(body.action==="cash_book_apply_supplier_credit"){
     const invoice=clean(p.grv_id),credit=clean(p.credit_id),currency=clean(p.currency),value=clean(p.amount);
     if(!/^[1-9]\d{0,17}$/.test(invoice)||!/^[1-9]\d{0,17}$/.test(credit)||!["USD","ZiG"].includes(currency)||
       !amount.test(value)||Number(value)<=0)throw Error("Select the invoice, credit note, currency and amount.");
     const [applied]=await tx`insert into cash_book.supplier_credit_application(id,credit_id,grv_id,currency,amount,applied_by)
      select ${body.operation_id}::uuid,c.credit_id,g.id,${currency},${value}::numeric,${user.id}::uuid
      from cash_book.verified_invoice_balance g join cash_book.supplier_credit_balance c
       on c.owner_code=g.owner_code and lower(btrim(c.supplier_name))=lower(btrim(g.supplier_name))
      where g.id=${invoice}::bigint and c.credit_id=${credit}::bigint
       and g.available>=${value}::numeric and c.remaining>=${value}::numeric
       and (g.linked_credit_id is null or g.linked_credit_id=c.credit_id
        or exists(select 1 from cash_book.supplier_credit_application a where a.grv_id=g.id and a.credit_id=g.linked_credit_id))
       and (g.payment_currency is null or g.payment_currency=${currency})
       and (c.currency is null or c.currency=${currency}) returning id,grv_id,credit_id`;
     if(!applied)throw Error("The credit must match the invoice supplier, stock owner and currency, with enough unapplied balance.");
     return applied;
    }
    if(body.action==="cash_book_supplier_draft"){
     const invoice=clean(p.grv_id),account=clean(p.account_id),date=clean(p.entry_date),value=clean(p.amount),reference=clean(p.reference);
     if(!/^[1-9]\d{0,17}$/.test(invoice)||!uuid.test(account)||!iso.test(date)||!amount.test(value)||Number(value)<=0||
       !reference||reference.length>120)throw Error("Select an invoice, account and amount, then enter a payment date and reference.");
     const [payment]=await tx`insert into cash_book.entry(id,kind,currency,account_id,amount,entry_date,value_date,
       reference,narrative,counterparty,created_by)
      select ${body.operation_id}::uuid,'payment',a.currency,a.id,${value}::numeric,${date}::date,${date}::date,
       ${reference},'Supplier invoice '||g.invoice_number,g.supplier_name,${user.id}::uuid
      from cash_book.supplier_invoice_balance g cross join cash_book.account a
      where g.id=${invoice}::bigint and a.id=${account}::uuid and a.active
       and ${date}::date>=greatest(a.opening_date,g.invoice_date) and g.available>=${value}::numeric
       and (g.payment_currency is null or g.payment_currency=a.currency)
      returning id,entry_number,status`;
     if(!payment)throw Error("The invoice balance, payment date or account currency changed. Reload before saving.");
     await tx`insert into cash_book.supplier_payment(entry_id,grv_id) values(${payment.id}::uuid,${invoice}::bigint)`;
     return payment;
    }
    if(body.action==="cash_book_trip_advance"){
     const trip=clean(p.trip_id),account=clean(p.account_id),date=clean(p.entry_date),value=clean(p.amount);
     if(!uuid.test(trip)||!uuid.test(account)||!iso.test(date)||!amount.test(value)||Number(value)<=0)
      throw Error("Select a Town Trip and enter a valid advance amount and date.");
     const [advance]=await tx`insert into cash_book.entry(id,kind,currency,account_id,amount,entry_date,value_date,
       reference,narrative,counterparty,status,created_by,decided_by,decided_at)
      select ${body.operation_id}::uuid,'payment',a.currency,a.id,${value}::numeric,${date}::date,${date}::date,
       'TRIP-ADV-'||t.trip_number,'Town Trip cash advance',coalesce(u.email,'Assigned driver'),'confirmed',
       ${user.id}::uuid,${user.id}::uuid,now()
      from cash_book.account a cross join stock_v2.town_trip t join auth.users u on u.id=t.driver_id
      where a.id=${account}::uuid and a.active and a.opening_date<=${date}::date and t.id=${trip}::uuid
       and not exists(select 1 from cash_book.trip_advance x where x.trip_id=t.id and x.account_id=a.id)
      returning id,entry_number`;
     if(!advance)throw Error("Choose an open account and a trip without an advance on that account.");
     await tx`insert into cash_book.trip_advance(id,trip_id,account_id,amount)
       values(${advance.id}::uuid,${trip}::uuid,${account}::uuid,${value}::numeric)`;
     return advance;
    }
    if(body.action==="cash_book_trip_settle"){
     const id=clean(p.advance_id),spend=clean(p.spend),returned=clean(p.cash_returned),date=clean(p.entry_date),reference=clean(p.receipt_reference);
     if(!uuid.test(id)||!amount.test(spend)||!amount.test(returned)||!iso.test(date)||!reference||reference.length>500)
      throw Error("Enter the spend, cash returned, date and supporting references.");
     const [advance]=await tx`select a.id,a.account_id,a.trip_id,e.currency,e.counterparty,e.entry_number
      from cash_book.trip_advance a join cash_book.entry e on e.id=a.id
      where a.id=${id}::uuid and ${date}::date>=e.entry_date and a.amount=${spend}::numeric+${returned}::numeric
       and not exists(select 1 from cash_book.trip_settlement s where s.advance_id=a.id)
      for update of a`;
     if(!advance)throw Error("An open advance must equal the sum spent and returned, and the settlement cannot predate it.");
     const invoices=p.invoices??[];
     if(!Array.isArray(invoices)||invoices.length>30||
      invoices.some(invoice=>!/^[1-9]\d{0,17}$/.test(clean(invoice?.grv_id))||!amount.test(clean(invoice?.amount))||Number(invoice.amount)<=0)||
      new Set(invoices.map(invoice=>invoice.grv_id)).size!==invoices.length)
      throw Error("Select distinct verified invoices and enter positive amounts paid from the advance.");
     if(invoices.length){
      const [checked]=await tx`select count(*)::int as matched,sum(x.amount::numeric)<=${spend}::numeric as within_spend
       from jsonb_to_recordset(${tx.json(invoices)}::jsonb) x(grv_id text,amount text)
       join cash_book.verified_invoice_balance g on g.id=x.grv_id::bigint and g.town_trip_id=${advance.trip_id}::uuid
        and g.available>=x.amount::numeric and g.invoice_date<=${date}::date
        and (g.payment_currency is null or g.payment_currency=${advance.currency})`;
      if(checked.matched!==invoices.length||!checked.within_spend)
       throw Error("Invoice allocations must belong to this trip and fit the available invoice balances and trip spend.");
     }
     const returnId=Number(returned)>0?body.operation_id:null;
     if(returnId)await tx`insert into cash_book.entry(id,kind,currency,account_id,amount,entry_date,value_date,
       reference,narrative,counterparty,status,created_by,decided_by,decided_at)
      values(${returnId}::uuid,'receipt',${advance.currency},${advance.account_id}::uuid,${returned}::numeric,
       ${date}::date,${date}::date,${"TRIP-RETURN-"+advance.entry_number},'Unused Town Trip cash returned',
       ${advance.counterparty},'confirmed',${user.id}::uuid,${user.id}::uuid,now())`;
     await tx`insert into cash_book.trip_settlement(advance_id,id,spend,cash_returned,receipt_reference,return_entry_id,settled_date,settled_by)
      values(${id}::uuid,${body.operation_id}::uuid,${spend}::numeric,${returned}::numeric,${reference},
       ${returnId}::uuid,${date}::date,${user.id}::uuid)`;
     for(const invoice of invoices)await tx`insert into cash_book.trip_invoice_payment(advance_id,grv_id,amount)
       values(${id}::uuid,${invoice.grv_id}::bigint,${invoice.amount}::numeric)`;
     return {advance_id:id,return_entry_id:returnId};
    }
    if(body.action==="cash_book_account"){
     const name=clean(p.name),currency=clean(p.currency),date=clean(p.opening_date),opening=clean(p.opening_balance);
     if(!name||name.length>120||!["USD","ZiG"].includes(currency)||!iso.test(date)||!amount.test(opening.replace(/^-/,"")))
      throw Error("Enter an account name, currency, opening date and valid balance.");
     const [account]=await tx`insert into cash_book.account(id,name,currency,opening_date,opening_balance,created_by)
      values(${body.operation_id}::uuid,${name},${currency},${date}::date,${opening}::numeric,${user.id}::uuid) returning id,name`;
     return account;
    }
    if(["cash_book_draft","cash_book_labour_draft"].includes(body.action)){
     const labour=body.action==="cash_book_labour_draft";
     const kind=labour?"payment":clean(p.kind),account=clean(p.account_id),destination=clean(p.destination_id),value=clean(p.amount);
     const date=clean(p.entry_date),valueDate=clean(p.value_date),reference=clean(p.reference),narrative=clean(p.narrative),party=clean(p.counterparty);
     if(!["payment","receipt"].includes(kind)||!uuid.test(account)||!amount.test(value)||Number(value)<=0||
      !iso.test(date)||!iso.test(valueDate)||!reference||reference.length>120||!narrative||narrative.length>500||
      (!party||party.length>120||!!destination))
      throw Error("Complete the transaction details and enter a positive amount.");
     let labourRows:any[]=[];
     if(labour){
      const sources=p.sources,labourDate=clean(p.labour_date);
      if(!iso.test(labourDate)||date<labourDate||!Array.isArray(sources)||!sources.length||sources.length>100||
       sources.some(source=>!clean(source?.source_type)||!clean(source?.source_id))||
       new Set(sources.map(source=>JSON.stringify([source.source_type,source.source_id]))).size!==sources.length)
       throw Error("Select distinct labour rows and a valid payment date.");
      labourRows=await tx`select l.source_type::text,l.source_id::text,round(l.total_cost::numeric,2)::text as amount,
        sum(round(l.total_cost::numeric,2)) over()=${value}::numeric as total_matches
       from public.labour_v2_report_rows l join jsonb_to_recordset(${tx.json(sources)}::jsonb) s(source_type text,source_id text)
        on s.source_type=l.source_type::text and s.source_id=l.source_id::text
       where l.labour_date=${labourDate}::date and round(l.total_cost::numeric,2)>0 and not exists(
        select 1 from cash_book.labour_payment_source paid where paid.active and paid.source_type=s.source_type and paid.source_id=s.source_id)`;
      if(labourRows.length!==sources.length||!labourRows[0]?.total_matches)throw Error("Labour rows or totals changed. Reload before saving.");
     }
     const [entry]=await tx`insert into cash_book.entry(id,kind,currency,account_id,destination_id,amount,entry_date,value_date,
      reference,narrative,counterparty,created_by,status,decided_by,decided_at)
      select ${body.operation_id}::uuid,${kind},a.currency,a.id,null,${value}::numeric,${date}::date,${valueDate}::date,
       ${reference},${narrative},${party},${user.id}::uuid,
       'draft',null::uuid,null::timestamptz
      from cash_book.account a
      where a.id=${account}::uuid and a.active and a.opening_date<=least(${date}::date,${valueDate}::date)
      returning id,entry_number,status`;
     if(!entry)throw Error("Use an active account and dates on or after opening.");
     if(p.expense_allocations?.length){
      if(labour||kind!=="payment"||!Array.isArray(p.expense_allocations)||p.expense_allocations.length>30)throw Error("Choose valid Job Card expense lines for a payment.");
      for(const line of p.expense_allocations)await tx`insert into cash_book.job_expense(entry_id,part_id,amount) values(${entry.id}::uuid,${line.part_id}::bigint,${line.amount}::numeric)`;
     }
     for(const row of labourRows)await tx`insert into cash_book.labour_payment_source(entry_id,source_type,source_id,amount)
       values(${entry.id}::uuid,${row.source_type},${row.source_id},${row.amount}::numeric)`;
     return entry;
    }
    const entryId=clean(p.entry_id),decision=clean(p.decision);
    if(!uuid.test(entryId)||!["confirm","void","reverse"].includes(decision))throw Error("Select an entry and a valid action.");
    if(decision==="reverse"){
     const reason=clean(p.reason),date=clean(p.entry_date);
     if(!reason||reason.length>500||!iso.test(date))throw Error("Enter a reversal reason and date.");
     const [reversal]=await tx`insert into cash_book.entry(id,kind,currency,account_id,destination_id,amount,entry_date,value_date,
       reference,narrative,counterparty,status,created_by,decided_by,decided_at,reversal_of)
      select ${body.operation_id}::uuid,kind,currency,account_id,destination_id,amount,${date}::date,${date}::date,
       'REV-'||entry_number,${reason},counterparty,'confirmed',${user.id}::uuid,${user.id}::uuid,now(),id
      from cash_book.entry e where e.id=${entryId}::uuid and e.status='confirmed' and e.reversal_of is null
       and ${date}::date>=greatest(e.entry_date,e.value_date)
       and not exists(select 1 from cash_book.entry r where r.reversal_of=e.id)
       and not exists(select 1 from cash_book.trip_advance a where a.id=e.id)
       and not exists(select 1 from cash_book.trip_settlement s where s.return_entry_id=e.id)
      returning id,entry_number,status`;
     if(!reversal)throw Error("Select an unreversed confirmed entry and a valid reversal date.");
     await tx`update cash_book.labour_payment_source set active=false where entry_id=${entryId}::uuid`;
     return reversal;
    }
    if(decision==="confirm"){
     const [invoice]=await tx`select b.id is not null and b.available>=0 as eligible
       from cash_book.supplier_payment p left join cash_book.supplier_invoice_balance b on b.id=p.grv_id
       where p.entry_id=${entryId}::uuid`;
     if(invoice&&!invoice.eligible)throw Error("The verified invoice changed. Void this draft and check the outstanding amount.");
    }
    if(decision==="confirm"&&(await tx`select 1 from cash_book.labour_payment_source where entry_id=${entryId}::uuid limit 1`).length){
     const [changed]=await tx`select exists(select 1 from cash_book.labour_payment_source p
       left join public.labour_v2_report_rows l on l.source_type::text=p.source_type and l.source_id::text=p.source_id
       where p.entry_id=${entryId}::uuid and p.active and round(l.total_cost::numeric,2) is distinct from p.amount) as changed`;
     if(changed?.changed)throw Error("Labour totals changed. Void this draft and reload the labour records.");
    }
    const [entry]=await tx`update cash_book.entry set status=${decision==="confirm"?"confirmed":"voided"},
      decided_at=now(),decided_by=${user.id}::uuid where id=${entryId}::uuid and status='draft'
      returning id,entry_number,status`;
    if(!entry)throw Error("Only a draft can be confirmed or voided.");
    if(decision==="void")await tx`update cash_book.labour_payment_source set active=false where entry_id=${entryId}::uuid`;
    return entry;
   });
   return reply({success:true,result});
  }
  if(["edit_town_trip","finalise_town_trip"].includes(body?.action)){
   if(!access.is_admin)return reply({error:"Admin access required"},403);
   const trip=String(body.trip_id??"");
   const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
   if(!uuid.test(trip)||!uuid.test(String(body.operation_id??"")))return reply({error:"Select a Town Trip."},400);
   const result=await transaction(async tx=>{
    if(body.action==="finalise_town_trip"){
     const [row]=await tx`update stock_v2.town_trip t set finalised_at=now(),finalised_by=${user.id}::uuid
      where t.id=${trip}::uuid and not t.line_plan and t.finalised_at is null
       and not exists(select 1 from stock_v2.town_trip_order e where e.trip_id=t.id and e.outcome='pending')
      returning id,trip_number`;
     if(!row)throw Error("Report the outcome of every collection before finalising an open trip.");
     return row;
    }
    const date=String(body.trip_date??""),driver=String(body.driver_id??""),ids=body.order_ids;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!uuid.test(driver)||!Array.isArray(ids)||!ids.length||
     ids.length>30||ids.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length)
     throw Error("Select a driver, trip date and up to 30 orders.");
    const [row]=await tx`update stock_v2.town_trip t set trip_date=${date}::date,driver_id=${driver}::uuid
     where t.id=${trip}::uuid and not t.line_plan and t.finalised_at is null
      and exists(select from public.app_user_role r where r.user_id=${driver}::uuid and lower(r.role_name)='driver' union all select from stock_v2.buying_staff_role r where r.user_id=${driver}::uuid and r.role_name='driver')
      and (t.driver_id=${driver}::uuid or not exists(select 1 from stock_v2.town_trip_order e where e.trip_id=t.id and e.outcome<>'pending'))
     returning id,trip_number`;
    if(!row)throw Error("Trip is finalised, the driver is unavailable, or collections have already been reported.");
    const current=await tx`select order_id::float8,outcome from stock_v2.town_trip_order where trip_id=${trip}::uuid`;
    for(const entry of current.filter(entry=>!ids.includes(entry.order_id))){
     if(entry.outcome!=="pending")throw Error("Reported collections must stay on the trip.");
     await tx`delete from stock_v2.town_trip_order where trip_id=${trip}::uuid and order_id=${entry.order_id}`;
    }
    for(const id of ids.filter(id=>!current.some(entry=>entry.order_id===id))){
     const [entry]=await tx`insert into stock_v2.town_trip_order(trip_id,order_id)
      select ${trip}::uuid,h.order_id from stock_v2.order_header h where h.order_id=${id} and h.status='approved'
       and exists(select 1 from stock_v2.order_line l where l.order_id=h.order_id and l.ordered_quantity>l.received_quantity)
       and not exists(select 1 from stock_v2.town_trip_order e where e.order_id=h.order_id and e.outcome='pending')
      returning order_id`;
     if(!entry)throw Error("An added order is already assigned or no longer outstanding.");
    }
    return row;
   });
   return reply({success:true,result});
  }
  if(body?.action==="create_town_trip"||body?.action==="report_town_trip_order"){
   const creating=body.action==="create_town_trip";
   if(creating?!access.is_admin:!access.is_driver)return reply({error:creating?"Admin access required":"Driver access required"},403);
   const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
   if(!uuid.test(String(body.operation_id??"")))return reply({error:"Reload the trip to save a recoverable operation."},400);
   if(creating){
    const date=String(body.trip_date??""),driver=String(body.driver_id??""),ids=body.order_ids;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!uuid.test(driver)||!Array.isArray(ids)||!ids.length||
     ids.length>30||ids.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length)
     return reply({error:"Select a driver, trip date and up to 30 outstanding orders."},400);
    const result=await transaction(async tx=>{
     const [trip]=await tx`insert into stock_v2.town_trip(id,trip_date,driver_id,created_by)
       select ${body.operation_id}::uuid,${date}::date,${driver}::uuid,${user.id}::uuid
       where exists(select from public.app_user_role where user_id=${driver}::uuid and lower(role_name)='driver'
        union all select from stock_v2.buying_staff_role where user_id=${driver}::uuid and role_name='driver')
       returning id,trip_number`;
     if(!trip)throw Error("The selected driver no longer has Driver access.");
     for(const id of ids){
      const [entry]=await tx`insert into stock_v2.town_trip_order(trip_id,order_id)
       select ${trip.id}::uuid,h.order_id from stock_v2.order_header h where h.order_id=${id} and h.status='approved'
       and exists(select 1 from stock_v2.order_line l where l.order_id=h.order_id and l.ordered_quantity>l.received_quantity)
       and not exists(select 1 from stock_v2.town_trip_order e where e.order_id=h.order_id and e.outcome='pending')
       returning order_id`;
      if(!entry)throw Error("A selected order is already assigned or no longer outstanding.");
     }
     return trip;
    });
    return reply({success:true,result});
   }
   const trip=String(body.trip_id??""),id=body.order_id,outcome=body.outcome;
   const note=typeof body.note==="string"?body.note.trim():"";
   if(!uuid.test(trip)||!Number.isSafeInteger(id)||id<=0||!["collected","unavailable"].includes(outcome)
    ||note.length>500||(outcome==="unavailable"&&!note))
    return reply({error:"Select an outcome and explain any uncollected order."},400);
   const result=await transaction(async tx=>{
    const [entry]=await tx`update stock_v2.town_trip_order e set outcome=${outcome},driver_note=${note||null},
      checked_at=now(),checked_by=${user.id}::uuid from stock_v2.town_trip t
      where e.trip_id=t.id and t.id=${trip}::uuid and t.driver_id=${user.id}::uuid and e.order_id=${id}
      and e.outcome='pending' returning e.order_id,e.outcome`;
    if(!entry)throw Error("This order is unavailable on your checklist.");
    return entry;
   });
   return reply({success:true,result});
  }
  if(body?.action==="cancel_job_part_balance"){
   if(!access.is_buyer&&!access.is_admin)return reply({error:"Buyer or Admin access required"},403);
   const part=Number(body.part_id),quantity=body.quantity,reason=body.reason;
   if(!/^[-a-f0-9]{36}$/i.test(String(body.operation_id??""))||!Number.isSafeInteger(part)||part<=0||
     !Number.isFinite(quantity)||quantity<=0||typeof reason!=="string"||!reason.trim()||reason.trim().length>500)
     return reply({error:"Select an outstanding part and enter a cancellation reason."},400);
   const result=await transaction(async tx=>{
    const [row]=await tx`select stock_v2.cancel_job_part_balance(${user.id}::uuid,${part}::bigint,${quantity}::numeric,${reason}::text) as result`;
    return row.result;
   });
   return reply({success:true,result});
  }
  if(body?.action==="reserve_job_part"){
   if(!access.is_stock&&!access.is_buyer)return reply({error:"Stock or Buying access required"},403);
   const partId=Number(body.part_id),quantity=body.quantity_delta;
   if(!/^[-a-f0-9]{36}$/i.test(String(body.operation_id??""))||!Number.isSafeInteger(partId)||partId<=0||
    !Number.isFinite(quantity)||Math.abs(quantity)<0.000001||Math.abs(quantity)>100000)
    return reply({error:"Select a part and enter a valid quantity."},400);
   const result=await transaction(async tx=>{
    if(body.owner_code!=null){
     if(quantity<=0||typeof body.owner_code!=='string'||!body.owner_code)throw Error('Choose the company supplying the stock.');
     const assigned=await tx`update stock_v2.job_card_part p set owner_id=o.owner_id
       from stock_v2.issue_company o,stock_v2.item i,stock_v2.job_card j
       where p.id=${partId} and i.item_id=p.item_id and not i.buying_direct_expense and j.id=p.job_id and j.vehicle_id is null and j.closed_at is null
         and o.owner_code=${body.owner_code} and o.enabled and (p.owner_id is null or p.owner_id=o.owner_id)
       returning p.id`;
     if(!assigned.length)throw Error('The stock owner on this Job Card line has changed. Reopen the card.');
    }
    const [part]=await tx`select (p.requested_quantity-coalesce(u.issued_quantity,0))::float8 as requested,r.quantity::float8 as reserved,
      stock_v2.available_after_job_reservations(p.owner_id,p.item_id,loc.location_id)::float8 as available
      from stock_v2.job_card_part p join stock_v2.job_part_reserved r on r.part_id=p.id
      join stock_v2.item i on i.item_id=p.item_id
      left join stock_v2.job_part_usage u on u.part_id=p.id
      cross join stock_v2.location loc where p.id=${partId} and loc.location_code='TEST_WH' and not i.buying_direct_expense
      for update of p`;
    if(!part)throw Error("Job Card part is unavailable.");
    const remaining=part.reserved+quantity;
    if(remaining<0||remaining>part.requested)throw Error("Reservation must stay within the requested quantity.");
    if(quantity>0&&quantity>part.available)throw Error("There is insufficient unreserved stock for this part.");
    await tx`insert into stock_v2.job_part_reservation_event(id,part_id,quantity_delta,actor)
      values(${body.operation_id}::uuid,${partId},${quantity},${user.id}::uuid)`;
    return {part_id:partId,reserved:remaining};
   });
   return reply({success:true,result});
  }
  if(body?.action==="issue_job_part"){
   if(!access.is_stock&&!access.is_buyer)return reply({error:"Stock or Buying access required"},403);
   const partId=Number(body.part_id),quantity=body.quantity;
   if(!/^[-a-f0-9]{36}$/i.test(String(body.operation_id??""))||!Number.isSafeInteger(partId)||partId<=0||
    !Number.isFinite(quantity)||quantity<0.000001||quantity>100000)
    return reply({error:"Select a part and enter a valid issue quantity."},400);
   const result=await transaction(async tx=>{
    const [posted]=await tx`select stock_v2.post_job_part_issue(${body.operation_id}::uuid,${user.id}::uuid,${partId},${quantity}::numeric) as result`;
    return posted.result;
   });
   return reply({success:true,result});
  }
  if(body?.action==="record_job_quote"){
   if(!access.is_buyer&&!access.is_admin)return reply({error:"Buying access required"},403);
   const p=body.payload??{},partId=Number(p.part_id),supplierId=Number(p.supplier_id);
   const reference=typeof p.reference==="string"?p.reference.trim():"";
   if(!/^[-a-f0-9]{36}$/i.test(String(body.operation_id??""))||!Number.isSafeInteger(partId)||partId<=0||
    !Number.isSafeInteger(supplierId)||supplierId<=0||!reference||reference.length>120||
    !/^\d{4}-\d{2}-\d{2}$/.test(p.quote_date)||!["USD","ZiG"].includes(p.currency)||
    typeof p.unit_price!=="string"||!/^\d{1,14}(?:\.\d{1,4})?$/.test(p.unit_price)||Number(p.unit_price)<=0)
    return reply({error:"Select a part and supplier, then enter the quotation reference, date, currency and price."},400);
   const result=await transaction(async tx=>{
    const [quote]=await tx`insert into stock_v2.job_part_quote(id,part_id,supplier_id,quote_reference,quote_date,currency,unit_price,quoted_by)
      select ${body.operation_id}::uuid,p.id,s.supplier_id,${reference},${p.quote_date}::date,${p.currency},${p.unit_price}::numeric,${user.id}::uuid
      from stock_v2.job_card_part p join stock_v2.job_card j on j.id=p.job_id cross join stock_v2.supplier s where p.id=${partId} and s.supplier_id=${supplierId} and s.active
      and j.closed_at is null and not exists(select from stock_v2.job_part_cancellation c where c.part_id=p.id) returning id`;
    if(!quote)throw Error("Select an outstanding Job Card part and active supplier.");
    return quote;
   });
   return reply({success:true,result});
  }

  if(["create_job_category","save_job_catalogue_part","set_job_part_price"].includes(body?.action)){
   if(!access.is_buyer&&!access.is_admin)return reply({error:"Buyer or Admin access required"},403);
   if(!/^[-a-f0-9]{36}$/i.test(String(body.operation_id??"")))return reply({error:"Operation reference required"},400);
   const result=await transaction(async tx=>{
    const p=body.payload??{};
    if(body.action==="set_job_part_price"){
     if(p.unit_price!=null&&!p.price_supplier_id)throw Error("Choose a supplier for the Job Card item price.");
     const [row]=await tx`update stock_v2.job_card_part set unit_price=${p.unit_price??null}::numeric,price_supplier_id=${p.price_supplier_id??null}::bigint
       where id=${Number(p.part_id)} and exists(select from stock_v2.job_card j where j.id=job_id and j.closed_at is null) and (${p.unit_price??null}::numeric is null or ${p.unit_price??null}::numeric between 0 and 999999999)
       returning id`;
     if(!row)throw Error("Select an open Job Card and valid item price.");
     await tx`update stock_v2.job_card set work_description=work_description where id=(select job_id from stock_v2.job_card_part where id=${row.id})`;
     return row;
    }
    if(body.action==="create_job_category"){
     const name=String(p.name??"").trim();
     if(!["general","vehicle","implement","irrigation"].includes(p.group)||name.length<1||name.length>120)
      throw Error("Enter a category name.");
     const [row]=await tx`insert into stock_v2.buying_category(catalogue_group,category_name) values(${p.group},case when stock_v2.is_job_lubricant_category(${name}) then 'Lubricants' else ${name} end)
       on conflict(catalogue_group,lower(category_name)) do update set category_name=stock_v2.buying_category.category_name
       returning category_id::float8,category_name`;
     return row;
    }
    const [category]=await tx`select category_id,catalogue_group,category_name,stock_v2.is_job_lubricant_category(category_name) as stock_only from stock_v2.buying_category where category_id=${Number(p.category_id)}`;
    const name=String(p.name??"").trim(),number=String(p.part_number??"").trim(),unit=String(p.unit??"").trim();
    if(!category||name.length>150||number.length>100||unit.length>30||(!name&&!number&&!p.item_code))
     throw Error("Select a category and enter a part name or number.");
    if(category.stock_only){
     const [stock]=await tx`select item_code from stock_v2.job_lubricant_inputs where item_code=${p.item_code??null}`;
     if(!stock)throw Error("Choose an existing lubricant Stock Input. Add missing products in Stock Balances first.");
     return stock;
    }
    let [item]=await tx`select item_id,item_code,active,input_type from stock_v2.item
      where (${p.item_code??null}::text is not null and item_code=${p.item_code??null})
       or (${number}<>'' and (lower(buying_part_number)=lower(${number}) or lower(item_code)=lower(${number})))
       or (${number}='' and lower(item_name)=lower(${name}))
      order by (lower(buying_part_number)=lower(${number})) desc nulls last,item_id limit 1`;
    if(item&&!item.active)throw Error("This catalogue item is inactive.");
    if(item?.input_type==='Lubricants')throw Error('Select this Stock Input from the Lubricants category.');
    if(!item){
     if(!name||!unit)throw Error("Enter the part name and unit of measure.");
     [item]=await tx`insert into stock_v2.item(item_code,item_name,base_unit,input_type,input_category,buying_part_number)
      values(${"PART-"+String(body.operation_id)},${name},${unit},${category.catalogue_group==="general"?"General":"Parts"},
       ${category.category_name},${number||null}) returning item_id,item_code,input_type`;
     if(item.input_type==='Lubricants')throw Error('Add this lubricant in Stock Balances first.');
    }
    await tx`insert into stock_v2.buying_item_category(item_id,category_id) values(${item.item_id},${category.category_id}) on conflict do nothing`;
    return {item_code:item.item_code};
   });
   return reply({success:true,result});
  }
  if(body?.action==="finalise_job_card"){
   if(!access.is_buyer&&!access.is_admin)return reply({error:"Buyer or Admin required"},403);
   const result=await transaction(async tx=>{
    const [row]=await tx`update stock_v2.job_card j set closed_at=now(),closed_by=${user.id}::uuid
      where j.id=${body.id}::uuid and j.closed_at is null and j.xmin::text=${body.revision}
      and (${jobClearanceReason()}) is null
      returning id,job_number`;
    if(!row)throw Error("Reload the Job Card and clear its outstanding orders, items and expenses before finalising.");
    return row;
   });return reply({success:true,result});
  }
  if(body?.action==="create_job_card"||body?.action==="edit_job_card"){
   const editing=body.action==="edit_job_card";
   if(!access.is_buyer&&!(editing&&access.is_admin))return reply({error:"Buyer access required to create a Job Card"},403);
   const p=body.payload??{},vehicle=Number(p.vehicle_id??0),description=typeof p.work_description==="string"?p.work_description.trim():"";
   const parts=p.parts??[];
   if(!/^[-a-f0-9]{36}$/i.test(String(body.operation_id??""))||!Number.isSafeInteger(vehicle)||vehicle<0||
    !description||description.length>1000||!Array.isArray(parts)||parts.length>30||parts.some((part:any)=>
     !part||typeof part.item_code!=="string"||
     !Number.isFinite(part.quantity)||part.quantity<0.000001||part.quantity>100000||
     (part.unit_price!=null&&(!Number.isFinite(part.unit_price)||part.unit_price<0||part.unit_price>999999999))||
     (part.sample_details!=null&&(typeof part.sample_details!=="string"||part.sample_details.length>500))))
    return reply({error:"Select an asset and enter valid work and part details."},400);
   const result=await transaction(async tx=>{

    const kind=p.card_type??"asset", trace=Number(p.tracecode_id??0);
    if(!["asset","general","irrigation"].includes(kind)||
       (kind==="asset"?(!vehicle||!!trace):kind==="general"?(!!vehicle||!trace):((!!vehicle)===(!!trace))))
     throw Error("Choose the Job Card destination.");
    if(!parts.length)throw Error("Add at least one Job Card line.");
    const [job]=editing?await tx`update stock_v2.job_card set work_description=${description},transaction_date=${p.transaction_date}::date where id=${p.id}::uuid and closed_at is null and xmin::text=${p.revision} and vehicle_id is not distinct from ${vehicle||null}::bigint and tracecode_id is not distinct from ${trace||null}::bigint and card_type=${kind} returning id,job_number`:await tx`insert into stock_v2.job_card(id,vehicle_id,tracecode_id,card_type,work_description,transaction_date,requested_by)
      values(${body.operation_id}::uuid,${vehicle||null},${trace||null},${kind},${description},${p.transaction_date}::date,${user.id}::uuid) returning id,job_number`;
    if(!job)throw Error("This Job Card changed or was finalised. Reload it before editing.");
    if(editing){
      const old=await tx`select p.id::text,i.item_code,p.category_id::text,p.requested_quantity::float8,
        exists(select from stock_v2.job_purchase_line l where l.part_id=p.id)
        or exists(select from stock_v2.job_order_allocation a join stock_v2.approval_document d on d.id=a.document_id where a.part_id=p.id and d.status not in ('rejected','cancelled'))
        or exists(select from stock_v2.job_part_quote q where q.part_id=p.id)
        or exists(select from stock_v2.job_part_reservation_event r where r.part_id=p.id)
        or exists(select from cash_book.job_expense e where e.part_id=p.id)
        or exists(select from stock_v2.job_part_cancellation c where c.part_id=p.id)
        or exists(select from stock_v2.approval_document a where a.payload->>'source_job_card_id'=p.job_id::text and a.status not in ('cancelled','rejected') and exists(select from jsonb_array_elements(a.payload->'lines') x where x->>'item_code'=i.item_code)) as linked
        from stock_v2.job_card_part p join stock_v2.item i using(item_id) where p.job_id=${job.id}::uuid for update of p`;
      for(const prior of old){
        const next=parts.find((r:any)=>String(r.part_id)===prior.id);
        if(prior.linked&&(!next||next.item_code!==prior.item_code||String(next.category_id)!==prior.category_id||next.quantity!==prior.requested_quantity))throw Error("Keep the part and quantity of a line that already has a transaction or quote.");
        if(!next)await tx`delete from stock_v2.job_card_part where id=${prior.id}::bigint`;
      }
    }
    for(const part of parts){
      if(part.kind==="sample"||part.kind==="repair"){
       await tx`select stock_v2.save_supplier_line(${user.id}::uuid,${job.id}::uuid,${tx.json(part)}::jsonb)`;
       continue;
      }
      if(editing&&part.part_id){
        const [saved]=await tx`update stock_v2.job_card_part p set item_id=i.item_id,category_id=${part.category_id},requested_quantity=${part.quantity},unit_price=${part.unit_price??null},price_supplier_id=${part.price_supplier_id??null}::bigint,sample_details=${part.sample_details?.trim()||null},line_purpose=${part.line_purpose?.trim()||description}
          from stock_v2.item i where p.id=${part.part_id}::bigint and p.job_id=${job.id}::uuid and i.item_code=${part.item_code} and i.active returning p.id`;
        if(!saved)throw Error("Reload the Job Card before editing this line.");
        continue;
      }
      const [line]=await tx`insert into stock_v2.job_card_part(job_id,item_id,requested_quantity,sample_details,category_id,unit_price,price_supplier_id,line_purpose)
        select ${job.id}::uuid,item_id,${part.quantity},${part.sample_details?.trim()||null},${part.category_id},${part.unit_price??null},${part.price_supplier_id??null}::bigint,${part.line_purpose?.trim()||description}
        from stock_v2.item where item_code=${part.item_code} and active returning id`;
      if(!line)throw Error("Choose an active catalogue part.");
    }
    return job;
   });
   return reply({success:true,result});
  }
  const queueReceipt=async(id:string,payload:any)=>{
   body.operation_id=id;
   const result=await transaction(async tx=>{
    const replacesId=body.replaces_id??null;
    const tripId=body.town_trip_id??null;
    if(replacesId){
     const [source]=await tx`select id from stock_v2.receipt_verification
       where id=${replacesId}::uuid and submitted_by=${user.id}::uuid and status='returned'
       and receipt_action=${body.action}::text and town_trip_id is not distinct from ${tripId}::uuid for update`;
     if(!source)throw Error("This receipt is unavailable for correction.");
    }
    if(tripId){
     const lines=body.action==="multi_po_dnote"?payload.lines:body.action==="combined_grv"?payload.po_allocations:null;
     if(!Array.isArray(lines)||!lines.length)throw Error("Select collected purchase order lines for this trip.");
     const [checked]=await tx`select bool_and(exists(
       select 1 from stock_v2.order_line l join stock_v2.town_trip_order e using(order_id)
       where l.order_line_id=(line->>'order_line_id')::bigint and e.trip_id=${tripId}::uuid and e.outcome='collected'
     )) as allowed from jsonb_array_elements(${tx.json(lines)}::jsonb) as line`;
     if(!checked.allowed)throw Error("Every purchase order line must belong to a collected order on this trip.");
    }
    const [receipt]=await tx`insert into stock_v2.receipt_verification(id,receipt_action,payload,submitted_by,replaces_id,town_trip_id)
      values(${id}::uuid,${body.action}::text,${tx.json(payload)}::jsonb,${user.id}::uuid,${replacesId}::uuid,${tripId}::uuid)
      returning id,request_number,status`;
    return receipt;
   });
   return reply({success:true,result});
  };
  if(body?.action==="decide_receipt"){
   await db`select stock_v2.workflow_require(${user.id}::uuid,true)`;
   const id=String(body.receipt_id??"");
   const reason=typeof body.reason==="string"?body.reason.trim():"";
   if(!/^[-a-f0-9]{36}$/i.test(id)||!/^[-a-f0-9]{36}$/i.test(String(body.operation_id??""))
    ||!["verify","return"].includes(body.decision)||(body.decision==="return"&&reason.length<5))
    return reply({error:"Select a receipt and enter a reason when returning it."},400);
   const result=await transaction(async tx=>{
    await tx`select set_config('jspl.receiving_trip',t.id::text,true) from stock_v2.receipt_verification v join stock_v2.town_trip t on t.id=v.town_trip_id where v.id=${id}::uuid and t.line_plan`;
    const [row]=await tx`select stock_v2.buying_decide_receipt(${user.id}::uuid,${id}::uuid,${body.decision},${reason||null}) as posting`;
    const posting=row.posting;
    if(posting.document_id)posting.document_number=(await tx`select stock_v2.business_number(${posting.document_id}::bigint) as number`)[0].number;
    return body.decision==="return"?{id,status:"returned"}:{id,status:"posted",posting};
   });
   return reply({success:true,result});
  }
  if(body?.action==='product_save'){
   const p=body.payload??{},code=String(p.item_code??'').trim();
   if(code?!access.is_admin:!(access.is_admin||access.is_stock))return reply({error:'Product creation requires Stock access; editing requires Admin access'},403);
   if(!/^[-a-f0-9]{36}$/i.test(String(body.operation_id??'')))return reply({error:'Reload the form to use a recoverable save'},400);
   const clean=(v:any)=>String(v??'').trim().replace(/\s+/g,' ');
   const name=clean(p.item_name),type=clean(p.input_type),category=clean(p.input_category),unit=clean(p.base_unit),pastel=clean(p.pastel_stock_code);
   const chemical=/^chemicals?$/i.test(type),actives=p.actives;
   if(!name||name.length>200||!type||type.length>100||!category||category.length>100||!unit||(!code&&unit==='UNVERIFIED')||unit.length>30||pastel.length>100)return reply({error:'Enter Type, Category, Product Name and a confirmed Unit of Measure'},400);
   if(!Array.isArray(actives)||actives.length>20||(!chemical&&actives.length)||chemical&&!code&&(!actives.length||!/^l(t|ts|itre(s)?)?$|^kg(s)?$/i.test(unit)))return reply({error:'New Chemicals require active ingredients and a litre or kilogram unit; other Types cannot have actives'},400);
   const normalized=actives.map((a:any)=>({name:clean(a.name),amount:Number(a.amount),unit:unit==='UNVERIFIED'?String(a.unit):/kg/i.test(unit)?'g/kg':'g/L'}));
   if(normalized.some((a:any)=>!a.name||a.name.length>150||!Number.isFinite(a.amount)||a.amount<=0||!['g/L','g/kg'].includes(a.unit))||new Set(normalized.map((a:any)=>a.name.toLowerCase())).size!==normalized.length)return reply({error:'Each active needs a unique name and positive concentration'},400);
   const result=await transaction(async tx=>{
    const found=code?await tx`select i.*,coalesce(m.version,0) as version,m.pastel_stock_code from stock_v2.item i left join stock_v2.product_metadata m using(item_id) where i.item_code=${code} for update of i`:[];
    if(code&&!found.length)throw Error('Product not found');
    if(code&&(Number(p.version)!==Number(found[0].version)))throw Error('Product changed since this form opened. Reopen Edit Product before saving.');
    if(code&&unit!==found[0].base_unit)throw Error('Existing stock units cannot be changed here');
    const duplicates=await tx`select item_code from stock_v2.item where lower(regexp_replace(btrim(item_name),'[[:space:]]+',' ','g'))=lower(${name}) and item_code<>${code}`;
    if(duplicates.length)throw Error('A product with this name already exists. Use the existing product.');
    const matchingCategory=await tx`select 1 from stock_v2.item where input_type=${type} and input_category=${category} limit 1`;
    if(!matchingCategory.length)throw Error('Choose a Category belonging to the selected Type');
    const oldActives=code?await tx`select active_name as name,concentration::text as amount,concentration_unit as unit from stock_v2.item_active_ingredient where item_id=${found[0].item_id} order by id`:[];
    const old=code?{...found[0],actives:oldActives}:null;
    const itemCode=code||'P-'+body.operation_id;
    const saved=code?await tx`update stock_v2.item set item_name=${name},input_type=${type},input_category=${category},active_ingredient=${normalized.map((a:any)=>a.name).join(' + ')||null} where item_code=${code} returning item_id`:
     await tx`insert into stock_v2.item(item_code,item_name,input_type,input_category,base_unit,active_ingredient) values(${itemCode},${name},${type},${category},${unit},${normalized.map((a:any)=>a.name).join(' + ')||null}) returning item_id`;
    const itemId=saved[0].item_id;
    await tx`insert into stock_v2.product_metadata(item_id,pastel_stock_code,version) values(${itemId},${pastel||null},1) on conflict(item_id) do update set pastel_stock_code=excluded.pastel_stock_code,version=product_metadata.version+1`;
    await tx`delete from stock_v2.item_active_ingredient where item_id=${itemId}`;
    for(const a of normalized)await tx`insert into stock_v2.item_active_ingredient(item_id,active_name,concentration,concentration_unit,updated_by) values(${itemId},${a.name},${a.amount},${a.unit},${user.id}::uuid)`;
    const version=Number(found[0]?.version??0)+1;
    const product={item_code:itemCode,item_name:name,input_type:type,input_category:category,base_unit:unit,pastel_stock_code:pastel||null,actives:normalized.map((a:any)=>({...a,amount:String(a.amount)})),version,active:found[0]?.active??true};
    await tx`insert into stock_v2.product_audit(item_id,actor,operation_id,old_values,new_values) values(${itemId},${user.id}::uuid,${body.operation_id}::uuid,${tx.json(old)}::jsonb,${tx.json(product)}::jsonb)`;
    await tx`insert into stock_v2.item_active_ingredient_audit(item_id,actor,old_ingredients,new_ingredients) values(${itemId},${user.id}::uuid,${tx.json(oldActives)}::jsonb,${tx.json(normalized)}::jsonb)`;
    return {product};
   });return reply({success:true,result});
  }
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
    if(['spray','spray_edit'].includes(body.action)){
     const payload=body.payload;
     if(!payload||!(await tx`select 1 from stock_v2.issue_company where enabled and owner_code=${payload.owner_code??'JS'}`).length)throw Error('Choose a company enabled to own stock.');
     const products=await tx`select i.item_code,i.item_name as inputs_name,i.base_unit,i.formulation_type,
       coalesce(q.quantity,0)::float8 as quantity,coalesce(aq.quantity,0)::float8 as ao_quantity,coalesce(ib.owner_quantities,'{}'::jsonb) as owner_quantities,
       coalesce((select jsonb_agg(jsonb_build_object('name',a.active_name,'amount',a.concentration::float8,'unit',a.concentration_unit)) from stock_v2.item_active_ingredient a where a.item_id=i.item_id),'[]'::jsonb) as actives
       from stock_v2.item i left join stock_v2.issue_item_balances ib using(item_id)
       left join stock_v2.quantity_balance q on q.item_id=i.item_id and q.owner_id=(select owner_id from stock_v2.owner where owner_code='TEST_JS') and q.location_id=(select location_id from stock_v2.location where location_code='TEST_WH')
       left join stock_v2.quantity_balance aq on aq.item_id=i.item_id and aq.owner_id=(select owner_id from stock_v2.owner where owner_code='TEST_AO') and aq.location_id=(select location_id from stock_v2.location where location_code='TEST_WH') where i.active`;
     const groups=payload.allocation_groups;
     if(groups){
      const expected=allocateSpray(groups,products,Number(payload.area_ha),payload.owner_code??'JS');
      if(!Array.isArray(payload.lines)||expected.length!==payload.lines.length||expected.some(r=>{const l=payload.lines.find((l:any)=>l.item_code===r.item_code);return !l||!Number.isFinite(Number(l.rate_per_ha))||Math.abs(Number(l.rate_per_ha)-r.rate_per_ha)>1e-10}))throw Error('Stock or allocations changed. Refresh owner balances and review the spray before saving.');
     }else{
      // Older callers may retain ordinary single-brand plans, but cannot bypass duplicate-active checks.
      const legacy=(payload.lines??[]).map((l:any)=>({input:products.find((p:any)=>p.item_code===l.item_code)?.inputs_name,rate:String(l.rate_per_ha)}));
      allocateSpray(legacy,products,Number(payload.area_ha),payload.owner_code??'JS');
     }
    }
    if(body.action==='spray_return')return (await tx`select stock_v2.demo_return_spray(${tx.json(body.payload)}::jsonb) as result`)[0].result;
    if(body.action==='spray_edit')return (await tx`select stock_v2.demo_edit_spray(${Number(body.payload.job_id)}::bigint,${tx.json(body.payload)}::jsonb) as result`)[0].result;
    return (await tx`select stock_v2.demo_multi(${body.action}::text,${body.operation_id}::uuid,${tx.json(body.payload)}::jsonb) as result`)[0].result;
   });return reply({success:true,result});
  }
  if(body?.action==="workflow_command"){
   if(body.command==="cancel"){
    const [grouped]=await db`select id from stock_v2.approval_document where id=${body.data?.id}::uuid and payload->>'job_requirements'='true' and status='applied'`;
    if(grouped){const result=await transaction(async tx=>(await tx`select stock_v2.job_requirements_command(${user.id}::uuid,'cancel_order',${tx.json(body.data)}::jsonb) as result`)[0].result);return reply({success:true,result});}
   }
   if(body.command==="authorise_po"){
    const basis=body.data?.payment_basis;
    if(!["Cash","Transfer","Account"].includes(basis)||typeof body.data?.payment_terms!=="string"||!(body.data.payment_terms===basis||body.data.payment_terms.startsWith(basis+" · ")))return reply({error:"Select Cash, Transfer or Account before authorising."},400);
    const [grouped]=await db`select id from stock_v2.approval_document where id=${body.data?.id}::uuid and payload->>'job_requirements'='true'`;
    if(grouped){
     const result=await transaction(async tx=>(await tx`select stock_v2.job_requirements_command(${user.id}::uuid,'authorise',${tx.json(body.data)}::jsonb) as result`)[0].result);
     return reply({success:true,result});
    }
    const paymentTerms=typeof body.data?.payment_terms==="string"?body.data.payment_terms.trim():"";
    if(!paymentTerms||paymentTerms.length>200)return reply({error:"Enter payment terms (up to 200 characters)."},400);
    const [order]=await db`select stock_v2.buying_authorise_po(${user.id}::uuid,${body.operation_id}::uuid,${db.json(body.data)}::jsonb) as result`;
    return reply({success:true,result:order.result});
   }
   if(["save","submit"].includes(body.command)&&body.data?.kind==="po"&&body.data.payload?.source_job_card_id){
    const [row]=await db.begin(async tx=>{
     await tx`select pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'))`;
     const [closed]=await tx`select from stock_v2.job_card where id=${body.data.payload.source_job_card_id}::uuid and closed_at is not null
       and not exists(select from stock_v2.approval_operation where id=${body.operation_id}::uuid and actor=${user.id}::uuid)`;
     if(closed)throw Error("This Job Card has been cleared.");
     return await tx`select stock_v2.buying_workflow_command(${user.id}::uuid,${body.operation_id}::uuid,${body.command}::text,${tx.json(body.data)}::jsonb) as result`;
    });
    return reply({success:true,result:row.result});
   }
   const rows=await db`select stock_v2.buying_workflow_command(${user.id}::uuid,${body.operation_id}::uuid,${body.command}::text,${db.json(body.data)}::jsonb) as result`;
   return reply({success:true,result:rows[0].result});
  }
  if(body?.action==="workflow_correct_grv"||body?.action==="workflow_correct_physical"){
   const rows=body.action==="workflow_correct_grv"?await db`select stock_v2.workflow_correct_grv(${user.id}::uuid,${body.operation_id}::uuid,${db.json(body.payload)}::jsonb) as result`:await db`select stock_v2.workflow_correct_physical(${user.id}::uuid,${body.operation_id}::uuid,${db.json(body.payload)}::jsonb) as result`;
   return reply({success:true,result:rows[0].result});
  }
  if(body?.action==="save_irrigation_vehicle"){
   if(!access.can_main)return reply({error:"Vehicle Admin access required"},403);
   const p=body.vehicle,vehicleId=body.vehicle_id??null,farmId=body.farm_id??null;
   if(!p?.vehicle_name?.trim()||!["DIESEL","PETROL","NONE"].includes(p.fuel_type))return reply({error:"Check the equipment name and fuel type."},400);
   const result=await transaction(async tx=>{
    const [type]=await tx`select concat_ws(' ',type_name,type_code) ~* 'pump|pivot' as fixed from public.vehicle_type where vehicle_type_id=${p.vehicle_type_id}`;
    if(!type?.fixed&&!vehicleId)throw Error("Choose a pump or pivot.");
    if(vehicleId){
     const [old]=await tx`select stock_v2.job_asset_group(vehicle_id) as catalogue_group from public.vehicle where vehicle_id=${vehicleId}::bigint for update`;
     if(!old||(!type?.fixed&&old.catalogue_group!=="irrigation"))throw Error("Choose a registered irrigation asset.");
     const [mapping]=await tx`select farm_id::float8 from stock_v2.irrigation_asset_farm where vehicle_id=${vehicleId}::bigint`;
     if((mapping?.farm_id??null)!==(body.previous_farm_id??null))throw Error("The farm assignment changed. Reload the equipment.");
    }
    if(farmId&&(!type?.fixed||!(await tx`select 1 from public.farm where farm_id=${farmId} and (active or farm_id=${body.previous_farm_id??null}::bigint) for share`).length))throw Error("Select an active farm for this pump or pivot.");
    const permitted=["fuel_type","vehicle_name","ownership_status","owner_company_id","hire_supplier_id","vehicle_model","vehicle_assignment_id","tractor_size","consumption","vehicle_discontinued","has_meter","meter_type","vehicle_type_id","tractor_class_id"];
    const values=Object.fromEntries(permitted.map(key=>[key,p[key]??null]));
    const [vehicle]=vehicleId
      ?await tx`update public.vehicle set ${tx(values,permitted)} where vehicle_id=${vehicleId}::bigint returning vehicle_id`
      :await tx`insert into public.vehicle ${tx(values,permitted)} returning vehicle_id`;
    if(farmId)await tx`insert into stock_v2.irrigation_asset_farm(vehicle_id,farm_id) values(${vehicle.vehicle_id},${farmId}) on conflict(vehicle_id) do update set farm_id=excluded.farm_id`;
    else await tx`delete from stock_v2.irrigation_asset_farm where vehicle_id=${vehicle.vehicle_id}`;
    return vehicle;
   });return reply({success:true,result});
  }
  if(body?.action==="buying_staff_assign"){
   await db`select stock_v2.workflow_require(${user.id}::uuid,true)`;
   if(!access.can_main||!["buyer","driver"].includes(body.role_name)||typeof body.active!=="boolean"||!body.reason?.trim())return reply({error:"Choose a responsibility, status and reason."},400);
   const result=await transaction(async tx=>{
     if(body.active)await tx`insert into stock_v2.buying_staff_role(user_id,role_name,assigned_by) values(${body.user_id}::uuid,${body.role_name},${user.id}::uuid) on conflict do nothing`;
     else {
      await tx`delete from stock_v2.buying_staff_role where user_id=${body.user_id}::uuid and role_name=${body.role_name}`;
      await tx`delete from public.app_user_role where user_id=${body.user_id}::uuid and lower(role_name)=${body.role_name} and lower(role_name) in ('buyer','driver')`;
     }
     return {saved:true};
   });
   return reply({success:true,result});
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
   return await queueReceipt(id,p);
  }
  if(body?.action==="multi_po_dnote"){
   const p=body.payload??{},id=String(body.operation_id??body.request_id??"");
   if(!/^[-a-f0-9]{36}$/i.test(id)||!Array.isArray(p.lines)||!p.lines.length)return reply({error:"Valid request and purchase order lines required"},400);
   return await queueReceipt(id,p);
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
   return await queueReceipt(id,p);
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
    const jobs=await tx`select job_id from stock_v2.spray_job where job_id=${jobId} and status='planned' and owner_id in (select owner_id from stock_v2.issue_company) for update`;
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
  if(body.action==="grv"||body.action==="direct_grv")return await queueReceipt(body.operation_id??body.request_id,body.payload);
  const result=await db`select stock_v2.demo_multi(${body.action}::text,${body.request_id}::uuid,${db.json(body.payload)}::jsonb) as result`;
  return reply({success:true,result:result[0].result});
 }catch(e){return reply({error:e instanceof Error?e.message:"Posting failed"},400)}
 finally{await db.end({timeout:2})}
});
