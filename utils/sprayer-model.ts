import {displayJsplDate} from './jspl-input';
export type SprayInput={code:string;name:string;unit:string;rate:number};
export type PhoneSpray={id:string;trace_id:string;trace:string;week:string;area:number;spray_type:string;water_rate:number|null;tank_capacity:number|null;part:string|null;fully_issued:boolean;last_issue_date:string|null;completed_date:string|null;completion_version:number;lines:SprayInput[];hash:string;revision:string};
export type CompletionChange={operation_id:string;job_id:string;completed_date:string;base_hash:string;attempted:boolean;state:'queued'|'review';error?:string;created_at:string};
export type PhoneCache={jobs:PhoneSpray[];outbox:CompletionChange[];cursor:string;epoch:string|null;lastSync:string|null;ready:boolean;tanks:Record<string,string>;rebuilding?:{epoch:string;seen:string[]}};
export type PhoneIdentity={id:string;name:string};
export type FeedChange={id:string;revision:string;hash:string;payload:Omit<PhoneSpray,'hash'|'revision'>|null};
export type SyncPage={epoch:string;reset:boolean;changes:FeedChange[];cursor:string;more:boolean;server_time:string;results:{operation_id:string;status:'accepted'|'rejected'|'unconfirmed';error?:string}[]};
export const emptyPhoneCache=():PhoneCache=>({jobs:[],outbox:[],cursor:'0',epoch:null,lastSync:null,ready:false,tanks:{}});
export function applyPhonePage(previous:PhoneCache,page:SyncPage):PhoneCache{
 if(!page||!Array.isArray(page.changes)||!/^\d+$/.test(page.cursor)||typeof page.epoch!=='string'||!Array.isArray(page.results))throw Error('Invalid sync response; saved phone data has been retained');
 const jobs=new Map(previous.jobs.map(j=>[j.id,j]));
 const rebuilding=page.reset?{epoch:page.epoch,seen:[] as string[]}:previous.rebuilding;const seen=new Set(rebuilding?.seen??[]);
 for(const c of page.changes){seen.add(c.id);if(!/^\d+$/.test(c.id)||!/^\d+$/.test(c.revision))throw Error('Invalid spray change');if(c.payload===null)jobs.delete(c.id);else{
  if(String(c.payload.id)!==c.id||!Array.isArray(c.payload.lines)||!c.payload.trace||!/^[a-f0-9]{32}$/.test(c.hash))throw Error('Invalid spray details');
  jobs.set(c.id,{...c.payload,hash:c.hash,revision:c.revision});
 }}
 const outcomes=new Map(page.results.map(r=>[r.operation_id,r]));
 const outbox=previous.outbox.filter(o=>outcomes.get(o.operation_id)?.status!=='accepted').map(o=>{const r=outcomes.get(o.operation_id);return r?.status==='rejected'?{...o,state:'review' as const,error:r.error??'Completion needs review'}:o});
 return {...previous,jobs:[...jobs.values()],outbox,cursor:page.cursor,epoch:page.epoch,rebuilding:rebuilding?{epoch:page.epoch,seen:[...seen]}:undefined};
}
export function localCompletion(job:PhoneSpray,outbox:CompletionChange[]){return job.completed_date??outbox.find(o=>o.job_id===job.id&&o.state==='queued')?.completed_date??null;}
export function phoneOutstanding(cache:PhoneCache){return cache.jobs.filter(j=>!localCompletion(j,cache.outbox)).sort((a,b)=>a.week.localeCompare(b.week)||Number(a.id)-Number(b.id));}
export type SprayHistoryRow={job_id:string;date:string;trace:string;input:string;rate:number;unit:string;pending:boolean};
export function phoneHistory(cache:PhoneCache):SprayHistoryRow[]{return cache.jobs.flatMap(j=>{const date=localCompletion(j,cache.outbox);return date?j.lines.map(l=>({job_id:j.id,date,trace:j.trace,input:l.name,rate:l.rate,unit:l.unit,pending:!j.completed_date})):[]}).sort((a,b)=>b.date.localeCompare(a.date)||a.trace.localeCompare(b.trace)||a.input.localeCompare(b.input));}
export function historyMatches(row:SprayHistoryRow,filters:Record<string,string>,omit?:string){return ['date','trace','input'].every(k=>k===omit||!filters[k]||String(row[k as 'date'|'trace'|'input'])===filters[k]);}
export function historyChoices(rows:SprayHistoryRow[],filters:Record<string,string>,key:'date'|'trace'|'input'){return [...new Set(rows.filter(r=>historyMatches(r,filters,key)).map(r=>r[key]))].sort((a,b)=>key==='date'?b.localeCompare(a):a.localeCompare(b));}
export function tankMix(job:PhoneSpray,capacity:number){
 const water=Number(job.water_rate),total=job.area*water;
 if(!Number.isFinite(capacity)||capacity<=0||!Number.isFinite(water)||water<=0)return null;
 const full=Math.floor((total+1e-7)/capacity),part=Math.max(0,total-full*capacity);
 return {full,part,total,lines:job.lines.map(l=>({...l,full_quantity:capacity/water*l.rate,part_quantity:part/water*l.rate}))};
}
export const sprayDate=(date:string)=>displayJsplDate(date.slice(0,10));
export const syncDateTime=(date:string|null)=>date?new Date(date).toLocaleString('en-GB',{timeZone:'Africa/Harare',hour12:false}):'Never';

export function finishPhoneCache(cache:PhoneCache,time:string):PhoneCache{const seen=new Set(cache.rebuilding?.seen??[]);return {...cache,jobs:cache.rebuilding?cache.jobs.filter(j=>seen.has(j.id)):cache.jobs,ready:true,lastSync:time,rebuilding:undefined};}
