/** Zimbabwe-local display dates and strict calendar-day parsing for Weighbridge forms. */
export function wbCurrentYear():number{return Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Harare",year:"numeric"}).format(new Date()));}
export function wbParseDate(value:string):string|null{
 const v=value.trim();if(!v)return null;
 const m=v.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
 if(!m)return null;
 const day=+m[1],month=+m[2],year=m[3]?+m[3]:wbCurrentYear();
 const d=new Date(Date.UTC(year,month-1,day));
 if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return null;
 return year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
}
export function wbFormatDate(value:string|null|undefined):string{
 if(!value)return "";
 const m=value.match(/^(\d{4})-(\d{2})-(\d{2})/);
 return m?m[3]+"/"+m[2]+"/"+m[1]:value;
}
export function wbToday():string{
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Harare",day:"2-digit",month:"2-digit",year:"numeric"}).formatToParts(new Date());
 const get=(type:string)=>parts.find(x=>x.type===type)?.value||"";
 return get("day")+"/"+get("month")+"/"+get("year");
}
