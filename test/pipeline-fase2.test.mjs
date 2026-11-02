import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verificar} from '../scripts/validar-integracion-manual.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const python=process.env.RADAR_PYTHON||'python';
const available=spawnSync(python,['--version'],{encoding:'utf8'}).status===0;
const read=(root,name)=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const put=(root,name,v)=>{fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),JSON.stringify(v));};
function sandbox(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'radar-fase2-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function run(dir,script,args=[]){return spawnSync(script.endsWith('.py')?python:process.execPath,[path.join(repo,script),...args],{env:{...process.env,ELECTOGRAFICA_TEST_ROOT:dir},encoding:'utf8'});}
const ok=r=>assert.equal(r.status,0,r.stderr||r.stdout);
function entry(id,institute,date,field,results={PP:30,PSOE:25,VOX:15},source='https://example.org/encuesta'){
 return {id:{$t:id},title:{$t:`ESPAÑA: Encuesta ${institute} ${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)}`},link:[{rel:'alternate',href:`https://www.electografica.com/${id}`}],published:{$t:date+'T12:00:00Z'},updated:{$t:date+'T12:00:00Z'},content:{$t:`Periodo de campo: ${field} · Método: web Muestra: 1000 · Fuente: <a href="${source}">Medio</a> `+Object.entries(results).map(([k,v])=>`<!-- ${k} --><span class="dato_encuesta">${v}</span>`).join('')}};
}
function snapshot(dir,entries,extra={}){put(dir,'data/pipeline-test/electografica/snapshot.json',{complete:true,expected:entries.length,feed:{entry:entries},...extra});}
const electo=(dir)=>run(dir,'scripts/importar-electografica.mjs',['--as-of','2026-11-02']);

test('errores tempranos independientes, entradas malformadas y snapshot incompleto: JSON y ningún cambio parcial',t=>{
 const dir=sandbox(t);
 put(dir,'data/pipeline-test/wikipedia/radar.json',{encuestas:[]});
 const sentinel={encuestas:[{estudio_id:'a',instituto:'Casa',resultados:{PP:1}}]};
 put(dir,'data/pipeline-test/electografica/radar.json',sentinel);
 fs.writeFileSync(path.join(dir,'data/pipeline-test/wikipedia/radar.json'),'{');
 fs.writeFileSync(path.join(dir,'data/pipeline-test/electografica/audit.json'),'{');
 snapshot(dir,[{id:{$t:'broken'}},entry('valid','Casa','2024-01-22','20–21/01/2024')],{complete:false});
 const r=electo(dir);assert.notEqual(r.status,0);
 const d=read(dir,'data/pipeline-test/electografica/diagnostico.json');
 assert.equal(d.validado,false);assert(d.incidencias.filter(i=>i.codigo==='LECTURA_INVALIDA').length>=2);
 assert(d.incidencias.some(i=>i.codigo==='SNAPSHOT_INCOMPLETO'));
 assert(d.incidencias.some(i=>i.tipo==='cuarentena'&&i.estudio_id==='broken'));
 assert(d.cobertura.some(i=>i.id==='valid'));
 assert.deepEqual(read(dir,'data/pipeline-test/electografica/radar.json'),sentinel);
 assert.equal(fs.readFileSync(path.join(dir,'data/pipeline-test/electografica/audit.json'),'utf8'),'{');
});

test('preparación reúne conflictos de revisiones, resultados y originales sin promover radar',t=>{
 const dir=sandbox(t),poll={estudio_id:'a',instituto:'Casa',tipo:'estimacion_voto',ambito:'España',fecha_publicacion:'2024-01-22',trabajo_campo_inicio:'2024-01-20',trabajo_campo_fin:'2024-01-21',tamano_muestra:1000,resultados:{PP:30},fuente:'https://example.org/a'};
 put(dir,'data/radar.json',{encuestas:[poll]});
 put(dir,'data/pipeline-test/wikipedia/staging.json',{encuestas:[{...poll,resultados:{PP:31}},{...poll,estudio_id:'b',fuente:'invalid'}],quarantine:[],report:{today:'2026-11-02'}});
 put(dir,'data/historico-revisado.json',{approved:[poll],audit:[]});
 put(dir,'data/originales-huecos.json',{encuestas:[{...poll,estudio_id:'bad-original'}]});
 const sentinel={encuestas:[poll]};put(dir,'data/pipeline-test/wikipedia/radar.json',sentinel);
 assert.notEqual(run(dir,'scripts/preparar-radar-wikipedia.mjs').status,0);
 const d=read(dir,'data/pipeline-test/wikipedia/diagnostico.json');
 for(const code of ['REVISION_MODIFICADA','ORIGINAL_NO_VERIFICADO','CANDIDATO_INVALIDO'])assert(d.incidencias.some(i=>i.codigo===code),code);
 assert.deepEqual(read(dir,'data/pipeline-test/wikipedia/radar.json'),sentinel);
});

function html(){
 const parties=['PP','PSOE','Vox','Sumar','FA','CCa','UPN','Podemos'];
 return '<link rel="license" href="https://creativecommons.org/licenses/by-sa/4.0/deed.en"><a href="?oldid=123">old</a><h4>Voting intention estimates</h4><h5>2024</h5><table class="wikitable"><tr><th>House</th><th>Field</th><th>Sample</th><th>Turnout</th>'+parties.map(p=>`<th><a title="${p}"></a></th>`).join('')+'</tr><tr></tr><tr><td>Hamalgama/Medio<sup><a href="#cite_note-1">1</a></sup></td><td>20–21 Jan</td><td>1000</td><td>?</td>'+[30,25,15,3,'–','–','–','–'].map(v=>`<td>${v}</td>`).join('')+'</tr></table><li id="cite_note-1"><cite><a class="external text" href="https://example.org/encuesta">Encuesta</a>. Medio. 22 January 2024.</cite></li>';
}

test('E2E representativo: dos reconstrucciones desde cero, repetición incremental y auditoría íntegra', {skip:!available&&!process.env.RADAR_REQUIRE_E2E?'Python no disponible: E2E NO verificado; establecer RADAR_PYTHON':false},t=>{
 assert(available,'Python requerido: configurar RADAR_PYTHON');
 const historical=read(repo,'data/radar-desarrollo.json'),cis=read(repo,'data/cis-historico.json');
 const gad=historical.encuestas.find(p=>p.instituto==='GAD3'&&p.fecha_publicacion==='2023-11-20');
 assert(gad,'GAD3 histórico 19/11/2023');
 const outputs=[];
 for(let attempt=0;attempt<2;attempt++){
  const dir=sandbox(t);put(dir,'data/radar.json',historical);put(dir,'data/radar-desarrollo.json',historical);
  put(dir,'data/historico-revisado.json',{approved:[],audit:[]});put(dir,'data/originales-huecos.json',{encuestas:[]});
  fs.writeFileSync(path.join(dir,'wikipedia.html'),html());
  ok(run(dir,'scripts/importar-wikipedia.py',['--html',path.join(dir,'wikipedia.html'),'--today','2026-11-02']));
  ok(run(dir,'scripts/preparar-radar-wikipedia.mjs'));
  const wiki=read(dir,'data/pipeline-test/wikipedia/radar.json');
  const h=wiki.encuestas.find(p=>p.instituto==='Hamalgama'&&p.trabajo_campo_fin==='2024-01-21');assert(h);
  assert(!Object.hasOwn(h.resultados,'CC'));assert(!Object.hasOwn(h.resultados,'FA'));
  const ham=entry('hamalgama','Hamalgama','2024-01-22','20–21/01/2024',{PP:30,PSOE:25,VOX:15,FA:5.4,CC:0,UPN:0.2});
  const field=p=>`${p.trabajo_campo_inicio.slice(8)}/${p.trabajo_campo_inicio.slice(5,7)}/${p.trabajo_campo_inicio.slice(0,4)}–${p.trabajo_campo_fin.slice(8)}/${p.trabajo_campo_fin.slice(5,7)}/${p.trabajo_campo_fin.slice(0,4)}`;
  const bad=entry('gad-publicacion','GAD3','2023-11-19',field(gad),gad.resultados,gad.fuente);
  const conflict=entry('conflict','Hamalgama','2024-01-22','20–21/01/2024',{PP:31,PSOE:25,VOX:15});
  const excluded=entry('regional','Casa','2024-01-22','20–21/01/2024');excluded.title.$t='CATALUÑA: Encuesta Casa 22/01/2024';
  snapshot(dir,[ham,bad,conflict,excluded]);ok(electo(dir));
  const output=read(dir,'data/pipeline-test/electografica/radar.json'),q=read(dir,'data/pipeline-test/electografica/quarantine.json');
  const merged=output.encuestas.find(p=>p.estudio_id===h.estudio_id);
  assert.deepEqual(merged.resultados,{PP:30,PSOE:25,VOX:15,SUMAR:3,FA:5.4,CC:0,UPN:0.2});
  assert(!Object.hasOwn(merged.resultados,'PODEMOS'));assert.equal(merged.fuentes_adicionales.length,1);
  assert(q.some(p=>p.id==='gad-publicacion'&&/publicación/.test(p.reason)));
  assert(q.some(p=>p.id==='conflict'&&/Conflicto/.test(p.reason)));
  const d=read(dir,'data/pipeline-test/electografica/diagnostico.json');assert(d.incidencias.some(i=>i.tipo==='exclusion_esperada'));
  const audit=()=>verificar({original:historical,desarrollo:historical,cis,wikipedia:wiki,combinado:read(dir,'data/pipeline-test/electografica/radar.json'),reporte:read(dir,'data/pipeline-test/electografica/report.json'),auditoria:read(dir,'data/pipeline-test/electografica/audit.json'),cuarentena:q});
  assert.equal(audit().validado,true);
  ok(electo(dir));assert.deepEqual(read(dir,'data/pipeline-test/electografica/radar.json'),output);assert.equal(audit().validado,true);
  assert.equal(new Set(output.encuestas.map(p=>p.estudio_id)).size,output.encuestas.length);
  assert.equal(output.encuestas.reduce((n,p)=>n+(p.fuentes_adicionales?.length||0),0),234);
  if(process.env.RADAR_E2E_ARTIFACTS){
   const target=path.resolve(process.env.RADAR_E2E_ARTIFACTS);
   put(target,'reconstruccion-'+(attempt+1)+'.json',{alcance:'Fixture HTML/JSON representativa + histórico versionado conservado; no reconstruye las 515 filas desde fuentes',auditoria:audit(),diagnostico:d,ids:output.encuestas.map(p=>p.estudio_id),hamalgama:merged,cuarentena:q});
  }
  outputs.push(output);
 }
 assert.deepEqual(outputs[0],outputs[1]);
});

test('reconciliación previa reúne dos conflictos y sigue diagnosticando el feed; no sustituye datos ni pruebas previas',t=>{
 const dir=sandbox(t),poll=id=>({estudio_id:id,instituto:'Casa',fecha_publicacion:'2024-01-22',trabajo_campo_inicio:'2024-01-20',trabajo_campo_fin:'2024-01-21',tamano_muestra:1000,resultados:{PP:30},fuente:'https://example.org/'+id});
 const base={encuestas:[poll('a'),poll('b')]},previous=structuredClone(base);
 previous.encuestas[0].resultados.PP=31;previous.encuestas[1].tamano_muestra=1001;
 put(dir,'data/pipeline-test/wikipedia/radar.json',base);put(dir,'data/pipeline-test/electografica/radar.json',previous);
 const priorAudit=[{decision:'alta',id:'prior'}];put(dir,'data/pipeline-test/electografica/audit.json',priorAudit);
 snapshot(dir,[entry('good','Otra','2024-01-22','20–21/01/2024'),{id:{$t:'bad'}}]);
 assert.notEqual(electo(dir).status,0);
 const d=read(dir,'data/pipeline-test/electografica/diagnostico.json');
 assert.deepEqual(d.incidencias.filter(i=>i.codigo==='RECONCILIACION_PREVIA').map(i=>i.estudio_id),['a','b']);
 assert(d.incidencias.some(i=>i.estudio_id==='bad'&&i.tipo==='cuarentena'));
 assert.deepEqual(read(dir,'data/pipeline-test/electografica/radar.json'),previous);
 assert.deepEqual(read(dir,'data/pipeline-test/electografica/audit.json'),priorAudit);
});

test('extracción Wikipedia fallida deja JSON y conserva el staging', {skip:!available&&!process.env.RADAR_REQUIRE_E2E},t=>{
 assert(available,'Python requerido: configurar RADAR_PYTHON');
 const dir=sandbox(t),sentinel={encuestas:[{estudio_id:'previo'}]};
 put(dir,'data/pipeline-test/wikipedia/staging.json',sentinel);
 fs.writeFileSync(path.join(dir,'invalid.html'),'<html>sin revisión ni licencia</html>');
 assert.notEqual(run(dir,'scripts/importar-wikipedia.py',['--html',path.join(dir,'invalid.html'),'--today','2026-11-02']).status,0);
 const d=read(dir,'data/pipeline-test/wikipedia/diagnostico-extraccion.json');
 assert.equal(d.validado,false);assert(d.incidencias.some(i=>i.tipo==='error'));assert(d.incidencias.some(i=>i.tipo==='no_evaluable'));
 assert.deepEqual(read(dir,'data/pipeline-test/wikipedia/staging.json'),sentinel);
});

test('fallo de escritura al promover: restaura radar y auditoría anteriores y limpia temporales',async t=>{
 const {promoverLote}=await import('../scripts/lote-atomico.mjs');
 const io=await import('node:fs/promises');
 const {pathToFileURL}=await import('node:url');
 const dir=sandbox(t),target=pathToFileURL(dir+path.sep);
 put(dir,'radar.json',{version:'anterior'});put(dir,'audit.json',[{id:'anterior'}]);
 const before=fs.readFileSync(path.join(dir,'radar.json')),audit=fs.readFileSync(path.join(dir,'audit.json'));
 let failed=false;
 await assert.rejects(promoverLote(target,{'audit.json':[{id:'nuevo'}],'radar.json':{version:'nuevo'}},{...io,rename:async(a,b)=>{
  if(b.href.endsWith('/radar.json')&&!failed){failed=true;throw Error('Fallo simulado de escritura');}
  return io.rename(a,b);
 }}),/Fallo simulado/);
 assert.deepEqual(fs.readFileSync(path.join(dir,'radar.json')),before);assert.deepEqual(fs.readFileSync(path.join(dir,'audit.json')),audit);
 assert.deepEqual(fs.readdirSync(dir).sort(),['audit.json','radar.json']);
});

test('una entrada con campo, enlace y resultados ausentes enumera los tres defectos independientes',t=>{
 const dir=sandbox(t);put(dir,'data/pipeline-test/wikipedia/radar.json',{encuestas:[]});
 const e=entry('multiple','Casa','2024-01-22','20–21/01/2024');e.content.$t='Sin ficha técnica';snapshot(dir,[e]);
 ok(electo(dir));
 const d=read(dir,'data/pipeline-test/electografica/diagnostico.json');
 for(const codigo of ['CAMPO_INCOMPLETO','ORIGINAL_AUSENTE','PORCENTAJES_INCOMPLETOS'])assert(d.incidencias.some(i=>i.codigo===codigo&&i.tipo==='cuarentena'));
 assert.equal(read(dir,'data/pipeline-test/electografica/quarantine.json').length,1);
 assert.equal(read(dir,'data/pipeline-test/electografica/radar.json').encuestas.length,0);
});
