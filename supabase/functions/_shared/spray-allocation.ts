export type Active = {name:string;amount:number;unit:string};
export type SprayProduct = {item_code:string;inputs_name:string;base_unit:string;quantity:number;ao_quantity:number;formulation_type?:string|null;actives:Active[]};
export type StockChoice = {useUp:boolean;rate:string};
export type Treatment = {input:string;rate:string;choices?:Record<string,StockChoice>;compatibilityConfirmed?:boolean};
export const activeName=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
export const available=(p:SprayProduct,owner:string)=>Math.max(0,Number(owner==='AO'?p.ao_quantity:p.quantity)||0);
export const similar=(a:SprayProduct,b:SprayProduct)=>a.item_code===b.item_code||a.actives.some(x=>b.actives.some(y=>activeName(x.name)===activeName(y.name)));
export function equivalent(a:SprayProduct,b:SprayProduct,ar:number,br:number){
 if(!a.formulation_type?.trim()||!b.formulation_type?.trim()||activeName(a.formulation_type)!==activeName(b.formulation_type))return false;
 if(!a.actives.length||a.actives.length!==b.actives.length||a.base_unit.toLowerCase()!==b.base_unit.toLowerCase())return false;
 return a.actives.every(x=>{const y=b.actives.find(y=>activeName(x.name)===activeName(y.name));return y&&x.amount>0&&y.amount>0&&x.unit===y.unit&&Math.abs(x.amount*ar-y.amount*br)<=Math.max(1e-8,x.amount*ar*1e-6)});
}
// Coverage is an accounting conversion only. Every emitted row is spread over the whole area.
export function allocateTreatment(t:Treatment,products:SprayProduct[],area:number,owner:string){
 const primary=products.find(p=>p.inputs_name===t.input),rate=Number(t.rate);
 if(!primary||!Number.isFinite(area)||area<=0||!Number.isFinite(rate)||rate<=0)throw Error('Select a product and a positive intended rate.');
 const rows:{item_code:string;quantity:number;rate_per_ha:number;shortfall:number;use_up:boolean;product_rate:number}[]=[];
 let covered=0;
 for(const [code,c] of Object.entries(t.choices??{})){
  if(!c.useUp)continue;
  const p=products.find(p=>p.item_code===code),r=code===primary.item_code?rate:Number(c.rate);
  if(!p||!Number.isFinite(r)||r<=0)throw Error('Enter the product-specific rate for each checked brand.');
  if(code!==primary.item_code&&!equivalent(primary,p,rate,r))throw Error('Complete active details and matching formulation, units and concentration-adjusted doses are required before substituting brands.');
  if(code!==primary.item_code&&!t.compatibilityConfirmed)throw Error('Confirm label, formulation and tank-mix compatibility before combining brands.');
  const quantity=available(p,owner);if(quantity<=0)throw Error('No stock is available for the checked product under this spray owner.');
  covered+=quantity/r;
  rows.push({item_code:code,quantity,rate_per_ha:quantity/area,shortfall:0,use_up:true,product_rate:r});
 }
 if(covered>area+1e-6)throw Error('Checked stock exceeds the intended treatment dose. Uncheck a product or correct the intended rates.');
 const remaining=Math.max(0,area-covered);
 if(remaining>1e-6&&!t.choices?.[primary.item_code]?.useUp){
  const quantity=remaining*rate;
  rows.push({item_code:primary.item_code,quantity,rate_per_ha:quantity/area,shortfall:Math.max(0,quantity-available(primary,owner)),use_up:false,product_rate:rate});
 }
 return {rows,covered,remaining,unallocated:t.choices?.[primary.item_code]?.useUp?remaining:0,shortfall:rows.reduce((n,r)=>n+r.shortfall,0)};
}

export function allocateSpray(groups:Treatment[],products:SprayProduct[],area:number,owner:string){
 if(!['JS','AO'].includes(owner)||!Array.isArray(groups)||groups.length<1||groups.length>30)throw Error('Choose a stock owner and 1–30 treatments.');
 const allocations=groups.map(g=>allocateTreatment(g,products,area,owner));
 if(allocations.some(a=>a.unallocated>1e-6))throw Error('Coverage remains: select an unchecked brand for the remaining requirement.');
 const rows=allocations.flatMap(a=>a.rows);
 if(rows.length>30||new Set(rows.map(r=>r.item_code)).size!==rows.length)throw Error('A product may only be allocated once per spray.');
 for(let i=0;i<groups.length;i++)for(let j=0;j<i;j++){
  const a=products.find(p=>p.inputs_name===groups[i].input),b=products.find(p=>p.inputs_name===groups[j].input);
  if(a&&b&&similar(a,b))throw Error('Products sharing an active must be allocated in one treatment to avoid doubling the dose.');
 }
 return rows;
}
