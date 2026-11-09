/** Minimal, dependency-free Office Open XML workbook writer for JSPL browser reports.
 * Exports an actual .xlsx file; no calls to external services.
 */
export type LabourExcelColumn={label:string;field:string};
type AnyRow=Record<string,unknown>;
const str=(s:string)=>{if(typeof TextEncoder==="undefined")throw Error("Excel export requires a desktop browser.");return new TextEncoder().encode(s)};
const xml=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const bytesToU32=(v:number)=>v>>>0;
const CRC_TABLE=(()=>{
 const a=new Uint32Array(256);
 for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;a[n]=c>>>0}
 return a;
})();
function crc32(data:Uint8Array){let crc=0xffffffff;for(const byte of data)crc=CRC_TABLE[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
function put16(d:DataView,at:number,n:number){d.setUint16(at,n,true)}
function put32(d:DataView,at:number,n:number){d.setUint32(at,bytesToU32(n),true)}
function zip(files:{name:string;data:string}[]):Uint8Array{
 const local:Uint8Array[]=[];const central:Uint8Array[]=[];let offset=0;let centralLength=0;
 for(const file of files){
  const name=str(file.name),data=str(file.data),crc=crc32(data);
  const head=new Uint8Array(30+name.length),v=new DataView(head.buffer);
  put32(v,0,0x04034b50);put16(v,4,20);put16(v,6,0x0800);put16(v,8,0);
  put16(v,10,0);put16(v,12,0x0021);put32(v,14,crc);put32(v,18,data.length);put32(v,22,data.length);put16(v,26,name.length);put16(v,28,0);
  head.set(name,30);local.push(head,data);
  const cen=new Uint8Array(46+name.length),c=new DataView(cen.buffer);
  put32(c,0,0x02014b50);put16(c,4,20);put16(c,6,20);put16(c,8,0x0800);put16(c,10,0);
  put16(c,12,0);put16(c,14,0x0021);put32(c,16,crc);put32(c,20,data.length);put32(c,24,data.length);
  put16(c,28,name.length);put16(c,30,0);put16(c,32,0);put16(c,34,0);put16(c,36,0);put32(c,38,0);put32(c,42,offset);
  cen.set(name,46);central.push(cen);centralLength+=cen.length;offset+=head.length+data.length;
 }
 const eocd=new Uint8Array(22),e=new DataView(eocd.buffer);
 put32(e,0,0x06054b50);put16(e,4,0);put16(e,6,0);put16(e,8,files.length);put16(e,10,files.length);
 put32(e,12,centralLength);put32(e,16,offset);put16(e,20,0);
 const out=new Uint8Array(offset+centralLength+eocd.length);let at=0;
 for(const part of [...local,...central,eocd]){out.set(part,at);at+=part.length}
 return out;
}
function col(i:number):string{let s="";while(i>0){i--;s=String.fromCharCode(65+i%26)+s;i=Math.floor(i/26)}return s}
function cell(ref:string,raw:unknown,header=false,field=""):string{
 if(raw===undefined||raw===null||raw==="")return '<c r="'+ref+'"/>';
 const numberField=["labour_qty","total_labour_qty","kgs","total_kgs","unit_cost","avg_kgs_per_person","total_cost","cost_per_ha"].includes(field);
 if((numberField || typeof raw === "number") && Number.isFinite(Number(raw))){
  const n=Number(raw);
  return '<c r="'+ref+'" s="'+(["unit_cost","total_cost","cost_per_ha"].includes(field)?"2":"0")+'"><v>'+n+'</v></c>';
 }
 return '<c r="'+ref+'" t="inlineStr"'+(header?' s="1"':'')+'><is><t xml:space="preserve">'+xml(String(raw))+'</t></is></c>';
}
function worksheet(title:string,columns:LabourExcelColumn[],rows:AnyRow[],total?:number):string{
 const lastCol=col(columns.length),rowXML:string[]=[];
 rowXML.push('<row r="1" ht="26" customHeight="1">'+cell("A1",title,true)+'</row>');
 rowXML.push('<row r="2" ht="22" customHeight="1">'+columns.map((c,i)=>cell(col(i+1)+"2",c.label,true)).join("")+'</row>');
 rows.forEach((row,i)=>{
  const ri=i+3;
  rowXML.push('<row r="'+ri+'">'+columns.map((c,j)=>cell(col(j+1)+ri,row[c.field],false,c.field)).join("")+'</row>');
 });
 const lastRow=rows.length+(total===undefined?2:3);
 if(total!==undefined)rowXML.push('<row r="'+lastRow+'">'+cell("A"+lastRow,"Grand Total",true)+cell(lastCol+lastRow,total,false,"total_cost")+'</row>');
 const widths=columns.map((c,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+(/Activity/.test(c.label)?34:/Field|Crop/.test(c.label)?18:15)+'" customWidth="1"/>').join("");
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
 +'<dimension ref="A1:'+lastCol+lastRow+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
 +'<sheetFormatPr defaultRowHeight="16"/><cols>'+widths+'</cols><sheetData>'+rowXML.join("")+'</sheetData>'
 +'<mergeCells count="1"><mergeCell ref="A1:'+lastCol+'1"/></mergeCells></worksheet>';
}
const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
 +'<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>'
 +'<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
 +'<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF25633A"/><bgColor indexed="64"/></patternFill></fill></fills>'
 +'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
 +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
 +'<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';
export function labourWorkbookBytes(title:string,columns:LabourExcelColumn[],rows:AnyRow[],total?:number):Uint8Array{
 if(!columns.length)throw Error("No Excel report columns.");
 const files=[
  {name:"[Content_Types].xml",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
  {name:"_rels/.rels",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
  {name:"xl/workbook.xml",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>'},
  {name:"xl/_rels/workbook.xml.rels",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
  {name:"xl/worksheets/sheet1.xml",data:worksheet(title,columns,rows,total)},
  {name:"xl/styles.xml",data:styles}
 ];
 return zip(files);
}
export function labourExportXLSX(title:string,columns:LabourExcelColumn[],rows:AnyRow[],total?:number):void{
 if(typeof document==="undefined")throw Error("Excel export is available in the desktop browser.");
 const file=labourWorkbookBytes(title,columns,rows,total);
 const blob=new Blob([file as unknown as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=(title.replace(/[^a-z0-9]+/gi,"_").slice(0,65)||"Labour_Report")+".xlsx";
 a.style.display="none";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);
}
