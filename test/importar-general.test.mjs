import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepare,ingest} from '../scripts/importar-general-test.mjs';
const source={id:'synthetic',enabled:true,adapter:'normalized-json-v1',url:'https://example.org/feed',
 allowedHosts:['example.org'],rights:{redistribution:true,reviewedBy:'synthetic fixture only',
 reviewedAt:'2026-01-01',evidenceUrl:'https://example.org/rights'}};
const poll={instituto:' Privada ',estudio_id:'synthetic-1',ambito:'España',tipo:'estimacion_voto',
 fecha_publicacion:'2023-08-01',trabajo_campo_inicio:'2023-07-24',trabajo_campo_fin:'2023-07-28',
 tamano_muestra:1000,resultados:{PP:30.5},fuente:'https://example.org/original'};
const raw=rows=>JSON.stringify({version:1,encuestas:rows});
const now=new Date('2026-11-01T10:00:00Z');
const fetcher=rows=>async()=>new Response(raw(rows));
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'atlas-general-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 return {dir,base:pathToFileURL(dir+sep),radar:join(dir,'data/pipeline-test/general/data/radar.json')};
}
test('bloquea derechos, hosts y adaptadores antes de consultar',async()=>{
 for(const change of [{rights:{}},{enabled:false},{adapter:'blogger'},{url:'https://evil.example/feed'},
 {rights:{...source.rights,reviewedAt:'2027-01-01'}}]){
  let calls=0;await assert.rejects(ingest({...source,...change},{fetcher:async()=>{calls++;},now}));
  assert.equal(calls,0);
 }
});
test('normaliza y conserva enlace original, hash y datos originales por índice',()=>{
 const input=raw([poll]);const r=prepare(input,source,'2026-11-01');
 assert.equal(r.encuestas[0].instituto,'Privada');assert.equal(r.encuestas[0].fuente,poll.fuente);
 assert.equal(r.encuestas[0].ingestion.rawIndex,0);assert.match(r.encuestas[0].ingestion.sha256,/^[a-f0-9]{64}$/);
 assert.equal(r.report.coverageComplete,false);assert.equal(r.report.accepted,1);
});
test('deduplica repetición y rechaza revisión contradictoria y distinta identidad sospechosa',()=>{
 assert.equal(prepare(raw([poll,poll]),source,'2026-11-01').report.duplicates,1);
 assert.throws(()=>prepare(raw([poll,{...poll,resultados:{PP:31}}]),source,'2026-11-01'),/contradictorio/);
 assert.throws(()=>prepare(raw([poll,{...poll,estudio_id:'other'}]),source,'2026-11-01'),/Posible duplicado/);
});
test('cuarentena campos ausentes y periodo 1–22 julio sin debilitar validador',()=>{
 const missing={...poll};delete missing.tamano_muestra;
 const july={...poll,trabajo_campo_inicio:'2023-07-01',trabajo_campo_fin:'2023-07-20',fecha_publicacion:'2023-07-21'};
 const r=prepare(raw([missing,july]),source,'2026-11-01');
 assert.equal(r.report.missing.tamano_muestra,1);assert.equal(r.report.quarantine.length,2);
 assert.equal(r.encuestas.length,0);assert.equal(r.report.requestedSince,'2023-07-01');
});
test('excluye CIS, anteriores a julio, ámbito territorial y porcentajes inválidos',()=>{
 const r=prepare(raw([{...poll,instituto:'C.i.s.'},{...poll,fecha_publicacion:'2023-06-30'},
 {...poll,ambito:'Madrid'},{...poll,resultados:{PP:120}}]),source,'2026-11-01');
 assert.equal(r.report.excluded.length,2);assert.equal(r.report.quarantine.length,2);
});
test('vacío, fechas imposibles, HTML y errores HTTP no se convierten en éxito',async t=>{
 assert.throws(()=>prepare(raw([]),source,'2026-11-01'));
 assert.throws(()=>prepare('<html/>',source,'2026-11-01'));
 assert.equal(prepare(raw([{...poll,fecha_publicacion:'2023-02-30'}]),source,'2026-11-01').report.quarantine.length,1);
 const f=await fixture(t);await assert.rejects(ingest(source,{...f,now,fetcher:async()=>new Response('',{status:429})}),/HTTP 429/);
 assert.deepEqual(await readdir(f.dir),[]);
});
test('archivo exacto, append-only, idempotencia y conflicto conserva instantánea',async t=>{
 const f=await fixture(t);
 const first=await ingest(source,{...f,now,fetcher:fetcher([poll])});
 const archived=join(f.dir,'data/pipeline-test/general/archive',first.sha256+'.raw');
 assert.equal(await readFile(archived,'utf8'),raw([poll]));
 await ingest(source,{...f,now,fetcher:fetcher([poll])});
 assert.equal(JSON.parse(await readFile(f.radar,'utf8')).encuestas.length,1);
 const second={...poll,estudio_id:'synthetic-2',trabajo_campo_fin:'2023-07-29'};
 await ingest(source,{...f,now,fetcher:fetcher([second])});
 const before=await readFile(f.radar,'utf8');assert.equal(JSON.parse(before).encuestas.length,2);
 assert.equal(JSON.parse(before).encuestas[0].ingestion.sha256,first.sha256);
 await assert.rejects(ingest(source,{...f,now,fetcher:fetcher([{...poll,resultados:{PP:32}}])}),/contradictorio/);
 assert.equal(await readFile(f.radar,'utf8'),before);
 assert.deepEqual(await readdir(f.dir),['data']);
});
test('un lote incompleto se archiva pero no entra parcialmente en radar',async t=>{
 const f=await fixture(t);const incomplete={...poll,estudio_id:'missing',tamano_muestra:null};
 const result=await ingest(source,{...f,now,fetcher:fetcher([poll,incomplete])});
 assert.equal(result.state,'review-required');assert.equal(result.quarantine.length,1);
 await assert.rejects(readFile(f.radar),/ENOENT/);
});
test('distinto ID entre ejecuciones se bloquea y conserva radar',async t=>{
 const f=await fixture(t);await ingest(source,{...f,now,fetcher:fetcher([poll])});
 const before=await readFile(f.radar,'utf8');
 await assert.rejects(ingest(source,{...f,now,fetcher:fetcher([{...poll,estudio_id:'syndicated'}])}),/Posible duplicado/);
 assert.equal(await readFile(f.radar,'utf8'),before);
});
