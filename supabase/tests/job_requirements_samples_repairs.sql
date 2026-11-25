begin;
-- Run in a transaction and roll back all operational rows.
do $test$
declare buyer uuid; admin_user uuid; stores uuid; driver uuid; j uuid; j2 uuid; vehicle bigint;
 cat bigint; supp bigint; own text; sample bigint; repair bigint; sample2 bigint; other bigint; doc stock_v2.approval_document;
 demand jsonb; approved jsonb; submitted jsonb; received jsonb; seen int; numbered text; denied boolean; old_payload jsonb; repair_ol bigint;
begin
 select user_id into strict buyer from public.app_user_role where role_name='buyer' limit 1;
 select user_id into strict stores from public.app_user_role where role_name='stock' limit 1;
 select user_id into strict admin_user from public.app_user_role where role_name='admin' limit 1;
 select user_id into strict driver from public.app_user_role where role_name='driver' limit 1;
 select v.vehicle_id,c.stock_owner_code into strict vehicle,own from public.vehicle v join public.company c on c.company_id=v.owner_company_id join stock_v2.issue_company ic on ic.owner_code=c.stock_owner_code and ic.enabled
 where v.ownership_status='owned' and not v.vehicle_discontinued and stock_v2.job_asset_group(v.vehicle_id)='vehicle' limit 1;
 select category_id into strict cat from stock_v2.buying_category where catalogue_group='vehicle' and not stock_v2.is_job_lubricant_category(category_name) limit 1;
 select supplier_id into strict supp from stock_v2.supplier where active limit 1;
 select supplier_id into strict other from stock_v2.supplier where active and supplier_id<>supp limit 1;
 insert into stock_v2.job_card(id,vehicle_id,card_type,work_description,transaction_date,requested_by) values(gen_random_uuid(),vehicle,'asset','Layout audit job',current_date,buyer) returning id into j;
 insert into stock_v2.job_card(id,vehicle_id,card_type,work_description,transaction_date,requested_by) values(gen_random_uuid(),vehicle,'asset','Second audit job',current_date,buyer) returning id into j2;
 demand:=jsonb_build_object('kind','sample','category_id',cat,'sample_details','Outer bearing','quantity',1,'supplier_id',supp);
 insert into stock_v2.item(item_code,item_name,base_unit,input_type,input_category) values('TEST-P-'||j,'Test bought filter','each','Parts','Filters') returning item_id into seen;
 insert into stock_v2.buying_item_category(item_id,category_id) values(seen,cat);
 insert into stock_v2.job_card_part(job_id,item_id,requested_quantity,category_id,line_purpose,unit_price,price_supplier_id)
 values(j,seen,2,cat,'Stock part for the same supplier',4,supp);
 sample:=stock_v2.save_supplier_line(buyer,j,demand);
 sample2:=stock_v2.save_supplier_line(buyer,j,demand||jsonb_build_object('sample_details','Inner bearing','supplier_id',other));
 repair:=stock_v2.save_supplier_line(buyer,j2,demand||jsonb_build_object('kind','repair','sample_details','Starter motor'));
 if (select count(distinct ref) from stock_v2.job_supplier_line where job_id in (j,j2))<>3 then raise exception 'Duplicate sample reference';end if;
 perform stock_v2.job_requirements_command(buyer,'dispatch',jsonb_build_object('key','S'||sample,'date',current_date,'supplier_id',supp));
 perform stock_v2.job_requirements_command(buyer,'dispatch',jsonb_build_object('key','S'||repair,'date',current_date,'supplier_id',supp));
 perform stock_v2.job_requirements_command(buyer,'dispatch',jsonb_build_object('key','S'||sample2,'date',current_date,'supplier_id',other));
 perform stock_v2.job_requirements_command(buyer,'quote',jsonb_build_object('key','S'||repair,'supplier_id',supp,'reference','Q1','work','Rebuild','unit_price',75));
 select jsonb_build_object('date',current_date,'lines',jsonb_agg(jsonb_build_object('key',key,'owner',own,'supplier_id',supplier_id,'unit_price',unit_price,'quantity',1))) into demand from stock_v2.job_requirements where job_id in (j,j2);
 submitted:=stock_v2.job_requirements_command(buyer,'submit',demand);
 if jsonb_array_length(submitted->'requests')<>2 then raise exception 'Wrong supplier grouping';end if;
 denied:=false;begin perform stock_v2.job_requirements_command(buyer,'submit',demand);exception when others then denied:=true;end;if not denied then raise exception 'Duplicate ordering allowed';end if;
 select * into strict doc from stock_v2.approval_document where id=(select document_id from stock_v2.job_order_allocation where supplier_line_id=sample);
 if jsonb_array_length(doc.payload->'lines')<>3 then raise exception 'Different Job Cards did not group';end if;
 demand:=jsonb_build_object('id',doc.id,'version',doc.version,'payment_terms','30 days');
 denied:=false;begin perform stock_v2.job_requirements_command(buyer,'authorise',demand);exception when others then denied:=true;end;if not denied then raise exception 'Buyer approved own order';end if;
 approved:=stock_v2.job_requirements_command(admin_user,'authorise',demand);
 old_payload:=approved->'payload';
 select jsonb_build_object('order_id',approved->'target_order_id','date',current_date,'invoice_number','TEST-'||j,'lines',
 jsonb_agg(jsonb_build_object('order_line_id',a.order_line_id,'quantity',1,'unit_price',case when a.supplier_line_id=repair then 75 when a.part_id is not null then 4 else 12 end,'marking','TEST-MARK'))) into demand from stock_v2.job_order_allocation a where a.document_id=doc.id;
 denied:=false;begin perform stock_v2.job_delivery_command(driver,'receive',demand);exception when others then denied:=true;end;if not denied then raise exception 'Driver received stock';end if;
 received:=stock_v2.job_delivery_command(stores,'receive',demand);
 demand:=jsonb_build_object('receipt_id',received->'id','numbers',jsonb_build_object((select order_line_id::text from stock_v2.job_order_allocation where supplier_line_id=sample),'TEST-'||j));
 denied:=false;begin perform stock_v2.job_delivery_command(stores,'verify',demand);exception when others then denied:=true;end;if not denied then raise exception 'Stores verified receipt';end if;
 perform stock_v2.job_delivery_command(admin_user,'verify',demand);
 if (select payload from stock_v2.approval_document where id=doc.id)<>old_payload then raise exception 'Approval changed on receipt';end if;
 if (select sum(verified_cost) from stock_v2.job_requirements where job_id in(j,j2))<>87 then raise exception 'Job costs incorrect';end if;
 if not exists(select from cash_book.supplier_invoice_balance where invoice_number='TEST-'||j and available=91) then raise exception 'Invoice missing from Cash Book';end if;
 if not exists(select from stock_v2.job_requirements where job_id=j and kind='part' and remaining=1) then raise exception 'Partial quantity was lost';end if;
 if not exists(select from stock_v2.quantity_balance where item_id=seen and quantity=1) then raise exception 'Regular stock receipt not posted';end if;
 if exists(select from stock_v2.movement m join stock_v2.document_line dl on dl.line_id=m.document_line_id where dl.item_id=(select item_id from stock_v2.job_supplier_line where id=sample)) then raise exception 'Sample delivery created warehouse stock';end if;
 if (select returned_on from stock_v2.job_supplier_line where id=repair) is null then raise exception 'Repair not returned';end if;
 -- Declined repair remains with its supplier until Stores records its return.
 repair:=stock_v2.save_supplier_line(buyer,j2,jsonb_build_object('kind','repair','category_id',cat,'sample_details','Declined repair','quantity',1,'supplier_id',other));
 perform stock_v2.job_requirements_command(buyer,'dispatch',jsonb_build_object('key','S'||repair,'date',current_date,'supplier_id',other));
 perform stock_v2.job_requirements_command(buyer,'decline',jsonb_build_object('key','S'||repair));
 if (select returned_on from stock_v2.job_supplier_line where id=repair) is not null then raise exception 'Decline automatically returned an item';end if;
 perform stock_v2.job_requirements_command(stores,'return_item',jsonb_build_object('key','S'||repair,'date',current_date));
 if (select returned_on from stock_v2.job_supplier_line where id=repair) is null then raise exception 'Stores return missing';end if;
end $test$;
rollback;
