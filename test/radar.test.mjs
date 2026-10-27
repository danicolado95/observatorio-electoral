import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validate,deduplicate,update} from '../scripts/update.mjs';
const {select,trend}=createRequire(import.meta.url)('../js/radar-core.js');
const poll={instituto:'CIS',estudio_id:'fixture-1',tipo:'estimacion_voto',ambito:'España',fecha_publicacion:'2026-01-10',trabajo_campo_inicio:'2026-01-01',trabajo_campo_fin:'2026-01-05',tamano_muestra:1000,resultados:{PP:30,PSOE:25},fuente:'https://example.org/study'};
const source={id:'test',enabled:true,adapter:'normalized-json-v1',url:'https://example.org/feed',allowedHosts:['example.org'],rights:{redistribution:true,reviewedBy:'test fixture only',reviewedAt:'2026-01-01',evidenceUrl:'https://example.org/rights'}};
test('CIS cambia puntos y agregación; ausente no equivale a cero',()=>{
 const privatePoll={...poll,instituto:'Otro',estudio_id:'fixture-2',resultados:{PP:20}};
 const rows=[poll,privatePoll];assert.equal(select(rows,false).length,1);
 assert.equal(trend(rows,'PP','2026-01-05')[0].value,25);
 assert.equal(trend(select(rows,false),'PP','2026-01-05')[0].value,20);
 assert.deepEqual(trend(select(rows,false),'PSOE','2026-01-05'),[]);
});
test('sin extrapolación y huecos mayores de 42 días',()=>{
 const later={...poll,trabajo_campo_fin:'2026-04-01'};
 const points=trend([poll,later],'PP','2026-10-25');assert.equal(points.at(-1).date,'2026-04-01');assert.ok(points.some(p=>p.value===null));
});
test('validación de fechas, fuentes, porcentajes y conflictos',()=>{
 assert.equal(validate(poll,source,'2026-10-25').source_id,'test');
 for(const change of [{fecha_publicacion:'2027-01-01'},{fuente:'https://unauthorized.example/study'},{resultados:{PP:101}},{trabajo_campo_inicio:'2026-01-09'}])assert.throws(()=>validate({...poll,...change},source,'2026-10-25'));
 assert.equal(deduplicate([poll,poll]).length,1);
 assert.throws(()=>deduplicate([poll,{...poll,resultados:{PP:20}}]));
});
test('pipeline reproducible, fallo conserva datos y último éxito',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'radar-test-'));await mkdir(join(dir,'data'));
 const save=(f,v)=>writeFile(join(dir,'data',f),JSON.stringify(v));
 const read=f=>readFile(join(dir,'data',f),'utf8');
 await save('sources.json',{sources:[source]});await save('radar.json',{version:1,encuestas:[]});await save('update-status.json',{lastSuccess:null,lastDataChange:null});
 const root=pathToFileURL(dir+sep),now=new Date('2026-10-25T06:17:00Z');
 const fetcher=async()=>({ok:true,text:async()=>JSON.stringify({version:1,encuestas:[poll,poll]})});
 await update(root,fetcher,now);const first=JSON.parse(await read('radar.json')).encuestas;assert.equal(first.length,1);
 await update(root,fetcher,new Date('2026-10-26T06:17:00Z'));assert.deepEqual(JSON.parse(await read('radar.json')).encuestas,first);
 assert.equal(JSON.parse(await read('radar.json')).status.lastDataChange,now.toISOString());
 await assert.rejects(update(root,async()=>{throw Error('network failure');},new Date('2026-10-27T06:17:00Z')));
 assert.deepEqual(JSON.parse(await read('radar.json')).encuestas,first);const state=JSON.parse(await read('radar.json')).status;assert.equal(state.state,'error');assert.equal(state.lastSuccess,'2026-10-26T06:17:00.000Z');
 await save('sources.json',{sources:[{...source,rights:{}}]});let calls=0;
 await assert.rejects(update(root,async()=>{calls++;},now));assert.equal(calls,0);
});
