export type FuelType = 'DIESEL' | 'PETROL' | 'NONE';
export type Equipment = {vehicle_id:number;vehicle_name:string;fuel_type:FuelType;vehicle_discontinued?:boolean;is_other?:boolean;vehicle_type_id?:number|string|null};
export function fuelEquipmentTypes<T extends {vehicle_type_id:number|string}>(types:T[],rows:Equipment[],fuel:'DIESEL'|'PETROL'):T[] {
 return types.filter(t=>rows.some(v=>!v.vehicle_discontinued&&v.fuel_type===fuel&&Number(v.vehicle_type_id)===Number(t.vehicle_type_id)));
}
export type IssueProduct = {item_name:string;input_type:string|null;input_category:string|null};
export function requiresLubricantJobCard(p?:IssueProduct):boolean {
 if(!p)return false;
 const type=p.input_type?.trim().toLowerCase(),category=p.input_category?.trim().toLowerCase();
 return type==='lubricants'||category==='lubricants'
   || ((type==='parts'||type==='general')&&(category==='oils'||category==='grease'))
   || ((type==='fuel'||category==='fuel')&&/\boil\b|lubricant|grease|transmission fluid/i.test(p.item_name));
}
// Classification is restricted to Fuel: mineral spray oil and cooking oil are not machinery oil.
export function equipmentIssueKind(p?:IssueProduct): 'DIESEL'|'PETROL'|null {
 if(!p || ![p.input_type,p.input_category].some(x=>x?.trim().toLowerCase()==='fuel'))return null;
 if(/^diesel$/i.test(p.item_name.trim()))return 'DIESEL';
 if(/^petrol$/i.test(p.item_name.trim()))return 'PETROL';
 return null;
}
export function eligibleEquipment(rows:Equipment[],kind:'DIESEL'|'PETROL') {
 return rows.filter(v=>!v.vehicle_discontinued&&!v.is_other&&v.fuel_type===kind);
}
export function validEquipmentDestination(rows:Equipment[],kind:'DIESEL'|'PETROL',id:number|'other'|null,description:string) {
 return id==='other'?description.trim().length>0:eligibleEquipment(rows,kind).some(v=>v.vehicle_id===id);
}
