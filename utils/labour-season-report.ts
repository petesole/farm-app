import {labourTotals,labourEntryColumns,LabourEntry,LabourLine,LabourMode} from './labour-period-report';
export type Season={season_id:number|string;season_name:string;season_complete:boolean;plan_year:number|null};
export type Farm={farm_id:number|string;farm_name:string;active:boolean};
export type Crop={crop_id:number|string;crop_name:string;active:boolean};
export type Field={field_id:number|string;farm_id:number|string|null};
export type Trace={tracecode_id:number|string;tracecode_name:string;season_id:number|string|null;crop_id:number|string|null;field_id:number|string|null;start_date:string|null;end_date:string|null};
export type LabourLists={seasons:Season[];farms:Farm[];crops:Crop[];fields:Field[];traces:Trace[]};
export type SeasonSelection={season:string;farm:string;crop:string;trace:string;mode:LabourMode};
const id=(v:unknown)=>v==null?'':String(v);
export function seasonTraces(lists:LabourLists,s:SeasonSelection,omit?:'farm'|'crop'|'trace'){
 if(!s.season)return [];
 const fields=new Map(lists.fields.map(f=>[id(f.field_id),id(f.farm_id)]));
 return lists.traces.filter(t=>id(t.season_id)===s.season&&(omit==='farm'||!s.farm||fields.get(id(t.field_id))===s.farm)&&(omit==='crop'||!s.crop||id(t.crop_id)===s.crop)&&(omit==='trace'||!s.trace||id(t.tracecode_id)===s.trace));
}
export function seasonOptions(lists:LabourLists,s:SeasonSelection,key:'farm'|'crop'|'trace'){
 const traces=seasonTraces(lists,s,key),fields=new Map(lists.fields.map(f=>[id(f.field_id),id(f.farm_id)]));
 const valid=new Set(traces.map(t=>key==='farm'?fields.get(id(t.field_id)):key==='crop'?id(t.crop_id):id(t.tracecode_id)));
 const options=key==='farm'?lists.farms.map(f=>({id:id(f.farm_id),label:f.farm_name})):key==='crop'?lists.crops.map(c=>({id:id(c.crop_id),label:c.crop_name})):lists.traces.map(t=>({id:id(t.tracecode_id),label:t.tracecode_name}));
 return options.filter(o=>valid.has(o.id)).sort((a,b)=>a.label.localeCompare(b.label,'en',{numeric:true}));
}
export function reconcileSeason(lists:LabourLists,s:SeasonSelection){
 const next={...s};if(!lists.seasons.some(x=>id(x.season_id)===next.season))return {...next,season:'',farm:'',crop:'',trace:''};
 for(const key of ['trace','crop','farm'] as const)if(next[key]&&!seasonOptions(lists,next,key).some(o=>o.id===next[key]))next[key]='';return next;
}
export async function readList(client:any,table:string,columns:string,key:string){
 const out:any[]=[];let count:number|null=null;const seen=new Set<string>();
 for(let start=0;;start+=1000){const result=await client.from(table).select(columns,start===0?{count:'exact'}:undefined).order(key).range(start,start+999);if(result.error)throw Error(result.error.message||'Unable to load '+table);if(!Array.isArray(result.data))throw Error('No '+table+' list was returned');if(start===0)count=Number.isInteger(result.count)?result.count:null;
  for(const row of result.data){if(seen.has(id(row[key])))throw Error('The '+table+' list changed while loading. Refresh and retry.');seen.add(id(row[key]))}out.push(...result.data);if(result.data.length<1000)break;
 }if(count!==null&&count!==out.length)throw Error('The '+table+' list changed while loading. Refresh and retry.');return out;
}
export async function loadLabourLists(client:any):Promise<LabourLists>{
 const [seasons,farms,crops,fields,traces]=await Promise.all([
  readList(client,'season','season_id,season_name,season_complete,plan_year','season_id'),
  readList(client,'farm','farm_id,farm_name,active','farm_id'),
  readList(client,'crop','crop_id,crop_name,active','crop_id'),
  readList(client,'field','field_id,farm_id','field_id'),
  readList(client,'tracecode','tracecode_id,tracecode_name,season_id,crop_id,field_id,start_date,end_date','tracecode_id')
 ]);return {seasons,farms,crops,fields,traces};
}
export async function loadSeasonEntries(client:any,lists:LabourLists,s:SeasonSelection):Promise<LabourEntry[]>{
 if(!s.season||!lists.seasons.some(x=>id(x.season_id)===s.season))throw Error('Choose a Season from the current season list');
 const traces=seasonTraces(lists,s),out:LabourEntry[]=[];const seen=new Set<string>();
 // Limit each request to existing trace IDs, preserving the season's membership rather than guessing date bounds.
 for(let i=0;i<traces.length;i+=100){const ids=traces.slice(i,i+100).map(t=>t.tracecode_id);let count:number|null=null,start=0;
  for(;;start+=1000){const result=await client.from('labour_v2_report_rows').select(labourEntryColumns,start===0?{count:'exact'}:undefined).in('tracecode_id',ids).order('source_type').order('source_id').range(start,start+999);if(result.error)throw Error(result.error.message||'Unable to load season labour');if(!Array.isArray(result.data))throw Error('Season labour was not returned');if(start===0)count=Number.isInteger(result.count)?result.count:null;
   for(const row of result.data){const key=row.source_type+':'+row.source_id;if(seen.has(key))throw Error('Labour changed while loading. Refresh and retry.');seen.add(key)}out.push(...result.data);if(result.data.length<1000){if(count!==null&&count!==start+result.data.length)throw Error('Labour changed while loading. Refresh and retry.');break}
  }
 }return out;
}
export function buildSeasonReport(rows:LabourEntry[],lists:LabourLists,s:SeasonSelection){
 const traces=new Map(seasonTraces(lists,s).map(t=>[id(t.tracecode_id),t])),fields=new Map(lists.fields.map(f=>[id(f.field_id),f])),farms=new Map(lists.farms.map(f=>[id(f.farm_id),f])),crops=new Map(lists.crops.map(c=>[id(c.crop_id),c]));
 const selected=rows.filter(r=>traces.has(id(r.tracecode_id))).map(r=>{const t=traces.get(id(r.tracecode_id))!,farm=farms.get(id(fields.get(id(t.field_id))?.farm_id)),crop=crops.get(id(t.crop_id));return {...r,report_farm:farm?.farm_name??'Unassigned farm',crop_name:crop?.crop_name??'Unassigned crop',tracecode_name:t.tracecode_name,master_warning:[!farm?'Farm not assigned':'',!crop?'Crop not assigned':''].filter(Boolean).join('; ')}});
 const groups=(data:LabourEntry[],key:(r:LabourEntry)=>string)=>{const map=new Map<string,LabourEntry[]>();for(const r of data){const k=key(r);if(!map.has(k))map.set(k,[]);map.get(k)!.push(r)}return [...map].sort(([a],[b])=>a.localeCompare(b,'en',{numeric:true})).map(([,v])=>v)};
 const period=(r:LabourEntry)=>s.mode==='daily'?r.labour_date:s.mode==='weekly'?r.labour_week:r.labour_date.slice(0,7);
 const make=(data:LabourEntry[],label?:string,level?:'farm'|'crop'|'trace'):LabourLine=>{const t=labourTotals(data),r=data[0],master=[...new Set(data.map(x=>(x as LabourEntry&{master_warning?:string}).master_warning).filter(Boolean))].join('; ');return {labour_date:label?'':s.mode==='weekly'?'Week '+period(r):period(r),report_farm:r.report_farm,crop_name:level==='farm'?'':r.crop_name,tracecode_name:level==='farm'||level==='crop'?'':r.tracecode_name,activity_name:label??r.activity_name,labour_qty:t.missingQty===t.entries?'Not recorded':t.qty,total_cost:t.missingValue===t.entries?'Not recorded':t.value,status:[t.missingQty?`Missing Qty: ${t.missingQty}`:'',t.missingValue?`Missing Value: ${t.missingValue}`:'',master].filter(Boolean).join('; '),_kind:label?'subtotal':'detail',entries:t.entries}};
 const output:LabourLine[]=[];
 for(const farm of groups(selected,r=>r.report_farm)){for(const crop of groups(farm,r=>r.crop_name)){for(const trace of groups(crop,r=>r.tracecode_name+'|'+r.tracecode_id)){for(const p of groups(trace,period)){for(const activity of groups(p,r=>r.activity_name+'|'+r.activity_id))output.push(make(activity))}output.push(make(trace,'Trace total','trace'))}output.push(make(crop,'Crop total','crop'))}output.push(make(farm,'Farm total','farm'))}
 return {rows:output,totals:labourTotals(selected),sourceRows:selected.length,missingMaster:selected.filter(r=>r.master_warning).length};
}
