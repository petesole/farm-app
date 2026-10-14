/** Date input for Fuel Admin: display dd/mm/yyyy, store ISO yyyy-mm-dd. */
export const fuelDateDisplay=(iso:string)=>{
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
 return m?`${m[3]}/${m[2]}/${m[1]}`:iso;
};
export const fuelDateISO=(input:string):string|null=>{
 const m=/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(input.trim());
 if(!m)return null;
 const day=Number(m[1]),month=Number(m[2]),year=m[3]?Number(m[3]):new Date().getFullYear();
 const dt=new Date(year,month-1,day);
 if(dt.getFullYear()!==year||dt.getMonth()!==month-1||dt.getDate()!==day)return null;
 return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
};
