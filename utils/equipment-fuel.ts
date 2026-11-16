export type FuelType = 'DIESEL' | 'PETROL' | 'NONE';
export type Equipment = {vehicle_id:number;vehicle_name:string;fuel_type:FuelType;vehicle_discontinued?:boolean;is_other?:boolean};
export type IssueProduct = {item_name:string;input_type:string|null;input_category:string|null};
// Classification is restricted to Fuel: mineral spray oil and cooking oil are not machinery oil.
export function equipmentIssueKind(p?:IssueProduct): 'DIESEL'|'PETROL'|'OIL'|null {
 if(!p || ![p.input_type,p.input_category].some(x=>x?.trim().toLowerCase()==='fuel'))return null;
 if(/^diesel$/i.test(p.item_name.trim()))return 'DIESEL';
 if(/^petrol$/i.test(p.item_name.trim()))return 'PETROL';
 return /\boil\b|lubricant|grease/i.test(p.item_name)?'OIL':null;
}
export function eligibleEquipment(rows:Equipment[],kind:'DIESEL'|'PETROL'|'OIL') {
 return rows.filter(v=>!v.vehicle_discontinued&&!v.is_other&&(kind==='OIL'||v.fuel_type===kind));
}
export function validEquipmentDestination(rows:Equipment[],kind:'DIESEL'|'PETROL'|'OIL',id:number|'other'|null,description:string) {
 return id==='other'?description.trim().length>0:eligibleEquipment(rows,kind).some(v=>v.vehicle_id===id);
}
