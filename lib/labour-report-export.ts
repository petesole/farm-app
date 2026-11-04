type Column={label:string;field:string};
type Row=Record<string,unknown>;
function value(row:Row,field:string):string{
 const raw=row[field];if(raw==null)return "";
 if(field.includes("date")&&typeof raw==="string"){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);if(m)return m[3]+"/"+m[2]+"/"+m[1];}
 return String(raw);
}
function safe(s:string):string{return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}
function slug(title:string){return title.replace(/[^a-z0-9]+/gi,"_").slice(0,65)||"Labour_Report"}
export function labourExportCSV(title:string,columns:Column[],rows:Row[],total:number){
 if(typeof document==="undefined")throw Error("Excel export is available in a desktop browser.");
 const csv=(vals:string[])=>vals.map(x=>'"'+x.replace(/"/g,'""')+'"').join(",");
 const lines=[csv(columns.map(c=>c.label)),...rows.map(r=>csv(columns.map(c=>value(r,c.field)))),csv(["Grand Total",...Array(Math.max(0,columns.length-2)).fill(""),total.toFixed(2)])];
 const file=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
 const uri=URL.createObjectURL(file),a=document.createElement("a");
 a.href=uri;a.download=slug(title)+".csv";a.style.display="none";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(uri),2500);
}
export function labourPrintReport(title:string,columns:Column[],rows:Row[],total:number){
 if(typeof window==="undefined")throw Error("Print Preview is available in a desktop browser.");
 const popup=window.open("","_blank");if(!popup)throw Error("Enable pop-ups to print this Labour report.");
 const head="<tr>"+columns.map(c=>"<th>"+safe(c.label)+"</th>").join("")+"</tr>";
 const body=rows.map(r=>"<tr>"+columns.map(c=>"<td>"+safe(value(r,c.field))+"</td>").join("")+"</tr>").join("");
 const html=[
 '<!doctype html><html><head><title>',safe(title),'</title><style>',
 'body{font:12px Arial,sans-serif;color:#183526;margin:25px}h1{font-size:20px;color:#103d2b;margin-bottom:5px}.muted{color:#666;font-size:11px;margin-bottom:12px}',
 'table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #bbb;padding:5px 7px;text-align:left}th{background:#e8f0e8}tr{break-inside:avoid}',
 '.sum{font-size:14px;font-weight:700;margin-top:15px}button{background:#25633a;color:white;border:0;padding:9px 14px;margin:10px 0;cursor:pointer}',
 '@media print{button{display:none}body{margin:8mm}@page{size:A4 landscape;margin:8mm}}',
 '</style></head><body><h1>John Sole (Private) Limited</h1><div class="muted">',safe(title),'</div>',
 '<button onclick="window.print()">Print Report</button><table><thead>',head,'</thead><tbody>',body,
 '</tbody></table><div class="sum">Grand Total: USD ',total.toFixed(2),'</div></body></html>'
 ].join("");
 popup.document.open();popup.document.write(html);popup.document.close();popup.focus();
}
