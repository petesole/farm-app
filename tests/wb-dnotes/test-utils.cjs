const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=require('node:path').resolve(__dirname,'../..');
const ts=require(repo+'/node_modules/typescript');
const compiled=path.join(require('node:os').tmpdir(),'jspl-wb-dnote-tests');fs.mkdirSync(compiled,{recursive:true});
for(const file of ['wb-date.ts','wb-dnote-register.ts']){
 const source=fs.readFileSync(repo+'/utils/'+file,'utf8');
 fs.writeFileSync(path.join(compiled,file.replace('.ts','.js')),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {dnoteKey,validateDnoteRanges,groupDnoteLoads,dnoteCsv}=require(path.join(compiled,'wb-dnote-register.js'));
let checks=0;
assert.equal(dnoteKey(' 02 / 046 '),'2/46');checks++;
for(const text of ['2/0','0/2','2/3/4','2/1.5','02-46','Infinity','1000000/1']){assert.equal(dnoteKey(text),null);checks++;}
const input=validateDnoteRanges('10/11/2026',[{start:'02/012',end:'2/22'},{start:'3/1',end:'3/8'}]);
assert.equal(input.count,19);assert.equal(input.date,'2026-11-10');assert.equal(input.ranges[0].start,'2/12');checks++;
for(const [date,ranges,re] of [
 ['31/2/2026',[{start:'2/1',end:'2/2'}],/date/],
 ['10/11/2026',[{start:'2/99',end:'3/2'}],/one book/],
 ['10/11/2026',[{start:'2/3',end:'2/2'}],/end must follow/],
 ['10/11/2026',[{start:'2/1',end:'2/5'},{start:'2/5',end:'2/6'}],/overlapping/],
 ['10/11/2026',[{start:'2/1',end:'2/2001'}],/at most 2000/],
 ['10/11/2026',[],/between 1 and 50/],
]){assert.throws(()=>validateDnoteRanges(date,ranges),re);checks++;}
const row={expected_id:1,source:'WB Computer',source_id:'truck1',report_date:'2026-11-10',dnote:'2/12',wb_slip:'84',crop_name:'Wheat',movement_kind:'HARVEST_IN',registration_text:'ABC-1234',load_kg:30000,tracecode_id:1,tracecode_name:'Field A',allocation_kg:20000,season_id:19,wb_date:'2026-11-10',missing:false,wb_match_count:1};
const loads=groupDnoteLoads([row,{...row,tracecode_id:2,tracecode_name:'Field B',allocation_kg:10000},{...row,expected_id:2,source:null,source_id:null,dnote:'2/13',wb_slip:null,load_kg:null,tracecode_id:null,season_id:null,missing:true}]);
assert.equal(loads.length,2);assert.equal(loads[0].kg,30000);assert.equal(loads[0].alloc.length,2);assert.equal(loads[1].kg,null);checks++;
const csv=dnoteCsv(loads);assert.equal((csv.match(/30000/g)||[]).length,1);assert.ok(csv.includes('"2/13",""'));assert.ok(csv.includes('Missing'));checks++;
assert.ok(dnoteCsv([{...loads[0],registration:'=MALICIOUS()'}]).includes("'=MALICIOUS()"));checks++;
console.log(`PASS: ${checks} UI-data checks: date/range validation, book changes, leading zeros, overlap rejection, allocation totals and CSV.`);

