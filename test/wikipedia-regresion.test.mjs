import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/preparar-radar-wikipedia.mjs',import.meta.url));
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wiki-regresion-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const put=(name,data)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data));};
 const poll={estudio_id:'valid',instituto:'Casa',tipo:'estimacion_voto',ambito:'España',fecha_publicacion:'2024-01-22',trabajo_campo_inicio:'2024-01-20',trabajo_campo_fin:'2024-01-21',tamano_muestra:1000,resultados:{PP:30},fuente:'https://example.org/a'};
 put('data/radar.json',{encuestas:[]});put('data/historico-revisado.json',{approved:[],audit:[]});put('data/originales-huecos.json',{encuestas:[]});
 return {root,put,poll,run:()=>spawnSync(process.execPath,[script],{env:{...process.env,ELECTOGRAFICA_TEST_ROOT:root},encoding:'utf8'}),read:name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'))};
}
test('variantes contradictorias en cuarentena se conservan sin bloquear ni entrar al radar',t=>{
 const f=fixture(t),q={...f.poll,estudio_id:'conflict',quarantine_reasons:['Resultados contradictorios']};
 f.put('data/pipeline-test/wikipedia/staging.json',{encuestas:[f.poll],quarantine:[q,{...q,resultados:{PP:31}}],report:{today:'2026-11-02'}});
 const r=f.run();assert.equal(r.status,0,r.stderr);
 const d=f.read('data/pipeline-test/wikipedia/diagnostico.json');assert.equal(d.validado,true);
 assert(d.incidencias.some(i=>i.codigo==='ID_DUPLICADO'&&i.tipo==='cuarentena'));
 assert.equal(d.incidencias.filter(i=>i.codigo==='STAGING_CUARENTENA').length,2);
 assert.deepEqual(f.read('data/pipeline-test/wikipedia/radar.json').encuestas.map(p=>p.estudio_id),['valid']);
 assert.equal(f.read('data/pipeline-test/wikipedia/staging.json').quarantine.length,2);
});
test('duplicados utilizables siguen bloqueados con diagnóstico visible y radar anterior intacto',t=>{
 const f=fixture(t),sentinel={encuestas:[]};f.put('data/pipeline-test/wikipedia/radar.json',sentinel);
 f.put('data/pipeline-test/wikipedia/staging.json',{encuestas:[f.poll,{...f.poll}],quarantine:[],report:{today:'2026-11-02'}});
 const r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,/Wikipedia ID_DUPLICADO.*staging/);assert.match(r.stderr,/diagnostico\.json/);
 assert.equal(f.read('data/pipeline-test/wikipedia/diagnostico.json').validado,false);
 assert.deepEqual(f.read('data/pipeline-test/wikipedia/radar.json'),sentinel);
});
test('JSON ilegible deja la causa visible además del informe',t=>{
 const f=fixture(t);f.put('data/pipeline-test/wikipedia/staging.json',{});
 fs.writeFileSync(path.join(f.root,'data/pipeline-test/wikipedia/staging.json'),'{');
 const r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,/LECTURA_INVALIDA.*staging.json/);
 assert.equal(f.read('data/pipeline-test/wikipedia/diagnostico.json').validado,false);
});

test('8N: los resultados auditados sobreviven tres capturas y conservan procedencia',t=>{
 const f=fixture(t);
 const incident=JSON.parse(fs.readFileSync(new URL('./fixtures/wikipedia-20261108.json',import.meta.url)));
 f.put('data/historico-revisado.json',{approved:incident.auditadas,audit:[]});
 const name='data/pipeline-test/wikipedia/';
 let before;
 for(const [index,observed] of [incident.observadas,incident.observadas.toReversed(),[]].entries()){
  f.put(name+'staging.json',{encuestas:[f.poll],quarantine:observed,report:{today:'2026-11-09'}});
  const run=f.run();assert.equal(run.status,0,run.stderr);
  const rows=f.read(name+'radar.json').encuestas;
  if(index===0)before=rows;
  assert.deepEqual(rows,before);
  assert.equal(rows.length,4);
  const diagnostics=f.read(name+'diagnostico.json').incidencias.filter(i=>i.codigo==='REVISION_MODIFICADA');
  assert.equal(diagnostics.length,observed.length);
  for(const i of diagnostics){
   const delta=JSON.parse(i.evidencia).differences.resultados;
   assert.equal(i.tipo,'cuarentena');
   assert.equal(delta.observado.ADELANTE_ANDALUCIA,0.1);
   assert.equal(delta.auditado.ADELANTE_ANDALUCIA,undefined);
  }
 }
});
