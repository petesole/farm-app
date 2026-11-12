import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '@/supabase';

const endpoint='https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow';
export type ApprovalDocument={id:string;request_number:number;kind:'po'|'credit';status:string;version:number;payload:any;received:boolean;target_order_id:number|null;decision_reason:string|null;audit?:{action:string;created_at:string;reason:string|null}[]};
export type WorkflowContext={access:{is_admin:boolean;is_stock:boolean;can_main:boolean};documents:ApprovalDocument[];stocktakes:any[];awaiting:number};
export function stockUUID(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16)});}
export async function stockRequest(query='',payload?:unknown){
 const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error('Please sign in');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  const r=await fetch(endpoint+query,{method:payload?'POST':'GET',headers:{authorization:'Bearer '+session.access_token,...(payload?{'content-type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,signal:controller.signal});
  const body=await r.json();if(!r.ok){const error=Error(body.error||'Request failed') as Error&{confirmed?:boolean};error.confirmed=r.status>=400&&r.status<500;throw error;}return body;
 }finally{clearTimeout(timer);}
}
// Persist uncertain operations, so reload/retry cannot create a second transaction.
// A pending operation must be resolved before a different mutation can be sent.
export async function stockMutation(scope:string,payload:Record<string,unknown>){
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Please sign in');
 const key='stock-workflow:'+session.user.id+':'+scope;
 const existing=await AsyncStorage.getItem(key);
 const pending=existing?JSON.parse(existing):{operation_id:stockUUID(),...payload};
 if(existing){
  const check=await stockRequest('?workflow_operation='+pending.operation_id);
  if(check.result){
   await AsyncStorage.removeItem(key);
   const {operation_id,...prior}=pending;
   if(JSON.stringify(prior)!==JSON.stringify(payload))throw Error('The previous save was confirmed. Your current inputs are retained. Reload the saved document before making another change.');
   return {success:true,result:check.result,recovered:true};
  }
  const {operation_id,...prior}=pending;
  if(JSON.stringify(prior)!==JSON.stringify(payload))throw Error('The previous save is still unconfirmed. Restore its inputs and retry to verify it before making another change.');
 }
 await AsyncStorage.setItem(key,JSON.stringify(pending));
 try{const result=await stockRequest('',pending);await AsyncStorage.removeItem(key);return result;}
 catch(e){if((e as {confirmed?:boolean}).confirmed)await AsyncStorage.removeItem(key);throw e;}
}
export const stockContext=()=>stockRequest('?workflow_context=1') as Promise<WorkflowContext>;
export const documentLabel=(d:ApprovalDocument)=>d.kind==='po'?(d.target_order_id?'PO-'+d.target_order_id:'PO Request '+d.request_number):'Credit '+d.payload.credit_note_number;
export async function recoverStockSave(scope:string){
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Please sign in');
 const saved=await AsyncStorage.getItem('stock-workflow:'+session.user.id+':'+scope);
 if(!saved)throw Error('There is no unconfirmed save for this screen.');
 const {operation_id,...payload}=JSON.parse(saved);
 return stockMutation(scope,payload);
}
