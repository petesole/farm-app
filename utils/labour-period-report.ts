export type LabourMode='daily'|'weekly'|'monthly';
export type LabourIndex={source_type:string;source_id:number|string;labour_date:string;labour_week:string;report_farm:string;crop_name:string;tracecode_id:number|string;tracecode_name:string};
export type LabourEntry=LabourIndex&{activity_id:number|string;activity_name:string;labour_qty:number|string|null;total_cost:number|string|null};
export type LabourSelection={mode:LabourMode;period:string;farm:string;crop:string;trace:string};
export type LabourLine={labour_date:string;report_farm:string;crop_name:string;tracecode_name:string;activity_name:string;labour_qty:number|string;total_cost:number|string;status:string;_kind:'detail'|'subtotal';entries:number};
export const labourIndexColumns='source_type,source_id,labour_date,labour_week,report_farm,crop_name,tracecode_id,tracecode_name';
export const labourEntryColumns=labourIndexColumns+',activity_id,activity_name,labour_qty,total_cost';
export const labourColumns=[{label:'Date / Period',field:'labour_date'},{label:'Farm',field:'report_farm'},{label:'Crop',field:'crop_name'},{label:'Trace',field:'tracecode_name'},{label:'Allocation',field:'activity_name'},{label:'Qty',field:'labour_qty'},{label:'Value',field:'total_cost'},{label:'Status',field:'status'}];
const numeric=(v:unknown)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function labourTotals(rows:LabourEntry[]){return rows.reduce((s,r)=>{const qty=numeric(r.labour_qty),value=numeric(r.total_cost);s.qty+=qty??0;s.value+=value??0;s.missingQty+=qty===null?1:0;s.missingValue+=value===null?1:0;s.entries++;return s},{qty:0,value:0,missingQty:0,missingValue:0,entries:0})}
export function labourPeriod(row:LabourIndex,mode:LabourMode){return mode==='daily'?row.labour_date:mode==='weekly'?row.labour_week:row.labour_date.slice(0,7)}
export function labourMatches(row:LabourIndex,s:LabourSelection,omit?:'period'|'farm'|'crop'|'trace'){
 return (omit==='period'||!s.period||labourPeriod(row,s.mode)===s.period)&&(omit==='farm'||!s.farm||row.report_farm===s.farm)&&(omit==='crop'||!s.crop||row.crop_name===s.crop)&&(omit==='trace'||!s.trace||String(row.tracecode_id)===s.trace);
}
export function labourOptions(rows:LabourIndex[],s:LabourSelection,key:'period'|'farm'|'crop'|'trace'){
 const values=new Map<string,string>();for(const row of rows.filter(r=>labourMatches(r,s,key))){const id=key==='period'?labourPeriod(row,s.mode):key==='farm'?row.report_farm:key==='crop'?row.crop_name:String(row.tracecode_id);const label=key==='trace'?row.tracecode_name:id;if(id)values.set(id,label)}
 return [...values].map(([id,label])=>({id,label})).sort((a,b)=>key==='period'?b.id.localeCompare(a.id):a.label.localeCompare(b.label,'en',{numeric:true}));
}
export function repairLabourSelection(rows:LabourIndex[],selection:LabourSelection){
 const next={...selection};for(const key of ['trace','crop','farm'] as const){if(next[key]&&!labourOptions(rows,next,key).some(x=>x.id===next[key]))next[key]=''}return next;
}
function line(rows:LabourEntry[],s:LabourSelection,label?:string,level?:'trace'|'crop'|'farm'):LabourLine{
 const first=rows[0],t=labourTotals(rows);
 const status=[t.missingQty?`Missing Qty: ${t.missingQty}`:'',t.missingValue?`Missing Value: ${t.missingValue}`:''].filter(Boolean).join('; ');
 return {labour_date:label?'':s.mode==='daily'?first.labour_date:s.mode==='weekly'?'Week '+s.period:s.period,
  report_farm:first.report_farm,crop_name:level==='farm'?'':first.crop_name,tracecode_name:level==='farm'||level==='crop'?'':first.tracecode_name,activity_name:label??first.activity_name,
  labour_qty:t.missingQty===t.entries?'Not recorded':t.qty,total_cost:t.missingValue===t.entries?'Not recorded':t.value,status,_kind:label?'subtotal':'detail',entries:t.entries};
}
export function buildLabourReport(rows:LabourEntry[],s:LabourSelection){
 const selected=rows.filter(r=>labourMatches(r,s));
 const groups=(data:LabourEntry[],key:(r:LabourEntry)=>string)=>{const map=new Map<string,LabourEntry[]>();for(const row of data){const k=key(row);map.set(k,[...(map.get(k)??[]),row])}return [...map].sort(([a],[b])=>a.localeCompare(b,'en',{numeric:true})).map(([,v])=>v)};
 const output:LabourLine[]=[];
 for(const farm of groups(selected,r=>r.report_farm)){
  for(const crop of groups(farm,r=>r.crop_name)){
   for(const trace of groups(crop,r=>r.tracecode_name+'|'+r.tracecode_id)){
    if(s.mode==='daily')for(const row of [...trace].sort((a,b)=>a.activity_name.localeCompare(b.activity_name)||String(a.source_id).localeCompare(String(b.source_id),'en',{numeric:true})))output.push(line([row],s));
    else for(const activity of groups(trace,r=>r.activity_name+'|'+r.activity_id))output.push(line(activity,s));
    output.push(line(trace,s,'Trace total','trace'));
   }
   output.push(line(crop,s,'Crop total','crop'));
  }
  output.push(line(farm,s,'Farm total','farm'));
 }
 return {rows:output,totals:labourTotals(selected),sourceRows:selected.length};
}
// Read every page in a stable source order. Never export a silently truncated report.
export async function loadLabourPages(client:any,columns:string,selection?:LabourSelection){
 const rows:any[]=[],seen=new Set<string>();const size=1000;let expected:number|null=null;
 for(let offset=0;;offset+=size){
  let query=client.from('labour_v2_report_rows').select(columns,offset===0?{count:'exact'}:undefined);
  if(selection){const s=selection;if(!s.period)throw Error('Choose a report period');
   if(s.mode==='daily')query=query.eq('labour_date',s.period);else if(s.mode==='weekly')query=query.eq('labour_week',s.period);else{const [y,m]=s.period.split('-').map(Number);const next=m===12?`${y+1}-01-01`:`${y}-${String(m+1).padStart(2,'0')}-01`;query=query.gte('labour_date',s.period+'-01').lt('labour_date',next)}
   if(s.farm)query=query.eq('report_farm',s.farm);if(s.crop)query=query.eq('crop_name',s.crop);if(s.trace)query=query.eq('tracecode_id',s.trace);
  }
  const result=await query.order('source_type').order('source_id').range(offset,offset+size-1);if(result.error)throw Error(result.error.message||'Unable to load labour report');if(!Array.isArray(result.data))throw Error('Labour data was not returned');
  if(offset===0)expected=Number.isInteger(result.count)?result.count:null;
  for(const row of result.data){const key=row.source_type+':'+row.source_id;if(seen.has(key))throw Error('Labour records changed between pages. Refresh and reopen the report.');seen.add(key)}
  rows.push(...result.data);if(expected!==null&&rows.length>expected)throw Error('Labour records changed while loading. Refresh and reopen the report.');if(result.data.length<size)break;
 }
 if(expected!==null&&expected!==rows.length)throw Error('Labour records changed while loading. Refresh and reopen the report.');
 if(new Set(rows.map(r=>r.source_type+':'+r.source_id)).size!==rows.length)throw Error('Labour records changed between pages. Refresh and reopen the report.');
 return rows;
}
