const fs=require('fs'),path=require('path');
const {PGlite}=require('@electric-sql/pglite');
async function fixture(){
 const db=new PGlite();const m=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/stock-fixture-meta.json')));const extra=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/stock-fixture-extra.json')));
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema stock_v2;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table public.app_user_role(user_id uuid,role_name text);create table public.tracecode(${extra.public_trace_columns.map(c=>c.column_name+' '+c.udt_name+(c.column_name==='tracecode_id'?' primary key':'')).join(',')});create table public.spray(spray_id bigint,spray_date_id bigint,input_id bigint,rate_per_ha numeric);create table public.spray_date(spray_date_id bigint,tracecode_id bigint);set search_path=public,stock_v2,pg_catalog;`);
 await db.exec('create table public.crop(crop_id bigint primary key,crop_name text,active boolean default true)');
 for(const s of extra.sequences)await db.exec(`create sequence stock_v2.${s.relname}`);
 for(const t of [...new Set(m.columns.map(c=>c.table_name))])await db.exec(`create table stock_v2.${t}(${m.columns.filter(c=>c.table_name===t).map(c=>c.column_name+' '+c.data_type+(c.is_identity==='YES'?` generated ${c.identity_generation} as identity`:c.column_default?' default '+c.column_default:'')+(c.is_nullable==='NO'?' not null':'')).join(',')})`);
 for(const c of [...m.constraints.filter(c=>!c.definition.startsWith('FOREIGN KEY')),...m.constraints.filter(c=>c.definition.startsWith('FOREIGN KEY'))])await db.exec(`alter table ${c.table_name.includes('.')?c.table_name:'stock_v2.'+c.table_name} add constraint ${c.conname} ${c.definition}`);
 for(const index of extra.indexes??[])await db.exec(index);
 for(const f of m.functions)await db.exec(f.definition);
 let views=[...m.views];while(views.length){let pending=[];for(const v of views){try{await db.exec(`create view stock_v2.${v.viewname} as ${v.definition}`)}catch(e){pending.push(v);v.error=e.message}}if(pending.length===views.length)throw Error(JSON.stringify(pending.map(v=>[v.viewname,v.error])));views=pending;}
 for(const t of m.triggers)await db.exec(t.definition);
 return db;
}
module.exports={fixture};
if(require.main===module)fixture().then(async db=>{console.log('Stock schema fixture ready');await db.close()}).catch(e=>{console.error(e);process.exit(1)});
