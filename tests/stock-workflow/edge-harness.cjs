const fs=require('fs'),vm=require('vm');const root=require('path').resolve(__dirname,'../..');const ts=require(root+'/node_modules/typescript');
function edge(db,name,actor){
 const makeSQL=connection=>{
 const sql=(strings,...values)=>{if(!Array.isArray(strings?.raw)){return {fragment:true,values:strings}}let query='',params=[];for(let i=0;i<strings.length;i++){query+=strings[i];if(i<values.length){const v=values[i];if(v?.fragment){query+='('+v.values.map(x=>{params.push(x);return '$'+params.length}).join(',')+')'}else{params.push(v);query+='$'+params.length}}}return connection.query(query,params).then(r=>r.rows)};
 sql.json=v=>JSON.stringify(v);sql.end=async()=>{};sql.begin=async fn=>connection.transaction(async tx=>fn(makeSQL(tx)));
 return sql;};const sql=makeSQL(db);
 let handler;const code=ts.transpileModule(fs.readFileSync(root+'/supabase/functions/'+name+'/index.ts','utf8').replace(/^import .*\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports:{},Request,Response,URL,Error,console,Deno:{env:{get:()=> 'local-test'},serve:fn=>{handler=fn}},createClient:()=>({auth:{getUser:async()=>({data:{user:actor?{id:actor}:null}})}}),postgres:()=>sql});
 return async(query='',body)=>{const res=await handler(new Request('http://local/'+name+query,{method:body?'POST':'GET',headers:{authorization:'Bearer local','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return {status:res.status,body:await res.json()}};
}
module.exports={edge};
