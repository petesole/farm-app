import AsyncStorage from '@react-native-async-storage/async-storage';
import {CompletionChange,emptyPhoneCache,PhoneCache,SyncPage,applyPhonePage,finishPhoneCache} from '@/utils/sprayer-model';
let serial:Promise<unknown>=Promise.resolve();
const key=(user:string)=>'jspl-sprayer:'+user;
async function read(user:string):Promise<PhoneCache>{const raw=await AsyncStorage.getItem(key(user));return raw?JSON.parse(raw):emptyPhoneCache();}
function change(user:string,fn:(c:PhoneCache)=>PhoneCache):Promise<PhoneCache>{const result=serial.then(async()=>{const next=fn(await read(user));await AsyncStorage.setItem(key(user),JSON.stringify(next));return next});serial=result.catch(()=>{});return result;}
export async function readPhoneCache(user:string){await serial;return read(user);}
export async function applySyncPage(user:string,page:SyncPage){return change(user,c=>applyPhonePage(c,page));}
export async function finishPhoneSync(user:string,time:string){return change(user,c=>finishPhoneCache(c,time));}
export async function markPhoneAttempts(user:string,ids:string[]){return change(user,c=>({...c,outbox:c.outbox.map(o=>ids.includes(o.operation_id)?{...o,attempted:true}:o)}));}
export async function queuePhoneCompletion(user:string,op:CompletionChange){return change(user,c=>{const old=c.outbox.find(o=>o.job_id===op.job_id);if(old?.attempted&&old.state!=='review')throw Error('Sync to verify the previous completion before changing its date');return {...c,outbox:[...c.outbox.filter(o=>o.job_id!==op.job_id),op]}});}
export async function discardPhoneChange(user:string,id:string){return change(user,c=>{const old=c.outbox.find(o=>o.operation_id===id);if(old?.attempted&&old.state!=='review')throw Error('Sync to verify this completion before removing it');return {...c,outbox:c.outbox.filter(o=>o.operation_id!==id)}});}
export async function setPhoneTank(user:string,job:string,value:string){return change(user,c=>({...c,tanks:{...c.tanks,[job]:value}}));}
