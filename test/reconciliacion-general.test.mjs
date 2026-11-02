import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {resolverElectografica,comprobarReconciliacion,comprobarCuarentena} from '../scripts/reconciliaciones-documentadas.mjs';
import {extraerEntrada} from '../scripts/extraer-electografica.mjs';
import {auditar,verificar} from '../scripts/validar-integracion-manual.mjs';
const read=n=>JSON.parse(readFileSync(new URL('fixtures/'+n,import.meta.url),'utf8'));
const cases=read('conflictos-reales.json'),entries=read('reconciliacion-entradas.json');
const entry=c=>structuredClone(entries.find(e=>e.id.$t===c.historico.ingestion.entry_id));
const wikiSigmaActual=read('sigma-wikipedia-revision.json');
function revisionSigma() {
 const c=cases[0],e=entry(c),p=extraerEntrada(e,'2026-11-02');
 // Actions representa los mismos instantes en UTC, sin cambiar el contenido.
 for(const k of ['published','updated'])e[k].$t=new Date(e[k].$t).toISOString();
 return {h:structuredClone(c.historico),w:structuredClone(wikiSigmaActual),p:extraerEntrada(e,'2026-11-02'),e};
}
function auditoriaSigma() {
 const {h,w,p,e}=revisionSigma(),r=resolverElectografica(h,w,p,e);
 assert(r);
 const rows=Array.from({length:514},(_,i)=>({estudio_id:'dummy-'+i,instituto:i<35?'CIS':'Casa',resultados:{PP:30}}));
 rows.push(structuredClone(h));
 return {original:{encuestas:[]},desarrollo:{encuestas:[h]},cis:{encuestas:[]},
  wikipedia:{encuestas:[w]},combinado:{encuestas:rows},auditoria:[{}],
  cuarentena:[{id:p.ingestion.entry_id,url:p.url_electografica,candidate:p,extracted:p,matches:[w],reconciliacion:r}],
  reporte:{entries:2,after:{private:480,cis:35}}};
}
test('regresión Actions 1383412906: puente de originales independiente de la captura Wikipedia; histórico exacto',()=>{
 const d=auditoriaSigma(),before=structuredClone(d);
 assert.equal(verificar(d).validado,true);assert.deepEqual(d,before);
 const r=d.cuarentena[0].reconciliacion;
 assert.equal(r.wikipedia.ingestion.revision,wikiSigmaActual.ingestion.revision);
 assert.equal(r.wikipedia.ingestion.sha256,wikiSigmaActual.ingestion.sha256);
 assert.equal(r.historico.resultados.FA,7.1);assert.equal(r.wikipedia.resultados.FA,7.5);
 assert.equal(r.candidato.ingestion.content_sha256,'c7d7a2e1fd27e2dbe220bee4a0a0cde28ad28c1421f58ce1392f168ee5167c4f');
 assert.deepEqual(r.historico,cases[0].historico);
 assert(comprobarCuarentena(d.cuarentena[0],d.wikipedia.encuestas[0],d.desarrollo.encuestas[0]));
});
test('puente con nueva captura: bloquea identidad distinta, hash Electográfica cambiado y contradicciones internas',()=>{
 for(const mutate of [d=>d.w.instituto='Otra',d=>d.w.ambito='Otra',d=>d.w.tipo='otro',
  d=>d.w.fecha_publicacion='2026-11-02',d=>d.w.trabajo_campo_inicio='2026-10-28',
  d=>d.w.trabajo_campo_fin='2026-10-29',d=>d.w.tamano_muestra=2506,
  d=>d.w.fuente+='?otra',d=>d.w.estudio_id+='-otra',d=>delete d.w.ingestion.sha256,
  d=>d.p.ingestion.content_sha256='f'.repeat(64),d=>d.e.content.$t+='x',
  d=>d.e.content.$t='<!-- FA --><span class="dato_encuesta">9</span>'+d.e.content.$t]) {
  const d=revisionSigma();mutate(d);assert.equal(resolverElectografica(d.h,d.w,d.p,d.e),null);
 }
});
test('verificar y alias: cuarentena sola no acredita identidad; rechaza pruebas ambiguas, pérdidas y manipulación',()=>{
 for(const mutate of [d=>delete d.cuarentena[0].reconciliacion,
  d=>d.cuarentena.push(structuredClone(d.cuarentena[0])),
  d=>d.cuarentena[0].reconciliacion.entrada.content.$t+='x',
  d=>d.cuarentena[0].reconciliacion.puente_documental.evidencias[0].sha256='f'.repeat(64),
  d=>d.combinado.encuestas.at(-1).resultados.FA=7.5,
  d=>delete d.combinado.encuestas.at(-1).resultados.UPN,
  d=>d.combinado.encuestas.at(-1).resultados.SUMAR=7.1,
  d=>d.combinado.encuestas[d.combinado.encuestas.length-1]=structuredClone(d.wikipedia.encuestas[0]),
  d=>d.combinado.encuestas.pop(),
  d=>d.wikipedia.encuestas[0].ingestion.sha256='f'.repeat(64)]) {
  const d=auditoriaSigma();mutate(d);assert.equal(auditar(d).validado,false);assert.throws(()=>verificar(d));
 }
});
for(const c of cases) test(c.historico.instituto+': cifra comprobada en HTML, histórico íntegro y diferencias trazables',()=>{
 const e=entry(c),p=extraerEntrada(e,'2026-11-02');
 assert.equal(p.resultados.FA,c.historico.resultados.FA);
 const r=resolverElectografica(c.historico,c.wikipedia,p,e);
 assert(r);assert(comprobarReconciliacion(r));assert.deepEqual(r.historico,c.historico);
 assert.deepEqual(r.diferencias.find(d=>d.partido==='FA'),{partido:'FA',wikipedia:{presente:true,valor:c.wikipedia.resultados.FA},electografica:{presente:true,valor:p.resultados.FA}});
 assert(!Object.hasOwn(r.historico.resultados,'SUMAR'));
 const q={id:p.ingestion.entry_id,url:p.url_electografica,candidate:p,extracted:p,matches:[c.wikipedia],reconciliacion:r};
 assert(comprobarCuarentena(q,c.wikipedia,c.historico));
});
test('regla general para otra encuesta, sin histórico ni lista de cifras; cero distinto de ausencia',()=>{
 const c=cases[1],e=entry(c);e.id.$t+='-futura';
 e.title.$t=e.title.$t.replace('SocioMétrica','Otra Casa');
 const p=extraerEntrada(e,'2026-11-02'),w=structuredClone(c.wikipedia);
 w.instituto=p.instituto;w.estudio_id='wiki-futura';delete w.resultados.UPN;
 const r=resolverElectografica(null,w,p,e);
 assert(r);assert(comprobarReconciliacion(r));assert.equal(r.historico.resultados.FA,4.9);
 assert.deepEqual(r.diferencias.find(d=>d.partido==='UPN'),{partido:'UPN',wikipedia:{presente:false},electografica:{presente:true,valor:0}});
});
test('identidad insuficiente, fuente no íntegra, revisión histórica o evidencia alterada no autoriza',()=>{
 for(const mutate of [
  d=>d.w.trabajo_campo_inicio='2026-09-02',d=>d.w.tamano_muestra=null,
  d=>d.w.fecha_publicacion='2026-11-02',d=>d.w.fuente+='?otra',
  d=>d.w.ingestion.source='otro',d=>d.p.resultados.FA=0,
  d=>d.h.resultados.FA=4.4,d=>d.e.content.$t+='corrupto',
  d=>d.e.title.$t=d.e.title.$t.replace('SocioMétrica','Otra'),
  d=>delete d.e.content,d=>d.p.ingestion.content_sha256='f'.repeat(64)
 ]){
  const c=cases[1],d={h:structuredClone(c.historico),w:structuredClone(c.wikipedia),p:extraerEntrada(entry(c),'2026-11-02'),e:entry(c)};
  mutate(d);assert.equal(resolverElectografica(d.h,d.w,d.p,d.e),null);
 }
 const c=cases[1],r=resolverElectografica(c.historico,c.wikipedia,extraerEntrada(entry(c),'2026-11-02'),entry(c));
 for(const mutate of [r=>r.diferencias[0].partido='SUMAR',r=>r.historico.resultados.FA=4.4,r=>r.entrada.content.$t+='x',r=>r.motivo='silenciado']){
  const d=structuredClone(r);mutate(d);assert.equal(comprobarReconciliacion(d),false);
 }
});
test('contradicciones internas Electográfica no se resuelven por precedencia',()=>{
 const e=entry(cases[1]);e.content.$t='<!-- FA --><span class="dato_encuesta">9</span>'+e.content.$t;
 assert.throws(()=>extraerEntrada(e,'2026-11-02'),/Contradicción interna/);
});
for(const mode of ['ambigua','versionada'])test('importador: bloquea sustitución '+mode+' y conserva las variantes',t=>{
 const dir=mkdtempSync(join(tmpdir(),'regla-general-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const c=cases[1],rows=[structuredClone(c.wikipedia)];
 if(mode==='ambigua')rows.push({...structuredClone(c.wikipedia),estudio_id:'wiki-otra'});
 const put=(name,value)=>{const p=join(dir,name);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,JSON.stringify(value));};
 put('data/pipeline-test/wikipedia/radar.json',{encuestas:rows});
 put('data/pipeline-test/electografica/snapshot.json',{complete:true,expected:1,feed:{entry:[entry(c)]}});
 if(mode==='versionada')put('data/radar-desarrollo.json',{encuestas:rows});
 const r=spawnSync(process.execPath,['scripts/importar-electografica.mjs','--as-of','2026-11-02'],{cwd:new URL('../',import.meta.url),env:{...process.env,ELECTOGRAFICA_TEST_ROOT:dir},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const output=JSON.parse(readFileSync(join(dir,'data/pipeline-test/electografica/radar.json'),'utf8'));
 assert.deepEqual(output.encuestas,rows);
 const q=JSON.parse(readFileSync(join(dir,'data/pipeline-test/electografica/quarantine.json'),'utf8'));
 assert.equal(q.length,1);assert(!q[0].reconciliacion);assert.equal(q[0].candidate.resultados.FA,4.9);
});
