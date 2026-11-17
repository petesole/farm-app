// UI capabilities use verified server roles; cached login labels are not authorization.
export async function verifiedIrrigationRoles(client:any):Promise<string[]>{
 try{
  const identity=await client.auth.getUser();if(identity.error||!identity.data?.user)return [];
  const result=await client.rpc('my_farm_app_roles');
  if(result.error||!Array.isArray(result.data))return [];
  return result.data.map((r:unknown)=>String(r).trim().toLowerCase());
 }catch{return []}
}
export function irrigationRole(roles:string[]){return roles.includes('admin')?'admin':roles.includes('irrigation')?'irrigation':roles[0]??'unknown'}
