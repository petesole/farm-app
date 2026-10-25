export type FieldControlKey="farm"|"zesa_point"|"rain_gauge"|"field_classification";
export type FieldDefinition={key:string;label:string;type:"text"|"number"|"date";required?:boolean};
export type ControlDefinition={table:FieldControlKey;title:string;id:string;name:string;fields:FieldDefinition[]};
export const fieldControls:Record<FieldControlKey,ControlDefinition>={
 farm:{table:"farm",title:"Farm",id:"farm_id",name:"farm_name",fields:[
  {key:"farm_name",label:"Farm name",type:"text",required:true},
  {key:"rental",label:"Rental",type:"number"},
  {key:"tractor_trip_litres",label:"Tractor trip litres",type:"number"},
  {key:"fuel_route_group",label:"Fuel route group",type:"text"},
  {key:"fuel_large_l",label:"Fuel large (L)",type:"number"},
  {key:"fuel_medium_l",label:"Fuel medium (L)",type:"number"},
  {key:"fuel_small_l",label:"Fuel small (L)",type:"number"}]},
 zesa_point:{table:"zesa_point",title:"ZESA",id:"zesa_point_id",name:"zesa_point",fields:[
  {key:"zesa_point",label:"ZESA point",type:"text",required:true},
  {key:"zesa_location",label:"Location",type:"text"},
  {key:"zesa_point_no",label:"Point number",type:"text"},
  {key:"zesa_account_name",label:"Account name",type:"text"}]},
 rain_gauge:{table:"rain_gauge",title:"Rain Gauge",id:"rain_gauge_id",name:"rain_gauge",fields:[
  {key:"rain_gauge",label:"Rain gauge",type:"text",required:true},
  {key:"active_from",label:"Active from (dd/mm/yyyy)",type:"date",required:true},
  {key:"active_to",label:"Active to (dd/mm/yyyy, optional)",type:"date"}]},
 field_classification:{table:"field_classification",title:"Field Classification",id:"field_classification_id",name:"field_classification_name",fields:[
  {key:"field_classification_name",label:"Classification name",type:"text",required:true}]}
};
export function controlFor(value:string|string[]|undefined){return typeof value==="string"&&Object.prototype.hasOwnProperty.call(fieldControls,value)?fieldControls[value as FieldControlKey]:null;}
export function dateInput(v:string){const s=v.trim();if(!s)return null;const m=/^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/.exec(s);return m?m[3]+"-"+m[2]+"-"+m[1]:null;}
export function dateDisplay(s:string|null){if(!s)return "";const m=/^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(s);return m?m[3]+"/"+m[2]+"/"+m[1]:s;}
