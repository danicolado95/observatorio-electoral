import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {extraerEntrada} from '../scripts/extraer-electografica.mjs';
import {resolverElectografica,comprobarReconciliacion} from '../scripts/reconciliaciones-documentadas.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const failures=read('test/fixtures/fallos-actions-20261104-05.json');
const entry=read('test/fixtures/sigma-20261103-revision.json');
const decision=read('docs/evidencia-reconciliacion/sigma.json');
const wiki=read('test/fixtures/sigma-wikipedia-revision.json');
const normalize=p=>{p=structuredClone(p);for(const k of ['blogger_published','blogger_updated'])p.ingestion[k]=new Date(p.ingestion[k]).toISOString();return p;};
for(const f of failures)test('Actions '+f.run+' '+f.asOf+': reproduce candidato exacto, recupera histórico y repite sin cambios',()=>{
 const p=extraerEntrada(entry,f.asOf);
 assert.deepEqual(normalize(p),normalize(f.candidate));
 assert.equal(f.incidencias[0].codigo,'ALIAS_NO_RESUELTO');
 const r=resolverElectografica(decision.historico,wiki,p,entry);
 assert(r,'La revisión HTML del 3N debe conservar el puente documental');
 assert(comprobarReconciliacion(r));assert.deepEqual(r.historico,decision.historico);
 const dir=mkdtempSync(join(tmpdir(),'radar-actions-'));
 const put=(name,v)=>{mkdirSync(join(dir,name,'..'),{recursive:true});writeFileSync(join(dir,name),JSON.stringify(v));};
 const get=name=>JSON.parse(readFileSync(join(dir,name),'utf8'));
 const run=(script,args=[])=>{const s=spawnSync(process.execPath,[resolve('scripts',script),...args],{cwd:dir,env:{...process.env,ELECTOGRAFICA_TEST_ROOT:dir},encoding:'utf8'});assert.equal(s.status,0,s.stderr+'\n'+s.stdout);};
 const development=read('data/radar-desarrollo.json');
 const base=structuredClone(development);base.encuestas=base.encuestas.map(q=>q.estudio_id===decision.historico.estudio_id?structuredClone(wiki):q);
 for(const name of ['data/radar.json','data/radar-desarrollo.json','data/cis-historico.json','data/radar-cuarentena-base.json'])put(name,read(name));
 put('data/pipeline-test/wikipedia/radar.json',base);put('data/pipeline-test/wikipedia/staging.json',base);
 put('data/pipeline-test/wikipedia/diagnostico.json',{validado:true});
 put('data/pipeline-test/electografica/radar.json',development);put('data/pipeline-test/electografica/audit.json',[]);
 const other=read('test/fixtures/reconciliacion-entradas.json').find(e=>e.id.$t!==entry.id.$t);
 put('data/pipeline-test/electografica/snapshot.json',{complete:true,expected:2,feed:{entry:[entry,other]}});
 run('importar-electografica.mjs',['--as-of',f.asOf]);run('validar-integracion-manual.mjs');
 const state='published/radar.json';run('radar-persistente.mjs',['promote',state]);
 const first=get(state);assert.equal(first.encuestas.length,515);
 assert.equal(first.encuestas.filter(p=>p.instituto==='CIS').length,35);
 assert.deepEqual(first.encuestas.find(p=>p.estudio_id===decision.historico.estudio_id),decision.historico);
 run('radar-persistente.mjs',['restore',state]);run('importar-electografica.mjs',['--as-of',f.asOf]);run('radar-persistente.mjs',['promote',state]);
 assert.deepEqual(get(state).encuestas,first.encuestas);assert.equal(get('data/pipeline-test/publicacion-resumen.json').dataChanged,false);
});
test('Revisión del blog: un porcentaje, origen, muestra o identidad distinto continúa bloqueando',()=>{
 for(const mutate of [p=>p.resultados.FA=7.2,p=>delete p.resultados.UPN,p=>p.fuente+='?otra',p=>p.medio='Otro',p=>p.tamano_muestra++,p=>p.ingestion.entry_id+='x',p=>p.ingestion.blogger_updated='invalida',p=>p.ingestion.content_sha256='f'.repeat(64)]){
  const p=extraerEntrada(entry,'2026-11-05');mutate(p);assert.equal(resolverElectografica(decision.historico,wiki,p,entry),null);
 }
});
