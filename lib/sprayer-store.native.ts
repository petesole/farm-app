import * as SQLite from 'expo-sqlite';
import {CompletionChange,emptyPhoneCache,PhoneCache,SyncPage,applyPhonePage,finishPhoneCache} from '@/utils/sprayer-model';
const db=SQLite.openDatabaseSync('jspl_sprayer.db');
db.execSync(`create table if not exists sprayer_cache(user_id text primary key,payload text not null);`);
const read=(user:string):PhoneCache=>{const row=db.getFirstSync<{payload:string}>('select payload from sprayer_cache where user_id=?',[user]);return row?JSON.parse(row.payload):emptyPhoneCache()};
const write=(user:string,state:PhoneCache)=>db.runSync('insert into sprayer_cache(user_id,payload) values(?,?) on conflict(user_id) do update set payload=excluded.payload',[user,JSON.stringify(state)]);
function change(user:string,fn:(c:PhoneCache)=>PhoneCache){db.withTransactionSync(()=>write(user,fn(read(user))));return read(user);}
export async function readPhoneCache(user:string){return read(user);}
export async function applySyncPage(user:string,page:SyncPage){return change(user,c=>applyPhonePage(c,page));}
export async function finishPhoneSync(user:string,time:string){return change(user,c=>finishPhoneCache(c,time));}
export async function markPhoneAttempts(user:string,ids:string[]){return change(user,c=>({...c,outbox:c.outbox.map(o=>ids.includes(o.operation_id)?{...o,attempted:true}:o)}));}
export async function queuePhoneCompletion(user:string,op:CompletionChange){return change(user,c=>{const old=c.outbox.find(o=>o.job_id===op.job_id);if(old?.attempted&&old.state!=='review')throw Error('Sync to verify the previous completion before changing its date');return {...c,outbox:[...c.outbox.filter(o=>o.job_id!==op.job_id),op]}});}
export async function discardPhoneChange(user:string,id:string){return change(user,c=>{const old=c.outbox.find(o=>o.operation_id===id);if(old?.attempted&&old.state!=='review')throw Error('Sync to verify this completion before removing it');return {...c,outbox:c.outbox.filter(o=>o.operation_id!==id)}});}
export async function setPhoneTank(user:string,job:string,value:string){return change(user,c=>({...c,tanks:{...c.tanks,[job]:value}}));}
