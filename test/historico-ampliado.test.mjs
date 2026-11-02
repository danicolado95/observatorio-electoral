import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFile} from 'node:fs/promises';
import {validate,deduplicate} from '../scripts/update.mjs';
const {medianTrend,pollTooltip}=createRequire(import.meta.url)('../js/radar-core.js');
const p={instituto:'A',estudio_id:'a',tipo:'estimacion_voto',ambito:'España',fecha_publicacion:null,trabajo_campo_inicio:'2024-01-01',trabajo_campo_fin:'2024-01-02',fecha_fin_campo:'2024-01-02',tipo_fecha:'fin_campo',tamano_muestra:null,publicacion_verificada:true,evidencia_publica:[{url:'https://example.org/a'}],fuente:'https://example.org/a',resultados:{PP:10}};
const source={id:'historico',allowedHosts:['example.org'],allowHistoricalMetadata:true};
test('histórico admite n ausente y publicación sin fecha solo con evidencia pública',()=>{
 assert.equal(validate(p,source,'2024-02-01').tamano_muestra,null);assert.equal(validate(p,source,'2024-02-01').fecha_publicacion,null);
 assert.throws(()=>validate({...p,publicacion_verificada:false},source,'2024-02-01'));
 assert.throws(()=>validate({...p,tamano_muestra:0},source,'2024-02-01'));
 assert.throws(()=>validate(p,{...source,allowHistoricalMetadata:false},'2024-02-01'));
 assert.throws(()=>validate({...p,fecha_fin_campo:'2024-01-03'},source,'2024-02-01'));
 assert.match(pollTooltip(p,'PP'),/2024-01-02\*/);assert.match(pollTooltip(p,'PP'),/Publicación: no consta/);
 assert.equal(deduplicate([p,p]).length,1);
});
test('mediana no depende de muestra y admite fin de campo acreditado sin publicación',()=>{
 const rows=[p,{...p,instituto:'B',estudio_id:'b',tamano_muestra:100,resultados:{PP:30}},{...p,instituto:'C',estudio_id:'c',tamano_muestra:100000,resultados:{PP:20}}];
 assert.equal(medianTrend(rows,'PP','2024-01-02').at(-1).value,20);
 assert.equal(medianTrend(rows.map(p=>({...p,tamano_muestra:null})),'PP','2024-01-02').at(-1).value,20);
});
test('auditoría distingue panel propio, modelos CIS y fichas discordantes',async()=>{
 const review=JSON.parse(await readFile(new URL('../data/historico-revisado.json',import.meta.url)));
 const em=review.audit.filter(p=>p.instituto==='EM-Analytics');assert.equal(em.length,171);
 assert(em.some(p=>p.decision==='incorporar'));assert(em.some(p=>p.decision==='cuarentena'));
 assert(review.approved.every(p=>!p.instituto.includes('CIS')));
 assert(review.approved.filter(p=>p.instituto==='EM-Analytics').every(p=>p.metodologia.muestra_propia&&p.evidencia_publica.some(e=>e.campo_verificado)));
 assert.equal(review.approved.find(p=>p.estudio_id==='wiki-0281fb7b37ea5499e8df').fecha_fin_campo,'2023-08-11');
 assert.equal(review.approved.filter(p=>p.instituto==='More in Common').length,3);
});
