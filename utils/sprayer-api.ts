import {supabase} from '@/supabase';
import {PhoneIdentity} from './sprayer-model';
import {setPhoneIdentity,clearPhoneIdentity} from '@/lib/sprayer-identity';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {stockUUID} from './stock-workflow';
const endpoint='https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-sprayer';
export class SprayerAccessError extends Error{}
export async function sprayerRequest(query='',body?:unknown,identity?:PhoneIdentity){
 const {data:{session},error:sessionError}=await supabase.auth.getSession();
 if(sessionError)throw Error('Unable to verify sign-in connection. Saved phone data is retained.');
 if(!session?.access_token||(identity&&session.user.id!==identity.id)){await clearPhoneIdentity();throw new SprayerAccessError('Sign in with the account that owns the saved phone data');}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{const res=await fetch(endpoint+query,{method:body?'POST':'GET',headers:{authorization:'Bearer '+session.access_token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
  const data=await res.json();if(res.status===401||res.status===403){await clearPhoneIdentity();throw new SprayerAccessError(data.error??'Sprayer access required');}if(!res.ok){const failure=Error(data.error??'Sync failed') as Error&{confirmed?:boolean};failure.confirmed=res.status>=400&&res.status<500;throw failure;}return data;
 }finally{clearTimeout(timer)}
}
export async function verifyPhoneAccess():Promise<PhoneIdentity>{const d=await sprayerRequest('?access=1');const identity={id:d.user_id,name:d.name};await setPhoneIdentity(identity);return identity;}
export async function sprayerAdminSave(data?:Record<string,unknown>){
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw new SprayerAccessError('Sign in required');
 const key='sprayer-admin-save:'+session.user.id,raw=await AsyncStorage.getItem(key);
 const pending=raw?JSON.parse(raw):data?{operation_id:stockUUID(),data}:null;
 if(!pending)throw Error('No previous completion correction to verify');
 if(raw&&data&&JSON.stringify(pending.data)!==JSON.stringify(data))throw Error('Verify the previous correction before saving different inputs');
 await AsyncStorage.setItem(key,JSON.stringify(pending));
 try{const result=await sprayerRequest('',{action:'admin_edit',...pending});await AsyncStorage.removeItem(key);return result;}
 catch(e){if((e as {confirmed?:boolean}).confirmed||e instanceof SprayerAccessError)await AsyncStorage.removeItem(key);throw e;}
}
