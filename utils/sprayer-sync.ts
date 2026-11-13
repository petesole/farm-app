import * as Network from 'expo-network';
import {applySyncPage,finishPhoneSync,markPhoneAttempts,readPhoneCache} from '@/lib/sprayer-store';
import {PhoneCache,PhoneIdentity,SyncPage} from './sprayer-model';
import {sprayerRequest} from './sprayer-api';
let running=false;
export async function phoneConnection(){const n=await Network.getNetworkStateAsync();return {online:n.isConnected!==false&&n.isInternetReachable!==false,wifi:n.type===Network.NetworkStateType.WIFI||n.type===Network.NetworkStateType.ETHERNET,label:n.isConnected===false||n.isInternetReachable===false?'Offline':n.type===Network.NetworkStateType.WIFI?'Wi-Fi':n.type===Network.NetworkStateType.CELLULAR?'Mobile data':'Network'};}
export async function syncPhone(identity:PhoneIdentity,options:{allowMobileDownload?:boolean;full?:boolean;onProgress?:(cache:PhoneCache)=>void}={}){
 if(running)throw Error('Sync is already running');running=true;
 try{
  const network=await phoneConnection();if(!network.online)throw Error('Offline. Saved sprays and completion dates remain on this phone');
  let cache=await readPhoneCache(identity.id);
  if((!cache.ready||options.full)&&!network.wifi&&!options.allowMobileDownload)throw Error('Connect to Wi-Fi for the first download or a full refresh. You can allow a mobile download below');
  let cursor=options.full?'0':cache.cursor,epoch=options.full?null:cache.epoch,bytes=0;
  for(let page=0;page<200;page++){
   const ops=cache.outbox.filter(o=>o.state==='queued').slice(0,50);await markPhoneAttempts(identity.id,ops.map(o=>o.operation_id));
   const data:SyncPage=await sprayerRequest('',{action:'sync',cursor,epoch,limit:network.wifi?500:100,operations:ops.map(o=>({operation_id:o.operation_id,job_id:o.job_id,completed_date:o.completed_date,base_hash:o.base_hash}))},identity);
   bytes+=JSON.stringify(data).length;cache=await applySyncPage(identity.id,data);cursor=cache.cursor;epoch=cache.epoch;options.onProgress?.(cache);
   if(data.results.some(r=>r.status==='unconfirmed'))throw Error('A completion response was not confirmed. Sync again to verify it; it has been retained');
   if(!data.more&&!cache.outbox.some(o=>o.state==='queued')){cache=await finishPhoneSync(identity.id,data.server_time);return {cache,bytes};}
  }
  throw Error('More changes remain. Tap Sync again to continue; downloaded pages are saved');
 }finally{running=false}
}
