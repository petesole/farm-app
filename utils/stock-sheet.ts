import {labourWorkbookBytes} from '@/lib/labour-xlsx-export';

export type SheetItem={item_code:string;item_name:string;category?:string|null;stock_type?:string|null;base_unit:string};
export type SheetHeader={take_number:string;owner_code:string;printed_at?:string;notes?:string};
export const stockCategory=(x:SheetItem)=>x.category?.trim()||'Uncategorised';
export const stockGroup=(x:SheetItem)=>x.stock_type?.trim()||'Other';
export function sortStockItems<T extends SheetItem>(items:readonly T[]):T[]{return [...items].sort((a,b)=>stockCategory(a).localeCompare(stockCategory(b),'en',{sensitivity:'base'})||a.item_name.localeCompare(b.item_name,'en',{sensitivity:'base'})||a.item_code.localeCompare(b.item_code));}
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function stockSheetHTML(t:SheetHeader,items:readonly SheetItem[],logoUri?:string){
 const rows=sortStockItems(items);
 return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.take_number)}</title><style>
 @page{size:A4 portrait;margin:12mm}body{font:12px Arial,sans-serif;color:#173e27;margin:16px}header{display:flex;gap:16px;align-items:center}header img{width:92px;height:60px;object-fit:contain}h1{font-size:20px;margin:0 0 6px}p{margin:8px 0}table{width:100%;border-collapse:collapse;color:#111}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #555;padding:7px;text-align:left}th{background:#e9f0eb}.count{width:105px;height:24px}footer{margin-top:20px}@media print{body{margin:0}}
 </style></head><body><header>${logoUri?`<img alt="JSPL" src="${esc(logoUri)}">`:''}<div><h1>JOHN SOLE (PVT) LTD</h1><strong>STOCK SHEET ${esc(t.take_number)}</strong></div></header>
 <p>Owner: ${esc(t.owner_code.replace(/^TEST_/,''))} · ${rows.length} items · ${new Set(rows.map(stockCategory)).size} categories${t.printed_at?' · Sheet date: '+esc(new Date(t.printed_at).toLocaleDateString('en-GB')):''}</p>
 ${t.notes?`<p>${esc(t.notes)}</p>`:''}<p>Count physical stock. Write 0 where none is found. Book balances are intentionally omitted.</p>
 <table><thead><tr><th>#</th><th>Type</th><th>Category</th><th>Product</th><th>Unit</th><th>Quantity counted</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(stockGroup(x))}</td><td>${esc(stockCategory(x))}</td><td>${esc(x.item_name)}<br><small>${esc(x.item_code)}</small></td><td>${esc(x.base_unit)}</td><td class="count"></td></tr>`).join('')}</tbody></table>
 <footer>Counted by: _______________________ Date/time: _______________________</footer></body></html>`;
}
// Printing an iframe avoids pop-ups and is triggered by the preview's Print button.
export function printStockSheet(html:string,onError:(message:string)=>void){
 if(typeof document==='undefined')throw Error('Print the sheet in the web browser.');
 const frame=document.createElement('iframe');frame.title='Stock sheet print document';
 Object.assign(frame.style,{position:'fixed',left:'-10000px',top:'0',width:'800px',height:'1100px',border:'0'});
 frame.addEventListener('load',()=>{try{const w=frame.contentWindow;if(!w)throw Error('Print document could not open');w.addEventListener('afterprint',()=>frame.remove(),{once:true});w.focus();w.print();}catch(e){frame.remove();onError((e as Error).message)}},{once:true});
 frame.srcdoc=html;document.body.appendChild(frame);
}
export function stockSheetWorkbook(t:SheetHeader,items:readonly SheetItem[]){return labourWorkbookBytes('Stock Sheet '+t.take_number,[{label:'Type',field:'stock_type'},{label:'Category',field:'category'},{label:'Product',field:'item_name'},{label:'Stock code',field:'item_code'},{label:'Unit',field:'base_unit'},{label:'Quantity counted',field:'quantity_counted'}],sortStockItems(items).map(x=>({...x,stock_type:stockGroup(x),category:stockCategory(x),quantity_counted:''})));}
export function downloadStockSheet(t:SheetHeader,items:readonly SheetItem[]){
 if(typeof document==='undefined')throw Error('Export the sheet in the web browser.');
 const bytes=stockSheetWorkbook(t,items),url=URL.createObjectURL(new Blob([bytes as unknown as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=url;link.download=t.take_number.replace(/[^a-z0-9_-]/gi,'_')+'.xlsx';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);
}
