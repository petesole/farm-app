import {wbParseDate,wbFormatDate} from './wb-date';
export type DnoteRange={start:string;end:string};
export type RegisterRaw={expected_id:number|null;source:string|null;source_id:string|null;report_date:string;dnote:string|null;wb_slip:string|null;crop_name:string|null;movement_kind:string|null;registration_text:string|null;load_kg:number|null;tracecode_id:number|null;tracecode_name:string|null;allocation_kg:number|null;season_id:number|null;wb_date:string|null;missing:boolean;wb_match_count:number};
export type DnoteLoad={key:string;expectedId:number|null;date:string;source:string;dnote:string;wbSlip:string;crop:string;movement:string;registration:string;kg:number|null;missing:boolean;matchCount:number;seasons:number[];alloc:{id:number;name:string;kg:number}[]};
export function dnoteKey(text:string):string|null{
 const m=text.trim().match(/^(\d{1,6})\s*\/\s*(\d{1,6})$/);
 return m&&+m[1]>0&&+m[2]>0?`${+m[1]}/${+m[2]}`:null;
}
export function validateDnoteRanges(date:string,lines:DnoteRange[]):{date:string;ranges:DnoteRange[];count:number}{
 const iso=wbParseDate(date);if(!iso)throw new Error('Enter a valid date, such as 10/11/2026.');
 if(!lines.length||lines.length>50)throw new Error('Enter between 1 and 50 range lines.');
 const seen=new Set<string>();let count=0;
 const ranges=lines.map((r,i)=>{
  const start=dnoteKey(r.start),end=dnoteKey(r.end);
  if(!start||!end)throw new Error(`Line ${i+1}: use book/note numbers, such as 2/12 and 2/22.`);
  const [book,first]=start.split('/').map(Number),[endBook,last]=end.split('/').map(Number);
  if(book!==endBook)throw new Error(`Line ${i+1}: use one book per line. Add another line when changing books.`);
  if(last<first||last-first+1>2000)throw new Error(`Line ${i+1}: end must follow start, with at most 2000 notes.`);
  for(let note=first;note<=last;note++){
   const key=`${book}/${note}`;if(seen.has(key))throw new Error(`D-Note ${key} appears in overlapping ranges.`);
   seen.add(key);
  }
  count+=last-first+1;if(count>5000)throw new Error('Add at most 5000 D-Notes in one save.');
  return {start,end};
 });
 return {date:iso,ranges,count};
}
export function groupDnoteLoads(rows:RegisterRaw[]):DnoteLoad[]{
 const map=new Map<string,DnoteLoad>();
 for(const r of rows){
  const key=r.expected_id!=null?`note:${r.expected_id}:${r.source||''}:${r.source_id||''}`:`${r.source}:${r.source_id}`;
  let load=map.get(key);
  if(!load){load={key,expectedId:r.expected_id,date:r.report_date,source:r.source||'',dnote:r.dnote||'',wbSlip:r.wb_slip||'',crop:r.crop_name||'',movement:r.movement_kind||'',registration:r.registration_text||'',kg:r.load_kg==null?null:Number(r.load_kg),missing:r.missing,matchCount:Number(r.wb_match_count),seasons:[],alloc:[]};map.set(key,load);}
  if(r.season_id!=null&&!load.seasons.includes(r.season_id))load.seasons.push(r.season_id);
  if(r.tracecode_id!=null&&!load.alloc.some(a=>a.id===r.tracecode_id))load.alloc.push({id:r.tracecode_id,name:r.tracecode_name||String(r.tracecode_id),kg:Number(r.allocation_kg||0)});
 }
 return [...map.values()];
}
export function dnoteCsv(loads:DnoteLoad[]):string{
 const headings=['Date','Field DNote','WB Slip','Source','Crop','Movement','Truck','Nett kg','Nett t','TraceCode','Allocation kg','Allocation t','WB status'];
 const csvValue=(value:unknown)=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 return [headings,...loads.flatMap(l=>(l.alloc.length?l.alloc:[{name:'',kg:0}]).map((a,i)=>[wbFormatDate(l.date),l.dnote,l.wbSlip,l.source,l.crop,l.movement,l.registration,i===0?l.kg:'',i===0&&l.kg!=null?l.kg/1000:'',a.name,a.name?a.kg:'',a.name?a.kg/1000:'',l.missing?'Missing':'Not missing']))].map(row=>row.map(csvValue).join(',')).join('\r\n');
}

