import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolverSigma,comprobarReconciliacion} from '../scripts/reconciliaciones-documentadas.mjs';
import {auditar} from '../scripts/validar-integracion-manual.mjs';
const cases=JSON.parse(readFileSync(new URL('fixtures/conflictos-reales.json',import.meta.url)));
const c=cases[0];
const resolve=()=>resolverSigma(c.historico,c.wikipedia,c.rechazado.candidate);
function fixture(){
 const rows=Array.from({length:514},(_,i)=>({estudio_id:'dummy-'+i,instituto:i<35?'CIS':'Casa',resultados:{PP:30}}));
 rows.push(structuredClone(c.historico));
 const q={...structuredClone(c.rechazado),matches:[structuredClone(c.wikipedia)],reconciliacion:resolve()};
 return {original:{encuestas:[]},desarrollo:{encuestas:[structuredClone(c.historico)]},cis:{encuestas:[]},wikipedia:{encuestas:[structuredClone(c.wikipedia)]},combinado:{encuestas:rows},auditoria:[],cuarentena:[q],reporte:{entries:1,after:{private:480,cis:35}}};
}
test('Sigma Dos: decisión exacta conserva histórico, versiones y evidencia sin mutar',()=>{
 const d=fixture();
 d.auditoria=[{}];d.reporte.entries=2;
 const snapshot=structuredClone(d);
 const r=auditar(d);assert.equal(r.validado,true);assert.equal(r.reconciliaciones.length,1);
 assert.deepEqual(d,snapshot);assert(comprobarReconciliacion(resolve()));
 assert.equal(resolverSigma(cases[1].historico,cases[1].wikipedia,cases[1].rechazado.candidate),null);
});
test('Sigma Dos: cualquier nueva versión, fuente, valor, fecha, hash o metadato queda fuera',()=>{
 for(const section of ['historico','wikipedia','candidato']) for(const mutate of [
  p=>p.resultados.FA=6,p=>p.resultados.PP=30,p=>p.resultados.SUMAR=7.1,
  p=>p.fuente+='?otra',p=>p.estudio_id+='x',p=>p.fecha_publicacion='2026-11-02',
  p=>p.trabajo_campo_inicio='2026-10-28',p=>p.tamano_muestra=2506,
  p=>p.ingestion.sha256='f'.repeat(64),p=>p.ingestion.revision='otra',
  p=>p.ingestion.content_sha256='f'.repeat(64),p=>p.ingestion.blogger_updated='2026-11-03T12:00:00Z'
 ]){
  const r=resolve();mutate(r[section]);
  assert.equal(resolverSigma(r.historico,r.wikipedia,r.candidato),null,section);
  assert.equal(comprobarReconciliacion(r),false);
 }
});
test('Auditoría: no acepta evidencia incompleta, ambigua, manipulada ni un conflicto nuevo',()=>{
 for(const mutate of [
  d=>d.cuarentena.push(structuredClone(d.cuarentena[0])),
  d=>d.cuarentena[0].reconciliacion.evidencias[0].sha256='f'.repeat(64),
  d=>delete d.cuarentena[0].reconciliacion,
  d=>d.cuarentena[0].candidate.resultados.FA=7.2,
  d=>d.cuarentena[0].matches[0].fuente='https://example.org',
  d=>d.combinado.encuestas.at(-1).resultados.FA=7.5,
  d=>d.wikipedia.encuestas[0].ingestion.sha256='e'.repeat(64),
  d=>d.desarrollo.encuestas.push(structuredClone(cases[1].historico))
 ]){const d=fixture();mutate(d);assert.equal(auditar(d).validado,false);}
 const d=fixture();d.combinado.reconciliaciones_anteriores=d.cuarentena;d.cuarentena=[];d.reporte.entries=1;d.auditoria=[{}];
 assert.equal(auditar(d).validado,true);
 d.combinado.reconciliaciones_anteriores[0].id='otro';assert.equal(auditar(d).validado,false);

});
