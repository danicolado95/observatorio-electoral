import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve('.');
const put=(dir,p,v)=>{mkdirSync(join(dir,p,'..'),{recursive:true});writeFileSync(join(dir,p),JSON.stringify(v));};
const get=(dir,p)=>JSON.parse(readFileSync(join(dir,p),'utf8'));
function entry(id,date,value=30){return {id:{$t:id},title:{$t:`ESPAÑA: Encuesta NuevaCasa ${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)}`},link:[{rel:'alternate',href:`https://www.electografica.com/${id}`}],published:{$t:date+'T09:00:00Z'},updated:{$t:date+'T09:00:00Z'},content:{$t:`Periodo de campo: ${date.slice(8)}/${date.slice(5,7)}/${date.slice(0,4)} · Método: web Fuente: <a href="https://example.org/${id}">Medio</a> <!-- PP --><span class="dato_encuesta">${value}</span><!-- PSOE --><span class="dato_encuesta">25</span><!-- VOX --><span class="dato_encuesta">15</span>`}};}
function run(dir,script,args=[]){return spawnSync(process.execPath,[join(root,'scripts',script),...args],{cwd:dir,env:{...process.env,ELECTOGRAFICA_TEST_ROOT:dir},encoding:'utf8'});}
const ok=r=>assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
for(const wikiConflict of [false,true]) test('día siguiente, alias Wikipedia y prioridad Electográfica (conflicto='+wikiConflict+'): conserva histórico, no duplica y bloquea fallos',()=>{
 const dir=mkdtempSync(join(tmpdir(),'radar-diario-'));
 const rows=Array.from({length:515},(_,i)=>({estudio_id:String(i),instituto:i<35?'CIS':'Casa '+i,tipo:'estimacion_voto',ambito:'España',fecha_publicacion:'2026-11-01',trabajo_campo_inicio:'2026-10-30',trabajo_campo_fin:'2026-10-31',fecha_fin_campo:'2026-10-31',tipo_fecha:'publicacion',tamano_muestra:1000,resultados:{PP:30,PSOE:25,VOX:15},fuente:'https://example.org/'+i}));
 for(const p of ['data/radar.json','data/radar-desarrollo.json','data/pipeline-test/wikipedia/radar.json','data/pipeline-test/wikipedia/staging.json'])put(dir,p,{encuestas:rows});
 put(dir,'data/cis-historico.json',{encuestas:rows.slice(0,35)});put(dir,'data/radar-cuarentena-base.json',[]);put(dir,'data/pipeline-test/wikipedia/diagnostico.json',{validado:true});
 const snapshot=entries=>put(dir,'data/pipeline-test/electografica/snapshot.json',{complete:true,expected:entries.length,feed:{entry:entries}});
 snapshot([entry('hoy','2026-11-02')]);ok(run(dir,'importar-electografica.mjs',['--as-of','2026-11-02']));
 const state='published/data/radar.json';ok(run(dir,'radar-persistente.mjs',['promote',state]));const first=get(dir,state);assert.equal(first.encuestas.length,516);
 ok(run(dir,'radar-persistente.mjs',['restore',state]));snapshot([entry('manana','2026-11-03')]);ok(run(dir,'importar-electografica.mjs',['--as-of','2026-11-03']));ok(run(dir,'radar-persistente.mjs',['promote',state]));
 const next=get(dir,state);assert.equal(next.encuestas.length,517);assert(next.encuestas.some(p=>p.ingestion?.entry_id==='hoy'));assert(next.encuestas.some(p=>p.ingestion?.entry_id==='manana'));
 ok(run(dir,'radar-persistente.mjs',['restore',state]));ok(run(dir,'importar-electografica.mjs',['--as-of','2026-11-03']));ok(run(dir,'radar-persistente.mjs',['promote',state]));assert.deepEqual(get(dir,state).encuestas,next.encuestas);
 // Wikipedia incorpora al día siguiente un estudio que ya entró por Electográfica.
 const wiki=get(dir,'data/pipeline-test/wikipedia/radar.json');
 const old=next.encuestas.find(p=>p.ingestion?.entry_id==='hoy');
 const alias={...old,resultados:{...old.resultados,PP:wikiConflict?31:30},estudio_id:'wiki-hoy',source_id:'wikipedia-staging',ingestion:{source:'wikipedia',sha256:'c'.repeat(64),revision:'https://en.wikipedia.org/w/index.php?oldid=123'}};
 delete alias.url_electografica;wiki.encuestas.push(alias);put(dir,'data/pipeline-test/wikipedia/radar.json',wiki);
 snapshot([entry('hoy','2026-11-02'),entry('manana','2026-11-03')]);ok(run(dir,'importar-electografica.mjs',['--as-of','2026-11-03']));ok(run(dir,'radar-persistente.mjs',['promote',state]));
 assert.equal(get(dir,state).encuestas.length,517);assert.equal(get(dir,state).encuestas.filter(p=>p.instituto==='NuevaCasa'&&p.fecha_publicacion==='2026-11-02').length,1);assert.equal(get(dir,state).encuestas.find(p=>p.instituto==='NuevaCasa'&&p.fecha_publicacion==='2026-11-02').resultados.PP,30);
 const before=readFileSync(join(dir,state));put(dir,'data/pipeline-test/electografica/diagnostico.json',{validado:false});assert.notEqual(run(dir,'radar-persistente.mjs',['promote',state]).status,0);assert.deepEqual(readFileSync(join(dir,state)),before);
 put(dir,'data/pipeline-test/electografica/diagnostico.json',{validado:true});const bad=get(dir,'data/pipeline-test/electografica/radar.json');bad.encuestas.shift();put(dir,'data/pipeline-test/electografica/radar.json',bad);assert.notEqual(run(dir,'radar-persistente.mjs',['promote',state]).status,0);assert.deepEqual(readFileSync(join(dir,state)),before);
});

test('Wikipedia: una descarga nueva no reescribe la procedencia del mismo sondeo; un porcentaje distinto bloquea',()=>{
 const dir=mkdtempSync(join(tmpdir(),'radar-wiki-hash-'));
 const poll={estudio_id:'wiki-uno',instituto:'Casa',tipo:'estimacion_voto',ambito:'España',fecha_publicacion:'2026-11-01',trabajo_campo_inicio:'2026-10-30',trabajo_campo_fin:'2026-10-31',fecha_fin_campo:'2026-10-31',tipo_fecha:'publicacion',tamano_muestra:1000,resultados:{PP:30,PSOE:25,VOX:15},fuente:'https://example.org/uno',source_id:'wikipedia-staging',ingestion:{source:'wikipedia',sha256:'a'.repeat(64),row_id:'mw1'}};
 put(dir,'data/radar.json',{encuestas:[]});put(dir,'data/historico-revisado.json',{approved:[],audit:[]});put(dir,'data/originales-huecos.json',{encuestas:[]});
 put(dir,'data/pipeline-test/wikipedia/radar.json',{encuestas:[poll]});
 const staging={encuestas:[{...poll,ingestion:{...poll.ingestion,sha256:'b'.repeat(64)}}],quarantine:[],report:{today:'2026-11-02'}};
 put(dir,'data/pipeline-test/wikipedia/staging.json',staging);ok(run(dir,'preparar-radar-wikipedia.mjs'));
 const result=get(dir,'data/pipeline-test/wikipedia/radar.json');assert.deepEqual(result.encuestas[0],poll);assert.deepEqual(get(dir,'data/pipeline-test/wikipedia/staging.json'),staging);
 const before=readFileSync(join(dir,'data/pipeline-test/wikipedia/radar.json'));staging.encuestas[0].resultados={PP:31,PSOE:25,VOX:15};put(dir,'data/pipeline-test/wikipedia/staging.json',staging);
 assert.notEqual(run(dir,'preparar-radar-wikipedia.mjs').status,0);assert.deepEqual(readFileSync(join(dir,'data/pipeline-test/wikipedia/radar.json')),before);
});
