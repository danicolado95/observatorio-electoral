import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'electo-separacion-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const source of ['wikipedia','electografica'])fs.mkdirSync(path.join(dir,'data/pipeline-test',source),{recursive:true});
 fs.writeFileSync(path.join(dir,'data/pipeline-test/wikipedia/radar.json'),JSON.stringify({version:1,encuestas:[]}));
 return dir;
}
const file=(dir,name)=>path.join(dir,'data/pipeline-test',name);
const read=(dir,name)=>JSON.parse(fs.readFileSync(file(dir,name),'utf8'));
const put=(dir,name,value)=>fs.writeFileSync(file(dir,name),JSON.stringify(value));
function run(dir,script,args=[]){return spawnSync(script.endsWith('.mjs')?process.execPath:'pwsh',script.endsWith('.mjs')?[script,...args]:['-NoProfile','-File',script,...args],{cwd:root,env:{...process.env,ELECTOGRAFICA_TEST_ROOT:dir},encoding:'utf8'});}
function entry(id,date){return {id:{$t:id},title:{$t:`ESPAÑA: Encuesta Casa ${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)}`},link:[{rel:'alternate',href:`https://www.electografica.com/${id}`}],published:{$t:date},updated:{$t:date},content:{$t:`Periodo de campo: ${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)} · Método: web Fuente: <a href="https://example.org/${id}">Medio</a> <!-- PP --><span class="dato_encuesta">30</span><!-- PSOE --><span class="dato_encuesta">25</span><!-- VOX --><span class="dato_encuesta">15</span>`}};}
function snapshot(dir,entries){put(dir,'electografica/snapshot.json',{complete:true,expected:entries.length,feed:{entry:entries}});}
function ok(result){assert.equal(result.status,0,result.stderr||result.stdout);}
test('AsOf fijo controla altas, validación, informe y no modifica Wikipedia; conserva histórico y deduplica',t=>{
 const dir=fixture(t),original=fs.readFileSync(file(dir,'wikipedia/radar.json'));
 snapshot(dir,[entry('one','2027-01-02'),entry('future','2027-01-03')]);
 ok(run(dir,'scripts/importar-electografica.mjs',['--as-of','2027-01-02']));
 const first=read(dir,'electografica/radar.json');assert.equal(first.encuestas.length,1);assert.equal(first.encuestas[0].ingestion.entry_id,'one');
 assert.equal(read(dir,'electografica/report.json').period[1],'2027-01-02');assert.match(read(dir,'electografica/quarantine.json')[0].reason,/Fuera del periodo/);
 snapshot(dir,[entry('future','2027-01-03')]);
 ok(run(dir,'scripts/importar-electografica.mjs',['--as-of','2027-01-03']));
 const second=read(dir,'electografica/radar.json');assert.equal(second.encuestas.length,2);assert.deepEqual(second.encuestas[0],first.encuestas[0]);
 ok(run(dir,'scripts/importar-electografica.mjs',['--as-of','2027-01-03']));assert.deepEqual(read(dir,'electografica/radar.json'),second);
 assert.deepEqual(fs.readFileSync(file(dir,'wikipedia/radar.json')),original);
});
test('fecha por defecto UTC y rechazo de fecha inválida antes de escribir',t=>{
 const dir=fixture(t),start=new Date().toISOString().slice(0,10);snapshot(dir,[entry('old','2024-01-02')]);
 ok(run(dir,'scripts/importar-electografica.mjs'));assert([start,new Date().toISOString().slice(0,10)].includes(read(dir,'electografica/report.json').period[1]));
 const previous=fs.readFileSync(file(dir,'electografica/radar.json'));
 assert.notEqual(run(dir,'scripts/importar-electografica.mjs',['--as-of','2027-02-30']).status,0);assert.deepEqual(fs.readFileSync(file(dir,'electografica/radar.json')),previous);
});
test('descarga propaga AsOf a normalización y usa límite UTC también en verano',t=>{
 const dir=fixture(t),feeds=path.join(dir,'feeds');fs.mkdirSync(feeds);
 for(const [category,id] of [['Generales','a'],['Generales_CCAA','b']])fs.writeFileSync(path.join(feeds,`${category}-1.json`),JSON.stringify({feed:{'openSearch$totalResults':{$t:'1'},entry:[entry(id,'2027-07-02')]}}));
 ok(run(dir,'scripts/descargar-electografica.ps1',['-AsOf','2027-07-01','-FixtureDirectory',feeds]));
 const snap=read(dir,'electografica/snapshot.json');assert.equal(snap.period[1],'2027-07-01');assert(snap.pages.every(p=>p.url.includes('published-max=2027-07-02T00:00:00Z')));
 assert.equal(read(dir,'electografica/report.json').period[1],'2027-07-01');assert.equal(read(dir,'electografica/radar.json').encuestas.length,0);
 ok(run(dir,'scripts/descargar-electografica.ps1',['-FixtureDirectory',feeds,'-DownloadOnly']));assert.equal(read(dir,'electografica/snapshot.json').period[1],new Date().toISOString().slice(0,10));
});
test('cruce con Wikipedia conserva sus bytes y añade trazabilidad solo en la fusión',t=>{
 const dir=fixture(t);snapshot(dir,[entry('same','2024-01-02')]);ok(run(dir,'scripts/importar-electografica.mjs',['--as-of','2024-01-03']));
 const poll=read(dir,'electografica/radar.json').encuestas[0];delete poll.url_electografica;delete poll.ingestion;poll.estudio_id='wikipedia-same';
 put(dir,'wikipedia/radar.json',{version:1,encuestas:[poll]});put(dir,'electografica/radar.json',{version:1,encuestas:[]});
 const original=fs.readFileSync(file(dir,'wikipedia/radar.json'));ok(run(dir,'scripts/importar-electografica.mjs',['--as-of','2024-01-03']));
 const rows=read(dir,'electografica/radar.json').encuestas;assert.equal(rows.length,1);assert.equal(rows[0].fuentes_adicionales.length,1);assert.deepEqual(fs.readFileSync(file(dir,'wikipedia/radar.json')),original);
 ok(run(dir,'scripts/importar-electografica.mjs',['--as-of','2024-01-03']));assert.deepEqual(read(dir,'electografica/radar.json').encuestas,rows);
});

for (const mode of ['complementarios','conflicto','cero','ambiguo','identidad']) test('enriquecimiento auditado: '+mode,t=>{
 const dir=fixture(t), e=entry('extras','2024-01-02');
 e.content.$t += '<!-- FA --><span class="dato_encuesta">5.4</span><!-- CC --><span class="dato_encuesta">0</span><!-- UPN --><span class="dato_encuesta">0.2</span>';
 snapshot(dir,[e]);ok(run(dir,'scripts/importar-electografica.mjs',['--as-of','2024-01-03']));
 const poll=read(dir,'electografica/radar.json').encuestas[0];
 delete poll.url_electografica;delete poll.ingestion;poll.estudio_id='wiki-extras';
 for(const k of ['FA','CC','UPN'])delete poll.resultados[k];
 poll.resultados.SUMAR=3;
 if(mode==='conflicto')poll.resultados.PSOE=26;
 if(mode==='cero')poll.resultados.CC=0.1;
 if(mode==='identidad')poll.fuente='https://example.org/otro';
 const polls=[poll];if(mode==='ambiguo')polls.push({...structuredClone(poll),estudio_id:'otro'});
 put(dir,'wikipedia/radar.json',{version:1,encuestas:polls});put(dir,'electografica/radar.json',{version:1,encuestas:[]});
 const original=fs.readFileSync(file(dir,'wikipedia/radar.json'));
 ok(run(dir,'scripts/importar-electografica.mjs',['--as-of','2024-01-03']));
 const rows=read(dir,'electografica/radar.json').encuestas;
 assert.equal(rows.length,polls.length);
 if(mode==='complementarios'){
  assert.deepEqual(rows[0].resultados,{PP:30,PSOE:25,VOX:15,SUMAR:3,FA:5.4,CC:0,UPN:0.2});
  assert.equal(read(dir,'electografica/audit.json')[0].decision,'cruzada');assert(rows[0].fuentes_adicionales[0].sha256);
  ok(run(dir,'scripts/importar-electografica.mjs',['--as-of','2024-01-03']));assert.deepEqual(read(dir,'electografica/radar.json').encuestas,rows);
 }else{assert.equal(read(dir,'electografica/quarantine.json').length,1);assert.deepEqual(rows,polls);}
 assert.deepEqual(fs.readFileSync(file(dir,'wikipedia/radar.json')),original);
});
