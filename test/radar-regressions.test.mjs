import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,rename,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validate,deduplicate,update} from '../scripts/update.mjs';
const {select,trend}=createRequire(import.meta.url)('../js/radar-core.js');
const poll={instituto:'CIS',estudio_id:'fixture',tipo:'estimacion_voto',ambito:'España',fecha_publicacion:'2026-01-10',trabajo_campo_inicio:'2026-01-01',trabajo_campo_fin:'2026-01-05',tamano_muestra:1000,resultados:{PP:30},fuente:'https://example.org/study'};
const source={id:'test',enabled:true,adapter:'normalized-json-v1',url:'https://example.org/feed',allowedHosts:['example.org'],rights:{redistribution:true,reviewedBy:'fixture',reviewedAt:'2026-01-01',evidenceUrl:'https://example.org/rights'}};
const now=new Date('2026-10-26T06:17:00Z');
const fetcher=rows=>async()=>({ok:true,text:async()=>JSON.stringify({version:1,encuestas:rows})});
async function fixture(t,sources=[source]){
 const dir=await mkdtemp(join(tmpdir(),'radar-regression-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await mkdir(join(dir,'data'));
 const old={version:1,encuestas:[poll],status:{state:'ok',lastAttempt:'2026-10-25T06:17:00.000Z',lastSuccess:'2026-10-25T06:17:00.000Z',lastDataChange:'2026-10-25T06:17:00.000Z',sources:[]}};
 await writeFile(join(dir,'data/sources.json'),JSON.stringify({sources}));
 await writeFile(join(dir,'data/radar.json'),JSON.stringify(old));
 return {dir,root:pathToFileURL(dir+sep),old,read:async()=>JSON.parse(await readFile(join(dir,'data/radar.json'),'utf8'))};
}
test('fuente vacía conserva sondeos, éxito y fecha de cambio; registra error',async t=>{
 const f=await fixture(t);
 await assert.rejects(update(f.root,fetcher([]),now),/Fuente vacía/);
 const actual=await f.read();
 assert.deepEqual(actual.encuestas,f.old.encuestas);
 assert.equal(actual.status.state,'error');
 assert.equal(actual.status.lastAttempt,now.toISOString());
 assert.equal(actual.status.lastSuccess,f.old.status.lastSuccess);
 assert.equal(actual.status.lastDataChange,f.old.status.lastDataChange);
});
test('una fuente vacía entre varias cancela la instantánea completa',async t=>{
 const f=await fixture(t,[source,{...source,id:'second',url:'https://example.org/second'}]);
 await assert.rejects(update(f.root,async url=>fetcher(url.endsWith('/second')?[]:[{...poll,resultados:{PP:35}}])(),now),/Fuente vacía/);
 assert.deepEqual((await f.read()).encuestas,f.old.encuestas);
});
test('normaliza alias CIS para validar, deduplicar, puntos y tendencia',()=>{
 const other={...poll,instituto:'Otro',estudio_id:'other',resultados:{PP:20}};
 for(const name of [' CIS ','cis',' C.i.s. ',' Centro  de Investigaciones Sociológicas ']){
   const raw={...poll,instituto:name};
   assert.equal(validate(raw,source,'2026-10-26').instituto,'CIS');
   assert.equal(deduplicate([poll,raw]).length,1);
   assert.deepEqual(select([raw,other],false),[other]);
   assert.equal(trend(select([raw,other],false),'PP','2026-01-05')[0].value,20);
   assert.equal(select([raw,other],true).length,2);
 }
 for(const bad of ['', '   ', null,123])assert.throws(()=>validate({...poll,instituto:bad},source,'2026-10-26'));
 for(const bad of ['', '   ', null,123])assert.throws(()=>validate({...poll,estudio_id:bad},source,'2026-10-26'));
 assert.equal(validate({...poll,estudio_id:' fixture '},source,'2026-10-26').estudio_id,'fixture');
});
test('éxito guarda datos y estado en una sola sustitución; ignora estado antiguo',async t=>{
 const f=await fixture(t);let commits=0;
 await writeFile(join(f.dir,'data/update-status.json'),'JSON antiguo inválido');
 await update(f.root,fetcher([{...poll,resultados:{PP:35}}]),now,{
   writeFile,
   rename:async(from,to)=>{
     assert.deepEqual(await f.read(),f.old);
     const pending=JSON.parse(await readFile(from,'utf8'));
     assert.equal(pending.encuestas[0].resultados.PP,35);
     assert.equal(pending.status.lastSuccess,now.toISOString());
     commits++;await rename(from,to);
   }
 });
 assert.equal(commits,1);
 const actual=await f.read();assert.equal(actual.encuestas[0].resultados.PP,35);assert.equal(actual.status.state,'ok');
 assert.equal(actual.status.lastDataChange,now.toISOString());
 assert.equal(await readFile(join(f.dir,'data/update-status.json'),'utf8'),'JSON antiguo inválido');
});
for(const stage of ['write','rename'])test('fallo de '+stage+' conserva instantánea completa y limpia temporal',async t=>{
 const f=await fixture(t);
 const bytes=await readFile(join(f.dir,'data/radar.json'),'utf8');
 await assert.rejects(update(f.root,fetcher([{...poll,resultados:{PP:35}}]),now,{
   writeFile:async(path,value)=>{if(stage==='write'){await writeFile(path,'parcial');throw Error('disk failure');}await writeFile(path,value);},
   rename:async(from,to)=>{if(stage==='rename')throw Error('disk failure');await rename(from,to);}
 }),/disk failure/);
 assert.equal(await readFile(join(f.dir,'data/radar.json'),'utf8'),bytes);
 assert.deepEqual((await readdir(join(f.dir,'data'))).sort(),['radar.json','sources.json']);
});
test('sin fuentes conserva datos y éxito en el mismo documento',async t=>{
 const f=await fixture(t,[]);
 await update(f.root,async()=>{throw Error('no debe consultar');},now);
 const actual=await f.read();assert.deepEqual(actual.encuestas,f.old.encuestas);
 assert.equal(actual.status.state,'unconfigured');assert.equal(actual.status.lastSuccess,f.old.status.lastSuccess);
});
