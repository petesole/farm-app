// JSPL ERP regression smoke checks. No database writes or external requests.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");
function loadTs(path){
  const code=ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const mod=new Module(path,module);mod.filename=path;mod.paths=module.paths;mod._compile(code,path);return mod.exports;
}
const {parseJsplDateInput,displayJsplDate,filterJsplOptions}=loadTs("utils/jspl-input.ts");
assert.equal(parseJsplDateInput("2/2",2026),"2026-02-02");
assert.equal(parseJsplDateInput("2/2/2025",2026),"2025-02-02");
assert.equal(parseJsplDateInput("29/2/2024",2026),"2024-02-29");
assert.equal(parseJsplDateInput("29/2",2026),null);
assert.equal(parseJsplDateInput("31/4",2026),null);
assert.equal(displayJsplDate("2026-02-02"),"02/02/2026");
assert.deepEqual(filterJsplOptions([{id:1,label:"HSCP1",active:true},{id:2,label:"DLW1",active:true}],"trace","HS"),[{id:1,label:"HSCP1",active:true}]);
function read(path){return fs.readFileSync(path,"utf8")}
const header=read("components/jspl/StockV2Header.tsx");
assert.ok(header.indexOf("<Image source=")<header.indexOf("<View style={styles.left}>"),"Stock logo must precede title and Back control");
const sprays=read("app/(tabs)/home/stock-v2-spray-planning.tsx");
assert.ok(sprays.includes('pathname:"/stock-v2-spray-transaction"'),"Spray list must open dedicated stock transaction route");
assert.ok(!sprays.includes("returnJob===job.id")&&!sprays.includes("issueId===job.id"),"No inline stock transfer or return editor");
const tx=read("app/stock-v2-spray-transaction.tsx");
assert.ok(tx.includes("action=\"planned_issue\"")&&tx.includes("action=\"spray_return\""),"Both spray workflows must be reachable");
const labourHistory=read("app/labour-history.tsx");
assert.ok(labourHistory.includes('pathname:"/labour-correction"'),"Saved Labour edits must use dedicated form");
assert.ok(!labourHistory.includes("chosen&&<View"),"No in-list Labour correction editor");
const labour=read("app/labour-entry.tsx");
assert.ok(labour.includes("if (editingKey !== null) return"),"Draft edits must isolate the selected record");
const field=read("app/(tabs)/home/field-master-dashboard.tsx");
assert.ok(field.includes('<JsplSearchCombo label="Farm"')&&field.includes('<JsplSearchCombo label="Field status"'),"Field filters use combo boxes");
console.log("PASS: ERP date parsing, filtering, header, and isolated workflow regression checks");
