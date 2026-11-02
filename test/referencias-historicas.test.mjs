import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {conservarReferencias, unirReferencias} from '../scripts/referencias-historicas.mjs';
const history=JSON.parse(fs.readFileSync(new URL('../data/radar-desarrollo.json',import.meta.url)));
const audit=JSON.parse(fs.readFileSync(new URL('./fixtures/electografica-audit.json',import.meta.url)));
const fresh=()=>history.encuestas.map(p=>{const q=structuredClone(p);delete q.fuentes_adicionales;return q;});
test('recupera las 233 referencias reales sin modificar porcentajes ni duplicar',()=>{
 const rows=fresh(),before=structuredClone(rows);conservarReferencias(rows,history.encuestas);conservarReferencias(rows,history.encuestas);
 assert.equal(rows.reduce((n,p)=>n+(p.fuentes_adicionales?.length||0),0),233);
 for(let i=0;i<rows.length;i++){assert.deepEqual(rows[i].resultados,before[i].resultados);assert.deepEqual(rows[i].fuentes_adicionales,history.encuestas[i].fuentes_adicionales);}
});
test('no permite conflictos, identidades duplicadas ni estudios perdidos',()=>{
 for(const mutate of [r=>r.push(r[0]),r=>r.splice(r.findIndex(p=>p.fuentes_adicionales?.length),1),r=>r.find(p=>p.fuentes_adicionales?.length).resultados.PP=99,r=>r.find(p=>p.fuentes_adicionales?.length).fuente='https://example.org']){
  const rows=structuredClone(history.encuestas);mutate(rows);assert.throws(()=>conservarReferencias(rows,history.encuestas));
 }
 assert.throws(()=>conservarReferencias(fresh(),[...history.encuestas,history.encuestas[0]]));
});
test('añade referencias y revisiones sin borrar hashes históricos ni duplicar por orden de claves',()=>{
 const ref=history.encuestas.find(p=>p.fuentes_adicionales?.length).fuentes_adicionales[0];
 const reordered=Object.fromEntries(Object.entries(ref).reverse());
 assert.equal(unirReferencias([ref],[reordered,{...ref,sha256:'nueva-revision'}]).length,2);
});
test('importador desde cero: GAD3 en cuarentena conserva su referencia y todo el histórico',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'electo-historico-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const data=path.join(dir,'data');fs.mkdirSync(path.join(data,'pipeline-test/wikipedia'),{recursive:true});fs.mkdirSync(path.join(data,'pipeline-test/electografica'));
 fs.writeFileSync(path.join(data,'radar-desarrollo.json'),JSON.stringify(history));
 fs.writeFileSync(path.join(data,'pipeline-test/wikipedia/radar.json'),JSON.stringify({...history,encuestas:fresh()}));
 const a=audit.find(a=>a.estudio_id==='wiki-9e08b27f424fbbafe859'),p=a.extracted;
 const e={id:{$t:a.id},title:{$t:a.title},link:[{rel:'alternate',href:a.url}],published:{$t:p.ingestion.blogger_published},updated:{$t:p.ingestion.blogger_updated},content:{$t:`Periodo de campo: 16/11/2023-17/11/2023 · Método: teléfono Muestra: 1008 · Fuente: <a href="${p.fuente}">${p.medio}</a> `+Object.entries(p.resultados).map(([k,v])=>`<!-- ${k} --><span class="dato_encuesta">${v}</span>`).join('')}};
 fs.writeFileSync(path.join(data,'pipeline-test/electografica/snapshot.json'),JSON.stringify({complete:true,expected:1,feed:{entry:[e]}}));
 const run=()=>spawnSync(process.execPath,['scripts/importar-electografica.mjs','--as-of','2026-11-02'],{cwd:new URL('../',import.meta.url),env:{...process.env,ELECTOGRAFICA_TEST_ROOT:dir},encoding:'utf8'});
 let r=run();assert.equal(r.status,0,r.stderr);
 const read=n=>JSON.parse(fs.readFileSync(path.join(data,'pipeline-test/electografica',n)));
 const output=read('radar.json');assert.deepEqual(output.encuestas,history.encuestas);
 assert.match(read('quarantine.json')[0].reason,/Identidad no homologada/);
 assert.equal(read('report.json').after.private,480);assert.equal(read('report.json').after.cis,35);
 r=run();assert.equal(r.status,0,r.stderr);assert.deepEqual(read('radar.json'),output);
});
